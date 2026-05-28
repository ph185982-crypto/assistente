import { serve } from 'https://deno.land/std@0.168.0/http/server.ts';
import { buscarTransacoesSemanaPassada, calcularResumo, calcularPorCategoria, fmt } from '../_shared/supabase.ts';
import { notificarPedro } from '../_shared/whatsapp.ts';

serve(async () => {
  try {
    const t = await buscarTransacoesSemanaPassada();
    const { receitas, despesas, saldo } = calcularResumo(t);
    const porCat = calcularPorCategoria(t.filter((x: Record<string, unknown>) => x.tipo === 'despesa'));

    let msg = `📊 Semana passada:\n\n💰 R$ ${fmt(receitas)}\n💸 R$ ${fmt(despesas)}\n📈 R$ ${fmt(saldo)}\n\nPor categoria:\n`;
    Object.entries(porCat).sort((a, b) => b[1].despesas - a[1].despesas)
      .forEach(([c, v]) => { msg += `• ${c}: R$ ${fmt(v.despesas)}\n`; });

    await notificarPedro(msg);
    return new Response(JSON.stringify({ ok: true }), { status: 200 });
  } catch (err) {
    console.error('[cron-weekly]', err);
    return new Response(JSON.stringify({ error: String(err) }), { status: 500 });
  }
});
