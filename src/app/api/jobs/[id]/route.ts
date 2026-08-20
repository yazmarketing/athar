import { NextRequest, NextResponse, after } from "next/server";
import { getSessionUser } from "@/lib/auth-session";
import { requireCreator } from "@/lib/authz";
import { arkGetVideoTask } from "@/lib/byteplus-server";
import { getGeneration } from "@/lib/generations-store";
import { submitImageJob } from "@/lib/image-jobs";
import {
  claimJobForFinalize,
  getJob,
  markJobCancelled,
  markJobFailed,
  requeueUnsubmittedJob,
} from "@/lib/jobs";
import { finalizeVideoJob, submitVideoJob } from "@/lib/video-jobs";
import { isImageJob, type GenerationJobRecord, type GenerationRecord } from "@/lib/types";

type Params = { params: Promise<{ id: string }> };

export const maxDuration = 300;

const UUID_RE =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

/** Jobs stuck in running with no provider progress fail after this long. */
const STALE_JOB_MS = 30 * 60 * 1000;

/**
 * A claimed submit that never produced a task id is presumed dead after this
 * long (a deploy mid-submit, say) and goes back in the queue.
 *
 * Must stay above the provider request timeout in `byteplus-server.ts`: a
 * submit that is merely slow has to fail on its own before this re-queues
 * it, or the retry opens a second paid render alongside the first.
 */
const SUBMIT_RETRY_MS = 3 * 60 * 1000;

/**
 * Gemini Pro can sit open for several minutes. Re-queue sooner than this
 * while the first call is still alive and we pay twice.
 */
const IMAGE_SUBMIT_RETRY_MS = 8 * 60 * 1000;

/** Same idea for a claimed finalize that never wrote its generation row. */
const FINALIZE_RETRY_MS = 5 * 60 * 1000;

function scheduleSubmit(job: { id: string; kind: string }) {
  return isImageJob(job) ? submitImageJob(job.id) : submitVideoJob(job.id);
}

/**
 * Poll a job and move it along.
 *
 * Everything slow is scheduled with `after()` and reported through the job
 * row on a later poll, so this answers in a database round trip whatever
 * state the render is in. It used to submit and store inline, which is how a
 * poll could outrun the gateway — and, because the studio polls every five
 * seconds, how two overlapping polls could store one clip twice.
 */
async function advance(job: GenerationJobRecord) {
  if (job.status !== "running" && job.status !== "queued") {
    return { job, generation: null as GenerationRecord | null };
  }

  // Not yet submitted. The request that queued it schedules the submit; this
  // is the safety net for when that never ran or died part-way.
  if (!job.provider_task_id) {
    if (job.status === "queued") {
      after(() => scheduleSubmit(job));
      return { job, generation: null };
    }
    const retryMs = isImageJob(job) ? IMAGE_SUBMIT_RETRY_MS : SUBMIT_RETRY_MS;
    const stale = Date.now() - new Date(job.updated_at).getTime() > retryMs;
    if (stale) {
      const requeued = await requeueUnsubmittedJob(job.id, retryMs);
      if (requeued) {
        after(() => scheduleSubmit(requeued));
        return { job: requeued, generation: null };
      }
    }
    return { job, generation: null };
  }

  // Gemini has no provider task to poll — submitImageJob writes completed
  // or failed on the job row itself.
  if (isImageJob(job)) {
    return { job, generation: null };
  }

  let task;
  try {
    task = await arkGetVideoTask(job.provider_task_id);
  } catch (err) {
    // Transient provider/network error — keep the job running, report as-is
    void err;
    return { job, generation: null };
  }

  const status = task.status ?? "";

  if (status === "succeeded") {
    const providerUrl = task.content?.video_url;
    if (!providerUrl) {
      return {
        job: await markJobFailed(job.id, "Provider returned no video URL"),
        generation: null,
      };
    }
    const claimed = await claimJobForFinalize(job.id, FINALIZE_RETRY_MS);
    // No claim means another poll is already storing this clip.
    if (claimed) after(() => finalizeVideoJob(claimed, providerUrl));
    return { job: claimed ?? job, generation: null };
  }

  if (status === "failed" || status === "expired") {
    const message =
      task.error?.message ?? task.message ?? `Seedance task ${status}`;
    return { job: await markJobFailed(job.id, message), generation: null };
  }

  // Still queued/running at the provider — stale-check
  const age = Date.now() - new Date(job.created_at).getTime();
  if (age > STALE_JOB_MS) {
    return {
      job: await markJobFailed(job.id, "Render timed out (no provider progress)"),
      generation: null,
    };
  }

  return { job, generation: null };
}

export async function GET(_req: NextRequest, { params }: Params) {
  try {
    const sessionUser = await getSessionUser();
    if (!sessionUser?.id) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const { id } = await params;
    if (!UUID_RE.test(id)) {
      return NextResponse.json({ error: "Invalid id" }, { status: 400 });
    }

    const job = await getJob(id);
    if (!job) {
      return NextResponse.json({ error: "Not found" }, { status: 404 });
    }

    const result = await advance(job);
    const nextJob = result.job ?? job;
    const generationId = nextJob.generation_id;
    const generation = generationId ? await getGeneration(generationId) : null;
    return NextResponse.json({ job: nextJob, generation });
  } catch (err) {
    const message = err instanceof Error ? err.message : "Query failed";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}

/** Dismiss a finished job so it stops reappearing after refresh. */
export async function DELETE(_req: NextRequest, { params }: Params) {
  try {
    // Destructive — viewers are read-only.
    const { response: authError } = await requireCreator();
    if (authError) return authError;

    const { id } = await params;
    if (!UUID_RE.test(id)) {
      return NextResponse.json({ error: "Invalid id" }, { status: 400 });
    }

    const job = await markJobCancelled(id);
    if (!job) {
      return NextResponse.json(
        { error: "Job not found or still running" },
        { status: 404 }
      );
    }
    return NextResponse.json({ job });
  } catch (err) {
    const message = err instanceof Error ? err.message : "Dismiss failed";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
