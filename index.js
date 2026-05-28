'use strict';
require('dotenv').config();
const express = require('express');

const app = express();
app.use(express.json());

app.use('/webhook', require('./src/webhook'));

app.get('/health', (_, res) => res.json({ status: 'ok', service: 'max' }));

require('./src/max/scheduler');

const PORT = process.env.PORT || 3000;
app.listen(PORT, () => console.log(`[Max] Rodando na porta ${PORT}`));
