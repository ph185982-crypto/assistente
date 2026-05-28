'use strict';
require('dotenv').config();
const express = require('express');
const { processarMensagem } = require('./max/assistente');
const { processarMensagemVendedoria } = require('./vendedoria');

const router = express.Router();
const MEU_NUMERO = process.env.MEU_NUMERO || '5562984465388';

// ── Verificação do webhook (GET) ─────────────────────────────
router.get('/', (req, res) => {
  const mode = req.query['hub.mode'];
  const token = req.query['hub.verify_token'];
  const challenge = req.query['hub.challenge'];

  if (mode === 'subscribe' && token === process.env.VERIFY_TOKEN) {
    console.log('[Webhook] Verificado com sucesso.');
    return res.status(200).send(challenge);
  }
  res.sendStatus(403);
});

// ── Recebimento de mensagens (POST) ──────────────────────────
router.post('/', async (req, res) => {
  // Responde 200 imediatamente para a Meta não reenviar
  res.sendStatus(200);

  try {
    const entry = req.body?.entry?.[0];
    const changes = entry?.changes?.[0];
    const value = changes?.value;

    if (!value?.messages?.length) return;

    const msg = value.messages[0];
    const remetente = msg.from;
    const tipo = msg.type;

    // ── ROTEADOR: se for o Pedro, vai para o Max ─────────────
    if (remetente === MEU_NUMERO) {
      let texto = null;
      let mediaId = null;

      if (tipo === 'text') {
        texto = msg.text?.body;
      } else if (tipo === 'image') {
        mediaId = msg.image?.id;
      } else if (tipo === 'document') {
        mediaId = msg.document?.id;
      }

      await processarMensagem(remetente, texto, tipo, mediaId);
      return;
    }

    // ── Qualquer outro número → Vendedoria (sem alteração) ───
    await processarMensagemVendedoria(req.body);
  } catch (err) {
    console.error('[Webhook] Erro não tratado:', err.message);
  }
});

module.exports = router;
