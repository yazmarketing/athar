-- 010 — Clients as the top-level entity: Client ▸ Projects, Client ▸ Brand kits.
-- Idempotent: safe to run more than once.

create table if not exists public.clients (
  id uuid primary key default gen_random_uuid(),
  name text not null,
  created_by uuid references public.users (id) on delete set null,
  archived_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

-- Case-insensitive unique client names.
create unique index if not exists clients_name_lower_idx
  on public.clients (lower(name));

alter table public.projects
  add column if not exists client_id uuid references public.clients (id) on delete set null;
alter table public.brand_kits
  add column if not exists client_id uuid references public.clients (id) on delete set null;

create index if not exists projects_client_id_idx on public.projects (client_id);
create index if not exists brand_kits_client_id_idx on public.brand_kits (client_id);

-- Seed clients from existing freeform `client` labels on projects and brand kits.
insert into public.clients (name)
select distinct trim(client) from public.projects
where client is not null and trim(client) <> ''
  and lower(trim(client)) not in (select lower(name) from public.clients);

insert into public.clients (name)
select distinct trim(client) from public.brand_kits
where client is not null and trim(client) <> ''
  and lower(trim(client)) not in (select lower(name) from public.clients);

-- Default bucket for anything without a client label.
insert into public.clients (name)
select 'Internal / Unassigned'
where not exists (
  select 1 from public.clients where lower(name) = lower('Internal / Unassigned')
);

-- Link projects to their client (by label), then bucket the rest.
update public.projects p set client_id = c.id
from public.clients c
where p.client_id is null and p.client is not null
  and lower(trim(p.client)) = lower(c.name);
update public.projects set client_id = (
  select id from public.clients where lower(name) = lower('Internal / Unassigned')
) where client_id is null;

-- Link brand kits to their client (by label), then bucket the rest.
update public.brand_kits b set client_id = c.id
from public.clients c
where b.client_id is null and b.client is not null
  and lower(trim(b.client)) = lower(c.name);
update public.brand_kits set client_id = (
  select id from public.clients where lower(name) = lower('Internal / Unassigned')
) where client_id is null;
