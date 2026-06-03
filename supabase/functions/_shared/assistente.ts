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
      description: 'Registra uma receita ou despesa imediatamente. Após registrar, mostra mini-extrato do dia.',
      parameters: {
        type: 'object',
        properties: {
          tipo: { type: 'string', enum: ['receita', 'despesa'] },
          valor: { type: 'number' },
          descricao: { type: 'string' },
          categoria: {
            type: 'string',
            enum: ['Moradia','Transporte','Alimentação','Saúde','Lazer','Vestuário',
              'Assinaturas','Negócios','Dívidas/Parcelas','Fornecedor','Marketing',
              'Salário','Renda Variável','Outros'],
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
      description: 'Apaga a última transação registrada se Pedro pedir para desfazer ou cancelar',
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

// ── Executor das tools ───────────────────────────────────────

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
        const id = (args.id as string) || ultimosIds.get(remetente);
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

// ── Processar imagem ─────────────────────────────────────────

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

// ── Enviar mensagem longa ────────────────────────────────────

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
    await salvarMensagem(remetente, 'user', mensagem ?? `[${tipo}]`);

    const [systemPrompt, historico] = await Promise.all([
      buildSystemPrompt(),
      buscarHistorico(remetente, 18),
    ]);

    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const messages: any[] = [
      { role: 'system', content: systemPrompt },
      ...historico.slice(0, -1),
    ];

    if (tipo === 'image' && mediaId) {
      const imgData = await processarImagem(mediaId);
      messages.push({
        role: 'user',
        content: [
          { type: 'image_url', image_url: { url: imgData } },
          { type: 'text', text: mensagem ?? 'Analise esta imagem. Se for comprovante ou transação financeira, extrai os dados e registra automaticamente.' },
        ],
      });
    } else {
      messages.push({ role: 'user', content: mensagem ?? '' });
    }

    let resposta = await callGPT(messages);

    let iteracoes = 0;
    while (resposta.finish_reason === 'tool_calls' && iteracoes < 5) {
      iteracoes++;
      messages.push(resposta.message);

      for (const tc of (resposta.message.tool_calls ?? [])) {
        const args   = JSON.parse(tc.function.arguments ?? '{}');
        const result = await executarTool(tc.function.name, args, remetente);
        messages.push({ role: 'tool', tool_call_id: tc.id, content: result });
      }

      resposta = await callGPT(messages);
    }

    const textoFinal = resposta.message.content ?? 'Entendido.';
    await enviarResposta(textoFinal);
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
    body: JSON.stringify({ model: MODEL, messages, tools: TOOLS, tool_choice: 'auto', max_tokens: 1200 }),
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
