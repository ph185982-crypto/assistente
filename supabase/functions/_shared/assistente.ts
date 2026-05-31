import {
  supabase, salvarMensagem, buscarHistorico, salvarContexto, buscarTodoContexto,
  inserirTransacao, confirmarTransacao, cancelarTransacao,
  buscarTransacoesHoje, buscarTransacoesSemana, buscarTransacoesMes,
  buscarTransacoesOntem, buscarTransacoesPeriodo,
  inserirLembrete, buscarProximosLembretes,
  setPendente, getPendente, deletePendente,
  calcularResumo, calcularPorCategoria, fmt,
} from './supabase.ts';
import { notificarPedro } from './whatsapp.ts';

const OPENAI_KEY = Deno.env.get('OPENAI_API_KEY')!;
const MODEL = 'gpt-4o';

// ── Tools disponíveis para o Max ─────────────────────────────

const TOOLS = [
  {
    type: 'function',
    function: {
      name: 'registrar_transacao',
      description: 'Registra uma receita ou despesa financeira. Sempre confirmar com o usuário antes de salvar definitivamente.',
      parameters: {
        type: 'object',
        properties: {
          tipo: { type: 'string', enum: ['receita', 'despesa'], description: 'Tipo da transação' },
          valor: { type: 'number', description: 'Valor em reais' },
          descricao: { type: 'string', description: 'Descrição da transação' },
          categoria: {
            type: 'string',
            enum: ['Moradia', 'Transporte', 'Alimentação', 'Saúde', 'Lazer', 'Vestuário',
              'Assinaturas', 'Negócios', 'Dívidas', 'Fornecedor', 'Marketing', 'Pessoal', 'Outros'],
          },
          tipo_negocio: {
            type: 'string',
            enum: ['pessoal', 'vendedoria', 'lukaizen', 'geral'],
            description: 'A qual contexto pertence esta transação',
          },
          data: { type: 'string', description: 'Data no formato YYYY-MM-DD. Se não informada, usar hoje.' },
          empresa: { type: 'string', description: 'Nome do fornecedor ou empresa envolvida, se aplicável' },
        },
        required: ['tipo', 'valor', 'descricao', 'categoria', 'tipo_negocio'],
      },
    },
  },
  {
    type: 'function',
    function: {
      name: 'confirmar_pendente',
      description: 'Confirma ou cancela a última transação pendente de confirmação do usuário',
      parameters: {
        type: 'object',
        properties: {
          acao: { type: 'string', enum: ['confirmar', 'cancelar'] },
        },
        required: ['acao'],
      },
    },
  },
  {
    type: 'function',
    function: {
      name: 'criar_lembrete',
      description: 'Cria um lembrete ou evento na agenda',
      parameters: {
        type: 'object',
        properties: {
          descricao: { type: 'string' },
          data_hora: { type: 'string', description: 'ISO 8601 no fuso de Brasília (UTC-3)' },
          recorrente: { type: 'boolean', default: false },
          frequencia: { type: 'string', enum: ['diario', 'semanal', 'mensal'], description: 'Só se recorrente=true' },
        },
        required: ['descricao', 'data_hora'],
      },
    },
  },
  {
    type: 'function',
    function: {
      name: 'consultar_financas',
      description: 'Consulta dados financeiros do banco. Use para responder perguntas sobre saldo, gastos, receitas.',
      parameters: {
        type: 'object',
        properties: {
          periodo: {
            type: 'string',
            enum: ['hoje', 'semana', 'mes', 'mes_passado', 'ontem'],
          },
          tipo_negocio: {
            type: 'string',
            enum: ['pessoal', 'vendedoria', 'lukaizen', 'geral', 'todos'],
            description: 'Filtrar por contexto',
          },
          categoria: { type: 'string', description: 'Filtrar por categoria específica' },
        },
        required: ['periodo'],
      },
    },
  },
  {
    type: 'function',
    function: {
      name: 'salvar_informacao',
      description: 'Salva uma informação importante sobre Pedro para usar como contexto futuro. Use quando Pedro compartilhar dados sobre ele, suas metas, negócios, rotina, etc.',
      parameters: {
        type: 'object',
        properties: {
          chave: { type: 'string', description: 'Nome único para esta informação (ex: meta_renda, divida_total, fornecedor_principal)' },
          valor: { type: 'string', description: 'O valor/descrição da informação' },
          categoria: {
            type: 'string',
            enum: ['financeiro', 'negocio', 'pessoal', 'meta', 'contato', 'rotina', 'outros'],
          },
        },
        required: ['chave', 'valor', 'categoria'],
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
  const [contexto, transacoesMes, proximosLembretes] = await Promise.all([
    buscarTodoContexto(),
    buscarTransacoesMes(),
    buscarProximosLembretes(),
  ]);

  const { receitas, despesas, saldo } = calcularResumo(transacoesMes);
  const porCat = calcularPorCategoria(transacoesMes.filter(t => t.tipo === 'despesa'));

  const contextoStr = contexto.length > 0
    ? contexto.map(c => `• ${c.chave}: ${c.valor}`).join('\n')
    : '(nenhum contexto salvo ainda)';

  const topCategorias = Object.entries(porCat)
    .sort((a, b) => b[1].despesas - a[1].despesas)
    .slice(0, 5)
    .map(([cat, v]) => `  ${cat}: R$ ${fmt(v.despesas)}`)
    .join('\n');

  const lembretesStr = proximosLembretes.length > 0
    ? proximosLembretes.map(l => `  • ${new Date(l.data_hora as string).toLocaleString('pt-BR', { timeZone: 'America/Sao_Paulo' })}: ${l.descricao}`).join('\n')
    : '  (nenhum)';

  return `Você é Max, assistente pessoal do Pedro Henrique.

SOBRE VOCÊ:
- Você é um assistente completo: financeiro, agenda, lembretes, conselheiro de negócios
- Você tem memória das conversas anteriores e aprende sobre o Pedro
- Você responde de forma natural, direta e humana — sem ser robótico
- Você pode conversar sobre qualquer assunto, não só finanças
- Quando perceber algo preocupante nos gastos, alerta com firmeza
- Use emojis com moderação, só quando fizer sentido

PERFIL DO PEDRO:
${contextoStr}

SITUAÇÃO FINANCEIRA ATUAL (${new Date().toLocaleString('pt-BR', { month: 'long', year: 'numeric' })}):
💰 Receitas: R$ ${fmt(receitas)}
💸 Despesas: R$ ${fmt(despesas)}
📊 Saldo: R$ ${fmt(saldo)}
Transações no mês: ${transacoesMes.length}

Maiores categorias de despesa:
${topCategorias || '  (sem despesas ainda)'}

PRÓXIMOS LEMBRETES:
${lembretesStr}

NEGÓCIOS DO PEDRO:
- Vendedoria: loja de ferramentas via WhatsApp
- LuKaizen Games: empresa de jogos
- Meta de renda: R$ 8.000/mês

REGRAS DE COMPORTAMENTO:
1. SEMPRE confirme antes de salvar qualquer transação financeira
2. Quando receber imagem, analise e proponha o registro
3. Classifique automaticamente: pessoal, vendedoria ou lukaizen
4. Se Pedro falar algo importante sobre ele (meta, dívida, rotina), salve com salvar_informacao
5. Nunca invente valores — só registre o que Pedro confirmar
6. Responda em português do Brasil, tom direto e próximo
7. Se for uma conversa casual, responda normalmente sem acionar tools
8. Data/hora atual: ${new Date().toLocaleString('pt-BR', { timeZone: 'America/Sao_Paulo' })}`;
}

// ── Executor das tools ───────────────────────────────────────

async function executarTool(nome: string, args: Record<string, unknown>, remetente: string): Promise<string> {
  switch (nome) {
    case 'registrar_transacao': {
      const t = await inserirTransacao({
        tipo: args.tipo,
        valor: args.valor,
        descricao: args.descricao,
        categoria: args.categoria,
        tipo_negocio: args.tipo_negocio ?? 'pessoal',
        empresa: args.empresa ?? null,
        data_transacao: (args.data as string) || new Date().toISOString().slice(0, 10),
        confirmado: false,
      });
      await setPendente(remetente, t.id);
      return JSON.stringify({ ok: true, id: t.id, aguardando_confirmacao: true });
    }

    case 'confirmar_pendente': {
      const id = await getPendente(remetente);
      if (!id) return JSON.stringify({ ok: false, motivo: 'nenhuma transação pendente' });
      if (args.acao === 'confirmar') {
        await confirmarTransacao(id);
        await deletePendente(remetente);
        return JSON.stringify({ ok: true, confirmado: true });
      } else {
        await cancelarTransacao(id);
        await deletePendente(remetente);
        return JSON.stringify({ ok: true, cancelado: true });
      }
    }

    case 'criar_lembrete': {
      const l = await inserirLembrete({
        descricao: args.descricao,
        data_hora: args.data_hora,
        recorrente: args.recorrente ?? false,
        frequencia: args.frequencia ?? null,
      });
      return JSON.stringify({ ok: true, id: l.id });
    }

    case 'consultar_financas': {
      let transacoes: Record<string, unknown>[];
      const periodo = args.periodo as string;
      if (periodo === 'hoje')         transacoes = await buscarTransacoesHoje();
      else if (periodo === 'semana')  transacoes = await buscarTransacoesSemana();
      else if (periodo === 'ontem')   transacoes = await buscarTransacoesOntem();
      else if (periodo === 'mes_passado') {
        const hoje = new Date();
        const mp = new Date(hoje.getFullYear(), hoje.getMonth() - 1, 1);
        transacoes = await buscarTransacoesMes(mp.toISOString().slice(0, 7));
      }
      else transacoes = await buscarTransacoesMes();

      // Filtros opcionais
      if (args.tipo_negocio && args.tipo_negocio !== 'todos') {
        transacoes = transacoes.filter(t => t.tipo_negocio === args.tipo_negocio);
      }
      if (args.categoria) {
        transacoes = transacoes.filter(t => t.categoria === args.categoria);
      }

      const resumo = calcularResumo(transacoes);
      const porCategoria = calcularPorCategoria(transacoes);
      const porNegocio = transacoes.reduce((acc: Record<string, number>, t) => {
        const n = (t.tipo_negocio as string) ?? 'pessoal';
        acc[n] = (acc[n] ?? 0) + (t.tipo === 'despesa' ? Number(t.valor) : 0);
        return acc;
      }, {});

      return JSON.stringify({
        periodo,
        total_transacoes: transacoes.length,
        receitas: resumo.receitas,
        despesas: resumo.despesas,
        saldo: resumo.saldo,
        por_categoria: porCategoria,
        por_negocio: porNegocio,
        ultimas_5: transacoes.slice(0, 5).map(t => ({
          tipo: t.tipo, valor: t.valor, descricao: t.descricao,
          categoria: t.categoria, data: t.data_transacao,
        })),
      });
    }

    case 'salvar_informacao': {
      await salvarContexto(args.chave as string, args.valor as string, args.categoria as string);
      return JSON.stringify({ ok: true, salvo: args.chave });
    }

    case 'listar_lembretes': {
      const lembretes = await buscarProximosLembretes();
      return JSON.stringify({ lembretes: lembretes.map(l => ({
        descricao: l.descricao,
        data_hora: l.data_hora,
        recorrente: l.recorrente,
      }))});
    }

    default:
      return JSON.stringify({ erro: 'tool desconhecida' });
  }
}

// ── Processar imagem ─────────────────────────────────────────

async function processarImagem(mediaId: string): Promise<string> {
  const WA_TOKEN = Deno.env.get('WHATSAPP_TOKEN')!;

  const metaRes = await fetch(`https://graph.facebook.com/v19.0/${mediaId}`, {
    headers: { Authorization: `Bearer ${WA_TOKEN}` },
  });
  const { url: mediaUrl } = await metaRes.json();

  const imgRes = await fetch(mediaUrl, { headers: { Authorization: `Bearer ${WA_TOKEN}` } });
  const buf    = await imgRes.arrayBuffer();
  const base64 = btoa(String.fromCharCode(...new Uint8Array(buf)));
  const mime   = imgRes.headers.get('content-type') ?? 'image/jpeg';

  return `data:${mime};base64,${base64}`;
}

// ── Motor principal ──────────────────────────────────────────

export async function processarMensagem(
  remetente: string,
  mensagem: string | null,
  tipo: string,
  mediaId: string | null,
) {
  // 1. Salvar mensagem do usuário
  const conteudoUsuario = mensagem ?? `[${tipo}]`;
  await salvarMensagem(remetente, 'user', conteudoUsuario);

  // 2. Construir contexto: system prompt + histórico
  const [systemPrompt, historico] = await Promise.all([
    buildSystemPrompt(),
    buscarHistorico(remetente, 20),
  ]);

  // 3. Montar mensagens para o OpenAI
  type OAIMessage = { role: string; content: string | unknown[] };
  const messages: OAIMessage[] = [
    { role: 'system', content: systemPrompt },
    ...historico.slice(0, -1), // histórico sem a última (já está no content abaixo)
  ];

  // Mensagem atual (com imagem se necessário)
  if (tipo === 'image' && mediaId) {
    const imgData = await processarImagem(mediaId);
    messages.push({
      role: 'user',
      content: [
        { type: 'image_url', image_url: { url: imgData } },
        { type: 'text', text: 'Analise esta imagem/comprovante e me diga o que é. Se for uma transação financeira, proponha o registro com os dados identificados.' },
      ],
    });
  } else {
    messages.push({ role: 'user', content: mensagem ?? '' });
  }

  // 4. Chamar GPT-4o com tools
  let resposta = await callGPT(messages, TOOLS);

  // 5. Loop de execução de tools
  let iteracoes = 0;
  while (resposta.stop_reason === 'tool_calls' && iteracoes < 5) {
    iteracoes++;
    const toolCalls = resposta.tool_calls ?? [];
    const toolResults: OAIMessage[] = [
      { role: 'assistant', content: JSON.stringify(resposta.raw_message) } as OAIMessage,
    ];

    for (const tc of toolCalls) {
      const args = JSON.parse(tc.function.arguments ?? '{}');
      const result = await executarTool(tc.function.name, args, remetente);
      toolResults.push({
        role: 'tool',
        content: result,
      } as OAIMessage);
    }

    // Continuar conversa com resultados das tools
    messages.push(...toolResults);
    resposta = await callGPT(messages, TOOLS);
  }

  // 6. Enviar resposta final para o Pedro
  const textoFinal = resposta.content ?? 'Entendido.';
  await notificarPedro(textoFinal);

  // 7. Salvar resposta no histórico
  await salvarMensagem(remetente, 'assistant', textoFinal);
}

// ── Wrapper OpenAI ───────────────────────────────────────────

async function callGPT(messages: unknown[], tools: unknown[]) {
  const res = await fetch('https://api.openai.com/v1/chat/completions', {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${OPENAI_KEY}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({
      model: MODEL,
      messages,
      tools,
      tool_choice: 'auto',
      max_tokens: 1024,
    }),
  });

  const json = await res.json();
  const choice = json.choices?.[0];
  const msg = choice?.message;

  return {
    content: msg?.content as string | null,
    stop_reason: choice?.finish_reason as string,
    tool_calls: msg?.tool_calls as Array<{ id: string; function: { name: string; arguments: string } }> | null,
    raw_message: msg,
  };
}
