-- 019 — Storyboards: script → bible → panels (safe to re-run).
--
-- A board is the unit a client is shown, so it carries the script and the
-- decisions made about it. The bible holds the world — every character,
-- location and prop, each pinned to an approved reference image — and panels
-- reference the bible by id rather than restating descriptions. That is what
-- keeps panel 23 the same person as panel 4.
create table if not exists public.storyboards (
  id uuid primary key default gen_random_uuid(),
  title text not null,
  -- The script or brief the board was broken down from, kept verbatim so a
  -- re-plan starts from the source rather than from an earlier plan.
  source_text text not null default '',
  -- "sketch" boards are for approving the sequence; "photoreal" ones are for
  -- selling the idea. Same pipeline, different style plate.
  register text not null default 'sketch'
    check (register in ('sketch', 'line', 'mono', 'photoreal')),
  aspect text not null default '16:9',
  -- The look every panel inherits: lighting, grade, lens language.
  look jsonb not null default '{}'::jsonb,
  status text not null default 'draft'
    check (status in ('draft', 'bible', 'panels', 'ready')),
  client_id uuid references public.clients (id) on delete set null,
  project_id uuid references public.projects (id) on delete set null,
  brand_kit_id uuid references public.brand_kits (id) on delete set null,
  created_by uuid references public.users (id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  deleted_at timestamptz
);

create index if not exists storyboards_client_idx
  on public.storyboards (client_id, created_at desc)
  where deleted_at is null;

-- One character, location or prop. `reference_url` is the approved sheet
-- every panel containing this entity is rendered against.
create table if not exists public.storyboard_entities (
  id uuid primary key default gen_random_uuid(),
  storyboard_id uuid not null
    references public.storyboards (id) on delete cascade,
  -- Stable handle the panels reference ("layla", "majlis-interior").
  slug text not null,
  kind text not null default 'character'
    check (kind in ('character', 'location', 'prop')),
  name text not null,
  description text not null default '',
  -- Held constant across every panel this entity appears in.
  wardrobe text not null default '',
  reference_url text,
  -- Approved by a human before any panel is drawn.
  approved_at timestamptz,
  -- Fixed per entity so re-renders of the sheet stay recognisable.
  seed bigint,
  position integer not null default 0,
  created_at timestamptz not null default now(),
  unique (storyboard_id, slug)
);

create index if not exists storyboard_entities_board_idx
  on public.storyboard_entities (storyboard_id, position);

-- One panel of the board.
create table if not exists public.storyboard_panels (
  id uuid primary key default gen_random_uuid(),
  storyboard_id uuid not null
    references public.storyboards (id) on delete cascade,
  -- 1-based, and what the client refers to in notes ("panel 12").
  number integer not null,
  -- Film grammar, kept as fields rather than buried in prose so the board can be
  -- checked and edited without re-parsing a sentence.
  shot_size text not null default 'MS',
  angle text not null default 'eye',
  lens text not null default '',
  -- Which way the subject faces/moves; enforced across cuts (the 180° rule).
  screen_direction text not null default 'neutral'
    check (screen_direction in ('left', 'right', 'neutral', 'to-camera')),
  action text not null default '',
  dialogue text not null default '',
  -- Camera move, deliberately kept out of the still prompt.
  motion text not null default '',
  duration_s numeric(6, 2),
  -- Bible slugs appearing in this panel; drives which references attach.
  entity_slugs text[] not null default '{}',
  -- The prompt actually sent, kept for reproducibility.
  prompt text not null default '',
  status text not null default 'pending'
    check (status in ('pending', 'rendering', 'ready', 'failed', 'flagged')),
  error text,
  image_url text,
  -- Library row this panel produced, for lineage and re-use.
  generation_id uuid references public.generations (id) on delete set null,
  -- Continuity verdict: 0–1 with the reasons that moved it.
  continuity_score numeric(4, 3),
  continuity_notes text,
  attempts integer not null default 0,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (storyboard_id, number)
);

create index if not exists storyboard_panels_board_idx
  on public.storyboard_panels (storyboard_id, number);
