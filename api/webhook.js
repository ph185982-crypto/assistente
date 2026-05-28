'use strict';
require('dotenv').config();
const { processarMensagem } = require('../src/max/assistente');

const MEU_NUMERO = process.env.MEU_NUMERO || '5562984465388';

module.exports = async (req, res) => {
  // ── GET: verificação do webhook Meta ─────────────────────
  if (req.method === 'GET') {
    const mode      = req.query['hub.mode'];
    const token     = req.query['hub.verify_token'];
    const challenge = req.query['hub.challenge'];
    if (mode === 'subscribe' && token === process.env.VERIFY_TOKEN) {
      return res.status(200).send(challenge);
    }
    return res.sendStatus(403);
  }

  // ── POST: mensagem recebida ───────────────────────────────
  if (req.method === 'POST') {
    res.status(200).json({ ok: true }); // responde antes de processar

    try {
      const msg = req.body?.entry?.[0]?.changes?.[0]?.value?.messages?.[0];
      if (!msg) return;

      const remetente = msg.from;
      if (remetente !== MEU_NUMERO) return; // só processa mensagens do Pedro

      const tipo    = msg.type;
      const texto   = tipo === 'text'  ? msg.text?.body        : null;
      const mediaId = tipo === 'image' ? msg.image?.id         : null;

      await processarMensagem(remetente, texto, tipo, mediaId);
    } catch (err) {
      console.error('[Webhook] Erro:', err.message);
    }
    return;
  }

  res.sendStatus(405);
};
