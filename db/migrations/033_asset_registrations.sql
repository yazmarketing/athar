-- Durable BytePlus face registration. CreateAsset is slow and used to run
-- only in after(), so a refresh dropped photos that never reached BytePlus.
create table if not exists public.asset_registrations (
  id uuid primary key default gen_random_uuid(),
  image_url text not null,
  name text not null,
  category text,
  tagged_name text,
  group_id text,
  status text not null default 'queued'
    check (status in ('queued', 'processing', 'completed', 'failed')),
  byteplus_id text,
  error text,
  created_by uuid references public.users (id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index if not exists asset_registrations_status_idx
  on public.asset_registrations (status, created_at desc);
