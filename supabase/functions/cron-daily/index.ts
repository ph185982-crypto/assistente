// Max — briefing matinal inteligente (8h) e resumo noturno (20h, ?modo=noite)
// Zero-import: Supabase REST + OpenAI via fetch nativo.

const OPENAI_CHAT      = 'https://api.openai.com/v1/chat/completions';
const OPENAI_RESPONSES = 'https://api.openai.com/v1/responses';
const MODEL_DEEP = 'gpt-5';
const MODEL_CHAT = 'gpt-5-mini';

function supaHeaders(key: string) {
  return { apikey: key, Authorization: `Bearer ${key}`, 'Content-Type': 'application/json' };
}

async function dbSelect(table: string, params: string, key: string, url: string) {
  const res = await fetch(`${url}/rest/v1/${table}?${params}`, { headers: supaHeaders(key) });
  if (!res.ok) throw new Error(`DB select ${table}: ${await res.text()}`);
  return res.json();
}

// deno-lint-ignore no-explicit-any
function calcularResumo(t: Record<string, any>[]) {
  const receitas = t.filter(x => x.tipo === 'receita').reduce((s, x) => s + Number(x.valor), 0);
  const despesas = t.filter(x => x.tipo === 'despesa').reduce((s, x) => s + Number(x.valor), 0);
  return { receitas, despesas, saldo: receitas - despesas };
}

async function sendWhatsApp(texto: string) {
  const TOKEN    = Deno.env.get('WHATSAPP_TOKEN')!;
  const PHONE_ID = Deno.env.get('WHATSAPP_PHONE_NUMBER_ID')!;
  const MEU_NUM  = Deno.env.get('MEU_NUMERO')!;
  const MAX = 4000;
  const partes = texto.length <= MAX ? [texto] : (texto.match(/[\s\S]{1,4000}(?:\n|$)/g) ?? [texto.slice(0, MAX)]);
  for (const parte of partes) {
    await fetch(`https://graph.facebook.com/v19.0/${PHONE_ID}/messages`, {
      method: 'POST',
      headers: { Authorization: `Bearer ${TOKEN}`, 'Content-Type': 'application/json' },
      body: JSON.stringify({ messaging_product: 'whatsapp', to: MEU_NUM, type: 'text', text: { body: parte.trim() } }),
    });
  }
}

async function buscarNoticias(openaiKey: string): Promise<string> {
  const res = await fetch(OPENAI_RESPONSES, {
    method: 'POST',
    headers: { Authorization: `Bearer ${openaiKey}`, 'Content-Type': 'application/json' },
    body: JSON.stringify({
      model: MODEL_CHAT,
      tools: [{ type: 'web_search' }],
      input: 'Busque as notícias mais relevantes de HOJE no Brasil sobre: 1) empreendedorismo e pequenos negócios, 2) IA e automação de vendas/WhatsApp, 3) mercado de games e consoles, 4) economia brasileira (juros, inflação, o que afeta pequeno empresário). Liste 4-6 manchetes com 1 linha de resumo cada, em português. Só fatos de fontes reais e recentes.',
      max_output_tokens: 2500,
    }),
  });
  if (!res.ok) throw new Error(`news: ${(await res.text()).slice(0, 200)}`);
  const json = await res.json();
  let texto = '';
  for (const item of json.output ?? []) {
    if (item.type === 'message') {
      for (const c of item.content ?? []) {
        if (c.type === 'output_text') texto += c.text + '\n';
      }
    }
  }
  return texto.trim();
}

// deno-lint-ignore no-explicit-any
async function gerarBriefing(dados: Record<string, any>, noticias: string, modo: string, openaiKey: string): Promise<string> {
  const persona = `Você é Max, assistente pessoal do Pedro Henrique — empreendedor em Goiânia (Vendedoria: SaaS de vendas WhatsApp; LuKaizen Games), dívidas ~R$87k, renda fixa R$4.550/mês, despesas fixas ~R$7.504/mês, meta R$8-20k/mês. Escreve no WhatsApp: direto, tom de amigo esperto, sem markdown com asteriscos, sem listas numeradas desnecessárias, sem frases de encerramento genéricas. Máximo ~1800 caracteres.`;

  const instrucao = modo === 'noite'
    ? `Escreva o RESUMO NOTURNO do dia (são ~20h em Brasília). Estrutura livre, mas cubra: como foi o dia financeiramente (com leitura crítica, não só números), o que ficou pendente (tarefas/lembretes não concluídos), e UMA sugestão concreta de foco pra amanhã. Comece com algo como "Fechamento do dia:".`
    : `Escreva o BRIEFING MATINAL (são ~8h em Brasília). Comece com "Bom dia". Cubra: leitura crítica de ontem e do mês (burn rate, projeção — interprete, não despeje números), o que vence/entra hoje, 3-4 notícias mais úteis pro Pedro (das fornecidas, com 1 frase de por que importa pra ele), e UMA sugestão de foco do dia. Termine sem frase genérica.`;

  const res = await fetch(OPENAI_CHAT, {
    method: 'POST',
    headers: { Authorization: `Bearer ${openaiKey}`, 'Content-Type': 'application/json' },
    body: JSON.stringify({
      model: MODEL_DEEP,
      reasoning_effort: 'medium',
      max_completion_tokens: 3000,
      messages: [
        { role: 'system', content: persona },
        { role: 'user', content: `${instrucao}\n\nDADOS FINANCEIROS REAIS:\n${JSON.stringify(dados)}\n\nNOTÍCIAS DE HOJE:\n${noticias || '(indisponíveis hoje)'}` },
      ],
    }),
  });
  if (!res.ok) throw new Error(`briefing: ${(await res.text()).slice(0, 200)}`);
  const json = await res.json();
  return json.choices?.[0]?.message?.content ?? '';
}

Deno.serve(async (req: Request) => {
  const SUPA_KEY   = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!;
  const SUPA_URL   = Deno.env.get('SUPABASE_URL')!;
  const OPENAI_KEY = Deno.env.get('OPENAI_API_KEY')!;
  const modo = new URL(req.url).searchParams.get('modo') ?? 'manha';

  try {
    const hoje = new Date().toISOString().slice(0, 10);
    const ontemD = new Date(); ontemD.setDate(ontemD.getDate() - 1);
    const ontem = ontemD.toISOString().slice(0, 10);
    const mesIni = hoje.slice(0, 7) + '-01';

    const [txOntem, txHoje, txMes, previstas, dividas, lembretes, tarefas] = await Promise.all([
      dbSelect('transacoes', `select=*&confirmado=eq.true&data_transacao=eq.${ontem}`, SUPA_KEY, SUPA_URL),
      dbSelect('transacoes', `select=*&confirmado=eq.true&data_transacao=eq.${hoje}`, SUPA_KEY, SUPA_URL),
      dbSelect('transacoes', `select=*&confirmado=eq.true&data_transacao=gte.${mesIni}&data_transacao=lte.${hoje}`, SUPA_KEY, SUPA_URL),
      dbSelect('receitas_previstas', 'select=descricao,valor,data_prevista,status,cliente&status=in.(pendente,atrasada)&order=data_prevista&limit=10', SUPA_KEY, SUPA_URL).catch(() => []),
      dbSelect('dividas', 'select=descricao,credor,valor_total,valor_pago,parcela_mensal,dia_vencimento&status=eq.ativa', SUPA_KEY, SUPA_URL).catch(() => []),
      dbSelect('lembretes', `select=descricao,data_hora&enviado=eq.false&order=data_hora&limit=8`, SUPA_KEY, SUPA_URL).catch(() => []),
      dbSelect('tarefas', 'select=descricao,proxima_cobranca,recorrente&status=eq.ativa&order=proxima_cobranca&limit=8', SUPA_KEY, SUPA_URL).catch(() => []),
    ]);

    const agora = new Date();
    const diaAtual = agora.getDate();
    const diasNoMes = new Date(agora.getFullYear(), agora.getMonth() + 1, 0).getDate();
    const resumoMes = calcularResumo(txMes);
    const burnRate = diaAtual > 0 ? resumoMes.despesas / diaAtual : 0;

    const dados = {
      data_hoje: hoje,
      ontem: { ...calcularResumo(txOntem), transacoes: txOntem.map((x: Record<string, unknown>) => ({ tipo: x.tipo, valor: x.valor, descricao: x.descricao, categoria: x.categoria })) },
      hoje: modo === 'noite' ? { ...calcularResumo(txHoje), transacoes: txHoje.map((x: Record<string, unknown>) => ({ tipo: x.tipo, valor: x.valor, descricao: x.descricao, categoria: x.categoria })) } : undefined,
      mes: { ...resumoMes, burn_rate_dia: Math.round(burnRate), projecao_despesas: Math.round(burnRate * diasNoMes), dias_restantes: diasNoMes - diaAtual },
      receitas_previstas: previstas,
      dividas_ativas: dividas,
      lembretes_proximos: lembretes,
      tarefas_ativas: tarefas,
    };

    const noticias = modo === 'noite' ? '' : await buscarNoticias(OPENAI_KEY).catch(e => { console.error('news', e); return ''; });
    const briefing = await gerarBriefing(dados, noticias, modo, OPENAI_KEY);

    await sendWhatsApp(briefing.trim() || 'Briefing indisponível hoje.');
    return new Response(JSON.stringify({ ok: true, modo }), { status: 200 });
  } catch (err) {
    console.error('[cron-daily]', err);
    return new Response(JSON.stringify({ error: String(err) }), { status: 500 });
  }
});
