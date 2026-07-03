// Max 2.0 — assistente pessoal completo (zero-import, OpenAI GPT-5)
// Sem imports externos: Supabase via REST direto, OpenAI e WhatsApp via fetch nativo.

// ── OpenAI config ─────────────────────────────────────────────────────────────

const OPENAI_CHAT       = 'https://api.openai.com/v1/chat/completions';
const OPENAI_RESPONSES  = 'https://api.openai.com/v1/responses';
const OPENAI_TRANSCRIBE = 'https://api.openai.com/v1/audio/transcriptions';
const OPENAI_TTS        = 'https://api.openai.com/v1/audio/speech';
const MODEL_CHAT = 'gpt-5-mini';
const MODEL_DEEP = 'gpt-5';

// ── Supabase REST helpers ─────────────────────────────────────────────────────

function supaHeaders(key: string) {
  return { apikey: key, Authorization: `Bearer ${key}`, 'Content-Type': 'application/json' };
}

async function dbSelect(table: string, params: string, key: string, url: string) {
  const res = await fetch(`${url}/rest/v1/${table}?${params}`, { headers: supaHeaders(key) });
  if (!res.ok) throw new Error(`DB select ${table}: ${await res.text()}`);
  return res.json();
}

async function dbInsert(table: string, data: Record<string, unknown>, key: string, url: string) {
  const res = await fetch(`${url}/rest/v1/${table}`, {
    method: 'POST',
    headers: { ...supaHeaders(key), Prefer: 'return=representation' },
    body: JSON.stringify(data),
  });
  if (!res.ok) throw new Error(`DB insert ${table}: ${await res.text()}`);
  const arr = await res.json();
  return Array.isArray(arr) ? arr[0] : arr;
}

async function dbUpdate(table: string, filter: string, data: Record<string, unknown>, key: string, url: string) {
  const res = await fetch(`${url}/rest/v1/${table}?${filter}`, {
    method: 'PATCH',
    headers: { ...supaHeaders(key), Prefer: 'return=representation' },
    body: JSON.stringify(data),
  });
  if (!res.ok) throw new Error(`DB update ${table}: ${await res.text()}`);
  return res.json();
}

async function dbUpsert(table: string, data: Record<string, unknown>, key: string, url: string) {
  const res = await fetch(`${url}/rest/v1/${table}`, {
    method: 'POST',
    headers: { ...supaHeaders(key), Prefer: 'resolution=merge-duplicates,return=representation' },
    body: JSON.stringify(data),
  });
  if (!res.ok) throw new Error(`DB upsert ${table}: ${await res.text()}`);
  return res.json();
}

async function dbDelete(table: string, filter: string, key: string, url: string) {
  const res = await fetch(`${url}/rest/v1/${table}?${filter}`, {
    method: 'DELETE',
    headers: supaHeaders(key),
  });
  if (!res.ok) throw new Error(`DB delete ${table}: ${await res.text()}`);
}

// ── Número helpers ────────────────────────────────────────────────────────────

function normalizarNumero(num: string): string {
  const d = num.replace(/\D/g, '');
  if (d.startsWith('55') && d.length === 12) return '55' + d.slice(2, 4) + '9' + d.slice(4);
  return d;
}

function numerosIguais(a: string, b: string) {
  return normalizarNumero(a) === normalizarNumero(b);
}

// ── Conversa ──────────────────────────────────────────────────────────────────

async function salvarMensagem(numero: string, role: string, content: string, key: string, url: string) {
  await dbInsert('conversas', { numero: normalizarNumero(numero), role, content }, key, url);
}

async function buscarHistorico(numero: string, limite: number, key: string, url: string) {
  const data = await dbSelect('conversas',
    `select=role,content&numero=eq.${encodeURIComponent(normalizarNumero(numero))}&order=criado_em.desc&limit=${limite}`,
    key, url);
  return (data ?? []).reverse();
}

// ── Contexto / memória ────────────────────────────────────────────────────────

async function salvarContexto(chave: string, valor: string, categoria: string, key: string, url: string) {
  await dbUpsert('contexto_pedro', {
    chave, valor, categoria, atualizado_em: new Date().toISOString()
  }, key, url);
}

async function buscarTodoContexto(key: string, url: string) {
  return dbSelect('contexto_pedro', 'select=*&order=categoria', key, url);
}

// ── Transações ────────────────────────────────────────────────────────────────

// deno-lint-ignore no-explicit-any
async function inserirTransacao(dados: Record<string, any>, key: string, url: string) {
  const mes = (dados.data_transacao as string)?.slice(0, 7) ?? new Date().toISOString().slice(0, 7);
  return dbInsert('transacoes', { ...dados, mes }, key, url);
}

async function cancelarTransacao(id: string, key: string, url: string) {
  await dbDelete('transacoes', `id=eq.${id}`, key, url);
}

async function buscarTransacoesPeriodo(inicio: string, fim: string, key: string, url: string) {
  return dbSelect('transacoes',
    `select=*&confirmado=eq.true&data_transacao=gte.${inicio}&data_transacao=lte.${fim}&order=data_transacao.desc`,
    key, url);
}

async function buscarTransacoesHoje(key: string, url: string) {
  const h = new Date().toISOString().slice(0, 10);
  return buscarTransacoesPeriodo(h, h, key, url);
}

async function buscarTransacoesSemana(key: string, url: string) {
  const hoje = new Date();
  const inicio = new Date(hoje); inicio.setDate(hoje.getDate() - hoje.getDay());
  return buscarTransacoesPeriodo(inicio.toISOString().slice(0, 10), hoje.toISOString().slice(0, 10), key, url);
}

async function buscarTransacoesMes(key: string, url: string, mes?: string) {
  const ref = mes ?? new Date().toISOString().slice(0, 7);
  const inicio = `${ref}-01`;
  const fim = new Date(ref + '-01');
  fim.setMonth(fim.getMonth() + 1); fim.setDate(0);
  return buscarTransacoesPeriodo(inicio, fim.toISOString().slice(0, 10), key, url);
}

async function buscarTransacoesOntem(key: string, url: string) {
  const d = new Date(); d.setDate(d.getDate() - 1);
  const s = d.toISOString().slice(0, 10);
  return buscarTransacoesPeriodo(s, s, key, url);
}

async function buscarTransacoesUltimosDias(dias: number, key: string, url: string) {
  const fim = new Date().toISOString().slice(0, 10);
  const d = new Date(); d.setDate(d.getDate() - dias);
  return buscarTransacoesPeriodo(d.toISOString().slice(0, 10), fim, key, url);
}

// ── Lembretes ─────────────────────────────────────────────────────────────────

// deno-lint-ignore no-explicit-any
async function inserirLembrete(dados: Record<string, any>, key: string, url: string) {
  return dbInsert('lembretes', dados, key, url);
}

async function buscarProximosLembretes(key: string, url: string) {
  return dbSelect('lembretes',
    `select=*&enviado=eq.false&data_hora=gte.${encodeURIComponent(new Date().toISOString())}&order=data_hora.asc&limit=5`,
    key, url);
}

// ── Cálculos ──────────────────────────────────────────────────────────────────

// deno-lint-ignore no-explicit-any
function calcularResumo(t: Record<string, any>[]) {
  const receitas = t.filter(x => x.tipo === 'receita').reduce((s, x) => s + Number(x.valor), 0);
  const despesas = t.filter(x => x.tipo === 'despesa').reduce((s, x) => s + Number(x.valor), 0);
  return { receitas, despesas, saldo: receitas - despesas };
}

// deno-lint-ignore no-explicit-any
function calcularPorCategoria(t: Record<string, any>[]) {
  return t.reduce((acc: Record<string, { despesas: number; receitas: number }>, x) => {
    const cat = (x.categoria as string) ?? 'Outros';
    if (!acc[cat]) acc[cat] = { receitas: 0, despesas: 0 };
    if (x.tipo === 'receita') acc[cat].receitas += Number(x.valor);
    else acc[cat].despesas += Number(x.valor);
    return acc;
  }, {});
}

function fmt(v: number) {
  return v.toLocaleString('pt-BR', { minimumFractionDigits: 2 });
}

// ── WhatsApp ──────────────────────────────────────────────────────────────────

async function sendWhatsApp(to: string, texto: string) {
  const TOKEN    = Deno.env.get('WHATSAPP_TOKEN')!;
  const PHONE_ID = Deno.env.get('WHATSAPP_PHONE_NUMBER_ID')!;
  await fetch(`https://graph.facebook.com/v19.0/${PHONE_ID}/messages`, {
    method: 'POST',
    headers: { Authorization: `Bearer ${TOKEN}`, 'Content-Type': 'application/json' },
    body: JSON.stringify({ messaging_product: 'whatsapp', to, type: 'text', text: { body: texto } }),
  });
}

function notificarPedro(texto: string) {
  return sendWhatsApp(Deno.env.get('MEU_NUMERO')!, texto);
}

async function enviarResposta(texto: string) {
  const MAX = 4000;
  if (texto.length <= MAX) { await notificarPedro(texto); return; }
  const partes = texto.match(/[\s\S]{1,4000}(?:\n|$)/g) ?? [texto.slice(0, MAX)];
  for (const parte of partes) await notificarPedro(parte.trim());
}

async function baixarMidiaWhatsApp(mediaId: string): Promise<{ mimeType: string; bytes: Uint8Array; base64: string }> {
  const WA_TOKEN = Deno.env.get('WHATSAPP_TOKEN')!;
  const metaRes = await fetch(`https://graph.facebook.com/v19.0/${mediaId}`,
    { headers: { Authorization: `Bearer ${WA_TOKEN}` } });
  const { url: mediaUrl, mime_type: mimeMeta } = await metaRes.json();
  const bin = await fetch(mediaUrl, { headers: { Authorization: `Bearer ${WA_TOKEN}` } });
  const buf  = await bin.arrayBuffer();
  const mime = bin.headers.get('content-type') ?? mimeMeta ?? 'application/octet-stream';
  const bytes = new Uint8Array(buf);
  let binary = '';
  const chunk = 8192;
  for (let i = 0; i < bytes.length; i += chunk)
    binary += String.fromCharCode(...bytes.subarray(i, i + chunk));
  return { mimeType: mime.split(';')[0], bytes, base64: btoa(binary) };
}

// Envia resposta em áudio (voz) — usado quando o Pedro manda áudio
async function enviarAudioResposta(texto: string, openaiKey: string) {
  const TOKEN    = Deno.env.get('WHATSAPP_TOKEN')!;
  const PHONE_ID = Deno.env.get('WHATSAPP_PHONE_NUMBER_ID')!;
  const MEU_NUM  = Deno.env.get('MEU_NUMERO')!;

  const ttsRes = await fetch(OPENAI_TTS, {
    method: 'POST',
    headers: { Authorization: `Bearer ${openaiKey}`, 'Content-Type': 'application/json' },
    body: JSON.stringify({ model: 'gpt-4o-mini-tts', voice: 'onyx', input: texto.slice(0, 1500), response_format: 'opus' }),
  });
  if (!ttsRes.ok) throw new Error(`TTS: ${await ttsRes.text()}`);
  const audioBuf = await ttsRes.arrayBuffer();

  const form = new FormData();
  form.append('messaging_product', 'whatsapp');
  form.append('type', 'audio/ogg');
  form.append('file', new Blob([audioBuf], { type: 'audio/ogg' }), 'resposta.ogg');
  const upRes = await fetch(`https://graph.facebook.com/v19.0/${PHONE_ID}/media`, {
    method: 'POST',
    headers: { Authorization: `Bearer ${TOKEN}` },
    body: form,
  });
  const upJson = await upRes.json();
  if (!upJson.id) throw new Error(`Upload áudio: ${JSON.stringify(upJson)}`);

  await fetch(`https://graph.facebook.com/v19.0/${PHONE_ID}/messages`, {
    method: 'POST',
    headers: { Authorization: `Bearer ${TOKEN}`, 'Content-Type': 'application/json' },
    body: JSON.stringify({ messaging_product: 'whatsapp', to: MEU_NUM, type: 'audio', audio: { id: upJson.id } }),
  });
}

// ── OpenAI: chat, transcrição, web search ─────────────────────────────────────

// deno-lint-ignore no-explicit-any
async function callOpenAI(messages: any[], openaiKey: string, opts?: { model?: string; semTools?: boolean; effort?: string }) {
  const delays = [2000, 4000, 8000];
  let lastErr = '';

  // deno-lint-ignore no-explicit-any
  const body: Record<string, any> = {
    model: opts?.model ?? MODEL_CHAT,
    messages,
    max_completion_tokens: 3000,
    reasoning_effort: opts?.effort ?? 'low',
  };
  if (!opts?.semTools) { body.tools = TOOLS; body.tool_choice = 'auto'; }

  for (let tentativa = 0; tentativa <= delays.length; tentativa++) {
    const res = await fetch(OPENAI_CHAT, {
      method: 'POST',
      headers: { Authorization: `Bearer ${openaiKey}`, 'Content-Type': 'application/json' },
      body: JSON.stringify(body),
    });

    if (res.ok) {
      const json = await res.json();
      const msg = json.choices?.[0]?.message;
      return {
        text: msg?.content ?? '',
        toolCalls: msg?.tool_calls ?? [],
        message: msg,
        finishReason: json.choices?.[0]?.finish_reason as string,
      };
    }

    lastErr = await res.text();
    if ((res.status === 429 || res.status >= 500) && tentativa < delays.length) {
      await new Promise(r => setTimeout(r, delays[tentativa]));
      continue;
    }
    throw new Error(`OpenAI error ${res.status}: ${lastErr.slice(0, 300)}`);
  }
  throw new Error(`OpenAI error: ${lastErr.slice(0, 300)}`);
}

async function transcreverAudio(bytes: Uint8Array, mime: string, openaiKey: string): Promise<string> {
  const ext = mime.includes('ogg') ? 'ogg' : mime.includes('mp4') ? 'mp4' : mime.includes('mpeg') ? 'mp3' : 'ogg';
  const form = new FormData();
  form.append('file', new Blob([bytes.buffer as ArrayBuffer], { type: mime }), `audio.${ext}`);
  form.append('model', 'whisper-1');
  form.append('language', 'pt');
  const res = await fetch(OPENAI_TRANSCRIBE, {
    method: 'POST',
    headers: { Authorization: `Bearer ${openaiKey}` },
    body: form,
  });
  if (!res.ok) throw new Error(`Whisper: ${await res.text()}`);
  const json = await res.json();
  return json.text ?? '';
}

async function buscarNaWeb(consulta: string, openaiKey: string): Promise<string> {
  const res = await fetch(OPENAI_RESPONSES, {
    method: 'POST',
    headers: { Authorization: `Bearer ${openaiKey}`, 'Content-Type': 'application/json' },
    body: JSON.stringify({
      model: MODEL_CHAT,
      tools: [{ type: 'web_search' }],
      input: `Pesquise na web e responda em português, de forma objetiva e com os fatos mais recentes: ${consulta}`,
      max_output_tokens: 2000,
    }),
  });
  if (!res.ok) throw new Error(`Web search: ${(await res.text()).slice(0, 300)}`);
  const json = await res.json();
  let texto = '';
  for (const item of json.output ?? []) {
    if (item.type === 'message') {
      for (const c of item.content ?? []) {
        if (c.type === 'output_text') texto += c.text + '\n';
      }
    }
  }
  return texto.trim() || '(sem resultados)';
}

// ── Tools ─────────────────────────────────────────────────────────────────────

const TOOLS = [
  {
    type: 'function',
    function: {
      name: 'registrar_transacao',
      description: 'Registra uma receita ou despesa imediatamente. Após registrar, mostra mini-extrato do dia.',
      parameters: {
        type: 'object',
        properties: {
          tipo:         { type: 'string', enum: ['receita', 'despesa'] },
          valor:        { type: 'number' },
          descricao:    { type: 'string' },
          categoria: {
            type: 'string',
            enum: ['Moradia','Transporte','Alimentação','Saúde','Lazer','Vestuário',
              'Assinaturas','Negócios','Dívidas/Parcelas','Fornecedor','Marketing',
              'Salário','Renda Variável','Outros'],
          },
          tipo_negocio: { type: 'string', enum: ['pessoal','vendedoria','lukaizen','geral'] },
          data:         { type: 'string', description: 'YYYY-MM-DD' },
          empresa:      { type: 'string' },
        },
        required: ['tipo','valor','descricao','categoria','tipo_negocio'],
      },
    },
  },
  {
    type: 'function',
    function: {
      name: 'desfazer_ultima',
      description: 'Apaga a última transação registrada se Pedro pedir para desfazer ou cancelar',
      parameters: {
        type: 'object',
        properties: { id: { type: 'string', description: 'ID da transação a apagar' } },
      },
    },
  },
  {
    type: 'function',
    function: {
      name: 'criar_lembrete',
      description: 'Cria lembrete ou evento na agenda',
      parameters: {
        type: 'object',
        properties: {
          descricao:  { type: 'string' },
          data_hora:  { type: 'string', description: 'ISO 8601 fuso Brasília UTC-3' },
          recorrente: { type: 'boolean' },
          frequencia: { type: 'string', enum: ['diario','semanal','mensal'] },
        },
        required: ['descricao','data_hora'],
      },
    },
  },
  {
    type: 'function',
    function: {
      name: 'consultar_financas',
      description: 'Consulta dados financeiros. Use para qualquer pergunta sobre gastos, saldo, receitas.',
      parameters: {
        type: 'object',
        properties: {
          periodo:      { type: 'string', enum: ['hoje','semana','mes','mes_passado','ontem'] },
          tipo_negocio: { type: 'string', enum: ['pessoal','vendedoria','lukaizen','geral','todos'] },
          categoria:    { type: 'string' },
        },
        required: ['periodo'],
      },
    },
  },
  {
    type: 'function',
    function: {
      name: 'salvar_informacao',
      description: 'Salva info importante sobre Pedro para contexto futuro (metas, rotina, negócios, contatos)',
      parameters: {
        type: 'object',
        properties: {
          chave:     { type: 'string' },
          valor:     { type: 'string' },
          categoria: { type: 'string', enum: ['financeiro','negocio','pessoal','meta','contato','rotina','outros'] },
        },
        required: ['chave','valor','categoria'],
      },
    },
  },
  {
    type: 'function',
    function: {
      name: 'listar_lembretes',
      description: 'Lista os próximos lembretes agendados',
      parameters: { type: 'object', properties: {} },
    },
  },
  {
    type: 'function',
    function: {
      name: 'buscar_na_web',
      description: 'Pesquisa na internet em tempo real: notícias, cotações, informações atuais, qualquer coisa que exija dados recentes ou externos. Use sempre que Pedro pedir notícias, pesquisa ou informação que você não tem.',
      parameters: {
        type: 'object',
        properties: { consulta: { type: 'string', description: 'O que pesquisar' } },
        required: ['consulta'],
      },
    },
  },
  {
    type: 'function',
    function: {
      name: 'analise_profunda',
      description: 'Análise financeira profunda com modelo avançado: usa 3 meses de transações + dívidas + metas. Use quando Pedro pedir conselho sério, análise, planejamento, decisão financeira importante.',
      parameters: {
        type: 'object',
        properties: { pergunta: { type: 'string', description: 'A pergunta ou decisão a analisar' } },
        required: ['pergunta'],
      },
    },
  },
  {
    type: 'function',
    function: {
      name: 'gerenciar_divida',
      description: 'Gerencia dívidas: listar dívidas ativas, registrar pagamento de parcela, quitar dívida',
      parameters: {
        type: 'object',
        properties: {
          acao:  { type: 'string', enum: ['listar','pagar_parcela','quitar'] },
          id:    { type: 'string', description: 'ID da dívida (obtenha com listar primeiro)' },
          valor: { type: 'number', description: 'Valor pago (para pagar_parcela)' },
        },
        required: ['acao'],
      },
    },
  },
  {
    type: 'function',
    function: {
      name: 'gerenciar_receita_prevista',
      description: 'Gerencia receitas previstas (dinheiro que vai entrar): criar previsão, listar pendentes, confirmar recebimento',
      parameters: {
        type: 'object',
        properties: {
          acao:          { type: 'string', enum: ['criar','listar','confirmar'] },
          id:            { type: 'string', description: 'ID (para confirmar)' },
          descricao:     { type: 'string' },
          valor:         { type: 'number' },
          data_prevista: { type: 'string', description: 'YYYY-MM-DD' },
          cliente:       { type: 'string' },
          tipo_negocio:  { type: 'string', enum: ['pessoal','vendedoria','lukaizen','geral'] },
        },
        required: ['acao'],
      },
    },
  },
  {
    type: 'function',
    function: {
      name: 'gerenciar_tarefa',
      description: 'Tarefas/mandatos com cobrança: Pedro pede "toda sexta me lembra de cobrar X" ou "acompanha Y". O Max cobra o resultado na data e registra a resposta.',
      parameters: {
        type: 'object',
        properties: {
          acao:             { type: 'string', enum: ['criar','listar','concluir','cancelar','registrar_resposta'] },
          id:               { type: 'string' },
          descricao:        { type: 'string' },
          proxima_cobranca: { type: 'string', description: 'ISO 8601 fuso Brasília UTC-3 (para criar)' },
          recorrente:       { type: 'boolean' },
          frequencia:       { type: 'string', enum: ['diario','semanal','mensal'] },
          resposta:         { type: 'string', description: 'Resposta do Pedro à cobrança (para registrar_resposta)' },
        },
        required: ['acao'],
      },
    },
  },
];

// ── System prompt ─────────────────────────────────────────────────────────────

async function buildSystemPrompt(key: string, url: string): Promise<string> {
  const [transacoesMes, lembretes, contexto, dividas, tarefas, metas] = await Promise.all([
    buscarTransacoesMes(key, url),
    buscarProximosLembretes(key, url),
    buscarTodoContexto(key, url),
    dbSelect('dividas', 'select=id,descricao,credor,valor_total,valor_pago,parcela_mensal,dia_vencimento&status=eq.ativa', key, url).catch(() => []),
    dbSelect('tarefas', 'select=id,descricao,proxima_cobranca,recorrente&status=eq.ativa&order=proxima_cobranca.asc&limit=8', key, url).catch(() => []),
    dbSelect('metas_financeiras', 'select=*&status=eq.ativa', key, url).catch(() => []),
  ]);

  const { receitas, despesas, saldo } = calcularResumo(transacoesMes);
  const porCat = calcularPorCategoria(transacoesMes.filter((t: Record<string, unknown>) => t.tipo === 'despesa'));

  const topCategorias = Object.entries(porCat)
    .sort((a, b) => (b[1] as { despesas: number }).despesas - (a[1] as { despesas: number }).despesas)
    .slice(0, 5)
    .map(([cat, v]) => `  ${cat}: R$ ${fmt((v as { despesas: number }).despesas)}`).join('\n');

  const lembretesStr = lembretes.length
    ? lembretes.map((l: Record<string, unknown>) => `  • ${new Date(l.data_hora as string).toLocaleString('pt-BR', { timeZone: 'America/Sao_Paulo' })}: ${l.descricao}`).join('\n')
    : '  (nenhum)';

  const dividasStr = dividas.length
    ? dividas.map((d: Record<string, unknown>) =>
        `  • [${d.id}] ${d.credor ?? d.descricao}: restam R$ ${fmt(Number(d.valor_total) - Number(d.valor_pago))} (parcela R$ ${fmt(Number(d.parcela_mensal ?? 0))}, vence dia ${d.dia_vencimento})`).join('\n')
    : '  Total ~R$87.420: Adijo R$300 (NOME SUJO, prioridade 1), Americanas R$6k, CNPJ esposa R$8k, Mercado Pago R$20k, Infinity Pay R$14k, Condomínio R$4.2k, MRV R$30k, Caixa R$2.7k, Fernando R$6.720 (R$450/mês até ago/2027)';

  const tarefasStr = tarefas.length
    ? tarefas.map((t: Record<string, unknown>) => `  • [${t.id}] ${t.descricao} (cobrança: ${new Date(t.proxima_cobranca as string).toLocaleString('pt-BR', { timeZone: 'America/Sao_Paulo' })})`).join('\n')
    : '  (nenhuma)';

  const metasStr = metas.length
    ? metas.map((m: Record<string, unknown>) => `  • ${m.descricao ?? m.nome}: R$ ${fmt(Number(m.valor_atual ?? 0))} de R$ ${fmt(Number(m.valor_alvo ?? m.valor_meta ?? 0))}`).join('\n')
    : '';

  const agora = new Date().toLocaleString('pt-BR', { timeZone: 'America/Sao_Paulo' });

  return `Você é Max, assistente pessoal do Pedro Henrique — finanças, agenda, negócios, informação e vida.

━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
QUEM É O PEDRO
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

Empreendedor em Goiânia/GO. Age rápido, aprende no caminho, valoriza autonomia. Maior risco: se dispersar entre projetos.

Negócios:
- Vendedoria: SaaS de automação de vendas no WhatsApp com IA. Vende kits de ferramentas (Bomvink 21V e Luatek 48V), entrega em Goiânia, pagamento na entrega. Agente: Léo.
- LuKaizen Games: loja de jogos e consertos, site dark/cyberpunk. WhatsApp: 5562991526593
- Instagram @pedro_destrava: conteúdo intelectual

Meta: R$8.000 a R$20.000/mês em 1 ano.

━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
SITUAÇÃO FINANCEIRA
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

Renda fixa ~R$4.550/mês: IEL R$2.600 + Iluminere R$1.000 + VA R$950. Vendedoria/LuKaizen: variável.
Despesas fixas ~R$7.504/mês. Déficit atual ~-R$6.900/mês sem receita dos negócios.

Dívidas ativas:
${dividasStr}

30 vendas/mês Vendedoria = para de afundar. 50 = começa a pagar dívida.
${metasStr ? `\nMetas:\n${metasStr}` : ''}
${contexto.length ? `\n━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━\nMEMÓRIA ATUALIZADA\n━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━\n${contexto.map((c: Record<string, unknown>) => `${c.chave}: ${c.valor}`).join('\n')}` : ''}
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
SALDO ${new Date().toLocaleString('pt-BR', { month: 'long', year: 'numeric' }).toUpperCase()}
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

Receitas: R$ ${fmt(receitas)} | Despesas: R$ ${fmt(despesas)} | Saldo: R$ ${fmt(saldo)}
${topCategorias ? `Maiores gastos:\n${topCategorias}` : ''}

Lembretes: ${lembretesStr}

Tarefas em acompanhamento:
${tarefasStr}

━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
COMO VOCÊ SE COMPORTA
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

VOCÊ É UM ASSISTENTE COMPLETO, não só financeiro:
- Pesquisa na web (buscar_na_web) quando ele pedir notícia, informação, cotação, qualquer coisa atual
- Pensa profundamente (analise_profunda) quando ele pedir conselho ou decisão importante
- Acompanha mandatos (gerenciar_tarefa): se ele pedir "me cobra X toda sexta", cria tarefa
- Gerencia dívidas e receitas previstas pelas ferramentas próprias
- VAI ALÉM: quando registrar uma transação ou responder algo, se notar um padrão relevante (gasto subindo, categoria estourando, oportunidade), comenta em 1 frase. Insight curto, não sermão.

TOM E ESTILO:
Você é um amigo inteligente que entende de finanças e negócios — não um robô, não um consultor de terno. Fala como gente, pensa antes de responder, vai direto ao ponto. Sem enrolação, sem listas desnecessárias, sem markdown com asteriscos (*texto*). Você está no WhatsApp.

PROIBIDO em qualquer resposta:
- Frases de encerramento genéricas: "Se precisar de mais alguma coisa...", "Estou à disposição!", "Qualquer dúvida é só falar!"
- Emoji no final de toda mensagem — use só quando fizer sentido
- Listas numeradas para coisas simples
- Asteriscos para negrito (*palavra*)
- Respostas longas para perguntas curtas

PARA REGISTROS SIMPLES (gastei X, recebi X, comprovante):
Registra na hora. Resposta em 2-3 linhas:
✅ [descrição] — R$ [valor]
Hoje: R$ [despesas] gastos | R$ [receitas] entrou
(+ 1 frase de insight SE houver algo relevante)

PARA PERGUNTAS FINANCEIRAS:
Responde com os números reais do banco, analisa, aponta o que está pesado. Direto.

PARA PEDIDOS DE AJUDA/CONSELHO:
Usa analise_profunda. Dá opinião real, não fica em cima do muro.

PERGUNTA-FILTRO para ideias novas: "Isso te aproxima dos R$8.000/mês mais rápido do que dobrar o que já funciona?"

CATEGORIAS DE RECEITA: Salário, Renda Variável, Negócios
CATEGORIAS DE DESPESA: Moradia, Transporte, Alimentação, Saúde, Lazer, Vestuário, Assinaturas, Negócios, Dívidas/Parcelas, Fornecedor, Marketing, Outros

CLASSIFICAÇÃO:
- Salário/renda fixa → categoria Salário, tipo_negocio pessoal
- Receita da Vendedoria/LuKaizen → Renda Variável, tipo_negocio correto
- Faturas de cartão → Dívidas/Parcelas
- Gasolina/corrida/Uber → Transporte
- Academia/internet/streaming → Assinaturas
- Imagens/comprovantes/PDFs → extrai os valores REAIS do documento e registra. NUNCA invente valor.

Se Pedro quiser desfazer: usa desfazer_ultima.

Data/hora agora: ${agora}`;
}

// ── Tool executor ─────────────────────────────────────────────────────────────

const ultimosIds = new Map<string, string>();

// deno-lint-ignore no-explicit-any
async function executarTool(nome: string, args: Record<string, any>, remetente: string, key: string, url: string, openaiKey: string): Promise<unknown> {
  try {
    switch (nome) {
      case 'registrar_transacao': {
        const t = await inserirTransacao({
          tipo: args.tipo, valor: args.valor, descricao: args.descricao,
          categoria: args.categoria, tipo_negocio: args.tipo_negocio ?? 'pessoal',
          empresa: args.empresa ?? null,
          data_transacao: (args.data as string) || new Date().toISOString().slice(0, 10),
          confirmado: true,
        }, key, url);
        ultimosIds.set(remetente, t.id);
        const hoje = await buscarTransacoesHoje(key, url);
        return { ok: true, id: t.id, registrado: true, resumo_hoje: calcularResumo(hoje) };
      }

      case 'desfazer_ultima': {
        const id = (args.id as string) || ultimosIds.get(remetente);
        if (!id) return { ok: false, motivo: 'nenhuma transação recente para desfazer' };
        await cancelarTransacao(id, key, url);
        ultimosIds.delete(remetente);
        return { ok: true, desfeito: true };
      }

      case 'criar_lembrete': {
        const l = await inserirLembrete({
          descricao: args.descricao, data_hora: args.data_hora,
          recorrente: args.recorrente ?? false, frequencia: args.frequencia ?? null,
        }, key, url);
        return { ok: true, id: l.id };
      }

      case 'consultar_financas': {
        // deno-lint-ignore no-explicit-any
        let t: Record<string, any>[];
        const p = args.periodo as string;
        if (p === 'hoje')             t = await buscarTransacoesHoje(key, url);
        else if (p === 'semana')      t = await buscarTransacoesSemana(key, url);
        else if (p === 'ontem')       t = await buscarTransacoesOntem(key, url);
        else if (p === 'mes_passado') {
          const mp = new Date(); mp.setMonth(mp.getMonth() - 1);
          t = await buscarTransacoesMes(key, url, mp.toISOString().slice(0, 7));
        }
        else t = await buscarTransacoesMes(key, url);

        if (args.tipo_negocio && args.tipo_negocio !== 'todos')
          t = t.filter(x => x.tipo_negocio === args.tipo_negocio);
        if (args.categoria)
          t = t.filter(x => x.categoria === args.categoria);

        const resumo = calcularResumo(t);
        const porCat = calcularPorCategoria(t);
        const porNeg = t.reduce((acc: Record<string, number>, x) => {
          const n = (x.tipo_negocio as string) ?? 'pessoal';
          if (x.tipo === 'despesa') acc[n] = (acc[n] ?? 0) + Number(x.valor);
          return acc;
        }, {});

        return {
          periodo: p, total: t.length,
          receitas: resumo.receitas, despesas: resumo.despesas, saldo: resumo.saldo,
          por_categoria: porCat, por_negocio: porNeg,
          ultimas: t.slice(0, 8).map(x => ({
            tipo: x.tipo, valor: x.valor, descricao: x.descricao,
            categoria: x.categoria, data: x.data_transacao,
          })),
        };
      }

      case 'salvar_informacao': {
        await salvarContexto(args.chave as string, args.valor as string, args.categoria as string, key, url);
        return { ok: true, salvo: args.chave };
      }

      case 'listar_lembretes': {
        const ls = await buscarProximosLembretes(key, url);
        return { lembretes: ls.map((l: Record<string, unknown>) => ({ descricao: l.descricao, data_hora: l.data_hora })) };
      }

      case 'buscar_na_web': {
        const resultado = await buscarNaWeb(args.consulta as string, openaiKey);
        return { resultado };
      }

      case 'analise_profunda': {
        const [tx90, dividas, metas, previstas] = await Promise.all([
          buscarTransacoesUltimosDias(90, key, url),
          dbSelect('dividas', 'select=*&status=eq.ativa', key, url).catch(() => []),
          dbSelect('metas_financeiras', 'select=*&status=eq.ativa', key, url).catch(() => []),
          dbSelect('receitas_previstas', 'select=*&status=eq.pendente&order=data_prevista', key, url).catch(() => []),
        ]);
        const dados = {
          transacoes_90_dias: tx90.map((x: Record<string, unknown>) => ({
            tipo: x.tipo, valor: x.valor, descricao: x.descricao,
            categoria: x.categoria, negocio: x.tipo_negocio, data: x.data_transacao,
          })),
          dividas, metas, receitas_previstas: previstas,
        };
        const r = await callOpenAI([
          { role: 'system', content: 'Você é o conselheiro financeiro pessoal do Pedro Henrique, empreendedor em Goiânia com dívidas de ~R$87k, renda fixa R$4.550/mês, despesas fixas R$7.504/mês e meta de R$8-20k/mês. Analise os dados reais fornecidos com profundidade: padrões, riscos, prioridades. Dê uma recomendação concreta e direta, com números. Português, tom de amigo experiente, sem markdown, máximo 1500 caracteres.' },
          { role: 'user', content: `DADOS REAIS:\n${JSON.stringify(dados)}\n\nPERGUNTA DO PEDRO: ${args.pergunta}` },
        ], openaiKey, { model: MODEL_DEEP, semTools: true, effort: 'medium' });
        return { analise: r.text };
      }

      case 'gerenciar_divida': {
        const acao = args.acao as string;
        if (acao === 'listar') {
          const ds = await dbSelect('dividas', 'select=id,descricao,credor,valor_total,valor_pago,parcela_mensal,dia_vencimento,status&order=criado_em.desc', key, url);
          return { dividas: ds };
        }
        if (acao === 'pagar_parcela') {
          const [d] = await dbSelect('dividas', `select=*&id=eq.${args.id}`, key, url);
          if (!d) return { ok: false, motivo: 'dívida não encontrada' };
          const novoPago = Number(d.valor_pago) + Number(args.valor ?? d.parcela_mensal ?? 0);
          const novoStatus = novoPago >= Number(d.valor_total) ? 'quitada' : 'ativa';
          await dbUpdate('dividas', `id=eq.${args.id}`, { valor_pago: novoPago, status: novoStatus }, key, url);
          return { ok: true, valor_pago_total: novoPago, status: novoStatus, saldo_restante: Number(d.valor_total) - novoPago };
        }
        if (acao === 'quitar') {
          const [d] = await dbSelect('dividas', `select=*&id=eq.${args.id}`, key, url);
          if (!d) return { ok: false, motivo: 'dívida não encontrada' };
          await dbUpdate('dividas', `id=eq.${args.id}`, { status: 'quitada', valor_pago: d.valor_total }, key, url);
          return { ok: true, status: 'quitada' };
        }
        return { erro: 'ação desconhecida' };
      }

      case 'gerenciar_receita_prevista': {
        const acao = args.acao as string;
        if (acao === 'criar') {
          const r = await dbInsert('receitas_previstas', {
            descricao: args.descricao, valor: args.valor, data_prevista: args.data_prevista,
            cliente: args.cliente ?? null, tipo_negocio: args.tipo_negocio ?? 'pessoal', status: 'pendente',
          }, key, url);
          return { ok: true, id: r.id };
        }
        if (acao === 'listar') {
          const rs = await dbSelect('receitas_previstas', 'select=*&status=in.(pendente,atrasada)&order=data_prevista', key, url);
          return { receitas_previstas: rs };
        }
        if (acao === 'confirmar') {
          const [prev] = await dbSelect('receitas_previstas', `select=*&id=eq.${args.id}`, key, url);
          if (!prev) return { ok: false, motivo: 'receita prevista não encontrada' };
          const dataRec = new Date().toISOString().slice(0, 10);
          const valorFinal = Number(args.valor ?? prev.valor);
          await dbUpdate('receitas_previstas', `id=eq.${args.id}`, {
            status: 'recebida', data_recebimento: new Date().toISOString(),
          }, key, url);
          const tx = await inserirTransacao({
            tipo: 'receita', valor: valorFinal, descricao: prev.descricao,
            categoria: 'Renda Variável', tipo_negocio: prev.tipo_negocio ?? 'pessoal',
            empresa: prev.cliente ?? null, data_transacao: dataRec, confirmado: true,
          }, key, url);
          return { ok: true, transacao_id: tx.id, valor: valorFinal };
        }
        return { erro: 'ação desconhecida' };
      }

      case 'gerenciar_tarefa': {
        const acao = args.acao as string;
        if (acao === 'criar') {
          const t = await dbInsert('tarefas', {
            descricao: args.descricao, proxima_cobranca: args.proxima_cobranca,
            recorrente: args.recorrente ?? false, frequencia: args.frequencia ?? null, status: 'ativa',
          }, key, url);
          return { ok: true, id: t.id };
        }
        if (acao === 'listar') {
          const ts = await dbSelect('tarefas', 'select=*&status=eq.ativa&order=proxima_cobranca', key, url);
          return { tarefas: ts };
        }
        if (acao === 'concluir' || acao === 'cancelar') {
          await dbUpdate('tarefas', `id=eq.${args.id}`, { status: acao === 'concluir' ? 'concluida' : 'cancelada' }, key, url);
          return { ok: true, status: acao };
        }
        if (acao === 'registrar_resposta') {
          const [t] = await dbSelect('tarefas', `select=historico&id=eq.${args.id}`, key, url);
          if (!t) return { ok: false, motivo: 'tarefa não encontrada' };
          const hist = Array.isArray(t.historico) ? t.historico : [];
          hist.push({ data: new Date().toISOString(), resposta: args.resposta });
          await dbUpdate('tarefas', `id=eq.${args.id}`, { historico: hist }, key, url);
          return { ok: true, registrado: true };
        }
        return { erro: 'ação desconhecida' };
      }

      default:
        return { erro: 'tool desconhecida' };
    }
  } catch (err) {
    return { erro: String(err) };
  }
}

// ── Memória automática ────────────────────────────────────────────────────────

async function extrairMemoria(msgUsuario: string, respostaMax: string, openaiKey: string, key: string, url: string) {
  try {
    const r = await callOpenAI([
      { role: 'system', content: 'Extraia fatos NOVOS e duradouros sobre Pedro desta conversa que valham a pena lembrar no futuro: clientes, decisões, hábitos, preferências, números de negócio, pessoas. NÃO extraia transações financeiras pontuais (já são registradas). Responda APENAS um array JSON: [{"chave":"...","valor":"...","categoria":"financeiro|negocio|pessoal|meta|contato|rotina|outros"}]. Se não houver nada relevante, responda [].' },
      { role: 'user', content: `Pedro: ${msgUsuario.slice(0, 800)}\nMax: ${respostaMax.slice(0, 400)}` },
    ], openaiKey, { semTools: true, effort: 'minimal' });
    const match = r.text.match(/\[[\s\S]*\]/);
    if (!match) return;
    const fatos = JSON.parse(match[0]);
    for (const f of fatos.slice(0, 3)) {
      if (f.chave && f.valor) await salvarContexto(f.chave, f.valor, f.categoria ?? 'outros', key, url);
    }
  } catch { /* memória é best-effort */ }
}

// ── Processar mensagem ────────────────────────────────────────────────────────

async function processarMensagem(
  remetente: string,
  mensagem: string | null,
  tipo: string,
  mediaId: string | null,
) {
  const OPENAI_KEY = Deno.env.get('OPENAI_API_KEY')!;
  const SUPA_KEY   = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!;
  const SUPA_URL   = Deno.env.get('SUPABASE_URL')!;

  try {
    // Áudio → transcreve com Whisper e trata como texto
    let respondeEmAudio = false;
    if (tipo === 'audio' && mediaId) {
      const { bytes, mimeType } = await baixarMidiaWhatsApp(mediaId);
      mensagem = await transcreverAudio(bytes, mimeType, OPENAI_KEY);
      respondeEmAudio = true;
      tipo = 'text';
      mediaId = null;
    }

    await salvarMensagem(remetente, 'user', mensagem ?? `[${tipo}]`, SUPA_KEY, SUPA_URL);

    const [systemPrompt, historico] = await Promise.all([
      buildSystemPrompt(SUPA_KEY, SUPA_URL),
      buscarHistorico(remetente, 12, SUPA_KEY, SUPA_URL),
    ]);

    // deno-lint-ignore no-explicit-any
    const messages: any[] = [{ role: 'system', content: systemPrompt }];

    for (const h of historico.slice(0, -1)) {
      const content = typeof h.content === 'string' ? h.content : String(h.content ?? '');
      if (!content.trim()) continue;
      messages.push({ role: h.role === 'assistant' ? 'assistant' : 'user', content });
    }

    // Mensagem atual — imagem e PDF vão com o conteúdo real (GPT-5 tem visão nativa)
    if (tipo === 'image' && mediaId) {
      const { mimeType, base64 } = await baixarMidiaWhatsApp(mediaId);
      messages.push({
        role: 'user',
        content: [
          { type: 'text', text: mensagem || 'Analise esta imagem. Se for comprovante/recibo/print de transação financeira, extraia os valores REAIS e registre com registrar_transacao.' },
          { type: 'image_url', image_url: { url: `data:${mimeType};base64,${base64}` } },
        ],
      });
    } else if (tipo === 'document' && mediaId) {
      const { mimeType, base64 } = await baixarMidiaWhatsApp(mediaId);
      if (mimeType === 'application/pdf') {
        messages.push({
          role: 'user',
          content: [
            { type: 'text', text: mensagem || 'Analise este PDF. Se for fatura, boleto ou comprovante, extraia os valores REAIS e registre as transações.' },
            { type: 'file', file: { filename: 'documento.pdf', file_data: `data:application/pdf;base64,${base64}` } },
          ],
        });
      } else {
        messages.push({ role: 'user', content: `[Documento ${mimeType} recebido — formato não suportado ainda] ${mensagem ?? ''}` });
      }
    } else {
      messages.push({ role: 'user', content: mensagem ?? '' });
    }

    let resposta = await callOpenAI(messages, OPENAI_KEY);
    let iteracoes = 0;

    while (resposta.toolCalls.length > 0 && iteracoes < 6) {
      iteracoes++;
      messages.push(resposta.message);

      for (const tc of resposta.toolCalls) {
        // deno-lint-ignore no-explicit-any
        let args: Record<string, any> = {};
        try { args = JSON.parse(tc.function.arguments ?? '{}'); } catch { /* ignore */ }

        const result = await executarTool(tc.function.name, args, remetente, SUPA_KEY, SUPA_URL, OPENAI_KEY);
        messages.push({ role: 'tool', tool_call_id: tc.id, content: JSON.stringify(result) });
      }

      resposta = await callOpenAI(messages, OPENAI_KEY);
    }

    const textoFinal = resposta.text || 'Entendido.';
    await enviarResposta(textoFinal);

    // Se veio em áudio, responde também em áudio (best-effort)
    if (respondeEmAudio && textoFinal.length <= 900) {
      try { await enviarAudioResposta(textoFinal, OPENAI_KEY); } catch (e) { console.error('[Max] TTS:', e); }
    }

    await salvarMensagem(remetente, 'assistant', textoFinal, SUPA_KEY, SUPA_URL);

    // Memória automática (depois da resposta — não afeta latência percebida)
    if (mensagem && mensagem.length > 15) {
      await extrairMemoria(mensagem, textoFinal, OPENAI_KEY, SUPA_KEY, SUPA_URL);
    }

  } catch (err) {
    console.error('[Max] Erro crítico:', err);
    try { await notificarPedro(`⚠️ Deu erro aqui: ${String(err).slice(0, 200)}`); } catch { /* ignore */ }
  }
}

// ── HTTP handler ──────────────────────────────────────────────────────────────

const MEU_NUMERO   = Deno.env.get('MEU_NUMERO') ?? '5562984465388';
const VERIFY_TOKEN = Deno.env.get('VERIFY_TOKEN') ?? 'max_webhook_2025';

Deno.serve(async (req: Request) => {
  const url = new URL(req.url);

  if (req.method === 'GET') {
    const mode      = url.searchParams.get('hub.mode');
    const token     = url.searchParams.get('hub.verify_token');
    const challenge = url.searchParams.get('hub.challenge');
    if (mode === 'subscribe' && token === VERIFY_TOKEN) {
      return new Response(challenge, { status: 200 });
    }
    return new Response('Forbidden', { status: 403 });
  }

  if (req.method !== 'POST') return new Response('Method Not Allowed', { status: 405 });

  const body = await req.json().catch(() => ({}));
  const msg  = body?.entry?.[0]?.changes?.[0]?.value?.messages?.[0];

  if (msg && numerosIguais(msg.from, MEU_NUMERO)) {
    const tipo    = msg.type as string;
    const texto   = tipo === 'text'     ? (msg.text?.body as string)      : null;
    const mediaId = tipo === 'image'    ? (msg.image?.id as string)       :
                    tipo === 'audio'    ? (msg.audio?.id as string)       :
                    tipo === 'document' ? (msg.document?.id as string)    : null;
    await processarMensagem(msg.from, texto, tipo, mediaId);
  }

  return new Response(JSON.stringify({ ok: true }), {
    status: 200,
    headers: { 'Content-Type': 'application/json' },
  });
});
