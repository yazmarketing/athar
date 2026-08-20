-- 026 — Mark which poll owns finalizing a finished video job (safe to re-run).
--
-- Storing the clip and writing its generation row takes seconds, and the
-- studio polls every five, so overlapping polls used to copy the same video
-- and insert the same generation more than once. A poll now stamps this
-- column to claim the work; the others see the claim and leave it alone. A
-- claim that goes nowhere (the process died mid-copy) ages out and is retried.
alter table public.generation_jobs
  add column if not exists finalizing_at timestamptz;
