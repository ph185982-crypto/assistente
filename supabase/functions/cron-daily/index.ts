import { serve } from 'https://deno.land/std@0.168.0/http/server.ts';
import { buscarTransacoesOntem, buscarTransacoesMes, calcularResumo, fmt } from '../_shared/supabase.ts';
import { notificarPedro } from '../_shared/whatsapp.ts';

serve(async () => {
  try {
    const ontem = await buscarTransacoesOntem();
    const mes   = await buscarTransacoesMes();
    const { receitas, despesas, saldo } = calcularResumo(ontem);
    const saldoMes = calcularResumo(mes).saldo;

    await notificarPedro(
      `☀️ Bom dia, Pedro! Resumo de ontem:\n\n` +
      `💰 Receitas: R$ ${fmt(receitas)}\n` +
      `💸 Despesas: R$ ${fmt(despesas)}\n` +
      `📊 Saldo do dia: R$ ${fmt(saldo)}\n\n` +
      `No mês até agora: R$ ${fmt(saldoMes)}`
    );
    return new Response(JSON.stringify({ ok: true }), { status: 200 });
  } catch (err) {
    console.error('[cron-daily]', err);
    return new Response(JSON.stringify({ error: String(err) }), { status: 500 });
  }
});
