// Zero-import self-contained webhook — Supabase REST API + Gemini 2.0 Flash
// No esm.sh imports; uses native Deno fetch + Supabase REST directly

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

// ── Número helpers ─────────────────────────────────────────────────────────────

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

// ── Contexto ──────────────────────────────────────────────────────────────────

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

// ── Helpers de cálculo ────────────────────────────────────────────────────────

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

// ── Gemini ─────────────────────────────────────────────────────────────────────

const MODEL      = 'gemini-2.0-flash';
const GEMINI_URL = `https://generativelanguage.googleapis.com/v1beta/models/${MODEL}:generateContent`;

const FUNCTION_DECLARATIONS = [
  {
    name: 'registrar_transacao',
    description: 'Registra uma receita ou despesa imediatamente. Após registrar, mostra mini-extrato do dia.',
    parameters: {
      type: 'OBJECT',
      properties: {
        tipo:         { type: 'STRING', enum: ['receita', 'despesa'] },
        valor:        { type: 'NUMBER' },
        descricao:    { type: 'STRING' },
        categoria: {
          type: 'STRING',
          enum: ['Moradia','Transporte','Alimentação','Saúde','Lazer','Vestuário',
            'Assinaturas','Negócios','Dívidas/Parcelas','Fornecedor','Marketing',
            'Salário','Renda Variável','Outros'],
        },
        tipo_negocio: { type: 'STRING', enum: ['pessoal','vendedoria','lukaizen','geral'] },
        data:         { type: 'STRING', description: 'YYYY-MM-DD' },
        empresa:      { type: 'STRING' },
      },
      required: ['tipo','valor','descricao','categoria','tipo_negocio'],
    },
  },
  {
    name: 'desfazer_ultima',
    description: 'Apaga a última transação registrada se Pedro pedir para desfazer ou cancelar',
    parameters: {
      type: 'OBJECT',
      properties: { id: { type: 'STRING', description: 'ID da transação a apagar' } },
      required: ['id'],
    },
  },
  {
    name: 'criar_lembrete',
    description: 'Cria lembrete ou evento na agenda',
    parameters: {
      type: 'OBJECT',
      properties: {
        descricao:  { type: 'STRING' },
        data_hora:  { type: 'STRING', description: 'ISO 8601 fuso Brasília UTC-3' },
        recorrente: { type: 'BOOLEAN' },
        frequencia: { type: 'STRING', enum: ['diario','semanal','mensal'] },
      },
      required: ['descricao','data_hora'],
    },
  },
  {
    name: 'consultar_financas',
    description: 'Consulta dados financeiros. Use para qualquer pergunta sobre gastos, saldo, receitas.',
    parameters: {
      type: 'OBJECT',
      properties: {
        periodo:      { type: 'STRING', enum: ['hoje','semana','mes','mes_passado','ontem'] },
        tipo_negocio: { type: 'STRING', enum: ['pessoal','vendedoria','lukaizen','geral','todos'] },
        categoria:    { type: 'STRING' },
      },
      required: ['periodo'],
    },
  },
  {
    name: 'salvar_informacao',
    description: 'Salva info importante sobre Pedro para contexto futuro (metas, rotina, negócios, contatos)',
    parameters: {
      type: 'OBJECT',
      properties: {
        chave:     { type: 'STRING' },
        valor:     { type: 'STRING' },
        categoria: { type: 'STRING', enum: ['financeiro','negocio','pessoal','meta','contato','rotina','outros'] },
      },
      required: ['chave','valor','categoria'],
    },
  },
  {
    name: 'listar_lembretes',
    description: 'Lista os próximos lembretes agendados',
    parameters: { type: 'OBJECT', properties: {} },
  },
];

const GEMINI_TOOLS = [{ functionDeclarations: FUNCTION_DECLARATIONS }];

// deno-lint-ignore no-explicit-any
async function callGemini(systemPrompt: string, contents: any[], geminiKey: string): Promise<any> {
  const body = {
    systemInstruction: { parts: [{ text: systemPrompt }] },
    contents,
    tools: GEMINI_TOOLS,
    toolConfig: { functionCallingConfig: { mode: 'AUTO' } },
    generationConfig: { maxOutputTokens: 1200, temperature: 0.7 },
  };

  // Retry com backoff exponencial para erros 429
  const delays = [2000, 4000, 8000];
  let lastErr = '';

  for (let attempt = 0; attempt <= delays.length; attempt++) {
    const res = await fetch(`${GEMINI_URL}?key=${geminiKey}`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(body),
    });

    if (res.status === 429) {
      if (attempt < delays.length) {
        await new Promise(r => setTimeout(r, delays[attempt]));
        continue;
      }
      lastErr = 'limite de uso do Gemini atingido — tente novamente em alguns minutos';
      break;
    }

    if (!res.ok) {
      const txt = await res.text();
      throw new Error(`Gemini API error ${res.status}: ${txt}`);
    }

    const json = await res.json();
    const candidate = json.candidates?.[0];
    // deno-lint-ignore no-explicit-any
    const parts: any[] = candidate?.content?.parts ?? [];
    // deno-lint-ignore no-explicit-any
    const functionCalls = parts.filter((p: any) => p.functionCall).map((p: any) => p.functionCall);
    // deno-lint-ignore no-explicit-any
    const text = parts.filter((p: any) => p.text).map((p: any) => p.text).join('');

    return {
      text,
      functionCalls,
      modelContent: candidate?.content ?? { role: 'model', parts: [] },
      finishReason: candidate?.finishReason as string,
    };
  }

  throw new Error(lastErr || 'Gemini indisponível');
}

// ── System prompt ─────────────────────────────────────────────────────────────

// deno-lint-ignore no-explicit-any
async function buildSystemPrompt(key: string, url: string): Promise<string> {
  const [transacoesMes, lembretes, contexto] = await Promise.all([
    buscarTransacoesMes(key, url),
    buscarProximosLembretes(key, url),
    buscarTodoContexto(key, url),
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

  const agora = new Date().toLocaleString('pt-BR', { timeZone: 'America/Sao_Paulo' });

  return `Você é Max, assistente pessoal do Pedro Henrique — financeiro, agenda e vida.

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

Dívidas (~R$87.420): Adijo R$300 (NOME SUJO, prioridade 1), Americanas R$6k, CNPJ esposa R$8k, Mercado Pago R$20k, Infinity Pay R$14k, Condomínio R$4.2k, MRV R$30k, Caixa R$2.7k, Fernando R$6.720 (R$450/mês, quitação ago/2027).

30 vendas/mês Vendedoria = para de afundar. 50 = começa a pagar dívida.
${contexto.length ? `\n━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━\nMEMÓRIA ATUALIZADA\n━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━\n${contexto.map((c: Record<string, unknown>) => `${c.chave}: ${c.valor}`).join('\n')}` : ''}
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
SALDO ${new Date().toLocaleString('pt-BR', { month: 'long', year: 'numeric' }).toUpperCase()}
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

Receitas: R$ ${fmt(receitas)} | Despesas: R$ ${fmt(despesas)} | Saldo: R$ ${fmt(saldo)}
${topCategorias ? `Maiores gastos:\n${topCategorias}` : ''}

Lembretes: ${lembretesStr}

━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
COMO VOCÊ SE COMPORTA
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

TOM E ESTILO:
Você é um amigo inteligente que entende de finanças — não um robô, não um consultor de terno. Fala como gente, pensa antes de responder, vai direto ao ponto. Sem enrolação, sem listas desnecessárias, sem numeração, sem markdown com asteriscos (*texto*). Você está no WhatsApp, não fazendo um relatório PDF.

PROIBIDO em qualquer resposta:
- Frases de encerramento genéricas: "Se precisar de mais alguma coisa...", "Estou à disposição!", "Qualquer dúvida é só falar!", "Conte comigo!"
- Emoji no final de toda mensagem — use só quando realmente fizer sentido
- Listas numeradas para coisas simples
- Asteriscos para negrito (*palavra*)
- Respostas longas para perguntas curtas

PARA REGISTROS SIMPLES (gastei X, recebi X, comprovante):
Registra na hora. Resposta em 2 linhas:
✅ [descrição] — R$ [valor]
Hoje: R$ [despesas] gastos | R$ [receitas] entrou

PARA PERGUNTAS FINANCEIRAS:
Responde com os números reais do banco, analisa, aponta o que está pesado. Direto.

PARA PEDIDOS DE AJUDA/CONSELHO:
Pensa de verdade. Faz as contas se precisar. Dá uma opinião real, não fica em cima do muro. Fala como alguém que conhece a situação do Pedro e está do lado dele.

PERGUNTA-FILTRO para ideias novas: "Isso te aproxima dos R$8.000/mês mais rápido do que dobrar o que já funciona?"

CATEGORIAS DE RECEITA: Salário, Renda Variável, Negócios
CATEGORIAS DE DESPESA: Moradia, Transporte, Alimentação, Saúde, Lazer, Vestuário, Assinaturas, Negócios, Dívidas/Parcelas, Fornecedor, Marketing, Outros

CLASSIFICAÇÃO:
- Salário/renda fixa → categoria Salário, tipo_negocio pessoal
- Receita da Vendedoria/LuKaizen → Renda Variável, tipo_negocio correto
- Faturas de cartão → Dívidas/Parcelas
- Gasolina/corrida/Uber → Transporte
- Academia/internet/streaming → Assinaturas
- Imagens/comprovantes → extrai e registra direto

Se Pedro quiser desfazer: usa desfazer_ultima com o ID.

Data/hora agora: ${agora}`;
}

// ── Tool executor ─────────────────────────────────────────────────────────────

const ultimosIds = new Map<string, string>();

// deno-lint-ignore no-explicit-any
async function executarTool(nome: string, args: Record<string, any>, remetente: string, key: string, url: string): Promise<unknown> {
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

      default:
        return { erro: 'tool desconhecida' };
    }
  } catch (err) {
    return { erro: String(err) };
  }
}

// ── Baixar imagem do WhatsApp ─────────────────────────────────────────────────

async function baixarImagemWhatsApp(mediaId: string): Promise<{ mimeType: string; data: string }> {
  const WA_TOKEN = Deno.env.get('WHATSAPP_TOKEN')!;
  const metaRes = await fetch(`https://graph.facebook.com/v19.0/${mediaId}`,
    { headers: { Authorization: `Bearer ${WA_TOKEN}` } });
  const { url: mediaUrl } = await metaRes.json();
  const imgRes = await fetch(mediaUrl, { headers: { Authorization: `Bearer ${WA_TOKEN}` } });
  const buf  = await imgRes.arrayBuffer();
  const mime = imgRes.headers.get('content-type') ?? 'image/jpeg';
  const bytes = new Uint8Array(buf);
  let binary = '';
  const chunk = 8192;
  for (let i = 0; i < bytes.length; i += chunk)
    binary += String.fromCharCode(...bytes.subarray(i, i + chunk));
  return { mimeType: mime, data: btoa(binary) };
}

// ── Enviar resposta longa ─────────────────────────────────────────────────────

async function enviarResposta(texto: string) {
  const MAX = 4000;
  if (texto.length <= MAX) { await notificarPedro(texto); return; }
  const partes = texto.match(/[\s\S]{1,4000}(?:\n|$)/g) ?? [texto.slice(0, MAX)];
  for (const parte of partes) await notificarPedro(parte.trim());
}

// ── Histórico → formato Gemini ────────────────────────────────────────────────

// deno-lint-ignore no-explicit-any
function toGeminiContents(historico: any[]): any[] {
  // deno-lint-ignore no-explicit-any
  const contents: any[] = [];
  for (const msg of historico) {
    const role = msg.role === 'assistant' ? 'model' : 'user';
    const text = typeof msg.content === 'string' ? msg.content : '';
    if (!text.trim()) continue;
    if (contents.length > 0 && contents[contents.length - 1].role === role) {
      contents[contents.length - 1].parts[0].text += '\n' + text;
    } else {
      contents.push({ role, parts: [{ text }] });
    }
  }
  return contents;
}

// ── Processar mensagem ────────────────────────────────────────────────────────

async function processarMensagem(
  remetente: string,
  mensagem: string | null,
  tipo: string,
  mediaId: string | null,
) {
  const GEMINI_KEY  = Deno.env.get('GEMINI_API_KEY')!;
  const SUPA_KEY    = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!;
  const SUPA_URL    = Deno.env.get('SUPABASE_URL')!;

  try {
    await salvarMensagem(remetente, 'user', mensagem ?? `[${tipo}]`, SUPA_KEY, SUPA_URL);

    const [systemPrompt, historico] = await Promise.all([
      buildSystemPrompt(SUPA_KEY, SUPA_URL),
      buscarHistorico(remetente, 18, SUPA_KEY, SUPA_URL),
    ]);

    // deno-lint-ignore no-explicit-any
    const contents: any[] = toGeminiContents(historico.slice(0, -1));

    if (tipo === 'image' && mediaId) {
      const img = await baixarImagemWhatsApp(mediaId);
      contents.push({
        role: 'user',
        parts: [
          { inlineData: { mimeType: img.mimeType, data: img.data } },
          { text: mensagem ?? 'Analise esta imagem. Se for comprovante ou transação financeira, extrai os dados e registra automaticamente.' },
        ],
      });
    } else {
      contents.push({ role: 'user', parts: [{ text: mensagem ?? '' }] });
    }

    let resposta = await callGemini(systemPrompt, contents, GEMINI_KEY);
    let iteracoes = 0;

    while (resposta.functionCalls.length > 0 && iteracoes < 5) {
      iteracoes++;
      contents.push(resposta.modelContent);
      // deno-lint-ignore no-explicit-any
      const functionResponses: any[] = [];
      for (const fc of resposta.functionCalls) {
        const result = await executarTool(fc.name, fc.args ?? {}, remetente, SUPA_KEY, SUPA_URL);
        functionResponses.push({ functionResponse: { name: fc.name, response: result } });
      }
      contents.push({ role: 'user', parts: functionResponses });
      resposta = await callGemini(systemPrompt, contents, GEMINI_KEY);
    }

    const textoFinal = resposta.text || 'Entendido.';
    await enviarResposta(textoFinal);
    await salvarMensagem(remetente, 'assistant', textoFinal, SUPA_KEY, SUPA_URL);

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
                    tipo === 'document' ? (msg.document?.id as string)    : null;
    await processarMensagem(msg.from, texto, tipo, mediaId);
  }

  return new Response(JSON.stringify({ ok: true }), {
    status: 200,
    headers: { 'Content-Type': 'application/json' },
  });
});
