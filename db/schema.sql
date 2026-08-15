-- YAZ Motion — Phase 0 schema (§7 of the build brief)
-- Run against your DigitalOcean Managed Postgres database, e.g.:
--   psql "$DATABASE_URL" -f db/schema.sql

create extension if not exists "pgcrypto";

-- Generations: every job stores everything needed to reproduce it exactly.
create table if not exists public.generations (
  id uuid primary key default gen_random_uuid(),
  project_id uuid,
  user_id uuid,
  mode text not null check (mode in ('t2i', 'i2v', 't2v', 'lipsync', 'upscale', 'edit')),
  preset_id uuid,
  brand_kit_id uuid,
  model_endpoint text not null,
  model_version text,
  tier text not null default 'draft' check (tier in ('draft', 'standard', 'hero')),
  input_payload jsonb not null default '{}'::jsonb,
  final_prompt text not null,
  negative_prompt text not null default '',
  seed bigint,
  reference_urls text[] not null default '{}',
  status text not null default 'queued'
    check (status in ('queued', 'running', 'ready', 'failed', 'qc_flagged')),
  output_url text,
  fal_url text,
  request_id text,
  cost numeric(10, 4) not null default 0,
  duration_s numeric(6, 2),
  resolution text,
  aspect text not null default '16:9',
  fps integer,
  qc_status text,
  qc_score numeric(4, 3),
  approved_by uuid,
  client_ready boolean not null default false,
  is_favorite boolean not null default false,
  created_at timestamptz not null default now(),
  completed_at timestamptz
);

create index if not exists generations_created_at_idx
  on public.generations (created_at desc);
create index if not exists generations_status_idx
  on public.generations (status);

-- Internal users (auth gate)
create table if not exists public.users (
  id uuid primary key default gen_random_uuid(),
  email text not null unique,
  name text,
  role text not null default 'creator'
    check (role in ('admin', 'creator', 'viewer')),
  active boolean not null default true,
  created_at timestamptz not null default now(),
  last_login_at timestamptz
);

create index if not exists users_email_idx on public.users (email);

-- Client/campaign project grouping
create table if not exists public.projects (
  id uuid primary key default gen_random_uuid(),
  name text not null,
  client text,
  created_by uuid references public.users (id) on delete set null,
  archived_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index if not exists projects_created_at_idx
  on public.projects (created_at desc);

-- Brand kits: reusable client/brand visual rules injected into prompts
create table if not exists public.brand_kits (
  id uuid primary key default gen_random_uuid(),
  name text not null,
  client text,
  brand_tokens text not null default '',
  negative_additions text not null default '',
  reference_urls text[] not null default '{}',
  project_id uuid references public.projects (id) on delete set null,
  created_by uuid references public.users (id) on delete set null,
  archived_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index if not exists brand_kits_created_at_idx
  on public.brand_kits (created_at desc);

-- Durable jobs for long-running video/batch generation
create table if not exists public.generation_jobs (
  id uuid primary key default gen_random_uuid(),
  kind text not null default 't2v' check (kind in ('t2v', 'i2v')),
  status text not null default 'queued'
    check (status in ('queued', 'running', 'completed', 'failed', 'cancelled')),
  provider text not null default 'byteplus',
  provider_task_id text,
  model_endpoint text not null,
  tier text not null,
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

-- Assets attached to a generation (image/video/audio files).
create table if not exists public.assets (
  id uuid primary key default gen_random_uuid(),
  generation_id uuid references public.generations (id) on delete cascade,
  kind text not null check (kind in ('image', 'video', 'audio')),
  url text not null,
  meta jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now()
);
