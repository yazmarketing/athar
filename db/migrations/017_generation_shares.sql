-- 017 — Revocable public share links for a generation (safe to re-run).
--
-- A share is a random, unguessable token that maps to one generation. The
-- public /s/<token> page serves the image through the app, so the underlying
-- Spaces URL is never exposed in a shared link, and revoking the row takes
-- the link offline immediately.
create table if not exists public.generation_shares (
  token text primary key,
  generation_id uuid not null
    references public.generations (id) on delete cascade,
  created_by uuid references public.users (id) on delete set null,
  created_at timestamptz not null default now(),
  revoked_at timestamptz
);

-- One lookup path: "the live share for this generation".
create index if not exists generation_shares_generation_idx
  on public.generation_shares (generation_id)
  where revoked_at is null;
