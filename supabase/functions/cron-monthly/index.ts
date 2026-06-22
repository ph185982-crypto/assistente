import { serve } from 'https://deno.land/std@0.168.0/http/server.ts';
import {
  buscarTransacoesMesPassado, buscarTransacoesMes,
  calcularResumo, calcularPorCategoria, fmt,
  buscarReceitasPrevistasMes, buscarMetasAtivas, atualizarMetaFinanceira,
} from '../_shared/supabase.ts';
import { notificarPedro } from '../_shared/whatsapp.ts';

serve(async () => {
  try {
    const agora = new Date();
    const mesPassado = new Date(agora.getFullYear(), agora.getMonth() - 1, 1);
    const mesPassadoStr = mesPassado.toISOString().slice(0, 7);

    const [tMesPassado, tMesAtual, previstasMesPassado, metas] = await Promise.all([
      buscarTransacoesMesPassado(),
      buscarTransacoesMes(),
      buscarReceitasPrevistasMes(mesPassadoStr),
      buscarMetasAtivas(),
    ]);

    const resumo    = calcularResumo(tMesPassado);
    const resumoAnt = calcularResumo(tMesAtual);
    const porCat    = calcularPorCategoria(tMesPassado.filter((x: Record<string, unknown>) => x.tipo === 'despesa'));
    const porNeg    = tMesPassado.reduce((acc: Record<string, { receitas: number; despesas: number }>, x: Record<string, unknown>) => {
      const n = (x.tipo_negocio as string) ?? 'pessoal';
      if (!acc[n]) acc[n] = { receitas: 0, despesas: 0 };
      if (x.tipo === 'receita') acc[n].receitas += Number(x.valor);
      else acc[n].despesas += Number(x.valor);
      return acc;
    }, {});

    const nomeMes = mesPassado.toLocaleString('pt-BR', { month: 'long', year: 'numeric' });

    let msg = `Fechamento de ${nomeMes}:\n\n`;
    msg += `Receitas: R$ ${fmt(resumo.receitas)}\n`;
    msg += `Despesas: R$ ${fmt(resumo.despesas)}\n`;
    msg += `Saldo: R$ ${fmt(resumo.saldo)}\n`;

    const pctMeta = ((resumo.receitas / 8000) * 100).toFixed(1);
    msg += `\nMeta R$8.000: ${pctMeta}% atingida`;
    if (resumo.receitas < 8000) {
      msg += ` (faltou R$ ${fmt(8000 - resumo.receitas)})`;
    } else {
      msg += ` — meta batida!`;
    }
    msg += `\n`;

    if (Object.keys(porNeg).length > 0) {
      msg += `\nPor negocio:\n`;
      for (const [neg, v] of Object.entries(porNeg)) {
        msg += `• ${neg}: entrada R$ ${fmt(v.receitas)} | saida R$ ${fmt(v.despesas)}\n`;
      }
    }

    const top5 = Object.entries(porCat).sort((a, b) => b[1].despesas - a[1].despesas).slice(0, 5);
    if (top5.length > 0) {
      msg += `\nMaiores gastos:\n`;
      top5.forEach(([c, v]) => { msg += `• ${c}: R$ ${fmt(v.despesas)}\n`; });
    }

    const deltaReceitas = resumo.receitas - resumoAnt.receitas;
    const deltaDespesas = resumo.despesas - resumoAnt.despesas;
    msg += `\nVs mes atual (parcial):\n`;
    msg += `Receitas: ${deltaReceitas >= 0 ? '+' : ''}R$ ${fmt(deltaReceitas)}\n`;
    msg += `Despesas: ${deltaDespesas >= 0 ? '+' : ''}R$ ${fmt(deltaDespesas)}\n`;

    const previstasPendentes = previstasMesPassado.filter((r: Record<string, unknown>) =>
      r.status === 'pendente' || r.status === 'atrasada'
    );
    if (previstasPendentes.length > 0) {
      const totalPend = previstasPendentes.reduce((s: number, r: Record<string, unknown>) => s + Number(r.valor), 0);
      msg += `\nAtencao — ${previstasPendentes.length} receita(s) prevista(s) de ${nomeMes} sem confirmacao:\n`;
      msg += `Total: R$ ${fmt(totalPend)}\n`;
      for (const r of previstasPendentes as Record<string, unknown>[]) {
        msg += `• ${r.descricao} — R$ ${fmt(Number(r.valor))}\n`;
      }
    }

    // Atualizar metas com receita do mes passado
    for (const meta of metas as Record<string, unknown>[]) {
      if (meta.tipo === 'mensal') {
        await atualizarMetaFinanceira(meta.id as string, resumo.receitas);
      }
    }

    await notificarPedro(msg.trim());
    return new Response(JSON.stringify({ ok: true }), { status: 200 });
  } catch (err) {
    console.error('[cron-monthly]', err);
    return new Response(JSON.stringify({ error: String(err) }), { status: 500 });
  }
});
