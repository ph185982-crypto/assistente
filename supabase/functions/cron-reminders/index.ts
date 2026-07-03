// Max — lembretes vencidos + cobrança de tarefas (roda a cada minuto). Zero-import.

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
    headers: { ...supaHeaders(key), Prefer: 'return=minimal' },
    body: JSON.stringify(data),
  });
  if (!res.ok) throw new Error(`DB insert ${table}: ${await res.text()}`);
}

async function dbUpdate(table: string, filter: string, data: Record<string, unknown>, key: string, url: string) {
  const res = await fetch(`${url}/rest/v1/${table}?${filter}`, {
    method: 'PATCH',
    headers: { ...supaHeaders(key), Prefer: 'return=minimal' },
    body: JSON.stringify(data),
  });
  if (!res.ok) throw new Error(`DB update ${table}: ${await res.text()}`);
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

function proximaData(dataAtual: string, frequencia: string) {
  const d = new Date(dataAtual);
  if (frequencia === 'diario')  d.setDate(d.getDate() + 1);
  if (frequencia === 'semanal') d.setDate(d.getDate() + 7);
  if (frequencia === 'mensal')  d.setMonth(d.getMonth() + 1);
  // Se a próxima data ainda ficou no passado (cobrança atrasada), avança a partir de agora
  while (d.getTime() <= Date.now()) {
    if (frequencia === 'diario')  d.setDate(d.getDate() + 1);
    else if (frequencia === 'semanal') d.setDate(d.getDate() + 7);
    else if (frequencia === 'mensal')  d.setMonth(d.getMonth() + 1);
    else break;
  }
  return d.toISOString();
}

Deno.serve(async () => {
  const SUPA_KEY = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!;
  const SUPA_URL = Deno.env.get('SUPABASE_URL')!;

  try {
    const agora = new Date().toISOString();
    let enviados = 0;

    // 1) Lembretes vencidos
    const lembretes = await dbSelect('lembretes',
      `select=*&enviado=eq.false&data_hora=lte.${encodeURIComponent(agora)}`, SUPA_KEY, SUPA_URL);
    for (const l of lembretes) {
      await sendWhatsApp(`⏰ Lembrete: ${l.descricao}`);
      await dbUpdate('lembretes', `id=eq.${l.id}`, { enviado: true }, SUPA_KEY, SUPA_URL);
      enviados++;
      if (l.recorrente && l.frequencia) {
        await dbInsert('lembretes', {
          descricao: l.descricao, recorrente: true, frequencia: l.frequencia,
          data_hora: proximaData(l.data_hora, l.frequencia),
        }, SUPA_KEY, SUPA_URL);
      }
    }

    // 2) Tarefas com cobrança vencida — Max cobra o resultado
    const tarefas = await dbSelect('tarefas',
      `select=*&status=eq.ativa&proxima_cobranca=lte.${encodeURIComponent(agora)}`, SUPA_KEY, SUPA_URL).catch(() => []);
    for (const t of tarefas) {
      await sendWhatsApp(`📋 Cobrança do Max: ${t.descricao}\n\nE aí, como está isso? Me responde que eu registro.`);
      enviados++;
      if (t.recorrente && t.frequencia) {
        await dbUpdate('tarefas', `id=eq.${t.id}`,
          { proxima_cobranca: proximaData(t.proxima_cobranca, t.frequencia) }, SUPA_KEY, SUPA_URL);
      } else {
        // Tarefa única: cobrou, vira concluída (a resposta do Pedro fica no histórico via webhook)
        await dbUpdate('tarefas', `id=eq.${t.id}`, { status: 'concluida' }, SUPA_KEY, SUPA_URL);
      }
    }

    return new Response(JSON.stringify({ ok: true, enviados }), { status: 200 });
  } catch (err) {
    console.error('[cron-reminders]', err);
    return new Response(JSON.stringify({ error: String(err) }), { status: 500 });
  }
});
