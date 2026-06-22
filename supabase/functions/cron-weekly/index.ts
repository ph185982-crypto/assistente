import { serve } from 'https://deno.land/std@0.168.0/http/server.ts';
import {
  buscarTransacoesSemanaPassada, buscarTransacoesSemana,
  calcularResumo, calcularPorCategoria, fmt,
  consultarReceitasPrevistas,
} from '../_shared/supabase.ts';
import { notificarPedro } from '../_shared/whatsapp.ts';

serve(async () => {
  try {
    const agora = new Date();
    const proximaSemanaInicio = new Date(agora); proximaSemanaInicio.setDate(agora.getDate() + 1);
    const proximaSemanaFim   = new Date(agora); proximaSemanaFim.setDate(agora.getDate() + 7);

    const [semPassada, semAtual, previstasSemana] = await Promise.all([
      buscarTransacoesSemanaPassada(),
      buscarTransacoesSemana(),
      consultarReceitasPrevistas('pendente', 'semana'),
    ]);

    const resumoPassada = calcularResumo(semPassada);
    const resumoAtual   = calcularResumo(semAtual);
    const porCat = calcularPorCategoria(semPassada.filter((x: Record<string, unknown>) => x.tipo === 'despesa'));

    const top3 = Object.entries(porCat)
      .sort((a, b) => b[1].despesas - a[1].despesas)
      .slice(0, 3);

    let msg = `Semana passada:\n\n`;
    msg += `Receitas: R$ ${fmt(resumoPassada.receitas)}\n`;
    msg += `Despesas: R$ ${fmt(resumoPassada.despesas)}\n`;
    msg += `Saldo: R$ ${fmt(resumoPassada.saldo)}\n`;

    if (top3.length > 0) {
      msg += `\nTop 3 categorias de gasto:\n`;
      top3.forEach(([c, v]) => { msg += `• ${c}: R$ ${fmt(v.despesas)}\n`; });
    }

    const deltaReceitas = resumoAtual.receitas - resumoPassada.receitas;
    const deltaDespesas = resumoAtual.despesas - resumoPassada.despesas;
    msg += `\nEsta semana vs semana passada:\n`;
    msg += `Receitas: ${deltaReceitas >= 0 ? '+' : ''}R$ ${fmt(deltaReceitas)}\n`;
    msg += `Despesas: ${deltaDespesas >= 0 ? '+' : ''}R$ ${fmt(deltaDespesas)}\n`;

    if (previstasSemana.length > 0) {
      const totalPrevistas = previstasSemana.reduce((s: number, r: Record<string, unknown>) => s + Number(r.valor), 0);
      msg += `\nReceitas previstas para os proximos 7 dias: R$ ${fmt(totalPrevistas)}\n`;
      for (const r of previstasSemana as Record<string, unknown>[]) {
        msg += `• ${r.data_prevista} — R$ ${fmt(Number(r.valor))} — ${r.descricao}\n`;
      }
    }

    await notificarPedro(msg.trim());
    return new Response(JSON.stringify({ ok: true }), { status: 200 });
  } catch (err) {
    console.error('[cron-weekly]', err);
    return new Response(JSON.stringify({ error: String(err) }), { status: 500 });
  }
});
