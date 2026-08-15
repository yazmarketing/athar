-- 016 — Record how long a generation actually took to render (safe to re-run).
--
-- `duration_s` is the *clip length* of a video, not render time, and
-- completed_at was being stamped at insert (after the render finished), so
-- completed_at - created_at was always ~0. This column stores the measured
-- provider round-trip in milliseconds.
alter table public.generations
  add column if not exists render_ms integer;
