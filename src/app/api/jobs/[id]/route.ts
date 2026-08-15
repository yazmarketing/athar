import { NextRequest, NextResponse } from "next/server";
import { getSessionUser } from "@/lib/auth-session";
import { requireCreator } from "@/lib/authz";
import { arkGetVideoTask } from "@/lib/byteplus-server";
import {
  ensureGenerationModes,
  insertGeneration,
  persistOutputToSpaces,
} from "@/lib/generations-store";
import {
  getJob,
  markJobCancelled,
  markJobCompleted,
  markJobFailed,
} from "@/lib/jobs";
import { resolveModel, type Tier } from "@/config/models";
import type { GenerationJobRecord, PromptInputs } from "@/lib/types";

type Params = { params: Promise<{ id: string }> };

const UUID_RE =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

/** Jobs stuck in running with no provider progress fail after this long. */
const STALE_JOB_MS = 30 * 60 * 1000;

/**
 * Poll a job. When the provider task has succeeded, this call finalizes it:
 * copies the video into Spaces, writes the generation record, and marks the
 * job completed. Safe to call repeatedly.
 */
async function checkAndFinalize(job: GenerationJobRecord) {
  if (job.status !== "running" && job.status !== "queued") {
    return { job, generation: null };
  }

  if (!job.provider_task_id) {
    return { job: await markJobFailed(job.id, "Missing provider task id"), generation: null };
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

    const outputUrl = await persistOutputToSpaces(
      providerUrl,
      "video",
      job.kind,
      null
    );

    const model = resolveModel(
      job.kind === "i2v" || job.kind === "v2v" ? job.kind : "t2v",
      job.tier as Tier
    );
    const durationS = job.duration_s != null ? Number(job.duration_s) : null;
    const cost =
      model.unit === "second" && durationS != null
        ? model.costPerUnit * durationS
        : model.costPerUnit;

    const input = job.input as {
      prompt?: PromptInputs;
      sourceImageUrl?: string | null; // legacy single-image jobs
      sourceImageUrls?: string[] | null;
      sourceGenerationId?: string | null;
      sourceVideoUrl?: string | null;
      sourceVideoGenerationId?: string | null;
    };
    const sourceImages = input.sourceImageUrls?.length
      ? input.sourceImageUrls
      : input.sourceImageUrl
        ? [input.sourceImageUrl]
        : [];
    if (job.kind === "v2v") {
      // Older databases restrict generations.mode — relax before insert
      await ensureGenerationModes();
    }
    const generation = await insertGeneration({
      mode: job.kind,
      tier: job.tier,
      modelEndpoint: job.model_endpoint,
      inputPayload: {
        prompt_inputs: input.prompt,
        duration_s: durationS,
        job_id: job.id,
        provider_task_id: job.provider_task_id,
        // Lineage back to the image(s) that seeded this clip (i2v)
        source_generation_id: input.sourceGenerationId ?? undefined,
        source_image_url: sourceImages[0] ?? undefined,
        source_image_urls: sourceImages.length ? sourceImages : undefined,
        // Lineage back to the clip this edit/extend started from (v2v)
        source_video_url: input.sourceVideoUrl ?? undefined,
        source_video_generation_id:
          input.sourceVideoGenerationId ?? undefined,
      },
      finalPrompt: job.final_prompt,
      negativePrompt: job.negative_prompt,
      seed: null,
      referenceUrls: sourceImages,
      outputUrl,
      providerUrl,
      requestId: job.provider_task_id,
      cost,
      aspect: job.aspect,
      durationS,
      userId: job.user_id,
      projectId: job.project_id,
      brandKitId: job.brand_kit_id,
      // Video renders are async, so the real elapsed time is from when the
      // job was queued to now — not a single request round-trip.
      renderMs: job.created_at
        ? Date.now() - new Date(job.created_at).getTime()
        : null,
    });

    return { job: await markJobCompleted(job.id, generation.id), generation };
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

    const result = await checkAndFinalize(job);
    return NextResponse.json(result);
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
