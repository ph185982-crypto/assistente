'use strict';
require('dotenv').config();
const axios = require('axios');
const Anthropic = require('@anthropic-ai/sdk');
const { notificarPedro } = require('./whatsapp');
const db = require('./supabase');

const claude = new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY });
const MODEL = 'claude-sonnet-4-6';

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

Regras de comportamento:
1. Respostas curtas e diretas no WhatsApp
2. Usar emojis com moderação
3. Quando identificar gasto fora do planejado, alertar
4. Sempre confirmar antes de salvar qualquer transação
5. Nunca inventar valores — só registrar o que Pedro confirmar
6. Se não entender a mensagem, perguntar de forma simples`;

// transações pendentes de confirmação por número
const pendentes = new Map();

// ── Helpers ──────────────────────────────────────────────────

function formatarValor(v) {
  return Number(v).toLocaleString('pt-BR', { minimumFractionDigits: 2 });
}

function formatarData(d) {
  if (!d) return 'data não informada';
  return new Date(d + 'T12:00:00').toLocaleDateString('pt-BR');
}

async function callClaude(userMsg, systemOverride = null) {
  const res = await claude.messages.create({
    model: MODEL,
    max_tokens: 512,
    system: systemOverride || SYSTEM_PROMPT,
    messages: [{ role: 'user', content: userMsg }],
  });
  return res.content[0].text.trim();
}

async function extrairJSON(texto) {
  const match = texto.match(/\{[\s\S]*\}/);
  if (!match) return null;
  try { return JSON.parse(match[0]); } catch { return null; }
}

// ── 1. Imagem / Comprovante ──────────────────────────────────

async function processarImagem(remetente, mediaId) {
  // Busca URL da mídia na Meta API
  const metaRes = await axios.get(
    `https://graph.facebook.com/v19.0/${mediaId}`,
    { headers: { Authorization: `Bearer ${process.env.WHATSAPP_TOKEN}` } }
  );
  const mediaUrl = metaRes.data.url;

  // Baixa a imagem
  const imgRes = await axios.get(mediaUrl, {
    responseType: 'arraybuffer',
    headers: { Authorization: `Bearer ${process.env.WHATSAPP_TOKEN}` },
  });
  const base64 = Buffer.from(imgRes.data).toString('base64');
  const mimeType = imgRes.headers['content-type'] || 'image/jpeg';

  // Envia para Claude com vision
  const res = await claude.messages.create({
    model: MODEL,
    max_tokens: 512,
    system: SYSTEM_PROMPT,
    messages: [
      {
        role: 'user',
        content: [
          {
            type: 'image',
            source: { type: 'base64', media_type: mimeType, data: base64 },
          },
          {
            type: 'text',
            text: `Analise este comprovante/imagem financeira. Extraia:
1. Valor (número apenas)
2. Estabelecimento ou descrição
3. Data (se visível, formato YYYY-MM-DD)
4. Tipo: despesa ou receita
5. Categoria sugerida entre: Moradia, Transporte, Alimentação, Saúde, Lazer, Vestuário, Assinaturas, Negócios, Dívidas, Outros
Responda APENAS em JSON: {"valor": 0, "descricao": "", "data": "", "tipo": "", "categoria": ""}`,
          },
        ],
      },
    ],
  });

  const json = await extrairJSON(res.content[0].text);
  if (!json || !json.valor) {
    await notificarPedro('❓ Não consegui identificar os dados financeiros nessa imagem. Pode me descrever a transação em texto?');
    return;
  }

  const transacao = await db.inserirTransacao({
    data_transacao: json.data || new Date().toISOString().slice(0, 10),
    tipo: json.tipo || 'despesa',
    valor: json.valor,
    descricao: json.descricao,
    categoria: json.categoria,
    comprovante_url: mediaUrl,
    confirmado: false,
  });

  pendentes.set(remetente, transacao.id);

  const emoji = json.tipo === 'receita' ? '💰' : '💸';
  await notificarPedro(
    `📄 Comprovante identificado:\n` +
    `${emoji} Tipo: ${json.tipo}\n` +
    `💵 Valor: R$ ${formatarValor(json.valor)}\n` +
    `📝 Descrição: ${json.descricao}\n` +
    `🏷️ Categoria: ${json.categoria}\n` +
    `📅 Data: ${formatarData(json.data)}\n\n` +
    `Confirma? Responda *sim* para salvar ou me diga o que corrigir.`
  );
}

// ── 2. Registro manual por texto ─────────────────────────────

const REGEX_REGISTRO = /\b(gastei|paguei|recebi|entrada de|despesa de|saída de|comprei)\b/i;

async function processarRegistroTexto(remetente, mensagem) {
  const resposta = await callClaude(
    `O usuário disse: "${mensagem}"\nExtraia a transação financeira em JSON:\n{"valor": 0, "descricao": "", "tipo": "receita ou despesa", "categoria": "uma entre Moradia, Transporte, Alimentação, Saúde, Lazer, Vestuário, Assinaturas, Negócios, Dívidas, Outros"}\nSe não conseguir extrair, retorne {"erro": true}`
  );

  const json = await extrairJSON(resposta);
  if (!json || json.erro || !json.valor) {
    await notificarPedro('❓ Não entendi. Tente: "gastei 50 de almoço" ou "recebi 200 de venda".');
    return;
  }

  const transacao = await db.inserirTransacao({
    data_transacao: new Date().toISOString().slice(0, 10),
    tipo: json.tipo || 'despesa',
    valor: json.valor,
    descricao: json.descricao,
    categoria: json.categoria,
    confirmado: false,
  });

  pendentes.set(remetente, transacao.id);

  const emoji = json.tipo === 'receita' ? '💰' : '💸';
  await notificarPedro(
    `${emoji} Registrar:\n` +
    `Tipo: ${json.tipo}\n` +
    `Valor: R$ ${formatarValor(json.valor)}\n` +
    `Descrição: ${json.descricao}\n` +
    `Categoria: ${json.categoria}\n\n` +
    `Confirma? Responda *sim* para salvar.`
  );
}

// ── 3. Confirmação ───────────────────────────────────────────

const REGEX_CONFIRMAR = /^(sim|confirma|pode salvar|ok|isso|correto|certo|salva|salvar)\s*$/i;

async function processarConfirmacao(remetente) {
  const id = pendentes.get(remetente);
  if (!id) {
    await notificarPedro('Não há nenhuma transação pendente de confirmação.');
    return;
  }

  await db.confirmarTransacao(id);
  pendentes.delete(remetente);
  await notificarPedro('✅ Salvo com sucesso!');
}

// ── 4. Lembretes / Agenda ─────────────────────────────────────

const REGEX_LEMBRETE = /\b(me lembra|lembrete|reunião|todo dia|agenda|agendar|me avisa|avisa)\b/i;

async function processarLembrete(mensagem) {
  const agora = new Date().toISOString();
  const resposta = await callClaude(
    `O usuário disse: "${mensagem}".\nData/hora atual: ${agora}.\nExtraia o lembrete em JSON:\n{"descricao": "", "data_hora": "ISO 8601", "recorrente": false, "frequencia": "diario|semanal|mensal|null"}\nSe não conseguir extrair, retorne {"erro": true}`
  );

  const json = await extrairJSON(resposta);
  if (!json || json.erro || !json.data_hora) {
    await notificarPedro('❓ Não entendi o horário. Tente: "me lembra de academia amanhã às 7h".');
    return;
  }

  await db.inserirLembrete({
    descricao: json.descricao,
    data_hora: json.data_hora,
    recorrente: json.recorrente || false,
    frequencia: json.frequencia || null,
  });

  const dataFormatada = new Date(json.data_hora).toLocaleString('pt-BR', { timeZone: 'America/Sao_Paulo' });
  await notificarPedro(
    `⏰ Lembrete criado!\n` +
    `📝 ${json.descricao}\n` +
    `📅 ${dataFormatada}` +
    (json.recorrente ? `\n🔁 Recorrente: ${json.frequencia}` : '')
  );
}

// ── 5. Consultas financeiras ──────────────────────────────────

const REGEX_CONSULTA = /\b(quanto gastei|qual.*saldo|despesas?|receitas?|resumo|saldo|extrato|quanto.*mês|gastos)\b/i;

async function processarConsulta(mensagem) {
  let transacoes = [];
  let periodo = 'mês atual';

  if (/hoje/i.test(mensagem)) {
    transacoes = await db.buscarTransacoesHoje();
    periodo = 'hoje';
  } else if (/semana/i.test(mensagem)) {
    transacoes = await db.buscarTransacoesSemana();
    periodo = 'esta semana';
  } else {
    transacoes = await db.buscarTransacoesMes();
    periodo = 'este mês';
  }

  // Filtrar por categoria se mencionada
  const categorias = ['Moradia', 'Transporte', 'Alimentação', 'Saúde', 'Lazer', 'Vestuário', 'Assinaturas', 'Negócios', 'Dívidas'];
  for (const cat of categorias) {
    if (mensagem.toLowerCase().includes(cat.toLowerCase())) {
      transacoes = transacoes.filter(t => t.categoria === cat);
      periodo += ` (${cat})`;
      break;
    }
  }

  const { receitas, despesas, saldo } = db.calcularResumo(transacoes);

  if (transacoes.length === 0) {
    await notificarPedro(`📊 Nenhuma transação registrada para ${periodo}.`);
    return;
  }

  await notificarPedro(
    `📊 Resumo — ${periodo}:\n\n` +
    `💰 Receitas: R$ ${formatarValor(receitas)}\n` +
    `💸 Despesas: R$ ${formatarValor(despesas)}\n` +
    `📈 Saldo: R$ ${formatarValor(saldo)}\n\n` +
    `(${transacoes.length} transações)`
  );
}

// ── 6. Comandos diretos ───────────────────────────────────────

async function processarComando(cmd) {
  switch (cmd) {
    case 'resumo': {
      const t = await db.buscarTransacoesMes();
      const { receitas, despesas, saldo } = db.calcularResumo(t);
      await notificarPedro(
        `📊 Resumo do mês:\n💰 Receitas: R$ ${formatarValor(receitas)}\n💸 Despesas: R$ ${formatarValor(despesas)}\n📈 Saldo: R$ ${formatarValor(saldo)}`
      );
      break;
    }
    case 'hoje': {
      const t = await db.buscarTransacoesHoje();
      if (!t.length) { await notificarPedro('Nenhuma transação hoje.'); break; }
      const linhas = t.map(tx => `${tx.tipo === 'receita' ? '💰' : '💸'} R$ ${formatarValor(tx.valor)} — ${tx.descricao}`).join('\n');
      await notificarPedro(`📅 Hoje:\n${linhas}`);
      break;
    }
    case 'semana': {
      const t = await db.buscarTransacoesSemana();
      const { receitas, despesas, saldo } = db.calcularResumo(t);
      await notificarPedro(
        `📊 Esta semana:\n💰 Receitas: R$ ${formatarValor(receitas)}\n💸 Despesas: R$ ${formatarValor(despesas)}\n📈 Saldo: R$ ${formatarValor(saldo)}`
      );
      break;
    }
    case 'lembretes': {
      const l = await db.buscarProximosLembretes();
      if (!l.length) { await notificarPedro('Nenhum lembrete pendente.'); break; }
      const linhas = l.map(r => `⏰ ${new Date(r.data_hora).toLocaleString('pt-BR', { timeZone: 'America/Sao_Paulo' })} — ${r.descricao}`).join('\n');
      await notificarPedro(`📋 Próximos lembretes:\n${linhas}`);
      break;
    }
    case 'ajuda':
    default:
      await notificarPedro(
        `🤖 *Max — Comandos disponíveis:*\n\n` +
        `*resumo* — Resumo do mês\n` +
        `*hoje* — Transações de hoje\n` +
        `*semana* — Transações da semana\n` +
        `*lembretes* — Próximos lembretes\n` +
        `*ajuda* — Esta mensagem\n\n` +
        `Ou me diga naturalmente:\n` +
        `"gastei 50 de almoço"\n` +
        `"recebi 500 de venda"\n` +
        `"me lembra de academia amanhã às 7h"\n` +
        `"quanto gastei este mês com Alimentação?"`
      );
  }
}

// ── Dispatcher principal ─────────────────────────────────────

async function processarMensagem(remetente, mensagem, tipo, mediaId) {
  try {
    if (tipo === 'image' && mediaId) {
      return await processarImagem(remetente, mediaId);
    }

    const texto = (mensagem || '').trim();
    const cmdLimpo = texto.toLowerCase().replace(/[^a-záéíóúãõ]/g, '');

    // Confirmação
    if (REGEX_CONFIRMAR.test(texto)) {
      return await processarConfirmacao(remetente);
    }

    // Comandos diretos
    if (['resumo', 'hoje', 'semana', 'lembretes', 'ajuda'].includes(cmdLimpo)) {
      return await processarComando(cmdLimpo);
    }

    // Lembrete / agenda
    if (REGEX_LEMBRETE.test(texto)) {
      return await processarLembrete(texto);
    }

    // Consulta financeira
    if (REGEX_CONSULTA.test(texto)) {
      return await processarConsulta(texto);
    }

    // Registro manual
    if (REGEX_REGISTRO.test(texto)) {
      return await processarRegistroTexto(remetente, texto);
    }

    // Fallback: conversa geral com o Max
    const resposta = await callClaude(texto);
    await notificarPedro(resposta);
  } catch (err) {
    console.error('[Max] Erro ao processar mensagem:', err.message);
    await notificarPedro('⚠️ Ocorreu um erro interno. Tente novamente.');
  }
}

module.exports = { processarMensagem };
