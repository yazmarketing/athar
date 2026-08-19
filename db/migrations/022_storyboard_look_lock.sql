-- 022 — Make a board's look editable, keepable, and actually enforced.
--
-- Re-planning re-derived the look from scratch, so a culturally correct
-- wardrobe found on one pass (a white kandura) was replaced by an invented one
-- on the next (a cotton shirt and olive trousers). The look is now something
-- you lock and edit rather than re-roll.
--
-- `banned_elements` are the things that must NOT be in frame. They used to be
-- written into the look as prose and hoped for; they now go into every frame's
-- negative prompt, which the model actually acts on. (Named `banned_elements`
-- rather than `constraints` on purpose — the latter is a Postgres keyword.)
alter table public.storyboards
  add column if not exists look_locked boolean not null default false;
alter table public.storyboards
  add column if not exists banned_elements text[] not null default '{}';
