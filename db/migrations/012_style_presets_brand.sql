-- 012 — Per-client style presets (Layer 6) + brand-guideline flags (Layer 8).
-- Idempotent.

-- A client's own saved looks, shown in the Style dropdown for that client only.
create table if not exists public.style_presets (
  id uuid primary key default gen_random_uuid(),
  client_id uuid references public.clients (id) on delete cascade,
  name text not null,
  positive text not null default '',
  negative text not null default '',
  created_by uuid references public.users (id) on delete set null,
  archived_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create index if not exists style_presets_client_idx
  on public.style_presets (client_id, archived_at);

-- Brand-guideline enforcement result stamped on a generation.
alter table public.generations
  add column if not exists brand_flagged boolean;
alter table public.generations
  add column if not exists brand_notes text;
