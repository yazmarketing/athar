alter table public.users
  add column if not exists spend_cap numeric(12, 2);

alter table public.projects
  add column if not exists spend_cap numeric(12, 2);

alter table public.generation_jobs
  add column if not exists estimated_cost numeric(12, 4) not null default 0;

alter table public.generations
  add column if not exists provider_tokens integer,
  add column if not exists has_video_input boolean not null default false,
  add column if not exists pricing_version text;

create table if not exists public.spend_alerts (
  scope_type text not null check (scope_type in ('user', 'project')),
  scope_id uuid not null,
  threshold numeric(12, 2) not null,
  created_at timestamptz not null default now(),
  primary key (scope_type, scope_id, threshold)
);
