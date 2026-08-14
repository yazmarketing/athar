-- Internal users for auth gate (safe to re-run)
create table if not exists public.users (
  id uuid primary key default gen_random_uuid(),
  email text not null unique,
  name text,
  role text not null default 'creator'
    check (role in ('admin', 'creator', 'viewer')),
  active boolean not null default true,
  created_at timestamptz not null default now(),
  last_login_at timestamptz
);

create index if not exists users_email_idx on public.users (email);
