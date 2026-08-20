-- 027 — Allow t2i jobs so Nano Banana can finish after the HTTP response.
--
-- Gemini Pro often outruns the App Platform gateway (~60s). Video already
-- queues a job and answers immediately; stills now use the same table.
alter table public.generation_jobs
  drop constraint if exists generation_jobs_kind_check;

alter table public.generation_jobs
  add constraint generation_jobs_kind_check
  check (kind in ('t2v', 'i2v', 'v2v', 't2i'));
