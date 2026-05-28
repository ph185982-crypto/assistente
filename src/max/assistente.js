'use strict';
require('dotenv').config();
const axios = require('axios');
const OpenAI = require('openai');
const { notificarPedro } = require('./whatsapp');
const db = require('./supabase');

const openai = new OpenAI({ apiKey: process.env.OPENAI_API_KEY });
const MODEL = 'gpt-4o';

const SYSTEM_PROMPT = `Você é Max, assistente financeiro pessoal do Pedro.
Personalidade: direto, objetivo, sem enrolação.
Tom de coach financeiro — aponta problemas, sugere soluções.

Contexto do Pedro:
- Empreendedor em Goiânia/GO
- Negócios: Vendedoria (loja ferramentas WA) e LuKaizen Games
- Meta: R$8.000/mês de renda
- Está quitando dívidas (~R$90.000 total)
- Renda atual: ~R$4.550/mês fixo
- Déficit mensal atual: ~R$6.900

Regras:
1. Respostas curtas e diretas no WhatsApp
2. Emojis com moderação
3. Alertar gastos fora do planejado
4. Sempre confirmar antes de salvar
5. Nunca inventar valores
6. Se não entender, perguntar de forma simples`;

function fmt(v) {
  return Number(v).toLocaleString('pt-BR', { minimumFractionDigits: 2 });
}

function fmtData(d) {
  if (!d) return 'data não informada';
  return new Date(d + 'T12:00:00').toLocaleDateString('pt-BR');
}

async function callAI(userMsg, system = SYSTEM_PROMPT) {
  const res = await openai.chat.completions.create({
    model: MODEL,
    max_tokens: 512,
    messages: [
      { role: 'system', content: system },
      { role: 'user', content: userMsg },
    ],
  });
  return res.choices[0].message.content.trim();
}

function extrairJSON(texto) {
  const m = texto.match(/\{[\s\S]*\}/);
  if (!m) return null;
  try { return JSON.parse(m[0]); } catch { return null; }
}

// ── 1. Imagem ────────────────────────────────────────────────

async function processarImagem(remetente, mediaId) {
  const metaRes = await axios.get(
    `https://graph.facebook.com/v19.0/${mediaId}`,
    { headers: { Authorization: `Bearer ${process.env.WHATSAPP_TOKEN}` } }
  );
  const mediaUrl = metaRes.data.url;

  const imgRes = await axios.get(mediaUrl, {
    responseType: 'arraybuffer',
    headers: { Authorization: `Bearer ${process.env.WHATSAPP_TOKEN}` },
  });
  const base64 = Buffer.from(imgRes.data).toString('base64');
  const mime = imgRes.headers['content-type'] || 'image/jpeg';

  const res = await openai.chat.completions.create({
    model: MODEL,
    max_tokens: 512,
    messages: [
      { role: 'system', content: SYSTEM_PROMPT },
      {
        role: 'user',
        content: [
          { type: 'image_url', image_url: { url: `data:${mime};base64,${base64}` } },
          {
            type: 'text',
            text: 'Analise este comprovante. Extraia:\n1. Valor (número)\n2. Estabelecimento/descrição\n3. Data (YYYY-MM-DD)\n4. Tipo: despesa ou receita\n5. Categoria: Moradia, Transporte, Alimentação, Saúde, Lazer, Vestuário, Assinaturas, Negócios, Dívidas ou Outros\nResponda APENAS em JSON: {"valor":0,"descricao":"","data":"","tipo":"","categoria":""}',
          },
        ],
      },
    ],
  });

  const json = extrairJSON(res.choices[0].message.content);
  if (!json || !json.valor) {
    await notificarPedro('❓ Não identifiquei dados financeiros nessa imagem. Descreva em texto.');
    return;
  }

  const t = await db.inserirTransacao({
    data_transacao: json.data || new Date().toISOString().slice(0, 10),
    tipo: json.tipo || 'despesa',
    valor: json.valor,
    descricao: json.descricao,
    categoria: json.categoria,
    comprovante_url: mediaUrl,
    confirmado: false,
  });

  await db.setPendente(remetente, t.id);

  const e = json.tipo === 'receita' ? '💰' : '💸';
  await notificarPedro(
    `📄 Comprovante identificado:\n${e} Tipo: ${json.tipo}\n💵 Valor: R$ ${fmt(json.valor)}\n📝 ${json.descricao}\n🏷️ ${json.categoria}\n📅 ${fmtData(json.data)}\n\nConfirma? Responda *sim* para salvar.`
  );
}

// ── 2. Registro manual ───────────────────────────────────────

const RE_REGISTRO = /\b(gastei|paguei|recebi|entrada de|despesa de|saída de|comprei)\b/i;

async function processarRegistro(remetente, mensagem) {
  const resp = await callAI(
    `Usuário disse: "${mensagem}"\nExtraia em JSON: {"valor":0,"descricao":"","tipo":"receita ou despesa","categoria":"Moradia|Transporte|Alimentação|Saúde|Lazer|Vestuário|Assinaturas|Negócios|Dívidas|Outros"}\nSe não conseguir: {"erro":true}`
  );

  const json = extrairJSON(resp);
  if (!json || json.erro || !json.valor) {
    await notificarPedro('❓ Não entendi. Tente: "gastei 50 de almoço" ou "recebi 200 de venda".');
    return;
  }

  const t = await db.inserirTransacao({
    data_transacao: new Date().toISOString().slice(0, 10),
    tipo: json.tipo || 'despesa',
    valor: json.valor,
    descricao: json.descricao,
    categoria: json.categoria,
    confirmado: false,
  });

  await db.setPendente(remetente, t.id);

  const e = json.tipo === 'receita' ? '💰' : '💸';
  await notificarPedro(
    `${e} Registrar:\nTipo: ${json.tipo}\nValor: R$ ${fmt(json.valor)}\nDescrição: ${json.descricao}\nCategoria: ${json.categoria}\n\nConfirma? Responda *sim* para salvar.`
  );
}

// ── 3. Confirmação ───────────────────────────────────────────

const RE_CONFIRMAR = /^(sim|confirma|pode salvar|ok|isso|correto|certo|salva|salvar)\s*$/i;

async function processarConfirmacao(remetente) {
  const id = await db.getPendente(remetente);
  if (!id) {
    await notificarPedro('Não há transação pendente para confirmar.');
    return;
  }
  await db.confirmarTransacao(id);
  await db.deletePendente(remetente);
  await notificarPedro('✅ Salvo com sucesso!');
}

// ── 4. Lembrete ──────────────────────────────────────────────

const RE_LEMBRETE = /\b(me lembra|lembrete|reunião|todo dia|agenda|agendar|me avisa|avisa)\b/i;

async function processarLembrete(mensagem) {
  const resp = await callAI(
    `Usuário disse: "${mensagem}"\nAgora: ${new Date().toISOString()}\nExtraia em JSON: {"descricao":"","data_hora":"ISO 8601","recorrente":false,"frequencia":"diario|semanal|mensal|null"}\nSe não conseguir: {"erro":true}`
  );

  const json = extrairJSON(resp);
  if (!json || json.erro || !json.data_hora) {
    await notificarPedro('❓ Não entendi. Tente: "me lembra de academia amanhã às 7h".');
    return;
  }

  await db.inserirLembrete({
    descricao: json.descricao,
    data_hora: json.data_hora,
    recorrente: json.recorrente || false,
    frequencia: json.frequencia || null,
  });

  const df = new Date(json.data_hora).toLocaleString('pt-BR', { timeZone: 'America/Sao_Paulo' });
  await notificarPedro(
    `⏰ Lembrete criado!\n📝 ${json.descricao}\n📅 ${df}` +
    (json.recorrente ? `\n🔁 Recorrente: ${json.frequencia}` : '')
  );
}

// ── 5. Consultas ─────────────────────────────────────────────

const RE_CONSULTA = /\b(quanto gastei|qual.*saldo|despesas?|receitas?|resumo|saldo|extrato|gastos)\b/i;

async function processarConsulta(mensagem) {
  let t, periodo;

  if (/hoje/i.test(mensagem)) {
    t = await db.buscarTransacoesHoje(); periodo = 'hoje';
  } else if (/semana/i.test(mensagem)) {
    t = await db.buscarTransacoesSemana(); periodo = 'esta semana';
  } else {
    t = await db.buscarTransacoesMes(); periodo = 'este mês';
  }

  const cats = ['Moradia','Transporte','Alimentação','Saúde','Lazer','Vestuário','Assinaturas','Negócios','Dívidas'];
  for (const c of cats) {
    if (mensagem.toLowerCase().includes(c.toLowerCase())) {
      t = t.filter(tx => tx.categoria === c);
      periodo += ` (${c})`;
      break;
    }
  }

  if (!t.length) { await notificarPedro(`📊 Nenhuma transação para ${periodo}.`); return; }

  const { receitas, despesas, saldo } = db.calcularResumo(t);
  await notificarPedro(
    `📊 ${periodo}:\n\n💰 Receitas: R$ ${fmt(receitas)}\n💸 Despesas: R$ ${fmt(despesas)}\n📈 Saldo: R$ ${fmt(saldo)}\n(${t.length} transações)`
  );
}

// ── 6. Comandos ──────────────────────────────────────────────

async function processarComando(cmd) {
  switch (cmd) {
    case 'resumo': {
      const t = await db.buscarTransacoesMes();
      const { receitas, despesas, saldo } = db.calcularResumo(t);
      await notificarPedro(`📊 Mês atual:\n💰 Receitas: R$ ${fmt(receitas)}\n💸 Despesas: R$ ${fmt(despesas)}\n📈 Saldo: R$ ${fmt(saldo)}`);
      break;
    }
    case 'hoje': {
      const t = await db.buscarTransacoesHoje();
      if (!t.length) { await notificarPedro('Nenhuma transação hoje.'); break; }
      const l = t.map(tx => `${tx.tipo === 'receita' ? '💰' : '💸'} R$ ${fmt(tx.valor)} — ${tx.descricao}`).join('\n');
      await notificarPedro(`📅 Hoje:\n${l}`);
      break;
    }
    case 'semana': {
      const t = await db.buscarTransacoesSemana();
      const { receitas, despesas, saldo } = db.calcularResumo(t);
      await notificarPedro(`📊 Esta semana:\n💰 Receitas: R$ ${fmt(receitas)}\n💸 Despesas: R$ ${fmt(despesas)}\n📈 Saldo: R$ ${fmt(saldo)}`);
      break;
    }
    case 'lembretes': {
      const l = await db.buscarProximosLembretes();
      if (!l.length) { await notificarPedro('Nenhum lembrete pendente.'); break; }
      await notificarPedro('📋 Próximos lembretes:\n' + l.map(r => `⏰ ${new Date(r.data_hora).toLocaleString('pt-BR', { timeZone: 'America/Sao_Paulo' })} — ${r.descricao}`).join('\n'));
      break;
    }
    default:
      await notificarPedro(
        `🤖 *Max — Comandos:*\n\n*resumo* — Resumo do mês\n*hoje* — Transações de hoje\n*semana* — Transações da semana\n*lembretes* — Próximos lembretes\n*ajuda* — Esta mensagem\n\nOu naturalmente:\n"gastei 50 de almoço"\n"recebi 500 de venda"\n"me lembra de reunião amanhã às 10h"\n"quanto gastei com Alimentação?"`
      );
  }
}

// ── Dispatcher ───────────────────────────────────────────────

async function processarMensagem(remetente, mensagem, tipo, mediaId) {
  try {
    if (tipo === 'image' && mediaId) return await processarImagem(remetente, mediaId);

    const txt = (mensagem || '').trim();
    const cmd = txt.toLowerCase().replace(/[^a-záéíóúãõ]/g, '');

    if (RE_CONFIRMAR.test(txt)) return await processarConfirmacao(remetente);
    if (['resumo','hoje','semana','lembretes','ajuda'].includes(cmd)) return await processarComando(cmd);
    if (RE_LEMBRETE.test(txt)) return await processarLembrete(txt);
    if (RE_CONSULTA.test(txt)) return await processarConsulta(txt);
    if (RE_REGISTRO.test(txt)) return await processarRegistro(remetente, txt);

    const resposta = await callAI(txt);
    await notificarPedro(resposta);
  } catch (err) {
    console.error('[Max] Erro:', err.message);
    await notificarPedro('⚠️ Erro interno. Tente novamente.');
  }
}

module.exports = { processarMensagem };
