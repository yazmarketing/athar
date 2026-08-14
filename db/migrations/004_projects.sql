-- Projects for client/campaign grouping (safe to re-run)
create table if not exists public.projects (
  id uuid primary key default gen_random_uuid(),
  name text not null,
  client text,
  created_by uuid references public.users (id) on delete set null,
  archived_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index if not exists projects_created_at_idx
  on public.projects (created_at desc);

create index if not exists projects_archived_at_idx
  on public.projects (archived_at);

-- generations.project_id already exists in schema; ensure FK when projects table exists
do $$
begin
  if not exists (
    select 1 from pg_constraint where conname = 'generations_project_id_fkey'
  ) then
    alter table public.generations
      add constraint generations_project_id_fkey
      foreign key (project_id) references public.projects (id) on delete set null;
  end if;
exception
  when others then null;
end $$;
