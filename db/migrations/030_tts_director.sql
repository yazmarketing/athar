-- 030 — VO Director pipeline: whole-script analysis, per-segment performance
-- direction/phonetics, generated variant takes, and the selection log the
-- learning loop reads. An analysis precedes synthesis — nothing here calls
-- Munsit. Only a stitched master (once every segment has a selected take, or
-- a Quick Optimize run) becomes a real tts_generations row, which is how
-- History/search/favorites/sharing keep working unmodified.
-- Idempotent — safe to re-run. Documentation only — the self-healing DDL in
-- lib/tts-director.ts is what actually runs, same as every other table here.

create table if not exists public.tts_director_analyses (
  id uuid primary key default gen_random_uuid(),
  mode text not null check (mode in ('quick', 'director')),
  status text not null default 'draft'
    check (status in ('draft', 'directed', 'adapted', 'phonetics_ready', 'complete', 'failed')),
  error text,
  original_text text not null,
  -- {speaker, audience, intention, notes} — the user-supplied campaign brief.
  campaign_context jsonb not null default '{}'::jsonb,
  -- {dialect, register, emotional_arc} — the LLM's own read, from Pass 1.
  overall_direction jsonb,
  -- The Light-Strong dial: 0.00 = Light (stay close to written form), 1.00 =
  -- Strong (full colloquial Emirati). See config/tts-director.ts for bands.
  register_strength numeric(3, 2) not null default 0.50,
  dialect text not null default 'emirati' check (dialect in ('emirati', 'fusha')),
  model text,
  client_id uuid references public.clients (id) on delete set null,
  project_id uuid references public.projects (id) on delete set null,
  created_by uuid references public.users (id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index if not exists tts_director_analyses_created_at_idx
  on public.tts_director_analyses (created_at desc);

create table if not exists public.tts_director_segments (
  id uuid primary key default gen_random_uuid(),
  analysis_id uuid not null references public.tts_director_analyses (id) on delete cascade,
  idx integer not null,
  -- The LLM's own read of who's speaking this beat — not yet an assigned voice.
  speaker_label text,
  voice_id text,
  original text not null,
  spoken text not null default '',
  tts text not null default '',
  -- Constrained taxonomy — DIRECTOR_EMOTIONS in config/tts-director.ts — so
  -- the learning loop's aggregation query can actually group on it.
  emotion text,
  intensity numeric(3, 2),
  pace text check (pace is null or pace in ('slow', 'normal', 'fast')),
  continuity text,
  avoid text[] not null default '{}',
  suggested_stability numeric(3, 2),
  suggested_speed numeric(3, 2),
  -- Only set by an explicit Director Mode action — see tts-punctuation.ts.
  -- No pass may insert a <break> tag without filling this in.
  break_justification text,
  -- [{canonical, respelling, applied}] from Pass 3, for UI transparency.
  phonetic_notes jsonb not null default '[]'::jsonb,
  selected_take_id uuid,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (analysis_id, idx)
);

create index if not exists tts_director_segments_analysis_idx
  on public.tts_director_segments (analysis_id, idx);

create table if not exists public.tts_director_takes (
  id uuid primary key default gen_random_uuid(),
  segment_id uuid not null references public.tts_director_segments (id) on delete cascade,
  preset text not null default 'custom'
    check (preset in ('natural', 'controlled', 'expressive', 'custom')),
  voice_id text not null,
  stability numeric(3, 2) not null,
  speed numeric(3, 2) not null,
  -- Snapshot of the text actually sent to Munsit for this take.
  text text not null,
  status text not null default 'ready' check (status in ('ready', 'failed')),
  error text,
  output_url text,
  duration_s numeric(10, 2),
  char_count integer not null default 0,
  cost numeric(10, 4) not null default 0,
  created_by uuid references public.users (id) on delete set null,
  created_at timestamptz not null default now()
);

create index if not exists tts_director_takes_segment_idx
  on public.tts_director_takes (segment_id, created_at desc);

-- Append-only. Every "user picked Take B, rejected A and C" event becomes one
-- row per take here. This table alone IS the learning loop — no separate
-- preferences table, no trained model, just an aggregation query over it.
create table if not exists public.tts_director_selection_events (
  id uuid primary key default gen_random_uuid(),
  segment_id uuid not null references public.tts_director_segments (id) on delete cascade,
  take_id uuid not null references public.tts_director_takes (id) on delete cascade,
  voice_id text not null,
  outcome text not null check (outcome in ('selected', 'rejected')),
  -- {emotion, pace, dialect, register_strength} — the context this take was
  -- chosen/rejected under, snapshotted at event time.
  context jsonb not null default '{}'::jsonb,
  -- Denormalized from the take so aggregation never needs a join.
  stability numeric(3, 2) not null,
  speed numeric(3, 2) not null,
  created_by uuid references public.users (id) on delete set null,
  created_at timestamptz not null default now()
);

create index if not exists tts_director_selection_events_voice_idx
  on public.tts_director_selection_events (voice_id, outcome, created_at desc);
create index if not exists tts_director_selection_events_context_idx
  on public.tts_director_selection_events using gin (context);

-- A generation may have come from the pipeline — nullable, set only when it did.
alter table public.tts_generations
  add column if not exists tts_director_analysis_id uuid
    references public.tts_director_analyses (id) on delete set null;
create index if not exists tts_generations_director_analysis_idx
  on public.tts_generations (tts_director_analysis_id);
