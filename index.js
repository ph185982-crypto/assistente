'use strict';
require('dotenv').config();
const express = require('express');

const app = express();
app.use(express.json());

// Webhook
app.use('/webhook', require('./src/webhook'));

// Scheduler do Max (lembretes + relatórios)
require('./src/max/scheduler');

const PORT = process.env.PORT || 3000;
app.listen(PORT, () => {
  console.log(`[Max] Servidor rodando na porta ${PORT}`);
});
