import { serve } from 'https://deno.land/std@0.168.0/http/server.ts';
import { buscarTransacoesMesPassado, calcularResumo, calcularPorCategoria, fmt } from '../_shared/supabase.ts';
import { notificarPedro } from '../_shared/whatsapp.ts';

serve(async () => {
  try {
    const t = await buscarTransacoesMesPassado();
    const { receitas, despesas, saldo } = calcularResumo(t);
    const porCat = calcularPorCategoria(t.filter((x: Record<string, unknown>) => x.tipo === 'despesa'));

    let msg = `📅 Relatório do mês anterior:\n\n💰 R$ ${fmt(receitas)}\n💸 R$ ${fmt(despesas)}\n📈 R$ ${fmt(saldo)}\n\nPor categoria:\n`;
    Object.entries(porCat).sort((a, b) => b[1].despesas - a[1].despesas)
      .forEach(([c, v]) => { msg += `• ${c}: R$ ${fmt(v.despesas)}\n`; });

    if (receitas < 8000) msg += `\n⚠️ R$ ${fmt(8000 - receitas)} abaixo da meta de R$ 8.000.`;

    await notificarPedro(msg);
    return new Response(JSON.stringify({ ok: true }), { status: 200 });
  } catch (err) {
    console.error('[cron-monthly]', err);
    return new Response(JSON.stringify({ error: String(err) }), { status: 500 });
  }
});
