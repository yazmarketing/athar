-- Team notes on generations (safe to re-run)
create table if not exists public.generation_comments (
  id uuid primary key default gen_random_uuid(),
  generation_id uuid not null references public.generations (id) on delete cascade,
  author text not null default 'Studio',
  body text not null,
  created_at timestamptz not null default now()
);

create index if not exists generation_comments_generation_id_idx
  on public.generation_comments (generation_id, created_at asc);
