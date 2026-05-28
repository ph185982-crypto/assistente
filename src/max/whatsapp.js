'use strict';
require('dotenv').config();
const axios = require('axios');

const TOKEN = process.env.WHATSAPP_TOKEN;
const PHONE_ID = process.env.WHATSAPP_PHONE_NUMBER_ID;
const MEU_NUMERO = process.env.MEU_NUMERO;

async function sendMessage(to, texto) {
  const url = `https://graph.facebook.com/v19.0/${PHONE_ID}/messages`;
  await axios.post(
    url,
    {
      messaging_product: 'whatsapp',
      to,
      type: 'text',
      text: { body: texto },
    },
    {
      headers: {
        Authorization: `Bearer ${TOKEN}`,
        'Content-Type': 'application/json',
      },
    }
  );
}

async function notificarPedro(texto) {
  return sendMessage(MEU_NUMERO, texto);
}

module.exports = { sendMessage, notificarPedro };
