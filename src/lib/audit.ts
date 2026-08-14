import "server-only";
import { db } from "@/lib/db";

/**
 * Append-only audit trail for sensitive/destructive actions (spec §17).
 * Never throws — auditing must not break the action being audited.
 */

let ensured = false;

async function ensureAuditTable() {
  if (ensured) return;
  await db().query(`
    create table if not exists public.audit_log (
      id uuid primary key default gen_random_uuid(),
      user_id uuid,
      user_email text,
      action text not null,
      subject_type text not null,
      subject_id text,
      meta jsonb not null default '{}'::jsonb,
      created_at timestamptz not null default now()
    )
  `);
  await db().query(`
    create index if not exists audit_log_created_at_idx
      on public.audit_log (created_at desc)
  `);
  ensured = true;
}

export async function logAudit(opts: {
  userId?: string | null;
  userEmail?: string | null;
  action: string;
  subjectType: string;
  subjectId?: string | null;
  meta?: Record<string, unknown>;
}) {
  try {
    await ensureAuditTable();
    await db().query(
      `insert into audit_log (user_id, user_email, action, subject_type, subject_id, meta)
       values ($1, $2, $3, $4, $5, $6)`,
      [
        opts.userId ?? null,
        opts.userEmail ?? null,
        opts.action,
        opts.subjectType,
        opts.subjectId ?? null,
        JSON.stringify(opts.meta ?? {}),
      ]
    );
  } catch {
    // Auditing must never block or fail the underlying action
  }
}

export type AuditEntry = {
  id: string;
  user_id: string | null;
  user_email: string | null;
  action: string;
  subject_type: string;
  subject_id: string | null;
  meta: Record<string, unknown>;
  created_at: string;
};

export async function listAudit(limit = 50): Promise<AuditEntry[]> {
  await ensureAuditTable();
  const { rows } = await db().query<AuditEntry>(
    `select * from audit_log order by created_at desc limit $1`,
    [Math.min(limit, 200)]
  );
  return rows;
}
