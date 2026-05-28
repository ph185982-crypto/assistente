'use strict';
require('dotenv').config();
const { supabase } = require('./supabase');

const SQL = `
CREATE TABLE IF NOT EXISTS transacoes (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  criado_em timestamp DEFAULT now(),
  data_transacao date,
  tipo text CHECK (tipo IN ('receita', 'despesa')),
  valor numeric NOT NULL,
  descricao text,
  categoria text,
  comprovante_url text,
  mes text,
  confirmado boolean DEFAULT false
);

CREATE TABLE IF NOT EXISTS lembretes (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  descricao text NOT NULL,
  data_hora timestamp NOT NULL,
  recorrente boolean DEFAULT false,
  frequencia text CHECK (frequencia IN ('diario', 'semanal', 'mensal') OR frequencia IS NULL),
  enviado boolean DEFAULT false,
  criado_em timestamp DEFAULT now()
);

CREATE TABLE IF NOT EXISTS agenda (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  titulo text NOT NULL,
  descricao text,
  data_hora timestamp NOT NULL,
  lembrete_minutos_antes integer DEFAULT 30,
  criado_em timestamp DEFAULT now()
);

CREATE TABLE IF NOT EXISTS pendentes_confirmacao (
  numero text PRIMARY KEY,
  transacao_id uuid NOT NULL,
  criado_em timestamp DEFAULT now()
);
`;

console.log('Cole o SQL abaixo no Supabase Dashboard → SQL Editor e execute:\n');
console.log(SQL);
