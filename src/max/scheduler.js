'use strict';
require('dotenv').config();
const cron = require('node-cron');
const db = require('./supabase');
const { notificarPedro } = require('./whatsapp');

function formatarValor(v) {
  return Number(v).toLocaleString('pt-BR', { minimumFractionDigits: 2 });
}

function proximaDataRecorrente(dataAtual, frequencia) {
  const d = new Date(dataAtual);
  if (frequencia === 'diario') d.setDate(d.getDate() + 1);
  else if (frequencia === 'semanal') d.setDate(d.getDate() + 7);
  else if (frequencia === 'mensal') d.setMonth(d.getMonth() + 1);
  return d.toISOString();
}

// A cada minuto: dispara lembretes vencidos
cron.schedule('* * * * *', async () => {
  try {
    const lembretes = await db.buscarLembretesVencidos();
    for (const l of lembretes) {
      await notificarPedro(`⏰ Lembrete: ${l.descricao}`);
      await db.marcarLembreteEnviado(l.id);

      if (l.recorrente && l.frequencia) {
        const proxima = proximaDataRecorrente(l.data_hora, l.frequencia);
        await db.inserirLembrete({
          descricao: l.descricao,
          data_hora: proxima,
          recorrente: true,
          frequencia: l.frequencia,
        });
      }
    }
  } catch (err) {
    console.error('[Scheduler] Erro lembretes:', err.message);
  }
});

// Todo dia às 08:00 (Brasília = UTC-3, logo 11:00 UTC)
cron.schedule('0 11 * * *', async () => {
  try {
    const ontem = await db.buscarTransacoesOntem();
    const mes = await db.buscarTransacoesMes();

    const { receitas, despesas, saldo } = db.calcularResumo(ontem);
    const saldoMes = db.calcularResumo(mes).saldo;

    await notificarPedro(
      `☀️ Bom dia, Pedro! Resumo de ontem:\n\n` +
      `💰 Receitas: R$ ${formatarValor(receitas)}\n` +
      `💸 Despesas: R$ ${formatarValor(despesas)}\n` +
      `📊 Saldo do dia: R$ ${formatarValor(saldo)}\n\n` +
      `No mês até agora: R$ ${formatarValor(saldoMes)}`
    );
  } catch (err) {
    console.error('[Scheduler] Erro resumo diário:', err.message);
  }
});

// Toda segunda-feira às 08:00 (Brasília)
cron.schedule('0 11 * * 1', async () => {
  try {
    const t = await db.buscarTransacoesSemanaPassada();
    const { receitas, despesas, saldo } = db.calcularResumo(t);
    const porCategoria = db.calcularPorCategoria(t.filter(tx => tx.tipo === 'despesa'));

    let msg =
      `📊 Resumo da semana passada:\n\n` +
      `💰 Receitas: R$ ${formatarValor(receitas)}\n` +
      `💸 Despesas: R$ ${formatarValor(despesas)}\n` +
      `📈 Saldo: R$ ${formatarValor(saldo)}\n\n` +
      `Despesas por categoria:\n`;

    for (const [cat, vals] of Object.entries(porCategoria).sort((a, b) => b[1].despesas - a[1].despesas)) {
      msg += `• ${cat}: R$ ${formatarValor(vals.despesas)}\n`;
    }

    await notificarPedro(msg);
  } catch (err) {
    console.error('[Scheduler] Erro resumo semanal:', err.message);
  }
});

// Dia 1 de cada mês às 08:00 (Brasília)
cron.schedule('0 11 1 * *', async () => {
  try {
    const t = await db.buscarTransacoesMesPassado();
    const { receitas, despesas, saldo } = db.calcularResumo(t);
    const porCategoria = db.calcularPorCategoria(t.filter(tx => tx.tipo === 'despesa'));

    let msg =
      `📅 Relatório do mês anterior:\n\n` +
      `💰 Receitas: R$ ${formatarValor(receitas)}\n` +
      `💸 Despesas: R$ ${formatarValor(despesas)}\n` +
      `📈 Saldo: R$ ${formatarValor(saldo)}\n\n` +
      `Despesas por categoria:\n`;

    const sorted = Object.entries(porCategoria).sort((a, b) => b[1].despesas - a[1].despesas);
    for (const [cat, vals] of sorted) {
      msg += `• ${cat}: R$ ${formatarValor(vals.despesas)}\n`;
    }

    const meta = 8000;
    if (receitas < meta) {
      msg += `\n⚠️ Renda R$ ${formatarValor(meta - receitas)} abaixo da meta de R$ ${formatarValor(meta)}.`;
    }

    await notificarPedro(msg);
  } catch (err) {
    console.error('[Scheduler] Erro relatório mensal:', err.message);
  }
});

console.log('[Max] Scheduler iniciado.');
