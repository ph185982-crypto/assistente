// Max — alertas proativos de hora em hora. Zero-import.
// Regras determinísticas + deduplicação via tabela alertas_enviados (chave única).

function supaHeaders(key: string) {
  return { apikey: key, Authorization: `Bearer ${key}`, 'Content-Type': 'application/json' };
}

async function dbSelect(table: string, params: string, key: string, url: string) {
  const res = await fetch(`${url}/rest/v1/${table}?${params}`, { headers: supaHeaders(key) });
  if (!res.ok) throw new Error(`DB select ${table}: ${await res.text()}`);
  return res.json();
}

// Retorna true se o alerta é novo (conseguiu inserir a chave), false se já foi enviado antes
async function alertaNovo(chave: string, key: string, url: string): Promise<boolean> {
  const res = await fetch(`${url}/rest/v1/alertas_enviados`, {
    method: 'POST',
    headers: { ...supaHeaders(key), Prefer: 'return=minimal' },
    body: JSON.stringify({ chave }),
  });
  return res.ok; // 409/conflito = já enviado
}

async function sendWhatsApp(texto: string) {
  const TOKEN    = Deno.env.get('WHATSAPP_TOKEN')!;
  const PHONE_ID = Deno.env.get('WHATSAPP_PHONE_NUMBER_ID')!;
  const MEU_NUM  = Deno.env.get('MEU_NUMERO')!;
  await fetch(`https://graph.facebook.com/v19.0/${PHONE_ID}/messages`, {
    method: 'POST',
    headers: { Authorization: `Bearer ${TOKEN}`, 'Content-Type': 'application/json' },
    body: JSON.stringify({ messaging_product: 'whatsapp', to: MEU_NUM, type: 'text', text: { body: texto } }),
  });
}

function fmt(v: number) {
  return v.toLocaleString('pt-BR', { minimumFractionDigits: 2 });
}

Deno.serve(async () => {
  const SUPA_KEY = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!;
  const SUPA_URL = Deno.env.get('SUPABASE_URL')!;

  try {
    // Só alerta entre 8h e 22h de Brasília
    const horaBrasilia = Number(new Date().toLocaleString('pt-BR', { timeZone: 'America/Sao_Paulo', hour: 'numeric', hour12: false }));
    if (horaBrasilia < 8 || horaBrasilia >= 22) {
      return new Response(JSON.stringify({ ok: true, silencio: true }), { status: 200 });
    }

    const alertas: string[] = [];
    const hoje = new Date().toISOString().slice(0, 10);
    const mes = hoje.slice(0, 7);
    const diaHoje = new Date().getDate();
    const amanha = new Date(); amanha.setDate(amanha.getDate() + 1);
    const diaAmanha = amanha.getDate();

    // 1) Dívidas vencendo hoje ou amanhã
    const dividas = await dbSelect('dividas', 'select=id,descricao,credor,parcela_mensal,dia_vencimento,valor_total,valor_pago&status=eq.ativa', SUPA_KEY, SUPA_URL).catch(() => []);
    for (const d of dividas) {
      const dia = Number(d.dia_vencimento);
      if (dia === diaHoje || dia === diaAmanha) {
        const quando = dia === diaHoje ? 'HOJE' : 'amanhã';
        if (await alertaNovo(`divida:${d.id}:${mes}`, SUPA_KEY, SUPA_URL)) {
          alertas.push(`💳 ${d.credor ?? d.descricao} vence ${quando} — parcela R$ ${fmt(Number(d.parcela_mensal ?? 0))} (restam R$ ${fmt(Number(d.valor_total) - Number(d.valor_pago))})`);
        }
      }
    }

    // 2) Receitas previstas atrasadas (não caíram)
    const atrasadas = await dbSelect('receitas_previstas', `select=id,descricao,valor,data_prevista,cliente&status=in.(pendente,atrasada)&data_prevista=lt.${hoje}`, SUPA_KEY, SUPA_URL).catch(() => []);
    for (const r of atrasadas) {
      if (await alertaNovo(`receita_atrasada:${r.id}`, SUPA_KEY, SUPA_URL)) {
        alertas.push(`⏳ R$ ${fmt(Number(r.valor))} de "${r.descricao}"${r.cliente ? ` (${r.cliente})` : ''} era pra ter caído em ${r.data_prevista} e não caiu. Cobrar?`);
      }
    }

    // 3) Gasto atípico hoje (> 2x a média da categoria nos últimos 60 dias, mínimo R$100)
    const d60 = new Date(); d60.setDate(d60.getDate() - 60);
    const tx60 = await dbSelect('transacoes', `select=id,valor,categoria,descricao,data_transacao,tipo&confirmado=eq.true&tipo=eq.despesa&data_transacao=gte.${d60.toISOString().slice(0, 10)}`, SUPA_KEY, SUPA_URL).catch(() => []);
    const txHoje = tx60.filter((x: Record<string, unknown>) => x.data_transacao === hoje);
    const porCategoria: Record<string, number[]> = {};
    for (const x of tx60) {
      if (x.data_transacao === hoje) continue;
      (porCategoria[x.categoria] ??= []).push(Number(x.valor));
    }
    for (const x of txHoje) {
      const amostras = porCategoria[x.categoria] ?? [];
      if (amostras.length < 5 || Number(x.valor) < 100) continue;
      const media = amostras.reduce((s, v) => s + v, 0) / amostras.length;
      if (Number(x.valor) > 2 * media) {
        if (await alertaNovo(`gasto_atipico:${x.id}`, SUPA_KEY, SUPA_URL)) {
          alertas.push(`👀 Gasto fora do padrão: R$ ${fmt(Number(x.valor))} em "${x.descricao}" (${x.categoria}) — sua média nessa categoria é R$ ${fmt(media)}.`);
        }
      }
    }

    // 4) Categoria estourando: mês atual > 1.5x a média dos 3 meses anteriores (mínimo R$500)
    const m3 = new Date(); m3.setMonth(m3.getMonth() - 3); m3.setDate(1);
    const txM3 = await dbSelect('transacoes', `select=valor,categoria,mes&confirmado=eq.true&tipo=eq.despesa&data_transacao=gte.${m3.toISOString().slice(0, 10)}`, SUPA_KEY, SUPA_URL).catch(() => []);
    const somaCatMes: Record<string, Record<string, number>> = {};
    for (const x of txM3) {
      (somaCatMes[x.categoria] ??= {})[x.mes] = ((somaCatMes[x.categoria] ??= {})[x.mes] ?? 0) + Number(x.valor);
    }
    for (const [cat, meses] of Object.entries(somaCatMes)) {
      const atual = meses[mes] ?? 0;
      const anteriores = Object.entries(meses).filter(([m]) => m !== mes).map(([, v]) => v);
      if (anteriores.length < 2 || atual < 500) continue;
      const media = anteriores.reduce((s, v) => s + v, 0) / anteriores.length;
      if (atual > 1.5 * media) {
        if (await alertaNovo(`categoria_estouro:${cat}:${mes}`, SUPA_KEY, SUPA_URL)) {
          alertas.push(`📈 ${cat} está em R$ ${fmt(atual)} este mês — bem acima da sua média de R$ ${fmt(media)}. Vale segurar.`);
        }
      }
    }

    if (alertas.length > 0) {
      await sendWhatsApp(`🔔 Max de olho:\n\n${alertas.join('\n\n')}`);
    }

    return new Response(JSON.stringify({ ok: true, alertas: alertas.length }), { status: 200 });
  } catch (err) {
    console.error('[cron-hourly]', err);
    return new Response(JSON.stringify({ error: String(err) }), { status: 500 });
  }
});
