-- 020 — Reference images on a storyboard.
--
-- Continuity is the whole point of a board: the same character, the same
-- product, the same look across every frame. Text alone doesn't hold it — the
-- model redraws a face from a description every time. These references are
-- passed into every frame render, and named to the planner so it writes to
-- the right subject. Idempotent.
alter table public.storyboards
  add column if not exists reference_urls text[] not null default '{}';
