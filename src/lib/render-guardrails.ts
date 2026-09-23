import "server-only";
import type { PoolClient } from "pg";
import { db, onceProcess } from "@/lib/db";
import { ensureGenerationColumns } from "@/lib/generations-store";

export const SPEND_ALERT_THRESHOLDS = [100, 200, 300] as const;

export const ensureSpendControls = onceProcess(async () => {
  await db().query(`alter table public.users add column if not exists spend_cap numeric(12, 2)`);
  await db().query(`alter table public.projects add column if not exists spend_cap numeric(12, 2)`);
  await db().query(`alter table public.generation_jobs add column if not exists estimated_cost numeric(12, 4) not null default 0`);
  await db().query(`
    create table if not exists public.spend_alerts (
      scope_type text not null check (scope_type in ('user', 'project')),
      scope_id uuid not null,
      threshold numeric(12, 2) not null,
      created_at timestamptz not null default now(),
      primary key (scope_type, scope_id, threshold)
    )
  `);
});

export function promptSimilarity(a: string, b: string): number {
  const terms = (value: string) => new Set(value.toLowerCase().replace(/[^\p{L}\p{N}]+/gu, " ").split(/\s+/).filter((x) => x.length > 2));
  const aa = terms(a);
  const bb = terms(b);
  if (!aa.size || !bb.size) return 0;
  let overlap = 0;
  for (const term of aa) if (bb.has(term)) overlap++;
  return overlap / Math.max(aa.size, bb.size);
}

export async function similarVideoRenderCount(userId: string, projectId: string, prompt: string) {
  await ensureGenerationColumns();
  const { rows } = await db().query<{ final_prompt: string }>(
    `select final_prompt from generations
     where user_id = $1 and project_id = $2
       and mode in ('t2v', 'i2v', 'v2v') and deleted_at is null
     order by created_at desc limit 50`,
    [userId, projectId]
  );
  return rows.filter((row) => promptSimilarity(prompt, row.final_prompt) >= 0.82).length;
}

type Scope = { type: "user" | "project"; id: string; cap: number | null; spent: number };

export async function checkSpendControls(input: { userId: string; projectId: string | null; proposedCost: number }, executor: Pick<PoolClient, "query"> = db()) {
  await ensureSpendControls();
  const { rows } = await executor.query<{
    user_cap: string | null; project_cap: string | null; user_spent: string; project_spent: string;
  }>(`select
      u.spend_cap as user_cap, p.spend_cap as project_cap,
      coalesce((select sum(cost) from generations where user_id = $1), 0) +
        coalesce((select sum(estimated_cost) from generation_jobs where user_id = $1 and status in ('queued','running')), 0) as user_spent,
      coalesce((select sum(cost) from generations where project_id = $2), 0) +
        coalesce((select sum(estimated_cost) from generation_jobs where project_id = $2 and status in ('queued','running')), 0) as project_spent
    from users u left join projects p on p.id = $2 where u.id = $1`, [input.userId, input.projectId]);
  const row = rows[0];
  const scopes: Scope[] = [
    { type: "user", id: input.userId, cap: row?.user_cap == null ? null : Number(row.user_cap), spent: Number(row?.user_spent ?? 0) },
  ];
  if (input.projectId) scopes.push({ type: "project", id: input.projectId, cap: row?.project_cap == null ? null : Number(row.project_cap), spent: Number(row?.project_spent ?? 0) });
  for (const scope of scopes) {
    if (scope.cap != null && scope.spent + input.proposedCost > scope.cap) {
      return { allowed: false as const, error: `${scope.type === "user" ? "Your" : "This project's"} $${scope.cap.toFixed(2)} spend cap would be exceeded.` };
    }
  }
  const alerts: string[] = [];
  for (const scope of scopes) {
    for (const threshold of SPEND_ALERT_THRESHOLDS) {
      if (scope.spent + input.proposedCost >= threshold) {
        const inserted = await executor.query(`insert into spend_alerts (scope_type, scope_id, threshold) values ($1,$2,$3) on conflict do nothing returning threshold`, [scope.type, scope.id, threshold]);
        if (inserted.rowCount) alerts.push(`${scope.type === "user" ? "User" : "Project"} spend has reached $${threshold}.`);
      }
    }
  }
  return { allowed: true as const, alerts };
}
