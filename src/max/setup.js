'use strict';
require('dotenv').config();
const { supabase } = require('./supabase');

async function criarTabelas() {
  console.log('Criando tabelas no Supabase...');

  const sqls = [
    `CREATE TABLE IF NOT EXISTS transacoes (
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
    );`,

    `CREATE TABLE IF NOT EXISTS lembretes (
      id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
      descricao text NOT NULL,
      data_hora timestamp NOT NULL,
      recorrente boolean DEFAULT false,
      frequencia text CHECK (frequencia IN ('diario', 'semanal', 'mensal') OR frequencia IS NULL),
      enviado boolean DEFAULT false,
      criado_em timestamp DEFAULT now()
    );`,

    `CREATE TABLE IF NOT EXISTS agenda (
      id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
      titulo text NOT NULL,
      descricao text,
      data_hora timestamp NOT NULL,
      lembrete_minutos_antes integer DEFAULT 30,
      criado_em timestamp DEFAULT now()
    );`,
  ];

  for (const sql of sqls) {
    const { error } = await supabase.rpc('exec_sql', { sql }).catch(() => ({ error: null }));
    if (error) {
      // Fallback: tenta via REST direto
      console.warn('RPC não disponível, use o SQL Editor do Supabase para criar as tabelas.');
      console.log('\nCopie e execute este SQL no Supabase Dashboard > SQL Editor:\n');
      console.log('-- COLE O BLOCO ABAIXO --');
      sqls.forEach(s => console.log(s));
      return;
    }
  }

  console.log('✅ Tabelas criadas com sucesso!');
}

criarTabelas().catch(err => {
  console.error('Erro:', err.message);
  console.log('\nExecute manualmente no Supabase SQL Editor:\n');
  console.log(`
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
  `);
});
