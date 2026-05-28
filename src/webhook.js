'use strict';
require('dotenv').config();
const express = require('express');
const { processarMensagem } = require('./max/assistente');

const router = express.Router();
const MEU_NUMERO = process.env.MEU_NUMERO || '5562984465388';

router.get('/', (req, res) => {
  const mode      = req.query['hub.mode'];
  const token     = req.query['hub.verify_token'];
  const challenge = req.query['hub.challenge'];
  if (mode === 'subscribe' && token === process.env.VERIFY_TOKEN) {
    console.log('[Webhook] Verificado.');
    return res.status(200).send(challenge);
  }
  res.sendStatus(403);
});

router.post('/', async (req, res) => {
  res.sendStatus(200);
  try {
    const msg = req.body?.entry?.[0]?.changes?.[0]?.value?.messages?.[0];
    if (!msg) return;

    const remetente = msg.from;
    if (remetente !== MEU_NUMERO) return; // outros números: Vendedoria (serviço separado)

    const tipo    = msg.type;
    const texto   = tipo === 'text'  ? msg.text?.body  : null;
    const mediaId = tipo === 'image' ? msg.image?.id   : null;

    await processarMensagem(remetente, texto, tipo, mediaId);
  } catch (err) {
    console.error('[Webhook] Erro:', err.message);
  }
});

module.exports = router;
