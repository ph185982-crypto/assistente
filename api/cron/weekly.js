'use strict';
require('dotenv').config();
const db = require('../../src/max/supabase');
const { notificarPedro } = require('../../src/max/whatsapp');

function fmt(v) { return Number(v).toLocaleString('pt-BR', { minimumFractionDigits: 2 }); }

module.exports = async (req, res) => {
  res.status(200).json({ ok: true });
  try {
    const t = await db.buscarTransacoesSemanaPassada();
    const { receitas, despesas, saldo } = db.calcularResumo(t);
    const porCat = db.calcularPorCategoria(t.filter(tx => tx.tipo === 'despesa'));

    let msg =
      `📊 Resumo da semana passada:\n\n` +
      `💰 Receitas: R$ ${fmt(receitas)}\n` +
      `💸 Despesas: R$ ${fmt(despesas)}\n` +
      `📈 Saldo: R$ ${fmt(saldo)}\n\n` +
      `Por categoria:\n`;

    Object.entries(porCat)
      .sort((a, b) => b[1].despesas - a[1].despesas)
      .forEach(([cat, v]) => { msg += `• ${cat}: R$ ${fmt(v.despesas)}\n`; });

    await notificarPedro(msg);
  } catch (err) {
    console.error('[Cron/weekly]', err.message);
  }
};
