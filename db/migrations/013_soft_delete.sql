-- 013 — Soft-delete generations so removing one never affects usage/cost data.
alter table public.generations add column if not exists deleted_at timestamptz;
create index if not exists generations_deleted_idx on public.generations (deleted_at);
