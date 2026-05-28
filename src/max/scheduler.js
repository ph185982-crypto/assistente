'use strict';
require('dotenv').config();
const cron = require('node-cron');
const db = require('./supabase');
const { notificarPedro } = require('./whatsapp');

function fmt(v) { return Number(v).toLocaleString('pt-BR', { minimumFractionDigits: 2 }); }

function proximaData(dataAtual, frequencia) {
  const d = new Date(dataAtual);
  if (frequencia === 'diario')  d.setDate(d.getDate() + 1);
  if (frequencia === 'semanal') d.setDate(d.getDate() + 7);
  if (frequencia === 'mensal')  d.setMonth(d.getMonth() + 1);
  return d.toISOString();
}

// A cada minuto — lembretes vencidos
cron.schedule('* * * * *', async () => {
  try {
    const lembretes = await db.buscarLembretesVencidos();
    for (const l of lembretes) {
      await notificarPedro(`⏰ Lembrete: ${l.descricao}`);
      await db.marcarLembreteEnviado(l.id);
      if (l.recorrente && l.frequencia) {
        await db.inserirLembrete({
          descricao:  l.descricao,
          data_hora:  proximaData(l.data_hora, l.frequencia),
          recorrente: true,
          frequencia: l.frequencia,
        });
      }
    }
  } catch (err) { console.error('[Scheduler/reminders]', err.message); }
});

// Diário às 08:00 Brasília (11:00 UTC)
cron.schedule('0 11 * * *', async () => {
  try {
    const ontem = await db.buscarTransacoesOntem();
    const mes   = await db.buscarTransacoesMes();
    const { receitas, despesas, saldo } = db.calcularResumo(ontem);
    const saldoMes = db.calcularResumo(mes).saldo;
    await notificarPedro(
      `☀️ Bom dia, Pedro! Resumo de ontem:\n\n` +
      `💰 Receitas: R$ ${fmt(receitas)}\n` +
      `💸 Despesas: R$ ${fmt(despesas)}\n` +
      `📊 Saldo do dia: R$ ${fmt(saldo)}\n\n` +
      `No mês até agora: R$ ${fmt(saldoMes)}`
    );
  } catch (err) { console.error('[Scheduler/daily]', err.message); }
});

// Segunda às 08:00 Brasília
cron.schedule('0 11 * * 1', async () => {
  try {
    const t = await db.buscarTransacoesSemanaPassada();
    const { receitas, despesas, saldo } = db.calcularResumo(t);
    const porCat = db.calcularPorCategoria(t.filter(tx => tx.tipo === 'despesa'));
    let msg = `📊 Semana passada:\n\n💰 R$ ${fmt(receitas)}\n💸 R$ ${fmt(despesas)}\n📈 R$ ${fmt(saldo)}\n\nPor categoria:\n`;
    Object.entries(porCat).sort((a, b) => b[1].despesas - a[1].despesas)
      .forEach(([c, v]) => { msg += `• ${c}: R$ ${fmt(v.despesas)}\n`; });
    await notificarPedro(msg);
  } catch (err) { console.error('[Scheduler/weekly]', err.message); }
});

// Dia 1 às 08:00 Brasília
cron.schedule('0 11 1 * *', async () => {
  try {
    const t = await db.buscarTransacoesMesPassado();
    const { receitas, despesas, saldo } = db.calcularResumo(t);
    const porCat = db.calcularPorCategoria(t.filter(tx => tx.tipo === 'despesa'));
    let msg = `📅 Relatório do mês anterior:\n\n💰 R$ ${fmt(receitas)}\n💸 R$ ${fmt(despesas)}\n📈 R$ ${fmt(saldo)}\n\nPor categoria:\n`;
    Object.entries(porCat).sort((a, b) => b[1].despesas - a[1].despesas)
      .forEach(([c, v]) => { msg += `• ${c}: R$ ${fmt(v.despesas)}\n`; });
    if (receitas < 8000) msg += `\n⚠️ R$ ${fmt(8000 - receitas)} abaixo da meta de R$ 8.000.`;
    await notificarPedro(msg);
  } catch (err) { console.error('[Scheduler/monthly]', err.message); }
});

console.log('[Max] Scheduler iniciado.');
