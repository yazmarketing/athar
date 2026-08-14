import "server-only";
import { db } from "@/lib/db";
import type { GenerationJobRecord } from "@/lib/types";

export async function ensureJobsTable() {
  await db().query(`
    create table if not exists public.generation_jobs (
      id uuid primary key default gen_random_uuid(),
      kind text not null default 't2v' check (kind in ('t2v', 'i2v', 'v2v')),
      status text not null default 'queued'
        check (status in ('queued', 'running', 'completed', 'failed', 'cancelled')),
      provider text not null default 'byteplus',
      provider_task_id text,
      model_endpoint text not null,
      tier text not null,
      input jsonb not null default '{}'::jsonb,
      final_prompt text not null,
      negative_prompt text not null default '',
      aspect text not null default '16:9',
      duration_s numeric(6, 2),
      error text,
      generation_id uuid references public.generations (id) on delete set null,
      user_id uuid references public.users (id) on delete set null,
      project_id uuid references public.projects (id) on delete set null,
      brand_kit_id uuid references public.brand_kits (id) on delete set null,
      created_at timestamptz not null default now(),
      updated_at timestamptz not null default now(),
      completed_at timestamptz
    )
  `);
  await db().query(`
    create index if not exists generation_jobs_status_idx
      on public.generation_jobs (status, created_at desc)
  `);
  // Existing tables predate the 'v2v' kind — relax the check. Idempotent.
  await db().query(`
    do $$
    begin
      alter table public.generation_jobs
        drop constraint if exists generation_jobs_kind_check;
      alter table public.generation_jobs
        add constraint generation_jobs_kind_check
        check (kind in ('t2v', 'i2v', 'v2v'));
    exception
      when others then null;
    end $$
  `);
}

export async function createJob(input: {
  kind: "t2v" | "i2v" | "v2v";
  providerTaskId: string;
  modelEndpoint: string;
  tier: string;
  input: Record<string, unknown>;
  finalPrompt: string;
  negativePrompt: string;
  aspect: string;
  durationS: number | null;
  userId: string | null;
  projectId: string | null;
  brandKitId: string | null;
}): Promise<GenerationJobRecord> {
  await ensureJobsTable();
  const { rows } = await db().query<GenerationJobRecord>(
    `insert into generation_jobs
       (kind, status, provider, provider_task_id, model_endpoint, tier, input,
        final_prompt, negative_prompt, aspect, duration_s,
        user_id, project_id, brand_kit_id)
     values
       ($1, 'running', 'byteplus', $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12)
     returning *`,
    [
      input.kind,
      input.providerTaskId,
      input.modelEndpoint,
      input.tier,
      JSON.stringify(input.input),
      input.finalPrompt,
      input.negativePrompt,
      input.aspect,
      input.durationS,
      input.userId,
      input.projectId,
      input.brandKitId,
    ]
  );
  return rows[0];
}

export async function getJob(id: string): Promise<GenerationJobRecord | null> {
  await ensureJobsTable();
  const { rows } = await db().query<GenerationJobRecord>(
    `select * from generation_jobs where id = $1`,
    [id]
  );
  return rows[0] ?? null;
}

/** Latest jobs first. Used to restore in-flight renders after a refresh. */
export async function listRecentJobs(limit = 10): Promise<GenerationJobRecord[]> {
  await ensureJobsTable();
  const { rows } = await db().query<GenerationJobRecord>(
    `select * from generation_jobs
     order by created_at desc
     limit $1`,
    [Math.min(limit, 50)]
  );
  return rows;
}

export async function markJobCompleted(
  id: string,
  generationId: string
): Promise<GenerationJobRecord | null> {
  const { rows } = await db().query<GenerationJobRecord>(
    `update generation_jobs
     set status = 'completed', generation_id = $2, error = null,
         updated_at = now(), completed_at = now()
     where id = $1
     returning *`,
    [id, generationId]
  );
  return rows[0] ?? null;
}

export async function markJobFailed(
  id: string,
  error: string
): Promise<GenerationJobRecord | null> {
  const { rows } = await db().query<GenerationJobRecord>(
    `update generation_jobs
     set status = 'failed', error = $2, updated_at = now(), completed_at = now()
     where id = $1
     returning *`,
    [id, error.slice(0, 2000)]
  );
  return rows[0] ?? null;
}

/** Permanently dismiss a finished job (hidden from restore-on-refresh). */
export async function markJobCancelled(
  id: string
): Promise<GenerationJobRecord | null> {
  const { rows } = await db().query<GenerationJobRecord>(
    `update generation_jobs
     set status = 'cancelled', updated_at = now(),
         completed_at = coalesce(completed_at, now())
     where id = $1 and status in ('failed', 'completed')
     returning *`,
    [id]
  );
  return rows[0] ?? null;
}

/** Reset a failed job onto a fresh provider task (retry). */
export async function markJobRequeued(
  id: string,
  providerTaskId: string
): Promise<GenerationJobRecord | null> {
  const { rows } = await db().query<GenerationJobRecord>(
    `update generation_jobs
     set status = 'running', provider_task_id = $2, error = null,
         updated_at = now(), completed_at = null, generation_id = null
     where id = $1
     returning *`,
    [id, providerTaskId]
  );
  return rows[0] ?? null;
}
