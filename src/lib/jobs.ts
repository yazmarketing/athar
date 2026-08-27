import "server-only";
import { db, onceProcess } from "@/lib/db";
import type { GenerationJobRecord } from "@/lib/types";

async function ensureJobsTableUncached() {
  await db().query(`
    create table if not exists public.generation_jobs (
      id uuid primary key default gen_random_uuid(),
      kind text not null default 't2v' check (kind in ('t2v', 'i2v', 'v2v', 't2i')),
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
  // Stamped when a poll takes ownership of finalizing a finished render, so
  // the polls that overlap it don't each store the clip and insert a row.
  await db().query(`
    alter table public.generation_jobs
      add column if not exists finalizing_at timestamptz
  `);
  // Existing tables predate the 'v2v' kind — relax the check. Idempotent.
  await db().query(`
    do $$
    begin
      alter table public.generation_jobs
        drop constraint if exists generation_jobs_kind_check;
      alter table public.generation_jobs
        add constraint generation_jobs_kind_check
        check (kind in ('t2v', 'i2v', 'v2v', 't2i'));
    exception
      when others then null;
    end $$
  `);
}

/** Memoised per process — see `onceProcess`. */
export const ensureJobsTable = onceProcess(ensureJobsTableUncached);

/**
 * Record a render before anything is asked of the provider.
 *
 * The job is born 'queued' with no provider task: submitting is the slow
 * part, and it happens after the response, not inside it. See
 * `submitVideoJob` / `submitImageJob`.
 */
export async function createJob(input: {
  kind: "t2v" | "i2v" | "v2v" | "t2i";
  provider?: string;
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
       (kind, status, provider, model_endpoint, tier, input,
        final_prompt, negative_prompt, aspect, duration_s,
        user_id, project_id, brand_kit_id)
     values
       ($1, 'queued', $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12)
     returning *`,
    [
      input.kind,
      input.provider ?? "byteplus",
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

/**
 * Latest jobs first. Used to restore in-flight renders after a refresh, and
 * to drive the notifications bell — always scoped to one person's own jobs.
 * Without the filter, everyone signed in polled and got notified about
 * everyone else's renders too.
 */
export async function listRecentJobs(
  userId: string,
  limit = 10
): Promise<GenerationJobRecord[]> {
  await ensureJobsTable();
  const { rows } = await db().query<GenerationJobRecord>(
    `select * from generation_jobs
     where user_id = $1
     order by created_at desc
     limit $2`,
    [userId, Math.min(limit, 50)]
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

/**
 * Cancel a job, or dismiss a finished one.
 *
 * This previously only accepted 'failed' and 'completed', which meant a
 * queued or running render could not be stopped — the expensive case, and
 * exactly the one worth stopping when something is kicked off by mistake.
 * Cancelling a live job also stops the poller from turning it into a
 * generation row when the provider eventually answers.
 */
export async function markJobCancelled(
  id: string
): Promise<GenerationJobRecord | null> {
  const { rows } = await db().query<GenerationJobRecord>(
    `update generation_jobs
     set status = 'cancelled', updated_at = now(),
         completed_at = coalesce(completed_at, now())
     where id = $1
       and status in ('queued', 'running', 'failed', 'completed')
     returning *`,
    [id]
  );
  return rows[0] ?? null;
}

/** Put a failed or cancelled job back in the queue for a fresh submit. */
export async function markJobRequeued(
  id: string
): Promise<GenerationJobRecord | null> {
  const { rows } = await db().query<GenerationJobRecord>(
    `update generation_jobs
     set status = 'queued', provider_task_id = null, error = null,
         updated_at = now(), completed_at = null, generation_id = null,
         finalizing_at = null
     where id = $1
     returning *`,
    [id]
  );
  return rows[0] ?? null;
}

/**
 * Take ownership of submitting a queued job.
 *
 * The claim *is* the 'queued' → 'running' transition, so two callers racing
 * — the request that created the job and a poll that got there first — can
 * never open two Seedance tasks for one render. The loser gets null and does
 * nothing.
 */
export async function claimJobForSubmit(
  id: string
): Promise<GenerationJobRecord | null> {
  await ensureJobsTable();
  const { rows } = await db().query<GenerationJobRecord>(
    `update generation_jobs
     set status = 'running', updated_at = now()
     where id = $1 and status = 'queued' and provider_task_id is null
     returning *`,
    [id]
  );
  return rows[0] ?? null;
}

/** Attach the provider task a claimed job was submitted as. */
export async function attachProviderTask(
  id: string,
  providerTaskId: string
): Promise<GenerationJobRecord | null> {
  const { rows } = await db().query<GenerationJobRecord>(
    `update generation_jobs
     set provider_task_id = $2, updated_at = now()
     where id = $1
     returning *`,
    [id, providerTaskId]
  );
  return rows[0] ?? null;
}

/**
 * Return a claim that never produced a task to the queue.
 *
 * A submit runs after the response, so it dies with the process on a deploy
 * or restart. Without this the render would sit 'running' against a provider
 * that was never asked for it, until the stale check failed it half an hour
 * later.
 */
export async function requeueUnsubmittedJob(
  id: string,
  olderThanMs: number
): Promise<GenerationJobRecord | null> {
  const { rows } = await db().query<GenerationJobRecord>(
    `update generation_jobs
     set status = 'queued', updated_at = now()
     where id = $1 and status = 'running' and provider_task_id is null
       and updated_at < now() - make_interval(secs => $2)
     returning *`,
    [id, olderThanMs / 1000]
  );
  return rows[0] ?? null;
}

/**
 * Take ownership of finalizing a finished render.
 *
 * Storing the clip and writing its generation row takes seconds, and the
 * studio polls every five, so without a claim every overlapping poll would
 * copy the same video and insert the same generation again. A claim that
 * goes nowhere (the process died mid-copy) is retried once it ages out.
 */
export async function claimJobForFinalize(
  id: string,
  retryAfterMs: number
): Promise<GenerationJobRecord | null> {
  await ensureJobsTable();
  const { rows } = await db().query<GenerationJobRecord>(
    `update generation_jobs
     set finalizing_at = now(), updated_at = now()
     where id = $1 and status = 'running'
       and (finalizing_at is null
            or finalizing_at < now() - make_interval(secs => $2))
     returning *`,
    [id, retryAfterMs / 1000]
  );
  return rows[0] ?? null;
}
