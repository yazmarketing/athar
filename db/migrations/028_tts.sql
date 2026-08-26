-- 028 — Text-to-speech: Munsit-generated voice-overs and cloned voices.
--
-- A generation is one call to /api/tts/generate — `segments` is the ordered
-- speaker/pause list that was requested (so history can show or regenerate
-- it), `text` is the flattened transcript for search. Munsit synthesizes one
-- voice per request; a multi-speaker generation is stitched from several
-- calls server-side (see audio-wav.ts), so `model`/`stability`/`speed` here
-- describe the shared settings, not any one call. Idempotent — safe to re-run.
-- This is documentation only — the self-healing DDL in lib/tts.ts is what
-- actually runs, same as every other table in this app.

create table if not exists public.tts_generations (
  id uuid primary key default gen_random_uuid(),
  title text not null default '',
  status text not null default 'ready'
    check (status in ('ready', 'failed')),
  error text,
  segments jsonb not null default '[]'::jsonb,
  text text not null default '',
  model text not null default '',
  stability numeric(3, 2) not null default 0.5,
  speed numeric(3, 2) not null default 1.0,
  sample_rate integer not null default 24000,
  dialect text not null default 'auto',
  word_timestamps boolean not null default false,
  timestamps jsonb,
  char_count integer not null default 0,
  -- Munsit bills from a wallet at an undocumented per-character rate — see
  -- MUNSIT_COST_PER_CHAR in munsit-tts.ts. Defaults to 0 until configured.
  cost numeric(10, 4) not null default 0,
  output_url text,
  duration_s numeric(10, 2),
  render_ms integer,
  client_id uuid references public.clients (id) on delete set null,
  project_id uuid references public.projects (id) on delete set null,
  created_by uuid references public.users (id) on delete set null,
  archived_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  completed_at timestamptz
);

create index if not exists tts_generations_created_at_idx
  on public.tts_generations (created_at desc);
create index if not exists tts_generations_client_idx
  on public.tts_generations (client_id);
create index if not exists tts_generations_fts_idx
  on public.tts_generations using gin (to_tsvector('simple', text));

-- Only cloned voices are persisted — built-in Munsit voices are fetched live
-- from GET /voices on every request, never cached in the database.
create table if not exists public.tts_voices (
  id uuid primary key default gen_random_uuid(),
  munsit_voice_id text not null unique,
  name text not null,
  description text,
  gender text,
  age text,
  languages text[] not null default '{}',
  dialects text[] not null default '{}',
  sample_url text,
  avatar_url text,
  created_by uuid references public.users (id) on delete set null,
  created_at timestamptz not null default now()
);
