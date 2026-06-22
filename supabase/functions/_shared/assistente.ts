import {
  salvarMensagem, buscarHistorico, salvarContexto, buscarTodoContexto,
  inserirTransacao, cancelarTransacao,
  buscarTransacoesHoje, buscarTransacoesSemana, buscarTransacoesMes,
  buscarTransacoesOntem,
  inserirLembrete, buscarProximosLembretes,
  calcularResumo, calcularPorCategoria, fmt,
  inserirReceitaPrevista, consultarReceitasPrevistas, confirmarReceitaPrevista,
  inserirDivida, consultarDividas, pagarParcelaDivida, quitarDivida,
  buscarMetasAtivas,
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
          tipo_negocio: { type: 'string', enum: ['pessoal','vendedoria','lukaizen','nexos','pedro_destrava','shopee_boost','geral'] },
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
          tipo_negocio: { type: 'string', enum: ['pessoal','vendedoria','lukaizen','nexos','pedro_destrava','shopee_boost','geral','todos'] },
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
      description: 'Salva info importante sobre Pedro para contexto futuro (metas, rotina, negócios, contatos, clientes)',
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
  {
    type: 'function',
    function: {
      name: 'registrar_receita_prevista',
      description: 'Registra uma receita que Pedro espera receber no futuro. Usar quando ele disser que vai receber um valor, que um cliente vai pagar, ou qualquer entrada futura de dinheiro.',
      parameters: {
        type: 'object',
        properties: {
          descricao: { type: 'string' },
          valor: { type: 'number' },
          data_prevista: { type: 'string', description: 'YYYY-MM-DD' },
          tipo_negocio: { type: 'string', enum: ['nexos','vendedoria','lukaizen','pedro_destrava','shopee_boost','pessoal'] },
          cliente: { type: 'string' },
        },
        required: ['descricao','valor','data_prevista'],
      },
    },
  },
  {
    type: 'function',
    function: {
      name: 'consultar_receitas_previstas',
      description: 'Consulta receitas previstas. Filtrar por status e período.',
      parameters: {
        type: 'object',
        properties: {
          status: { type: 'string', enum: ['pendente','recebida','atrasada','cancelada','todas'] },
          periodo: { type: 'string', enum: ['semana','mes','proximo_mes'] },
        },
      },
    },
  },
  {
    type: 'function',
    function: {
      name: 'confirmar_receita_prevista',
      description: 'Marca uma receita prevista como recebida e registra a transação real automaticamente. Usar quando Pedro confirmar que recebeu um pagamento que estava previsto.',
      parameters: {
        type: 'object',
        properties: {
          id: { type: 'string', description: 'ID da receita prevista' },
          valor_real: { type: 'number', description: 'Valor recebido (pode ser diferente do previsto)' },
          data_recebimento: { type: 'string', description: 'YYYY-MM-DD. Default: hoje.' },
        },
        required: ['id'],
      },
    },
  },
  {
    type: 'function',
    function: {
      name: 'gerenciar_divida',
      description: 'Registra, atualiza ou consulta dívidas. Usar quando Pedro mencionar dívidas, parcelas, ou quitar algo.',
      parameters: {
        type: 'object',
        properties: {
          acao: { type: 'string', enum: ['registrar','pagar_parcela','consultar','quitar'] },
          id: { type: 'string' },
          descricao: { type: 'string' },
          valor_total: { type: 'number' },
          parcela_mensal: { type: 'number' },
          dia_vencimento: { type: 'integer' },
          credor: { type: 'string' },
          valor_pago: { type: 'number', description: 'Valor desta parcela' },
        },
        required: ['acao'],
      },
    },
  },
  {
    type: 'function',
    function: {
      name: 'gerar_relatorio',
      description: 'Gera relatório financeiro detalhado. Usar quando Pedro pedir análise, relatório, ou quiser entender sua situação.',
      parameters: {
        type: 'object',
        properties: {
          tipo: { type: 'string', enum: ['mensal','semanal','por_negocio','comparativo','projecao'] },
          mes: { type: 'integer', description: '1-12' },
          ano: { type: 'integer' },
          tipo_negocio: { type: 'string' },
        },
        required: ['tipo'],
      },
    },
  },
];

// ── System prompt dinâmico ───────────────────────────────────

async function buildSystemPrompt(): Promise<string> {
  const agora = new Date();
  const agoraStr = agora.toLocaleString('pt-BR', { timeZone: 'America/Sao_Paulo' });

  const [transacoesMes, lembretes, contexto, receitasPrevistas] = await Promise.all([
    buscarTransacoesMes(),
    buscarProximosLembretes(),
    buscarTodoContexto(),
    consultarReceitasPrevistas('pendente'),
  ]);

  const { receitas, despesas, saldo } = calcularResumo(transacoesMes);
  const porCat = calcularPorCategoria(transacoesMes.filter(t => t.tipo === 'despesa'));

  const topCategorias = Object.entries(porCat)
    .sort((a, b) => b[1].despesas - a[1].despesas).slice(0, 5)
    .map(([cat, v]) => `  ${cat}: R$ ${fmt(v.despesas)}`).join('\n');

  const lembretesStr = lembretes.length
    ? lembretes.map(l => `  • ${new Date(l.data_hora as string).toLocaleString('pt-BR', { timeZone: 'America/Sao_Paulo' })}: ${l.descricao}`).join('\n')
    : '  (nenhum)';

  const totalPrevistas = receitasPrevistas.reduce((s: number, r: Record<string, unknown>) => s + Number(r.valor), 0);
  const qtdPrevistas = receitasPrevistas.length;

  const diasNoMes = new Date(agora.getFullYear(), agora.getMonth() + 1, 0).getDate();
  const diaAtual = agora.getDate();
  const diasRestantes = diasNoMes - diaAtual;
  const diasPassados = diaAtual > 0 ? diaAtual : 1;
  const burnRate = despesas / diasPassados;
  const projecaoDespesas = burnRate * diasNoMes;
  const pctMeta = ((receitas / 8000) * 100).toFixed(1);

  const contextoStr = contexto.length
    ? contexto.map((c: Record<string, unknown>) => `${c.chave}: ${c.valor}`).join('\n')
    : '(nenhuma memória salva ainda)';

  const previstaStr = receitasPrevistas.length
    ? receitasPrevistas.slice(0, 5).map((r: Record<string, unknown>) =>
        `  • ${r.data_prevista} | R$ ${fmt(Number(r.valor))} — ${r.descricao}${r.cliente ? ` (${r.cliente})` : ''}`
      ).join('\n')
    : '  (nenhuma)';

  return `Voce e o Max — assistente pessoal financeiro do Pedro.

━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
PERFIL DO PEDRO
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

Nome: Pedro Henrique | Goiania, GO
Papel: Empreendedor, unico provedor financeiro da familia (esposa nao trabalha agora)

NEGOCIOS ATIVOS:

1. Nexos Brasil — Agencia de marketing digital. Foco em marketplaces e trafego pago.
   Clientes fixos (recebem dia 20):
   - A Felyne Servicos (construcao/reformas): R$1.000
   - Lumiere Jeans: R$1.700
   - Effata Jeans (marketplace): R$1.000
   - LuKaizen Gamers: R$1.000
   Total fixo Nexos: R$4.700/mes
   Servicos: gestao Shopee, Meta Ads, Google Ads, criacao de sites
   Conta: Bradesco (conta da agencia)

2. Vendedoria — SaaS de automacao de vendas por WhatsApp com agente de IA.
   PRIORIDADE #1. Meta: 30 vendas/mes = break-even | 50 vendas/mes = paga dividas
   Criado para qualificar leads do trafego pago da agencia

3. @pedro_destrava — Instagram 175k+ seguidores. Repositionando para marca pessoal
   que atrai clientes da agencia.

4. ShopeeBoost AI — SaaS para otimizar listagens na Shopee (em desenvolvimento)

META FINANCEIRA: R$8.000 a R$20.000/mes em 6-12 meses

PADRAO COMPORTAMENTAL: Pedro tende a abrir novas frentes antes de consolidar as que ja
rodam. Quando mencionar projeto novo, pergunte com jeitinho: "Isso acelera a meta ou
e uma frente nova antes de consolidar o que ja funciona?"

PRINCIPIOS:
- Consolidar antes de expandir | Vendedoria e prioridade #1
- Execucao > Planejamento | Receita recorrente > pontual
- Separar dinheiro pessoal do dinheiro dos negocios

DIVIDAS CONHECIDAS (~R$87.420 total):
- Adijo R$300 (NOME SUJO — prioridade absoluta)
- Americanas R$6.000
- CNPJ esposa R$8.000
- Mercado Pago R$20.000
- Infinity Pay R$14.000
- Condominio R$4.200
- Fernando R$6.720 (parcela R$450/mes, quitacao ago/2027)
- MRV R$30.000
- Caixa R$2.700

━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
SITUACAO FINANCEIRA ATUAL
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

Receitas do mes:  R$ ${fmt(receitas)}
Despesas do mes:  R$ ${fmt(despesas)}
Saldo do mes:     R$ ${fmt(saldo)}
Meta minima:      R$ 8.000 | ${pctMeta}% atingida
Dias restantes:   ${diasRestantes} dias
Burn rate:        R$ ${fmt(burnRate)}/dia (projecao: R$ ${fmt(projecaoDespesas)} no mes)

${topCategorias ? `Maiores gastos:\n${topCategorias}` : ''}

Receitas previstas pendentes: R$ ${fmt(totalPrevistas)} (${qtdPrevistas} item${qtdPrevistas !== 1 ? 's' : ''})
${previstaStr}

Proximos lembretes:
${lembretesStr}
${contexto.length ? `\n━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━\nMEMORIA (contexto_pedro)\n━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━\n${contextoStr}` : ''}

━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
COMO VOCE AGE
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

TOM: Amigo inteligente que entende de financas — nao um robo, nao um consultor de terno.
Fala como socio conselheiro, informal, direto. Pode chamar de "Pedro" ou "chefe" ocasionalmente.
Voce esta no WhatsApp, nao fazendo PDF. Use emoji com moderacao (unicamente: checkmark, grafico, dinheiro, aviso).

RESPONSABILIDADES:
1. Registrar transacoes, receitas previstas e lembretes — sem pedir confirmacao, na hora
2. Analisar padroes, comparar meses, identificar o que esta pesado
3. Alertar quando gastos fogem do padrao ou metas estao em risco
4. Aconselhar com base nos dados reais — opinion real, nao cima do muro
5. Lembrar compromissos financeiros, dividas, metas

REGRAS:
- Despesa alta: comente o impacto no saldo e o % da receita
- Receita registrada: mostre quanto falta pra meta
- "Como estou?": panorama completo — saldo, receitas vs despesas, projecao, previstas pendentes
- Nao julgue. Contextualize: "isso representa X% da sua receita"
- Salve via salvar_informacao qualquer info relevante que Pedro compartilhar

PROIBIDO em qualquer resposta:
- Frases de encerramento: "Se precisar e so falar!", "Estou a disposicao!", "Conte comigo!"
- Listas numeradas para coisas simples
- Asteriscos para negrito (*palavra*)
- Emojis no fim de toda mensagem
- Respostas longas para perguntas curtas

PARA REGISTROS SIMPLES:
Registra na hora. Resposta em 2 linhas:
checkmark [descricao] — R$ [valor]
Hoje: R$ [despesas] gastos | R$ [receitas] entrou

RECEITAS PREVISTAS:
- "Vou receber X dia Y" → registrar_receita_prevista imediatamente
- "Recebi o X" e tinha prevista → confirmar_receita_prevista + registra transacao automaticamente
- Se prevista estiver atrasada, pergunte se recebeu

Data/hora agora: ${agoraStr}`;
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
          ok: true, id: t.id, registrado: true,
          resumo_hoje: { despesas: resumoHoje.despesas, receitas: resumoHoje.receitas, saldo: resumoHoje.saldo },
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

      case 'registrar_receita_prevista': {
        const r = await inserirReceitaPrevista({
          descricao: args.descricao,
          valor: args.valor,
          data_prevista: args.data_prevista,
          tipo_negocio: args.tipo_negocio ?? null,
          cliente: args.cliente ?? null,
          status: 'pendente',
        });
        return JSON.stringify({ ok: true, id: r.id, registrado: true });
      }

      case 'consultar_receitas_previstas': {
        const status  = (args.status as string) ?? 'pendente';
        const periodo = args.periodo as string | undefined;
        const lista = await consultarReceitasPrevistas(status, periodo);
        const total = lista.reduce((s: number, r: Record<string, unknown>) => s + Number(r.valor), 0);
        return JSON.stringify({ total: lista.length, valor_total: total, itens: lista });
      }

      case 'confirmar_receita_prevista': {
        const resultado = await confirmarReceitaPrevista(
          args.id as string,
          args.valor_real as number | undefined,
          args.data_recebimento as string | undefined,
        );
        const hoje = await buscarTransacoesHoje();
        const resumo = calcularResumo(hoje);
        return JSON.stringify({ ok: true, ...resultado, resumo_hoje: resumo });
      }

      case 'gerenciar_divida': {
        const acao = args.acao as string;

        if (acao === 'registrar') {
          const d = await inserirDivida({
            descricao: args.descricao, valor_total: args.valor_total,
            parcela_mensal: args.parcela_mensal ?? null,
            dia_vencimento: args.dia_vencimento ?? null,
            credor: args.credor ?? null, status: 'ativa',
          });
          return JSON.stringify({ ok: true, id: d.id });
        }

        if (acao === 'consultar') {
          const lista = await consultarDividas('todas');
          const totalDevendo = lista
            .filter((d: Record<string, unknown>) => d.status === 'ativa')
            .reduce((s: number, d: Record<string, unknown>) => s + Number(d.valor_total) - Number(d.valor_pago), 0);
          return JSON.stringify({ dividas: lista, total_devendo: totalDevendo });
        }

        if (acao === 'pagar_parcela') {
          if (!args.id) return JSON.stringify({ erro: 'id obrigatorio para pagar_parcela' });
          const res = await pagarParcelaDivida(args.id as string, Number(args.valor_pago ?? 0));
          return JSON.stringify({ ok: true, ...res });
        }

        if (acao === 'quitar') {
          if (!args.id) return JSON.stringify({ erro: 'id obrigatorio para quitar' });
          const res = await quitarDivida(args.id as string);
          return JSON.stringify({ ok: true, ...res });
        }

        return JSON.stringify({ erro: 'acao desconhecida' });
      }

      case 'gerar_relatorio': {
        const tipo = args.tipo as string;
        const agora = new Date();
        const mes  = (args.mes as number) ?? (agora.getMonth() + 1);
        const ano  = (args.ano as number) ?? agora.getFullYear();
        const mesStr = `${ano}-${String(mes).padStart(2, '0')}`;

        const [txMes, txMesAnterior, previstas, dividas] = await Promise.all([
          buscarTransacoesMes(mesStr),
          buscarTransacoesMes(new Date(ano, mes - 2, 1).toISOString().slice(0, 7)),
          consultarReceitasPrevistas('pendente'),
          consultarDividas('ativa'),
        ]);

        let txFiltradas = txMes;
        if (args.tipo_negocio)
          txFiltradas = txMes.filter(x => x.tipo_negocio === args.tipo_negocio);

        const resumo    = calcularResumo(txFiltradas);
        const resumoAnt = calcularResumo(txMesAnterior);
        const porCat    = calcularPorCategoria(txFiltradas.filter(t => t.tipo === 'despesa'));
        const porNeg    = txFiltradas.reduce((acc: Record<string, { receitas: number; despesas: number }>, x) => {
          const n = (x.tipo_negocio as string) ?? 'pessoal';
          if (!acc[n]) acc[n] = { receitas: 0, despesas: 0 };
          if (x.tipo === 'receita') acc[n].receitas += Number(x.valor);
          else acc[n].despesas += Number(x.valor);
          return acc;
        }, {});

        const diasNoMes   = new Date(ano, mes, 0).getDate();
        const diaAtual    = mes === agora.getMonth() + 1 ? agora.getDate() : diasNoMes;
        const burnRate    = diaAtual > 0 ? resumo.despesas / diaAtual : 0;
        const projecao    = burnRate * diasNoMes;
        const totalDividas = dividas.reduce((s: number, d: Record<string, unknown>) =>
          s + Number(d.valor_total) - Number(d.valor_pago), 0);

        return JSON.stringify({
          tipo, periodo: mesStr,
          receitas: resumo.receitas, despesas: resumo.despesas, saldo: resumo.saldo,
          vs_mes_anterior: {
            receitas: resumoAnt.receitas, despesas: resumoAnt.despesas, saldo: resumoAnt.saldo,
            delta_receitas: resumo.receitas - resumoAnt.receitas,
            delta_despesas: resumo.despesas - resumoAnt.despesas,
          },
          por_categoria: porCat,
          por_negocio: porNeg,
          projecao_despesas_mes: projecao,
          burn_rate_diario: burnRate,
          meta_minima: 8000,
          pct_meta: ((resumo.receitas / 8000) * 100).toFixed(1) + '%',
          receitas_previstas_pendentes: { total: previstas.length, valor: previstas.reduce((s: number, r: Record<string, unknown>) => s + Number(r.valor), 0) },
          total_dividas_ativas: totalDividas,
          total_transacoes: txFiltradas.length,
        });
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
          { type: 'text', text: mensagem ?? 'Analise esta imagem. Se for comprovante ou transacao financeira, extrai os dados e registra automaticamente.' },
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
    console.error('[Max] Erro critico:', err);
    try {
      await notificarPedro(`Deu erro aqui: ${String(err).slice(0, 200)}`);
    } catch { /* ignore */ }
  }
}

// ── Wrapper OpenAI ───────────────────────────────────────────

// eslint-disable-next-line @typescript-eslint/no-explicit-any
async function callGPT(messages: any[]) {
  const res = await fetch('https://api.openai.com/v1/chat/completions', {
    method: 'POST',
    headers: { Authorization: `Bearer ${OPENAI_KEY}`, 'Content-Type': 'application/json' },
    body: JSON.stringify({ model: MODEL, messages, tools: TOOLS, tool_choice: 'auto', max_tokens: 1500 }),
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
