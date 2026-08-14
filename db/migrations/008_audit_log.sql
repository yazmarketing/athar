-- Append-only audit trail for sensitive/destructive actions (safe to re-run)
create table if not exists public.audit_log (
  id uuid primary key default gen_random_uuid(),
  user_id uuid,
  user_email text,
  action text not null,
  subject_type text not null,
  subject_id text,
  meta jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now()
);

create index if not exists audit_log_created_at_idx
  on public.audit_log (created_at desc);
