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
      name: 'buscar_transacoes',
      description: 'Busca transações com filtros livres e retorna com IDs. Use para achar transações específicas ("quanto gastei com X?"), e SEMPRE antes de editar/excluir para obter o ID correto.',
      parameters: {
        type: 'object',
        properties: {
          data_inicio:  { type: 'string', description: 'YYYY-MM-DD' },
          data_fim:     { type: 'string', description: 'YYYY-MM-DD' },
          texto:        { type: 'string', description: 'Busca por texto na descrição ou empresa' },
          categoria:    { type: 'string' },
          tipo:         { type: 'string', enum: ['receita','despesa'] },
          tipo_negocio: { type: 'string', enum: ['pessoal','vendedoria','lukaizen','geral'] },
          limite:       { type: 'number', description: 'Máximo de resultados (default 30)' },
        },
      },
    },
  },
  {
    type: 'function',
    function: {
      name: 'editar_transacao',
      description: 'Edita qualquer campo de uma transação existente: valor, descrição/título, categoria, competência (data), tipo de negócio. Obtenha o ID com buscar_transacoes primeiro. Se houver mais de um candidato, confirme com Pedro antes.',
      parameters: {
        type: 'object',
        properties: {
          id:             { type: 'string' },
          valor:          { type: 'number' },
          descricao:      { type: 'string' },
          categoria:      { type: 'string' },
          tipo:           { type: 'string', enum: ['receita','despesa'] },
          tipo_negocio:   { type: 'string', enum: ['pessoal','vendedoria','lukaizen','geral'] },
          data_transacao: { type: 'string', description: 'YYYY-MM-DD — mudar isso muda a competência (mês) automaticamente' },
          empresa:        { type: 'string' },
        },
        required: ['id'],
      },
    },
  },
  {
    type: 'function',
    function: {
      name: 'excluir_transacao',
      description: 'Exclui uma transação específica por ID (qualquer uma, não só a última). Confirme com Pedro se houver ambiguidade.',
      parameters: {
        type: 'object',
        properties: { id: { type: 'string' } },
        required: ['id'],
      },
    },
  },
  {
    type: 'function',
    function: {
      name: 'gerar_extrato',
      description: 'Gera extrato completo formatado (linha a linha, com totais). Use quando Pedro pedir extrato, histórico ou lista das transações. Repasse o texto do extrato COMPLETO e sem resumir.',
      parameters: {
        type: 'object',
        properties: {
          data_inicio:  { type: 'string', description: 'YYYY-MM-DD' },
          data_fim:     { type: 'string', description: 'YYYY-MM-DD' },
          tipo_negocio: { type: 'string', enum: ['pessoal','vendedoria','lukaizen','geral'] },
          categoria:    { type: 'string' },
        },
        required: ['data_inicio','data_fim'],
      },
    },
  },
  {
    type: 'function',
    function: {
      name: 'gerenciar_conta_pagar',
      description: 'Contas a pagar e provisões (despesas futuras conhecidas): criar provisão, listar pendentes, marcar como paga (registra a transação automaticamente), cancelar. O Max avisa no vencimento.',
      parameters: {
        type: 'object',
        properties: {
          acao:            { type: 'string', enum: ['criar','listar','pagar','cancelar'] },
          id:              { type: 'string' },
          descricao:       { type: 'string' },
          valor:           { type: 'number' },
          data_vencimento: { type: 'string', description: 'YYYY-MM-DD' },
          categoria:       { type: 'string' },
          tipo_negocio:    { type: 'string', enum: ['pessoal','vendedoria','lukaizen','geral'] },
          recorrente:      { type: 'boolean' },
          frequencia:      { type: 'string', enum: ['semanal','mensal','anual'] },
        },
        required: ['acao'],
      },
    },
  },
  {
    type: 'function',
    function: {
      name: 'gerenciar_orcamento',
      description: 'Orçamento (teto de gasto mensal) por categoria: definir, listar (mostra gasto atual vs limite), remover. O Max alerta sozinho em 80% e 100%.',
      parameters: {
        type: 'object',
        properties: {
          acao:          { type: 'string', enum: ['definir','listar','remover'] },
          categoria:     { type: 'string' },
          limite_mensal: { type: 'number' },
        },
        required: ['acao'],
      },
    },
  },
  {
    type: 'function',
    function: {
      name: 'projecao_caixa',
      description: 'Projeção de fluxo de caixa dos próximos 30 dias: combina saldo do mês, contas a pagar, receitas previstas e burn rate. Use quando Pedro perguntar "como fecha o mês?", "vai faltar dinheiro?", planejamento de caixa.',
      parameters: { type: 'object', properties: { dias: { type: 'number', description: 'Horizonte em dias (default 30)' } } },
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

VOCÊ É UM ASSISTENTE COMPLETO com controle TOTAL das finanças:
- Pesquisa na web (buscar_na_web) quando ele pedir notícia, informação, cotação, qualquer coisa atual
- Pensa profundamente (analise_profunda) quando ele pedir conselho ou decisão importante
- Acompanha mandatos (gerenciar_tarefa): se ele pedir "me cobra X toda sexta", cria tarefa
- Gerencia dívidas e receitas previstas pelas ferramentas próprias
- EXTRATOS/HISTÓRICOS: gerar_extrato devolve o extrato pronto — repasse COMPLETO, sem resumir
- EDIÇÃO: pode alterar QUALQUER transação (valor, título, categoria, competência/data). Fluxo: buscar_transacoes para achar o ID → se houver mais de um candidato, pergunta qual → editar_transacao/excluir_transacao
- PROVISÕES/CONTAS A PAGAR: "provisiona o aluguel dia 5" → gerenciar_conta_pagar criar. Você avisa no vencimento. Quando Pedro disser que pagou, usa a ação pagar (registra a transação sozinha)
- ORÇAMENTOS: teto por categoria com gerenciar_orcamento — você alerta sozinho em 80% e 100%
- CAIXA: "como fecha o mês?" → projecao_caixa e interpreta o resultado (destaque o primeiro dia no vermelho, se houver)
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

      case 'buscar_transacoes': {
        const partes: string[] = ['select=id,tipo,valor,descricao,categoria,tipo_negocio,empresa,data_transacao', 'confirmado=eq.true'];
        if (args.data_inicio) partes.push(`data_transacao=gte.${args.data_inicio}`);
        if (args.data_fim)    partes.push(`data_transacao=lte.${args.data_fim}`);
        if (args.categoria)   partes.push(`categoria=eq.${encodeURIComponent(args.categoria)}`);
        if (args.tipo)        partes.push(`tipo=eq.${args.tipo}`);
        if (args.tipo_negocio) partes.push(`tipo_negocio=eq.${args.tipo_negocio}`);
        if (args.texto) {
          const t = encodeURIComponent(`*${args.texto}*`);
          partes.push(`or=(descricao.ilike.${t},empresa.ilike.${t})`);
        }
        partes.push('order=data_transacao.desc');
        partes.push(`limit=${Math.min(Number(args.limite ?? 30), 100)}`);
        const ts = await dbSelect('transacoes', partes.join('&'), key, url);
        return { total: ts.length, soma: ts.reduce((s: number, x: Record<string, unknown>) => s + Number(x.valor), 0), transacoes: ts };
      }

      case 'editar_transacao': {
        // deno-lint-ignore no-explicit-any
        const patch: Record<string, any> = {};
        for (const campo of ['valor','descricao','categoria','tipo','tipo_negocio','empresa'] as const) {
          if (args[campo] !== undefined && args[campo] !== null) patch[campo] = args[campo];
        }
        if (args.data_transacao) {
          patch.data_transacao = args.data_transacao;
          patch.mes = String(args.data_transacao).slice(0, 7);
        }
        if (Object.keys(patch).length === 0) return { ok: false, motivo: 'nenhum campo para alterar' };
        const upd = await dbUpdate('transacoes', `id=eq.${args.id}`, patch, key, url);
        if (!Array.isArray(upd) || upd.length === 0) return { ok: false, motivo: 'transação não encontrada' };
        return { ok: true, transacao_atualizada: upd[0] };
      }

      case 'excluir_transacao': {
        const [existe] = await dbSelect('transacoes', `select=id,descricao,valor&id=eq.${args.id}`, key, url);
        if (!existe) return { ok: false, motivo: 'transação não encontrada' };
        await cancelarTransacao(args.id as string, key, url);
        return { ok: true, excluida: existe };
      }

      case 'gerar_extrato': {
        const partes: string[] = ['select=*', 'confirmado=eq.true',
          `data_transacao=gte.${args.data_inicio}`, `data_transacao=lte.${args.data_fim}`,
          'order=data_transacao.asc', 'limit=400'];
        if (args.tipo_negocio) partes.push(`tipo_negocio=eq.${args.tipo_negocio}`);
        if (args.categoria)    partes.push(`categoria=eq.${encodeURIComponent(args.categoria)}`);
        const ts = await dbSelect('transacoes', partes.join('&'), key, url);
        if (ts.length === 0) return { extrato: `Extrato ${args.data_inicio} a ${args.data_fim}: nenhuma transação no período.` };

        let corpo = `📄 EXTRATO ${args.data_inicio} a ${args.data_fim}${args.tipo_negocio ? ` (${args.tipo_negocio})` : ''}${args.categoria ? ` — ${args.categoria}` : ''}\n\n`;
        let dataAtual = '';
        for (const x of ts) {
          if (x.data_transacao !== dataAtual) {
            dataAtual = x.data_transacao;
            const [, m, d] = dataAtual.split('-');
            corpo += `— ${d}/${m} —\n`;
          }
          const sinal = x.tipo === 'receita' ? '+' : '-';
          corpo += `${sinal} R$ ${fmt(Number(x.valor))}  ${x.descricao} (${x.categoria})\n`;
        }
        const resumo = calcularResumo(ts);
        const porCat = calcularPorCategoria(ts.filter((x: Record<string, unknown>) => x.tipo === 'despesa'));
        corpo += `\nTOTAIS:\nEntrou: R$ ${fmt(resumo.receitas)} | Saiu: R$ ${fmt(resumo.despesas)} | Saldo: R$ ${fmt(resumo.saldo)}\n`;
        const cats = Object.entries(porCat).sort((a, b) => (b[1] as { despesas: number }).despesas - (a[1] as { despesas: number }).despesas);
        if (cats.length > 1) {
          corpo += `\nPor categoria:\n`;
          for (const [c, v] of cats) corpo += `  ${c}: R$ ${fmt((v as { despesas: number }).despesas)}\n`;
        }
        return { extrato: corpo.trim(), instrucao: 'Envie o extrato COMPLETO para Pedro, sem resumir nem cortar linhas.' };
      }

      case 'gerenciar_conta_pagar': {
        const acao = args.acao as string;
        if (acao === 'criar') {
          const c = await dbInsert('contas_pagar', {
            descricao: args.descricao, valor: args.valor, data_vencimento: args.data_vencimento,
            categoria: args.categoria ?? 'Outros', tipo_negocio: args.tipo_negocio ?? 'pessoal',
            recorrente: args.recorrente ?? false, frequencia: args.frequencia ?? null, status: 'pendente',
          }, key, url);
          return { ok: true, id: c.id, provisao_criada: true };
        }
        if (acao === 'listar') {
          const cs = await dbSelect('contas_pagar', 'select=*&status=eq.pendente&order=data_vencimento&limit=30', key, url);
          return { contas_pendentes: cs, total: cs.reduce((s: number, x: Record<string, unknown>) => s + Number(x.valor), 0) };
        }
        if (acao === 'pagar') {
          const [c] = await dbSelect('contas_pagar', `select=*&id=eq.${args.id}`, key, url);
          if (!c) return { ok: false, motivo: 'conta não encontrada' };
          const valorPago = Number(args.valor ?? c.valor);
          const tx = await inserirTransacao({
            tipo: 'despesa', valor: valorPago, descricao: c.descricao,
            categoria: c.categoria ?? 'Outros', tipo_negocio: c.tipo_negocio ?? 'pessoal',
            data_transacao: new Date().toISOString().slice(0, 10), confirmado: true,
          }, key, url);
          await dbUpdate('contas_pagar', `id=eq.${args.id}`, { status: 'paga', transacao_id: tx.id }, key, url);
          if (c.recorrente && c.frequencia) {
            const d = new Date(c.data_vencimento + 'T12:00:00Z');
            if (c.frequencia === 'semanal') d.setDate(d.getDate() + 7);
            else if (c.frequencia === 'anual') d.setFullYear(d.getFullYear() + 1);
            else d.setMonth(d.getMonth() + 1);
            await dbInsert('contas_pagar', {
              descricao: c.descricao, valor: c.valor, data_vencimento: d.toISOString().slice(0, 10),
              categoria: c.categoria, tipo_negocio: c.tipo_negocio,
              recorrente: true, frequencia: c.frequencia, status: 'pendente',
            }, key, url);
          }
          return { ok: true, paga: true, transacao_id: tx.id, proxima_criada: !!(c.recorrente && c.frequencia) };
        }
        if (acao === 'cancelar') {
          await dbUpdate('contas_pagar', `id=eq.${args.id}`, { status: 'cancelada' }, key, url);
          return { ok: true, cancelada: true };
        }
        return { erro: 'ação desconhecida' };
      }

      case 'gerenciar_orcamento': {
        const acao = args.acao as string;
        if (acao === 'definir') {
          await dbUpsert('orcamentos', { categoria: args.categoria, limite_mensal: args.limite_mensal }, key, url);
          return { ok: true, categoria: args.categoria, limite: args.limite_mensal };
        }
        if (acao === 'listar') {
          const [orcs, txMes] = await Promise.all([
            dbSelect('orcamentos', 'select=*&order=categoria', key, url),
            buscarTransacoesMes(key, url),
          ]);
          const gastoPorCat = calcularPorCategoria(txMes.filter((x: Record<string, unknown>) => x.tipo === 'despesa'));
          return {
            orcamentos: orcs.map((o: Record<string, unknown>) => ({
              categoria: o.categoria, limite: Number(o.limite_mensal),
              gasto_no_mes: (gastoPorCat[o.categoria as string]?.despesas ?? 0),
              percentual: Math.round(((gastoPorCat[o.categoria as string]?.despesas ?? 0) / Number(o.limite_mensal)) * 100),
            })),
          };
        }
        if (acao === 'remover') {
          await dbDelete('orcamentos', `categoria=eq.${encodeURIComponent(args.categoria)}`, key, url);
          return { ok: true, removido: args.categoria };
        }
        return { erro: 'ação desconhecida' };
      }

      case 'projecao_caixa': {
        const dias = Math.min(Number(args.dias ?? 30), 60);
        const hoje = new Date().toISOString().slice(0, 10);
        const fimD = new Date(); fimD.setDate(fimD.getDate() + dias);
        const fim = fimD.toISOString().slice(0, 10);
        const [txMes, contas, previstas, tx60] = await Promise.all([
          buscarTransacoesMes(key, url),
          dbSelect('contas_pagar', `select=descricao,valor,data_vencimento&status=eq.pendente&data_vencimento=lte.${fim}&order=data_vencimento`, key, url).catch(() => []),
          dbSelect('receitas_previstas', `select=descricao,valor,data_prevista&status=in.(pendente,atrasada)&data_prevista=lte.${fim}&order=data_prevista`, key, url).catch(() => []),
          buscarTransacoesUltimosDias(60, key, url),
        ]);
        const saldoMes = calcularResumo(txMes).saldo;
        const despesas60 = tx60.filter((x: Record<string, unknown>) => x.tipo === 'despesa')
          .reduce((s: number, x: Record<string, unknown>) => s + Number(x.valor), 0);
        const burnDiario = despesas60 / 60;

        // Linha do tempo: eventos conhecidos + burn diário estimado
        // deno-lint-ignore no-explicit-any
        const eventos: any[] = [];
        const amanhaD = new Date(); amanhaD.setDate(amanhaD.getDate() + 1);
        const amanha = amanhaD.toISOString().slice(0, 10);
        // Vencidos/atrasados entram como "amanhã" para aparecerem na linha do tempo
        for (const c of contas) eventos.push({ data: c.data_vencimento <= hoje ? amanha : c.data_vencimento, tipo: 'conta_a_pagar', descricao: c.descricao, valor: -Number(c.valor) });
        for (const r of previstas) eventos.push({ data: r.data_prevista <= hoje ? amanha : r.data_prevista, tipo: 'receita_prevista', descricao: r.descricao, valor: Number(r.valor) });
        eventos.sort((a, b) => a.data.localeCompare(b.data));

        let acumulado = saldoMes;
        let primeiroDiaNegativo: string | null = acumulado < 0 ? hoje : null;
        const linha: Record<string, unknown>[] = [];
        const cursor = new Date();
        for (let i = 1; i <= dias; i++) {
          cursor.setDate(cursor.getDate() + 1);
          const dstr = cursor.toISOString().slice(0, 10);
          acumulado -= burnDiario;
          for (const e of eventos.filter(e => e.data === dstr)) {
            acumulado += e.valor;
            linha.push({ data: dstr, evento: e.descricao, valor: e.valor, acumulado: Math.round(acumulado) });
          }
          if (acumulado < 0 && !primeiroDiaNegativo) primeiroDiaNegativo = dstr;
        }
        return {
          nota: 'Projeção relativa ao saldo do mês corrente (não é saldo bancário). Burn diário = média de TODAS as despesas dos últimos 60 dias, então contas provisionadas podem estar parcialmente contadas em dobro — trate como estimativa conservadora.',
          saldo_mes_atual: Math.round(saldoMes),
          burn_diario_estimado: Math.round(burnDiario),
          eventos_conhecidos: linha,
          saldo_projetado_fim: Math.round(acumulado),
          primeiro_dia_no_vermelho: primeiroDiaNegativo,
          contas_a_pagar_total: contas.reduce((s: number, x: Record<string, unknown>) => s + Number(x.valor), 0),
          receitas_previstas_total: previstas.reduce((s: number, x: Record<string, unknown>) => s + Number(x.valor), 0),
        };
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
        console.log(`[Max] tool=${tc.function.name} args=${JSON.stringify(args).slice(0, 300)} result=${JSON.stringify(result).slice(0, 300)}`);
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
