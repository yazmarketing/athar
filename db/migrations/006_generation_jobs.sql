-- Durable jobs for long-running video/batch generation (safe to re-run)
create table if not exists public.generation_jobs (
  id uuid primary key default gen_random_uuid(),
  kind text not null default 't2v' check (kind in ('t2v', 'i2v')),
  status text not null default 'queued'
    check (status in ('queued', 'running', 'completed', 'failed', 'cancelled')),
  provider text not null default 'byteplus',
  provider_task_id text,
  model_endpoint text not null,
  tier text not null,
  -- Full normalized request so a job can be retried exactly
  input jsonb not null default '{}'::jsonb,
  final_prompt text not null,
  negative_prompt text not null default '',
  aspect text not null default '16:9',
  duration_s numeric(6, 2),
  error text,
  generation_id uuid references public.generations (id) on delete set null,
  user_id uuid references public.users (id) on delete set null,
  project_id uuid references public.projects (id) on delete set null,
  brand_kit_id uuid references public.brand_kits (id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  completed_at timestamptz
);

create index if not exists generation_jobs_status_idx
  on public.generation_jobs (status, created_at desc);

create index if not exists generation_jobs_created_at_idx
  on public.generation_jobs (created_at desc);
