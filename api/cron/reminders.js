'use strict';
require('dotenv').config();
const db = require('../../src/max/supabase');
const { notificarPedro } = require('../../src/max/whatsapp');

function proximaData(dataAtual, frequencia) {
  const d = new Date(dataAtual);
  if (frequencia === 'diario')   d.setDate(d.getDate() + 1);
  if (frequencia === 'semanal')  d.setDate(d.getDate() + 7);
  if (frequencia === 'mensal')   d.setMonth(d.getMonth() + 1);
  return d.toISOString();
}

module.exports = async (req, res) => {
  res.status(200).json({ ok: true });
  try {
    const lembretes = await db.buscarLembretesVencidos();
    for (const l of lembretes) {
      await notificarPedro(`⏰ Lembrete: ${l.descricao}`);
      await db.marcarLembreteEnviado(l.id);
      if (l.recorrente && l.frequencia) {
        await db.inserirLembrete({
          descricao:   l.descricao,
          data_hora:   proximaData(l.data_hora, l.frequencia),
          recorrente:  true,
          frequencia:  l.frequencia,
        });
      }
    }
  } catch (err) {
    console.error('[Cron/reminders]', err.message);
  }
};
