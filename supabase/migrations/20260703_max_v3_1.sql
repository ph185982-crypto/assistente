-- Max v3.1 — contas a pagar (provisões) + orçamentos por categoria

create table if not exists contas_pagar (
  id uuid primary key default gen_random_uuid(),
  descricao text not null,
  valor numeric not null,
  data_vencimento date not null,
  categoria text default 'Outros',
  tipo_negocio text default 'pessoal',
  recorrente boolean default false,
  frequencia text,                -- 'mensal' | 'semanal' | 'anual'
  status text default 'pendente', -- 'pendente' | 'paga' | 'cancelada'
  transacao_id uuid,              -- preenchido quando paga
  criado_em timestamptz default now()
);

create index if not exists idx_contas_pagar_venc on contas_pagar (status, data_vencimento);

create table if not exists orcamentos (
  id uuid primary key default gen_random_uuid(),
  categoria text not null unique,
  limite_mensal numeric not null,
  criado_em timestamptz default now()
);
