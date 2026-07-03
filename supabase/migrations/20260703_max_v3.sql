-- Max v3 — tarefas com cobrança de resultado + deduplicação de alertas proativos

create table if not exists tarefas (
  id uuid primary key default gen_random_uuid(),
  descricao text not null,
  recorrente boolean default false,
  frequencia text,                       -- 'diario' | 'semanal' | 'mensal'
  proxima_cobranca timestamptz not null,
  status text default 'ativa',           -- 'ativa' | 'concluida' | 'cancelada'
  historico jsonb default '[]'::jsonb,   -- [{data, resposta}]
  criado_em timestamptz default now()
);

create table if not exists alertas_enviados (
  id uuid primary key default gen_random_uuid(),
  chave text not null unique,            -- identificador único do alerta (ex.: 'divida_vence:<id>:2026-07-03')
  enviado_em timestamptz default now()
);

create index if not exists idx_tarefas_cobranca on tarefas (status, proxima_cobranca);
