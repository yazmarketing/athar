-- Brand kits: reusable client/brand visual rules (safe to re-run)
create table if not exists public.brand_kits (
  id uuid primary key default gen_random_uuid(),
  name text not null,
  client text,
  -- Prompt fragment appended to every generation using this kit
  brand_tokens text not null default '',
  -- Extra negative-prompt bans for this brand
  negative_additions text not null default '',
  reference_urls text[] not null default '{}',
  project_id uuid references public.projects (id) on delete set null,
  created_by uuid references public.users (id) on delete set null,
  archived_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index if not exists brand_kits_created_at_idx
  on public.brand_kits (created_at desc);

-- generations.brand_kit_id already exists in schema; add FK when possible
do $$
begin
  if not exists (
    select 1 from pg_constraint where conname = 'generations_brand_kit_id_fkey'
  ) then
    alter table public.generations
      add constraint generations_brand_kit_id_fkey
      foreign key (brand_kit_id) references public.brand_kits (id) on delete set null;
  end if;
exception
  when others then null;
end $$;
