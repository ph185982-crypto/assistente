import {
  salvarMensagem, buscarHistorico, salvarContexto, buscarTodoContexto,
  inserirTransacao, cancelarTransacao,
  buscarTransacoesHoje, buscarTransacoesSemana, buscarTransacoesMes,
  buscarTransacoesOntem,
  inserirLembrete, buscarProximosLembretes,
  calcularResumo, calcularPorCategoria, fmt,
} from './supabase.ts';
import { notificarPedro } from './whatsapp.ts';

const GEMINI_KEY = Deno.env.get('GEMINI_API_KEY')!;
const MODEL      = 'gemini-2.0-flash';
const GEMINI_URL = `https://generativelanguage.googleapis.com/v1beta/models/${MODEL}:generateContent?key=${GEMINI_KEY}`;

// ── Tools (Gemini usa functionDeclarations com tipos uppercase) ──────────────

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

// ── System prompt dinâmico ───────────────────────────────────────────────────

async function buildSystemPrompt(): Promise<string> {
  const [transacoesMes, lembretes, contexto] = await Promise.all([
    buscarTransacoesMes(),
    buscarProximosLembretes(),
    buscarTodoContexto(),
  ]);

  const { receitas, despesas, saldo } = calcularResumo(transacoesMes);
  const porCat = calcularPorCategoria(transacoesMes.filter(t => t.tipo === 'despesa'));

  const topCategorias = Object.entries(porCat)
    .sort((a, b) => b[1].despesas - a[1].despesas).slice(0, 5)
    .map(([cat, v]) => `  ${cat}: R$ ${fmt(v.despesas)}`).join('\n');

  const lembretesStr = lembretes.length
    ? lembretes.map(l => `  • ${new Date(l.data_hora as string).toLocaleString('pt-BR', { timeZone: 'America/Sao_Paulo' })}: ${l.descricao}`).join('\n')
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
${contexto.length ? `\n━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━\nMEMÓRIA ATUALIZADA\n━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━\n${contexto.map(c => `${c.chave}: ${c.valor}`).join('\n')}` : ''}
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

// ── Executor das tools ───────────────────────────────────────────────────────

const ultimosIds = new Map<string, string>();

// deno-lint-ignore no-explicit-any
async function executarTool(nome: string, args: Record<string, any>, remetente: string): Promise<unknown> {
  try {
    switch (nome) {
      case 'registrar_transacao': {
        const t = await inserirTransacao({
          tipo: args.tipo, valor: args.valor, descricao: args.descricao,
          categoria: args.categoria, tipo_negocio: args.tipo_negocio ?? 'pessoal',
          empresa: args.empresa ?? null,
          data_transacao: (args.data as string) || new Date().toISOString().slice(0, 10),
          confirmado: true,
        });
        ultimosIds.set(remetente, t.id);

        const hoje = await buscarTransacoesHoje();
        const resumoHoje = calcularResumo(hoje);
        return { ok: true, id: t.id, registrado: true, resumo_hoje: resumoHoje };
      }

      case 'desfazer_ultima': {
        const id = (args.id as string) || ultimosIds.get(remetente);
        if (!id) return { ok: false, motivo: 'nenhuma transação recente para desfazer' };
        await cancelarTransacao(id);
        ultimosIds.delete(remetente);
        return { ok: true, desfeito: true };
      }

      case 'criar_lembrete': {
        const l = await inserirLembrete({
          descricao: args.descricao, data_hora: args.data_hora,
          recorrente: args.recorrente ?? false, frequencia: args.frequencia ?? null,
        });
        return { ok: true, id: l.id };
      }

      case 'consultar_financas': {
        // deno-lint-ignore no-explicit-any
        let t: Record<string, any>[];
        const p = args.periodo as string;

        if (p === 'hoje')             t = await buscarTransacoesHoje();
        else if (p === 'semana')      t = await buscarTransacoesSemana();
        else if (p === 'ontem')       t = await buscarTransacoesOntem();
        else if (p === 'mes_passado') {
          const mp = new Date(); mp.setMonth(mp.getMonth() - 1);
          t = await buscarTransacoesMes(mp.toISOString().slice(0, 7));
        }
        else t = await buscarTransacoesMes();

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
        await salvarContexto(args.chave as string, args.valor as string, args.categoria as string);
        return { ok: true, salvo: args.chave };
      }

      case 'listar_lembretes': {
        const ls = await buscarProximosLembretes();
        return { lembretes: ls.map(l => ({ descricao: l.descricao, data_hora: l.data_hora })) };
      }

      default:
        return { erro: 'tool desconhecida' };
    }
  } catch (err) {
    return { erro: String(err) };
  }
}

// ── Baixar imagem do WhatsApp ────────────────────────────────────────────────

async function baixarImagemWhatsApp(mediaId: string): Promise<{ mimeType: string; data: string }> {
  const WA_TOKEN = Deno.env.get('WHATSAPP_TOKEN')!;

  const metaRes = await fetch(`https://graph.facebook.com/v19.0/${mediaId}`,
    { headers: { Authorization: `Bearer ${WA_TOKEN}` } });
  const { url: mediaUrl } = await metaRes.json();

  const imgRes = await fetch(mediaUrl, { headers: { Authorization: `Bearer ${WA_TOKEN}` } });
  const buf    = await imgRes.arrayBuffer();
  const mime   = imgRes.headers.get('content-type') ?? 'image/jpeg';

  const bytes = new Uint8Array(buf);
  let binary = '';
  const chunk = 8192;
  for (let i = 0; i < bytes.length; i += chunk)
    binary += String.fromCharCode(...bytes.subarray(i, i + chunk));

  return { mimeType: mime, data: btoa(binary) };
}

// ── Enviar resposta longa ────────────────────────────────────────────────────

async function enviarResposta(texto: string) {
  const MAX = 4000;
  if (texto.length <= MAX) { await notificarPedro(texto); return; }
  const partes = texto.match(/[\s\S]{1,4000}(?:\n|$)/g) ?? [texto.slice(0, MAX)];
  for (const parte of partes) await notificarPedro(parte.trim());
}

// ── Converter histórico do Supabase → formato Gemini ────────────────────────

// deno-lint-ignore no-explicit-any
function toGeminiContents(historico: any[]): any[] {
  const contents = [];
  for (const msg of historico) {
    const role = msg.role === 'assistant' ? 'model' : 'user';
    const text = typeof msg.content === 'string' ? msg.content : '';
    if (!text.trim()) continue;
    // Gemini exige alternância user/model — mescla mensagens consecutivas do mesmo role
    if (contents.length > 0 && contents[contents.length - 1].role === role) {
      contents[contents.length - 1].parts[0].text += '\n' + text;
    } else {
      contents.push({ role, parts: [{ text }] });
    }
  }
  return contents;
}

// ── Motor principal ──────────────────────────────────────────────────────────

export async function processarMensagem(
  remetente: string,
  mensagem: string | null,
  tipo: string,
  mediaId: string | null,
) {
  try {
    await salvarMensagem(remetente, 'user', mensagem ?? `[${tipo}]`);

    const [systemPrompt, historico] = await Promise.all([
      buildSystemPrompt(),
      buscarHistorico(remetente, 18),
    ]);

    // Histórico sem a última mensagem (que já vamos adicionar)
    // deno-lint-ignore no-explicit-any
    const contents: any[] = toGeminiContents(historico.slice(0, -1));

    // Adiciona mensagem atual
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

    let resposta = await callGemini(systemPrompt, contents);
    let iteracoes = 0;

    // Loop de tool calls
    while (resposta.functionCalls.length > 0 && iteracoes < 5) {
      iteracoes++;

      // Adiciona a resposta do modelo (com as function calls) ao histórico
      contents.push(resposta.modelContent);

      // Executa todas as tool calls e coleta as respostas
      // deno-lint-ignore no-explicit-any
      const functionResponses: any[] = [];
      for (const fc of resposta.functionCalls) {
        const result = await executarTool(fc.name, fc.args ?? {}, remetente);
        functionResponses.push({
          functionResponse: { name: fc.name, response: result },
        });
      }

      // Todas as respostas de tool numa única mensagem user
      contents.push({ role: 'user', parts: functionResponses });

      resposta = await callGemini(systemPrompt, contents);
    }

    const textoFinal = resposta.text || 'Entendido.';
    await enviarResposta(textoFinal);
    await salvarMensagem(remetente, 'assistant', textoFinal);

  } catch (err) {
    console.error('[Max] Erro crítico:', err);
    try { await notificarPedro(`⚠️ Deu erro aqui: ${String(err).slice(0, 200)}`); } catch { /* ignore */ }
  }
}

// ── Wrapper Gemini ───────────────────────────────────────────────────────────

// deno-lint-ignore no-explicit-any
async function callGemini(systemPrompt: string, contents: any[]) {
  const body = {
    systemInstruction: { parts: [{ text: systemPrompt }] },
    contents,
    tools: GEMINI_TOOLS,
    toolConfig: { functionCallingConfig: { mode: 'AUTO' } },
    generationConfig: { maxOutputTokens: 1200, temperature: 0.7 },
  };

  const res = await fetch(GEMINI_URL, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
  });

  if (!res.ok) {
    const err = await res.text();
    throw new Error(`Gemini API error ${res.status}: ${err}`);
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
