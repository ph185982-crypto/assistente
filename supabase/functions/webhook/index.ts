import { serve } from 'https://deno.land/std@0.168.0/http/server.ts';
import { callAI, callOpenAI, extrairJSON, SYSTEM_PROMPT } from '../_shared/openai.ts';
import { notificarPedro } from '../_shared/whatsapp.ts';
import {
  inserirTransacao, confirmarTransacao, inserirLembrete,
  setPendente, getPendente, deletePendente,
  buscarTransacoesHoje, buscarTransacoesSemana, buscarTransacoesMes,
  buscarProximosLembretes, calcularResumo, fmt,
} from '../_shared/supabase.ts';

const MEU_NUMERO   = Deno.env.get('MEU_NUMERO')!;
const VERIFY_TOKEN = Deno.env.get('VERIFY_TOKEN')!;
const WA_TOKEN     = Deno.env.get('WHATSAPP_TOKEN')!;

// ── Imagem ───────────────────────────────────────────────────

async function processarImagem(remetente: string, mediaId: string) {
  const metaRes = await fetch(`https://graph.facebook.com/v19.0/${mediaId}`, {
    headers: { Authorization: `Bearer ${WA_TOKEN}` },
  });
  const { url: mediaUrl } = await metaRes.json();

  const imgRes = await fetch(mediaUrl, { headers: { Authorization: `Bearer ${WA_TOKEN}` } });
  const buf    = await imgRes.arrayBuffer();
  const base64 = btoa(String.fromCharCode(...new Uint8Array(buf)));
  const mime   = imgRes.headers.get('content-type') ?? 'image/jpeg';

  const texto = await callOpenAI([
    { role: 'system', content: SYSTEM_PROMPT },
    {
      role: 'user', content: [
        { type: 'image_url', image_url: { url: `data:${mime};base64,${base64}` } },
        { type: 'text', text: 'Analise este comprovante. Extraia valor, descrição, data (YYYY-MM-DD), tipo (despesa/receita) e categoria (Moradia|Transporte|Alimentação|Saúde|Lazer|Vestuário|Assinaturas|Negócios|Dívidas|Outros). Responda APENAS em JSON: {"valor":0,"descricao":"","data":"","tipo":"","categoria":""}' },
      ],
    },
  ]);

  const json = extrairJSON(texto);
  if (!json?.valor) { await notificarPedro('❓ Não identifiquei dados financeiros. Descreva em texto.'); return; }

  const t = await inserirTransacao({
    data_transacao: (json.data as string) || new Date().toISOString().slice(0, 10),
    tipo: json.tipo ?? 'despesa', valor: json.valor,
    descricao: json.descricao, categoria: json.categoria,
    comprovante_url: mediaUrl, confirmado: false,
  });

  await setPendente(remetente, t.id);
  const e = json.tipo === 'receita' ? '💰' : '💸';
  await notificarPedro(`📄 Comprovante identificado:\n${e} Tipo: ${json.tipo}\n💵 Valor: R$ ${fmt(Number(json.valor))}\n📝 ${json.descricao}\n🏷️ ${json.categoria}\n\nConfirma? Responda *sim* para salvar.`);
}

// ── Registro texto ───────────────────────────────────────────

async function processarRegistro(remetente: string, mensagem: string) {
  const resp = await callAI(`Usuário disse: "${mensagem}"\nExtraia em JSON: {"valor":0,"descricao":"","tipo":"receita ou despesa","categoria":"Moradia|Transporte|Alimentação|Saúde|Lazer|Vestuário|Assinaturas|Negócios|Dívidas|Outros"}\nSe não conseguir: {"erro":true}`);
  const json = extrairJSON(resp);
  if (!json || json.erro || !json.valor) { await notificarPedro('❓ Não entendi. Tente: "gastei 50 de almoço".'); return; }

  const t = await inserirTransacao({
    data_transacao: new Date().toISOString().slice(0, 10),
    tipo: json.tipo ?? 'despesa', valor: json.valor,
    descricao: json.descricao, categoria: json.categoria, confirmado: false,
  });

  await setPendente(remetente, t.id);
  const e = json.tipo === 'receita' ? '💰' : '💸';
  await notificarPedro(`${e} Registrar:\nTipo: ${json.tipo}\nValor: R$ ${fmt(Number(json.valor))}\nDescrição: ${json.descricao}\nCategoria: ${json.categoria}\n\nConfirma? Responda *sim* para salvar.`);
}

// ── Confirmação ──────────────────────────────────────────────

async function processarConfirmacao(remetente: string) {
  const id = await getPendente(remetente);
  if (!id) { await notificarPedro('Não há transação pendente.'); return; }
  await confirmarTransacao(id);
  await deletePendente(remetente);
  await notificarPedro('✅ Salvo com sucesso!');
}

// ── Lembrete ─────────────────────────────────────────────────

async function processarLembrete(mensagem: string) {
  const resp = await callAI(`Usuário disse: "${mensagem}"\nAgora: ${new Date().toISOString()}\nExtraia em JSON: {"descricao":"","data_hora":"ISO 8601","recorrente":false,"frequencia":"diario|semanal|mensal|null"}\nSe não conseguir: {"erro":true}`);
  const json = extrairJSON(resp);
  if (!json || json.erro || !json.data_hora) { await notificarPedro('❓ Não entendi. Tente: "me lembra de reunião amanhã às 10h".'); return; }

  await inserirLembrete({ descricao: json.descricao, data_hora: json.data_hora, recorrente: json.recorrente ?? false, frequencia: json.frequencia ?? null });
  const df = new Date(json.data_hora as string).toLocaleString('pt-BR', { timeZone: 'America/Sao_Paulo' });
  await notificarPedro(`⏰ Lembrete criado!\n📝 ${json.descricao}\n📅 ${df}${json.recorrente ? `\n🔁 ${json.frequencia}` : ''}`);
}

// ── Consulta ─────────────────────────────────────────────────

async function processarConsulta(mensagem: string) {
  let t, periodo: string;
  if (/hoje/i.test(mensagem))   { t = await buscarTransacoesHoje();   periodo = 'hoje'; }
  else if (/semana/i.test(mensagem)) { t = await (await import('../_shared/supabase.ts')).buscarTransacoesSemana?.() ?? []; periodo = 'esta semana'; }
  else                           { t = await buscarTransacoesMes();    periodo = 'este mês'; }

  if (!t.length) { await notificarPedro(`📊 Nenhuma transação para ${periodo}.`); return; }
  const { receitas, despesas, saldo } = calcularResumo(t);
  await notificarPedro(`📊 ${periodo}:\n💰 R$ ${fmt(receitas)}\n💸 R$ ${fmt(despesas)}\n📈 R$ ${fmt(saldo)}\n(${t.length} transações)`);
}

// ── Comandos ─────────────────────────────────────────────────

async function processarComando(cmd: string) {
  if (cmd === 'resumo' || cmd === 'semana' || cmd === 'hoje') {
    const t = cmd === 'hoje' ? await buscarTransacoesHoje() : await buscarTransacoesMes();
    const { receitas, despesas, saldo } = calcularResumo(t);
    await notificarPedro(`📊 ${cmd === 'hoje' ? 'Hoje' : cmd === 'semana' ? 'Semana' : 'Mês'}:\n💰 R$ ${fmt(receitas)}\n💸 R$ ${fmt(despesas)}\n📈 R$ ${fmt(saldo)}`);
  } else if (cmd === 'lembretes') {
    const l = await buscarProximosLembretes();
    if (!l.length) { await notificarPedro('Nenhum lembrete pendente.'); return; }
    await notificarPedro('📋 Próximos:\n' + l.map((r: Record<string, unknown>) => `⏰ ${new Date(r.data_hora as string).toLocaleString('pt-BR', { timeZone: 'America/Sao_Paulo' })} — ${r.descricao}`).join('\n'));
  } else {
    await notificarPedro(`🤖 *Max — Comandos:*\n\n*resumo* — Resumo do mês\n*hoje* — Transações de hoje\n*semana* — Semana atual\n*lembretes* — Próximos lembretes\n*ajuda* — Esta mensagem\n\nOu naturalmente:\n"gastei 50 de almoço"\n"recebi 500 de venda"\n"me lembra de reunião amanhã às 10h"`);
  }
}

// ── Dispatcher ───────────────────────────────────────────────

async function processarMensagem(remetente: string, mensagem: string | null, tipo: string, mediaId: string | null) {
  try {
    if (tipo === 'image' && mediaId) return await processarImagem(remetente, mediaId);

    const txt = (mensagem ?? '').trim();
    const cmd = txt.toLowerCase().replace(/[^a-záéíóúãõ]/g, '');

    if (/^(sim|confirma|pode salvar|ok|isso|correto|certo|salva|salvar)$/i.test(txt)) return await processarConfirmacao(remetente);
    if (['resumo','hoje','semana','lembretes','ajuda'].includes(cmd)) return await processarComando(cmd);
    if (/\b(me lembra|lembrete|reunião|todo dia|agenda|agendar|me avisa)\b/i.test(txt)) return await processarLembrete(txt);
    if (/\b(quanto gastei|qual.*saldo|despesas?|receitas?|resumo|saldo|extrato|gastos)\b/i.test(txt)) return await processarConsulta(txt);
    if (/\b(gastei|paguei|recebi|entrada de|despesa de|saída de|comprei)\b/i.test(txt)) return await processarRegistro(remetente, txt);

    const resposta = await callAI(txt);
    await notificarPedro(resposta);
  } catch (err) {
    console.error('[Max] Erro:', err);
    await notificarPedro('⚠️ Erro interno. Tente novamente.');
  }
}

// ── Servidor ─────────────────────────────────────────────────

serve(async (req) => {
  const url = new URL(req.url);

  // GET — verificação Meta
  if (req.method === 'GET') {
    const mode      = url.searchParams.get('hub.mode');
    const token     = url.searchParams.get('hub.verify_token');
    const challenge = url.searchParams.get('hub.challenge');
    if (mode === 'subscribe' && token === VERIFY_TOKEN) {
      return new Response(challenge, { status: 200 });
    }
    return new Response('Forbidden', { status: 403 });
  }

  // POST — mensagem
  if (req.method === 'POST') {
    const body = await req.json().catch(() => ({}));
    const msg  = body?.entry?.[0]?.changes?.[0]?.value?.messages?.[0];

    if (msg && msg.from === MEU_NUMERO) {
      const tipo    = msg.type;
      const texto   = tipo === 'text'  ? msg.text?.body  : null;
      const mediaId = tipo === 'image' ? msg.image?.id   : null;
      // Processa em background, responde 200 imediatamente
      processarMensagem(msg.from, texto, tipo, mediaId);
    }

    return new Response(JSON.stringify({ ok: true }), {
      status: 200, headers: { 'Content-Type': 'application/json' },
    });
  }

  return new Response('Method Not Allowed', { status: 405 });
});
