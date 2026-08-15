-- 011 — Reusable, versioned reference library (Layer 3).
-- Persistent brand / character / product / style references a team picks into
-- generations instead of re-uploading each session. Client-scoped, versioned.
-- Idempotent.

create table if not exists public.reference_assets (
  id uuid primary key default gen_random_uuid(),
  client_id uuid references public.clients (id) on delete cascade,
  project_id uuid references public.projects (id) on delete set null,
  name text not null,
  kind text not null default 'reference'
    check (kind in ('character', 'product', 'brand', 'style', 'reference')),
  url text not null,
  notes text not null default '',
  -- Versioning: v2 of an asset points parent_id at the original; the row with
  -- the highest version and archived_at is null is the "current" one.
  version integer not null default 1,
  parent_id uuid references public.reference_assets (id) on delete set null,
  created_by uuid references public.users (id) on delete set null,
  archived_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index if not exists reference_assets_client_idx
  on public.reference_assets (client_id, archived_at);
create index if not exists reference_assets_kind_idx
  on public.reference_assets (client_id, kind, archived_at);
