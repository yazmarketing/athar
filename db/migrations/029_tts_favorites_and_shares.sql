-- 029 — Favorite voices (per client, shared across the team) and read-only
-- share links for voice-overs, mirroring transcript_shares. Idempotent —
-- safe to re-run. Documentation only — the self-healing DDL in lib/tts.ts is
-- what actually runs, same as every other table in this app.

create table if not exists public.tts_voice_favorites (
  id uuid primary key default gen_random_uuid(),
  voice_id text not null,
  voice_name text not null,
  -- Null means "every client" — a favorite saved before one was picked, or
  -- one the team wants available everywhere.
  client_id uuid references public.clients (id) on delete cascade,
  created_by uuid references public.users (id) on delete set null,
  created_at timestamptz not null default now()
);

create unique index if not exists tts_voice_favorites_unique_idx
  on public.tts_voice_favorites
  (voice_id, coalesce(client_id, '00000000-0000-0000-0000-000000000000'::uuid));

create table if not exists public.tts_shares (
  token text primary key,
  generation_id uuid not null
    references public.tts_generations (id) on delete cascade,
  created_by uuid references public.users (id) on delete set null,
  created_at timestamptz not null default now(),
  revoked_at timestamptz
);
