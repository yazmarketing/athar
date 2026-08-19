-- 023 — A cast, not a single locked subject; and a board-level visual style.
--
-- The planner used to decide one subject and put them in every frame, so a
-- treatment whose first two beats are pure landscape came back with a boy
-- standing in both. Characters now live in a cast, and each frame names which
-- of them (if any) it contains — so a frame with no people gets no people, and
-- the same character recurring across frames 3, 6 and 11 is held to one
-- identity while a different character stays different.
--
-- (`cast_members`, not `cast` — CAST is a Postgres keyword.)
alter table public.storyboards
  add column if not exists cast_members jsonb not null default '[]'::jsonb;

-- Finish level / art direction for the whole board. See config/storyboard-styles.
alter table public.storyboards
  add column if not exists style_id text not null default 'raw';

alter table public.storyboard_frames
  add column if not exists cast_ids text[] not null default '{}';
