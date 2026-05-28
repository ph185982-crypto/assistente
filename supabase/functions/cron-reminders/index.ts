import { serve } from 'https://deno.land/std@0.168.0/http/server.ts';
import { buscarLembretesVencidos, marcarLembreteEnviado, inserirLembrete } from '../_shared/supabase.ts';
import { notificarPedro } from '../_shared/whatsapp.ts';

function proximaData(dataAtual: string, frequencia: string) {
  const d = new Date(dataAtual);
  if (frequencia === 'diario')  d.setDate(d.getDate() + 1);
  if (frequencia === 'semanal') d.setDate(d.getDate() + 7);
  if (frequencia === 'mensal')  d.setMonth(d.getMonth() + 1);
  return d.toISOString();
}

serve(async () => {
  try {
    const lembretes = await buscarLembretesVencidos();
    for (const l of lembretes as Record<string, unknown>[]) {
      await notificarPedro(`⏰ Lembrete: ${l.descricao}`);
      await marcarLembreteEnviado(l.id as string);
      if (l.recorrente && l.frequencia) {
        await inserirLembrete({
          descricao: l.descricao, recorrente: true, frequencia: l.frequencia,
          data_hora: proximaData(l.data_hora as string, l.frequencia as string),
        });
      }
    }
    return new Response(JSON.stringify({ ok: true, enviados: lembretes.length }), { status: 200 });
  } catch (err) {
    console.error('[cron-reminders]', err);
    return new Response(JSON.stringify({ error: String(err) }), { status: 500 });
  }
});
