import {
  salvarMensagem, buscarHistorico, salvarContexto, buscarTodoContexto,
  inserirTransacao, cancelarTransacao,
  buscarTransacoesHoje, buscarTransacoesSemana, buscarTransacoesMes,
  buscarTransacoesOntem,
  inserirLembrete, buscarProximosLembretes,
  calcularResumo, calcularPorCategoria, fmt,
} from './supabase.ts';
import { notificarPedro } from './whatsapp.ts';

const OPENAI_KEY = Deno.env.get('OPENAI_API_KEY')!;
const MODEL = 'gpt-4o';

// ── Tools ────────────────────────────────────────────────────

const TOOLS = [
  {
    type: 'function',
    function: {
      name: 'registrar_transacao',
      description: 'Registra uma receita ou despesa imediatamente, sem pedir confirmação. Após registrar, mostra um mini-extrato do dia.',
      parameters: {
        type: 'object',
        properties: {
          tipo: { type: 'string', enum: ['receita', 'despesa'] },
          valor: { type: 'number' },
          descricao: { type: 'string' },
          categoria: {
            type: 'string',
            enum: ['Moradia','Transporte','Alimentação','Saúde','Lazer','Vestuário',
              'Assinaturas','Negócios','Dívidas','Fornecedor','Marketing','Outros'],
          },
          tipo_negocio: { type: 'string', enum: ['pessoal','vendedoria','lukaizen','geral'] },
          data: { type: 'string', description: 'YYYY-MM-DD' },
          empresa: { type: 'string' },
        },
        required: ['tipo','valor','descricao','categoria','tipo_negocio'],
      },
    },
  },
  {
    type: 'function',
    function: {
      name: 'desfazer_ultima',
      description: 'Apaga a última transação registrada se o Pedro pedir para desfazer ou cancelar',
      parameters: {
        type: 'object',
        properties: { id: { type: 'string', description: 'ID da transação a apagar' } },
        required: ['id'],
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
          descricao: { type: 'string' },
          data_hora: { type: 'string', description: 'ISO 8601 fuso Brasília UTC-3' },
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
          periodo: { type: 'string', enum: ['hoje','semana','mes','mes_passado','ontem'] },
          tipo_negocio: { type: 'string', enum: ['pessoal','vendedoria','lukaizen','geral','todos'] },
          categoria: { type: 'string' },
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
          chave: { type: 'string' },
          valor: { type: 'string' },
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
];

// ── System prompt dinâmico ───────────────────────────────────

async function buildSystemPrompt(): Promise<string> {
  const [contexto, transacoesMes, lembretes] = await Promise.all([
    buscarTodoContexto(),
    buscarTransacoesMes(),
    buscarProximosLembretes(),
  ]);

  const { receitas, despesas, saldo } = calcularResumo(transacoesMes);
  const porCat = calcularPorCategoria(transacoesMes.filter(t => t.tipo === 'despesa'));

  const contextoStr = contexto.length
    ? contexto.map(c => `• ${c.chave}: ${c.valor}`).join('\n')
    : '(nenhum contexto salvo ainda)';

  const topCategorias = Object.entries(porCat)
    .sort((a, b) => b[1].despesas - a[1].despesas).slice(0, 5)
    .map(([cat, v]) => `  ${cat}: R$ ${fmt(v.despesas)}`).join('\n');

  const lembretesStr = lembretes.length
    ? lembretes.map(l => `  • ${new Date(l.data_hora as string).toLocaleString('pt-BR', { timeZone: 'America/Sao_Paulo' })}: ${l.descricao}`).join('\n')
    : '  (nenhum)';

  const agora = new Date().toLocaleString('pt-BR', { timeZone: 'America/Sao_Paulo' });

  return `Você é Max, assistente pessoal do Pedro Henrique.

PERSONALIDADE:
- Fala de forma descontraída, informal, como um amigo próximo que entende de finanças
- Usa linguagem casual do dia a dia, sem ser formal ou robótico
- É direto e rápido — não enrola, vai logo ao ponto
- Usa emojis com moderação, só quando faz sentido
- Às vezes usa expressões brasileiras naturais ("beleza", "tranquilo", "tá bom")
- Nunca é bajulador — fala a verdade mesmo quando é ruim
- Tom leve e próximo, mas com firmeza quando o gasto tá preocupando

PERFIL DO PEDRO:
${contextoStr}

SITUAÇÃO FINANCEIRA (${new Date().toLocaleString('pt-BR', { month: 'long', year: 'numeric' })}):
💰 Receitas: R$ ${fmt(receitas)}
💸 Despesas: R$ ${fmt(despesas)}
📊 Saldo: R$ ${fmt(saldo)}
Transações: ${transacoesMes.length}
${topCategorias ? `\nMaiores despesas:\n${topCategorias}` : ''}

PRÓXIMOS LEMBRETES:
${lembretesStr}

NEGÓCIOS:
- Vendedoria: loja de ferramentas via WhatsApp
- LuKaizen Games: empresa de jogos
- Meta de renda: R$ 8.000/mês

REGRAS DE COMPORTAMENTO:
1. REGISTRA NA HORA — não pede confirmação, executa direto
2. Depois de registrar, mostra um mini-extrato simples: o que registrou + saldo do dia
3. Se Pedro quiser desfazer, usa a tool desfazer_ultima com o ID retornado
4. Imagens: analisa, identifica os dados e registra automaticamente
5. Classifica corretamente: pessoal / vendedoria / lukaizen
6. Salva informações importantes do Pedro com salvar_informacao
7. Nunca inventa valores
8. Português do Brasil informal, tom de amigo próximo
9. Data/hora atual: ${agora}

FORMATO DO MINI-EXTRATO APÓS REGISTRAR:
✅ [descrição] — R$ [valor] ([categoria])
📅 Hoje: R$ [despesas_hoje] gastos | R$ [receitas_hoje] entrou`;
}

// ── Executor das tools ───────────────────────────────────────

// Guarda o último ID registrado por remetente para possível desfazer
const ultimosIds = new Map<string, string>();

async function executarTool(nome: string, args: Record<string, unknown>, remetente: string): Promise<string> {
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

        // Busca extrato do dia para incluir no retorno
        const hoje = await buscarTransacoesHoje();
        const resumoHoje = calcularResumo(hoje);

        return JSON.stringify({
          ok: true,
          id: t.id,
          registrado: true,
          resumo_hoje: {
            despesas: resumoHoje.despesas,
            receitas: resumoHoje.receitas,
            saldo: resumoHoje.saldo,
          },
        });
      }

      case 'desfazer_ultima': {
        const id = args.id as string ?? ultimosIds.get(remetente);
        if (!id) return JSON.stringify({ ok: false, motivo: 'nenhuma transação recente para desfazer' });
        await cancelarTransacao(id);
        ultimosIds.delete(remetente);
        return JSON.stringify({ ok: true, desfeito: true });
      }

      case 'criar_lembrete': {
        const l = await inserirLembrete({
          descricao: args.descricao, data_hora: args.data_hora,
          recorrente: args.recorrente ?? false, frequencia: args.frequencia ?? null,
        });
        return JSON.stringify({ ok: true, id: l.id });
      }

      case 'consultar_financas': {
        let t: Record<string, unknown>[];
        const p = args.periodo as string;

        if (p === 'hoje')          t = await buscarTransacoesHoje();
        else if (p === 'semana')   t = await buscarTransacoesSemana();
        else if (p === 'ontem')    t = await buscarTransacoesOntem();
        else if (p === 'mes_passado') {
          const mp = new Date(); mp.setMonth(mp.getMonth() - 1);
          t = await buscarTransacoesMes(mp.toISOString().slice(0, 7));
        }
        else t = await buscarTransacoesMes();

        if (args.tipo_negocio && args.tipo_negocio !== 'todos')
          t = t.filter(x => x.tipo_negocio === args.tipo_negocio);
        if (args.categoria)
          t = t.filter(x => x.categoria === args.categoria);

        const resumo  = calcularResumo(t);
        const porCat  = calcularPorCategoria(t);
        const porNeg  = t.reduce((acc: Record<string, number>, x) => {
          const n = (x.tipo_negocio as string) ?? 'pessoal';
          if (x.tipo === 'despesa') acc[n] = (acc[n] ?? 0) + Number(x.valor);
          return acc;
        }, {});

        return JSON.stringify({
          periodo: p, total: t.length,
          receitas: resumo.receitas, despesas: resumo.despesas, saldo: resumo.saldo,
          por_categoria: porCat, por_negocio: porNeg,
          ultimas: t.slice(0, 8).map(x => ({
            tipo: x.tipo, valor: x.valor, descricao: x.descricao,
            categoria: x.categoria, data: x.data_transacao,
          })),
        });
      }

      case 'salvar_informacao': {
        await salvarContexto(args.chave as string, args.valor as string, args.categoria as string);
        return JSON.stringify({ ok: true, salvo: args.chave });
      }

      case 'listar_lembretes': {
        const ls = await buscarProximosLembretes();
        return JSON.stringify({ lembretes: ls.map(l => ({ descricao: l.descricao, data_hora: l.data_hora })) });
      }

      default:
        return JSON.stringify({ erro: 'tool desconhecida' });
    }
  } catch (err) {
    return JSON.stringify({ erro: String(err) });
  }
}

// ── Processar imagem (fix: base64 seguro para arquivos grandes) ──

async function processarImagem(mediaId: string): Promise<string> {
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
  for (let i = 0; i < bytes.length; i += chunk) {
    binary += String.fromCharCode(...bytes.subarray(i, i + chunk));
  }

  return `data:${mime};base64,${btoa(binary)}`;
}

// ── Enviar mensagem longa (split se > 4000 chars) ────────────

async function enviarResposta(texto: string) {
  const MAX = 4000;
  if (texto.length <= MAX) {
    await notificarPedro(texto);
    return;
  }
  const partes = texto.match(/[\s\S]{1,4000}(?:\n|$)/g) ?? [texto.slice(0, MAX)];
  for (const parte of partes) {
    await notificarPedro(parte.trim());
  }
}

// ── Motor principal ──────────────────────────────────────────

export async function processarMensagem(
  remetente: string,
  mensagem: string | null,
  tipo: string,
  mediaId: string | null,
) {
  try {
    // 1. Salvar mensagem do usuário no histórico
    await salvarMensagem(remetente, 'user', mensagem ?? `[${tipo}]`);

    // 2. Construir contexto e histórico em paralelo
    const [systemPrompt, historico] = await Promise.all([
      buildSystemPrompt(),
      buscarHistorico(remetente, 18),
    ]);

    // 3. Montar array de mensagens
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const messages: any[] = [
      { role: 'system', content: systemPrompt },
      ...historico.slice(0, -1),
    ];

    // Mensagem atual
    if (tipo === 'image' && mediaId) {
      const imgData = await processarImagem(mediaId);
      messages.push({
        role: 'user',
        content: [
          { type: 'image_url', image_url: { url: imgData } },
          { type: 'text', text: mensagem ?? 'Analise esta imagem. Se for comprovante ou transação financeira, identifique os dados e registre automaticamente.' },
        ],
      });
    } else {
      messages.push({ role: 'user', content: mensagem ?? '' });
    }

    // 4. Chamar GPT-4o
    let resposta = await callGPT(messages);

    // 5. Loop de tool calling
    let iteracoes = 0;
    while (resposta.finish_reason === 'tool_calls' && iteracoes < 5) {
      iteracoes++;

      messages.push(resposta.message);

      for (const tc of (resposta.message.tool_calls ?? [])) {
        const args   = JSON.parse(tc.function.arguments ?? '{}');
        const result = await executarTool(tc.function.name, args, remetente);
        messages.push({
          role: 'tool',
          tool_call_id: tc.id,
          content: result,
        });
      }

      resposta = await callGPT(messages);
    }

    // 6. Enviar resposta
    const textoFinal = resposta.message.content ?? 'Entendido.';
    await enviarResposta(textoFinal);

    // 7. Salvar no histórico
    await salvarMensagem(remetente, 'assistant', textoFinal);

  } catch (err) {
    console.error('[Max] Erro crítico:', err);
    try {
      await notificarPedro(`⚠️ Deu erro aqui: ${String(err).slice(0, 200)}`);
    } catch { /* ignore */ }
  }
}

// ── Wrapper OpenAI ───────────────────────────────────────────

// eslint-disable-next-line @typescript-eslint/no-explicit-any
async function callGPT(messages: any[]) {
  const res = await fetch('https://api.openai.com/v1/chat/completions', {
    method: 'POST',
    headers: { Authorization: `Bearer ${OPENAI_KEY}`, 'Content-Type': 'application/json' },
    body: JSON.stringify({ model: MODEL, messages, tools: TOOLS, tool_choice: 'auto', max_tokens: 1024 }),
  });

  if (!res.ok) {
    const err = await res.text();
    throw new Error(`OpenAI API error ${res.status}: ${err}`);
  }

  const json = await res.json();
  const choice = json.choices?.[0];
  return {
    message: choice?.message,
    finish_reason: choice?.finish_reason as string,
  };
}
