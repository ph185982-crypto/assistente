'use strict';
require('dotenv').config();
const db = require('../../src/max/supabase');
const { notificarPedro } = require('../../src/max/whatsapp');

function fmt(v) { return Number(v).toLocaleString('pt-BR', { minimumFractionDigits: 2 }); }

module.exports = async (req, res) => {
  res.status(200).json({ ok: true });
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
  } catch (err) {
    console.error('[Cron/daily]', err.message);
  }
};
