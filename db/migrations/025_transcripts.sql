-- 025 — Transcripts: self-hosted Whisper transcription with word timestamps
-- and speaker turns.
--
-- A transcript is one media file (uploaded, recorded, or an Athar render)
-- broken into timed segments. Segments carry their own word array so the
-- player can highlight a single word, and a speaker label so an interview
-- reads as a conversation. Idempotent — safe to re-run.

create table if not exists public.transcripts (
  id uuid primary key default gen_random_uuid(),
  title text not null default '',
  status text not null default 'queued'
    check (status in ('queued', 'running', 'ready', 'failed', 'cancelled')),
  -- 0–100, reported by the worker as it moves through the file.
  progress numeric(5, 2) not null default 0,
  -- Human label for the current phase: downloading / transcribing / diarizing.
  stage text not null default '',
  error text,

  -- Media lives in our Space like every other output; the worker pulls it
  -- from there rather than us streaming bytes through the app server.
  media_url text not null,
  media_kind text not null default 'audio'
    check (media_kind in ('audio', 'video')),
  media_bytes bigint,

  duration_s numeric(10, 2),
  -- Detected (or forced) ISO language code, plus Whisper's confidence in it.
  language text,
  language_probability numeric(5, 4),
  -- 'transcribe' keeps the original language, 'translate' renders English.
  task text not null default 'transcribe'
    check (task in ('transcribe', 'translate')),
  model text,
  device text,
  diarize boolean not null default true,
  -- Renaming SPEAKER_00 once has to stick everywhere: {"SPEAKER_00":"Yazan"}.
  speaker_names jsonb not null default '{}'::jsonb,
  -- Names/products fed to the decoder so they spell correctly.
  vocabulary text not null default '',
  -- Summary, action items, chapters and clip picks — one AI pass, cached.
  insights jsonb,

  client_id uuid references public.clients (id) on delete set null,
  project_id uuid references public.projects (id) on delete set null,
  created_by uuid references public.users (id) on delete set null,
  -- Wall-clock the worker spent, for the usage panel.
  render_ms integer,
  archived_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  completed_at timestamptz
);

create table if not exists public.transcript_segments (
  id uuid primary key default gen_random_uuid(),
  transcript_id uuid not null
    references public.transcripts (id) on delete cascade,
  -- Dense and rewritten wholesale on split/merge, so no unique constraint.
  idx integer not null default 0,
  start_s numeric(10, 3) not null default 0,
  end_s numeric(10, 3) not null default 0,
  -- Raw diarization label (SPEAKER_00); display name resolves via the parent.
  speaker text,
  text text not null default '',
  -- [{ "w": "hello", "s": 1.24, "e": 1.51 }] — drives word-level highlight.
  words jsonb not null default '[]'::jsonb,
  -- Per-language subtitle translations: {"ar": "…"}.
  translations jsonb not null default '{}'::jsonb,
  -- True once a human corrected it, so a re-run never silently overwrites.
  edited boolean not null default false,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists public.transcript_shares (
  token text primary key,
  transcript_id uuid not null
    references public.transcripts (id) on delete cascade,
  created_by uuid references public.users (id) on delete set null,
  created_at timestamptz not null default now(),
  revoked_at timestamptz
);

create index if not exists transcripts_created_at_idx
  on public.transcripts (created_at desc);
create index if not exists transcripts_client_idx
  on public.transcripts (client_id);
create index if not exists transcripts_project_idx
  on public.transcripts (project_id);
create index if not exists transcripts_status_idx
  on public.transcripts (status, created_at desc);
create index if not exists transcript_segments_transcript_idx
  on public.transcript_segments (transcript_id, idx);

-- Search across every transcript in the studio. 'simple' rather than
-- 'english': it does no stemming and no stop-wording, which is what makes it
-- work for Arabic as well as English instead of mangling one to suit the other.
create index if not exists transcript_segments_fts_idx
  on public.transcript_segments
  using gin (to_tsvector('simple', text));
