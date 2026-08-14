-- Allow 'v2v' (video edit/extend via Seedance reference_video) as a
-- generation mode and job kind (safe to re-run)
alter table public.generations
  drop constraint if exists generations_mode_check;

alter table public.generations
  add constraint generations_mode_check
  check (mode in ('t2i', 'i2v', 't2v', 'v2v', 'lipsync', 'upscale', 'edit'));

alter table public.generation_jobs
  drop constraint if exists generation_jobs_kind_check;

alter table public.generation_jobs
  add constraint generation_jobs_kind_check
  check (kind in ('t2v', 'i2v', 'v2v'));
