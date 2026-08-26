-- 027 — Track real Whisper spend and duration on transcripts (safe to re-run).
--
-- Transcription runs through OpenAI's hosted whisper-1, which is billed per
-- minute of audio — it was never self-hosted, despite what earlier comments
-- here said. Nothing wrote `duration_s`, `render_ms`, or a cost anywhere in
-- the transcribe flow, so every usage total involving audio read as 0 no
-- matter how much was actually transcribed. `cost` is new; the chunk route
-- now also fills in `duration_s`/`render_ms`, which existed but sat unused.
alter table public.transcripts
  add column if not exists cost numeric(10, 4) not null default 0;
