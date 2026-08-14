-- Additive migration for favorite flag (safe to re-run)
alter table public.generations
  add column if not exists is_favorite boolean not null default false;
