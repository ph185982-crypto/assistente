-- Rodar no Supabase SQL Editor

-- ── Tabela: receitas_previstas ───────────────────────────────
CREATE TABLE IF NOT EXISTS receitas_previstas (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  descricao TEXT NOT NULL,
  valor NUMERIC(12,2) NOT NULL,
  data_prevista DATE NOT NULL,
  tipo_negocio TEXT,
  cliente TEXT,
  status TEXT DEFAULT 'pendente',
  data_recebimento TIMESTAMP WITH TIME ZONE,
  observacao TEXT,
  criado_em TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);
ALTER TABLE receitas_previstas ENABLE ROW LEVEL SECURITY;
CREATE POLICY "leitura_publica"   ON receitas_previstas FOR SELECT USING (true);
CREATE POLICY "insercao_publica"  ON receitas_previstas FOR INSERT WITH CHECK (true);
CREATE POLICY "atualizacao_publica" ON receitas_previstas FOR UPDATE USING (true);

-- ── Tabela: metas_financeiras ────────────────────────────────
CREATE TABLE IF NOT EXISTS metas_financeiras (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  descricao TEXT NOT NULL,
  valor_alvo NUMERIC(12,2) NOT NULL,
  valor_atual NUMERIC(12,2) DEFAULT 0,
  tipo TEXT DEFAULT 'mensal',
  tipo_negocio TEXT,
  data_inicio DATE,
  data_fim DATE,
  status TEXT DEFAULT 'ativa',
  criado_em TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);
ALTER TABLE metas_financeiras ENABLE ROW LEVEL SECURITY;
CREATE POLICY "leitura_publica"   ON metas_financeiras FOR SELECT USING (true);
CREATE POLICY "insercao_publica"  ON metas_financeiras FOR INSERT WITH CHECK (true);
CREATE POLICY "atualizacao_publica" ON metas_financeiras FOR UPDATE USING (true);

-- ── Tabela: dividas ──────────────────────────────────────────
CREATE TABLE IF NOT EXISTS dividas (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  descricao TEXT NOT NULL,
  valor_total NUMERIC(12,2) NOT NULL,
  valor_pago NUMERIC(12,2) DEFAULT 0,
  parcela_mensal NUMERIC(12,2),
  dia_vencimento INTEGER,
  credor TEXT,
  status TEXT DEFAULT 'ativa',
  observacao TEXT,
  criado_em TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);
ALTER TABLE dividas ENABLE ROW LEVEL SECURITY;
CREATE POLICY "leitura_publica"   ON dividas FOR SELECT USING (true);
CREATE POLICY "insercao_publica"  ON dividas FOR INSERT WITH CHECK (true);
CREATE POLICY "atualizacao_publica" ON dividas FOR UPDATE USING (true);

-- ── Seed: dívidas conhecidas do Pedro ────────────────────────
INSERT INTO dividas (descricao, valor_total, valor_pago, parcela_mensal, dia_vencimento, credor, status, observacao) VALUES
  ('Nome sujo Adijo', 300.00, 0, NULL, NULL, 'Adijo', 'ativa', 'PRIORIDADE 1 - limpar nome'),
  ('Americanas', 6000.00, 0, NULL, NULL, 'Americanas', 'ativa', NULL),
  ('CNPJ esposa', 8000.00, 0, NULL, NULL, 'CNPJ esposa', 'ativa', NULL),
  ('Mercado Pago', 20000.00, 0, NULL, NULL, 'Mercado Pago', 'ativa', NULL),
  ('Infinity Pay', 14000.00, 0, NULL, NULL, 'Infinity Pay', 'ativa', NULL),
  ('Condominio', 4200.00, 0, NULL, NULL, 'Condominio', 'ativa', NULL),
  ('Fernando - emprestimo consorcio', 6719.98, 0, 450.00, NULL, 'Fernando', 'ativa', 'R$450/mes, quitacao ago/2027'),
  ('MRV', 30000.00, 0, NULL, NULL, 'MRV', 'ativa', NULL),
  ('Caixa', 2700.00, 0, NULL, NULL, 'Caixa Economica Federal', 'ativa', NULL);

-- ── Seed: meta principal ─────────────────────────────────────
INSERT INTO metas_financeiras (descricao, valor_alvo, tipo, tipo_negocio, data_inicio, status) VALUES
  ('Meta mensal minima', 8000.00, 'mensal', NULL, CURRENT_DATE, 'ativa'),
  ('Meta mensal ideal', 20000.00, 'mensal', NULL, CURRENT_DATE, 'ativa');
