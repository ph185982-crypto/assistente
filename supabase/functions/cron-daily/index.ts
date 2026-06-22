import { serve } from 'https://deno.land/std@0.168.0/http/server.ts';
import {
  buscarTransacoesOntem, buscarTransacoesMes,
  calcularResumo, fmt,
  buscarReceitasPrevistasPróximas, marcarReceitasAtrasadas, buscarDividasVencendoHoje,
} from '../_shared/supabase.ts';
import { notificarPedro } from '../_shared/whatsapp.ts';

serve(async () => {
  try {
    const [ontem, mes, previstasBrevemente, atrasadas, dividasHoje] = await Promise.all([
      buscarTransacoesOntem(),
      buscarTransacoesMes(),
      buscarReceitasPrevistasPróximas(3),
      marcarReceitasAtrasadas(),
      buscarDividasVencendoHoje(),
    ]);

    const { receitas, despesas, saldo } = calcularResumo(ontem);
    const saldoMes = calcularResumo(mes).saldo;
    const despesasMes = calcularResumo(mes).despesas;

    const agora = new Date();
    const diaAtual = agora.getDate();
    const diasNoMes = new Date(agora.getFullYear(), agora.getMonth() + 1, 0).getDate();
    const diasRestantes = diasNoMes - diaAtual;
    const burnRate = diaAtual > 0 ? despesasMes / diaAtual : 0;
    const projecao = burnRate * diasNoMes;

    let msg = `Bom dia, Pedro!\n\nOntem:\n`;
    msg += `Receitas: R$ ${fmt(receitas)}\n`;
    msg += `Despesas: R$ ${fmt(despesas)}\n`;
    msg += `Saldo do dia: R$ ${fmt(saldo)}\n`;
    msg += `\nNo mes: R$ ${fmt(saldoMes)}\n`;
    msg += `Burn rate: R$ ${fmt(burnRate)}/dia — projecao R$ ${fmt(projecao)} no mes (${diasRestantes} dias restantes)\n`;

    if (previstasBrevemente.length > 0) {
      msg += `\nReceitas previstas nos proximos 3 dias:\n`;
      for (const r of previstasBrevemente as Record<string, unknown>[]) {
        msg += `• ${r.data_prevista} — R$ ${fmt(Number(r.valor))} — ${r.descricao}\n`;
      }
    }

    if (atrasadas.length > 0) {
      msg += `\nAtencao: ${atrasadas.length} receita(s) prevista(s) em atraso — confirmar se recebeu?\n`;
      for (const r of atrasadas as Record<string, unknown>[]) {
        msg += `• ${r.data_prevista} — R$ ${fmt(Number(r.valor))} — ${r.descricao}\n`;
      }
    }

    if (dividasHoje.length > 0) {
      msg += `\nVence hoje:\n`;
      for (const d of dividasHoje as Record<string, unknown>[]) {
        const saldo = Number(d.valor_total) - Number(d.valor_pago);
        msg += `• ${d.descricao} (${d.credor}) — parcela R$ ${fmt(Number(d.parcela_mensal ?? 0))} | restam R$ ${fmt(saldo)}\n`;
      }
    }

    await notificarPedro(msg.trim());
    return new Response(JSON.stringify({ ok: true }), { status: 200 });
  } catch (err) {
    console.error('[cron-daily]', err);
    return new Response(JSON.stringify({ error: String(err) }), { status: 500 });
  }
});
