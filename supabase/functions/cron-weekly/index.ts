// Max — análise semanal profunda (segunda 8h). Zero-import: REST + OpenAI fetch.

const OPENAI_CHAT = 'https://api.openai.com/v1/chat/completions';
const MODEL_DEEP  = 'gpt-5';

function supaHeaders(key: string) {
  return { apikey: key, Authorization: `Bearer ${key}`, 'Content-Type': 'application/json' };
}

async function dbSelect(table: string, params: string, key: string, url: string) {
  const res = await fetch(`${url}/rest/v1/${table}?${params}`, { headers: supaHeaders(key) });
  if (!res.ok) throw new Error(`DB select ${table}: ${await res.text()}`);
  return res.json();
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

Deno.serve(async () => {
  const SUPA_KEY   = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!;
  const SUPA_URL   = Deno.env.get('SUPABASE_URL')!;
  const OPENAI_KEY = Deno.env.get('OPENAI_API_KEY')!;

  try {
    const hoje = new Date().toISOString().slice(0, 10);
    const d60 = new Date(); d60.setDate(d60.getDate() - 60);
    const inicio = d60.toISOString().slice(0, 10);

    const [tx, dividas, metas, previstas, tarefas, contasPagar, orcamentos] = await Promise.all([
      dbSelect('transacoes', `select=tipo,valor,descricao,categoria,tipo_negocio,data_transacao&confirmado=eq.true&data_transacao=gte.${inicio}&order=data_transacao`, SUPA_KEY, SUPA_URL),
      dbSelect('dividas', 'select=descricao,credor,valor_total,valor_pago,parcela_mensal,dia_vencimento&status=eq.ativa', SUPA_KEY, SUPA_URL).catch(() => []),
      dbSelect('metas_financeiras', 'select=*&status=eq.ativa', SUPA_KEY, SUPA_URL).catch(() => []),
      dbSelect('receitas_previstas', 'select=descricao,valor,data_prevista,status&status=in.(pendente,atrasada)&order=data_prevista', SUPA_KEY, SUPA_URL).catch(() => []),
      dbSelect('tarefas', 'select=descricao,status,historico&order=criado_em.desc&limit=15', SUPA_KEY, SUPA_URL).catch(() => []),
      dbSelect('contas_pagar', 'select=descricao,valor,data_vencimento,recorrente&status=eq.pendente&order=data_vencimento&limit=20', SUPA_KEY, SUPA_URL).catch(() => []),
      dbSelect('orcamentos', 'select=categoria,limite_mensal', SUPA_KEY, SUPA_URL).catch(() => []),
    ]);

    const res = await fetch(OPENAI_CHAT, {
      method: 'POST',
      headers: { Authorization: `Bearer ${OPENAI_KEY}`, 'Content-Type': 'application/json' },
      body: JSON.stringify({
        model: MODEL_DEEP,
        reasoning_effort: 'high',
        max_completion_tokens: 4000,
        messages: [
          {
            role: 'system',
            content: 'Você é Max, conselheiro financeiro e de negócios do Pedro Henrique — empreendedor em Goiânia (Vendedoria: SaaS de vendas no WhatsApp; LuKaizen Games), dívidas ~R$87k, renda fixa R$4.550/mês, despesas fixas ~R$7.504/mês, meta R$8-20k/mês. Toda segunda você entrega a ANÁLISE SEMANAL PROFUNDA no WhatsApp. Tom: amigo experiente que fala a real, sem markdown com asteriscos, sem listas numeradas engessadas, sem frases genéricas de encerramento. Máximo ~2500 caracteres.',
          },
          {
            role: 'user',
            content: `Hoje é ${hoje}. Analise os últimos 60 dias com profundidade: tendência semana a semana (gastos e receitas), categorias que estão crescendo ou fora de controle, desempenho por negócio (pessoal vs vendedoria vs lukaizen), progresso real das dívidas, ritmo vs a meta de R$8k/mês, receitas previstas que não estão caindo. Feche com: 1 coisa pra CORTAR, 1 coisa pra DOBRAR, e o número da semana (a métrica que mais importa agora). Seja específico com valores reais.\n\nDADOS:\nTRANSACOES_60D: ${JSON.stringify(tx)}\nDIVIDAS: ${JSON.stringify(dividas)}\nMETAS: ${JSON.stringify(metas)}\nRECEITAS_PREVISTAS: ${JSON.stringify(previstas)}\nCONTAS_A_PAGAR: ${JSON.stringify(contasPagar)}\nORCAMENTOS: ${JSON.stringify(orcamentos)}\nTAREFAS: ${JSON.stringify(tarefas)}`,
          },
        ],
      }),
    });
    if (!res.ok) throw new Error(`OpenAI: ${(await res.text()).slice(0, 200)}`);
    const json = await res.json();
    const analise = json.choices?.[0]?.message?.content ?? '';

    await sendWhatsApp(analise.trim() || 'Análise semanal indisponível.');
    return new Response(JSON.stringify({ ok: true }), { status: 200 });
  } catch (err) {
    console.error('[cron-weekly]', err);
    return new Response(JSON.stringify({ error: String(err) }), { status: 500 });
  }
});
