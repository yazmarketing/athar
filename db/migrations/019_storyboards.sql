-- 019 — Storyboards: an ordered, editable board of frames for one piece.
--
-- A storyboard is the planning surface that sits in front of generation: the
-- brief is broken into frames, each frame holds a still prompt plus the camera
-- move that belongs to it, and frames are rendered against a shared key frame
-- so the whole board reads as one piece. Idempotent — safe to re-run.

create table if not exists public.storyboards (
  id uuid primary key default gen_random_uuid(),
  title text not null,
  brief text not null default '',
  -- The locked look (subject / wardrobe / location / lighting / grade) the
  -- planner decided once. Re-planning and newly added frames inherit it.
  look jsonb,
  client_id uuid references public.clients (id) on delete set null,
  project_id uuid references public.projects (id) on delete set null,
  brand_kit_id uuid references public.brand_kits (id) on delete set null,
  aspect text not null default '16:9',
  created_by uuid references public.users (id) on delete set null,
  archived_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists public.storyboard_frames (
  id uuid primary key default gen_random_uuid(),
  storyboard_id uuid not null
    references public.storyboards (id) on delete cascade,
  -- Sparse and rewritten wholesale on reorder, so no unique constraint.
  position integer not null default 0,
  title text not null default '',
  -- Still-frame description only. Camera language lives in `motion`.
  prompt text not null default '',
  motion text not null default '',
  shot_size text not null default '',
  dialogue text not null default '',
  notes text not null default '',
  aspect text,
  duration_s integer,
  image_url text,
  video_url text,
  generation_id uuid references public.generations (id) on delete set null,
  video_job_id uuid,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index if not exists storyboards_client_idx
  on public.storyboards (client_id);
create index if not exists storyboards_project_idx
  on public.storyboards (project_id);
create index if not exists storyboards_created_at_idx
  on public.storyboards (created_at desc);
create index if not exists storyboard_frames_board_idx
  on public.storyboard_frames (storyboard_id, position);
