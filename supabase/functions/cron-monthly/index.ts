// Max — fechamento mensal inteligente (dia 1, 8h Brasília). Zero-import: REST + OpenAI.

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
    // Mês fechado = mês anterior; comparativo = mês retrasado
    const agora = new Date();
    const mesFechadoD = new Date(agora.getFullYear(), agora.getMonth() - 1, 1);
    const mesAnteriorD = new Date(agora.getFullYear(), agora.getMonth() - 2, 1);
    const mesFechado  = mesFechadoD.toISOString().slice(0, 7);
    const mesAnterior = mesAnteriorD.toISOString().slice(0, 7);

    const [txFechado, txAnterior, dividas, metas, contasPendentes] = await Promise.all([
      dbSelect('transacoes', `select=tipo,valor,descricao,categoria,tipo_negocio,data_transacao&confirmado=eq.true&mes=eq.${mesFechado}`, SUPA_KEY, SUPA_URL),
      dbSelect('transacoes', `select=tipo,valor,categoria,tipo_negocio&confirmado=eq.true&mes=eq.${mesAnterior}`, SUPA_KEY, SUPA_URL),
      dbSelect('dividas', 'select=descricao,credor,valor_total,valor_pago,parcela_mensal&status=eq.ativa', SUPA_KEY, SUPA_URL).catch(() => []),
      dbSelect('metas_financeiras', 'select=*&status=eq.ativa', SUPA_KEY, SUPA_URL).catch(() => []),
      dbSelect('contas_pagar', 'select=descricao,valor,data_vencimento&status=eq.pendente&order=data_vencimento&limit=20', SUPA_KEY, SUPA_URL).catch(() => []),
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
            content: 'Você é Max, conselheiro financeiro e de negócios do Pedro Henrique — empreendedor em Goiânia (Vendedoria: SaaS de vendas WhatsApp; LuKaizen Games), dívidas ~R$87k, renda fixa R$4.550/mês, despesas fixas ~R$7.504/mês, meta R$8-20k/mês. Todo dia 1 você entrega o FECHAMENTO DO MÊS no WhatsApp. Tom de amigo experiente que fala a real, sem markdown com asteriscos, sem frases genéricas. Máximo ~2500 caracteres.',
          },
          {
            role: 'user',
            content: `Feche o mês ${mesFechado} comparando com ${mesAnterior}: receitas x despesas x mês anterior, categorias que subiram/desceram (com valores), quanto foi pra dívida, desempenho por negócio (pessoal/vendedoria/lukaizen), quanto faltou pra meta de R$8k. Dê uma NOTA de 0 a 10 pro mês (justifique em 1 frase) e feche com as 3 prioridades do mês que começa.\n\nDADOS:\nMES_FECHADO_${mesFechado}: ${JSON.stringify(txFechado)}\nMES_ANTERIOR_${mesAnterior}: ${JSON.stringify(txAnterior)}\nDIVIDAS: ${JSON.stringify(dividas)}\nMETAS: ${JSON.stringify(metas)}\nCONTAS_A_PAGAR_PENDENTES: ${JSON.stringify(contasPendentes)}`,
          },
        ],
      }),
    });
    if (!res.ok) throw new Error(`OpenAI: ${(await res.text()).slice(0, 200)}`);
    const json = await res.json();
    const fechamento = json.choices?.[0]?.message?.content ?? '';

    await sendWhatsApp(fechamento.trim() || 'Fechamento mensal indisponível.');
    return new Response(JSON.stringify({ ok: true, mes: mesFechado }), { status: 200 });
  } catch (err) {
    console.error('[cron-monthly]', err);
    return new Response(JSON.stringify({ error: String(err) }), { status: 500 });
  }
});
