-- 024 — Was this generation any good?
--
-- A thumb from the person who made it, and when it's down, a structured reason.
-- The reasons are a fixed vocabulary rather than free text so the export is
-- countable — "eleven of the last forty failures were wardrobe" is actionable
-- in a way that a pile of sentences is not. The free note is kept alongside for
-- the detail a vocabulary can't carry.
--
-- One rating per person per generation; rating again replaces it.
create table if not exists public.generation_feedback (
  id uuid primary key default gen_random_uuid(),
  generation_id uuid not null
    references public.generations (id) on delete cascade,
  user_id uuid references public.users (id) on delete set null,
  -- 1 = good, -1 = not good. No middle: a scale invites 3/5 and tells us
  -- nothing about what to change.
  rating smallint not null check (rating in (-1, 1)),
  reasons text[] not null default '{}',
  note text not null default '',
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create unique index if not exists generation_feedback_one_per_user_idx
  on public.generation_feedback (generation_id, user_id);
create index if not exists generation_feedback_created_at_idx
  on public.generation_feedback (created_at desc);
create index if not exists generation_feedback_rating_idx
  on public.generation_feedback (rating);
