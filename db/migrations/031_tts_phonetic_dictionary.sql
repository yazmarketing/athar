-- 031 — Faseeh pronunciation dictionary. The LLM decides, per context,
-- whether a canonical word should be respelled for TTS; this table only
-- enforces that once a mapping is chosen it stays consistent across scripts.
-- Never applied as a blind find/replace — see tts-phonetics.ts.
-- Idempotent — safe to re-run. Documentation only — the self-healing DDL in
-- lib/tts-phonetics.ts is what actually runs.

create table if not exists public.tts_phonetic_dictionary (
  id uuid primary key default gen_random_uuid(),
  canonical text not null,
  respelling text not null,
  dialect text not null default 'emirati',
  notes text,
  example_context text,
  source text not null default 'manual' check (source in ('seed', 'manual', 'llm_suggested')),
  status text not null default 'active' check (status in ('active', 'pending_review', 'rejected')),
  usage_count integer not null default 0,
  created_by uuid references public.users (id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create unique index if not exists tts_phonetic_dictionary_unique_idx
  on public.tts_phonetic_dictionary (canonical, dialect);

-- Seed with known Munsit/Faseeh mispronunciation fixes from the founder's brief.
insert into public.tts_phonetic_dictionary (canonical, respelling, dialect, source, status, notes)
values
  ('ورثت', 'وِرثَت', 'emirati', 'seed', 'active', 'Munsit mispronounces the plain spelling'),
  ('التي', 'اللّي', 'emirati', 'seed', 'active', 'Spoken relative pronoun'),
  ('معها', 'وياها', 'emirati', 'seed', 'active', 'Spoken "with her"'),
  ('بمفردها', 'بروحها', 'emirati', 'seed', 'active', 'Spoken "by herself"'),
  ('الشهادات', 'الشهايد', 'emirati', 'seed', 'active', 'Spoken plural, register-dependent — use only where colloquial fits')
on conflict (canonical, dialect) do nothing;
