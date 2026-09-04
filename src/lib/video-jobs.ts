import "server-only";
import { arkCreateVideoTask, type ArkVideoRequest } from "@/lib/byteplus-server";
import { resolveModel, seedanceRealCost, type Tier } from "@/config/models";
import { ASPECT_TO_VIDEO_RATIO, isAspectRatio } from "@/config/aspects";
import {
  ensureGenerationModes,
  insertGeneration,
  persistOutputToSpaces,
} from "@/lib/generations-store";
import {
  attachProviderTask,
  claimJobForSubmit,
  markJobCompleted,
  markJobFailed,
} from "@/lib/jobs";
import type { GenerationJobRecord, PromptInputs } from "@/lib/types";

/**
 * The two slow halves of a video render, kept off the request path.
 *
 * Neither submitting to Seedance nor storing the finished clip belongs
 * inside an HTTP request: the first waits on ModelArk moderating every
 * attached image, the second copies tens of megabytes of MP4 into Spaces.
 * Both used to run inline, and both are why a render surfaced as a gateway
 * 504 in the browser. Routes now schedule these with `after()` and answer
 * immediately; the studio's poll reports what the job row says.
 */

/** Seedance ratio — map uncommon aspects to the closest supported. See ASPECT_TO_VIDEO_RATIO. */

/** The parts of a stored job payload the provider request is built from. */
type VideoJobInput = {
  sourceImageUrl?: string | null; // legacy single-image jobs
  sourceImageUrls?: string[] | null;
  sourceVideoUrl?: string | null;
  /** Subject/motion/style reference clips — see ArkVideoRequest.referenceVideoUrls */
  referenceVideoUrls?: string[] | null;
  sourceAudioUrls?: string[] | null;
  videoResolution?: string | null;
  prompt?: PromptInputs;
  sourceGenerationId?: string | null;
  sourceVideoGenerationId?: string | null;
};

export function videoJobInput(job: GenerationJobRecord): VideoJobInput {
  return (job.input ?? {}) as VideoJobInput;
}

/** The image(s) this render started from, oldest single-image jobs included. */
export function videoJobSourceImages(input: VideoJobInput): string[] {
  if (input.sourceImageUrls?.length) return input.sourceImageUrls;
  return input.sourceImageUrl ? [input.sourceImageUrl] : [];
}

/**
 * Turn a stored job row back into the Seedance request that renders it.
 *
 * The first submit and a retry both go through here, so a retry can't drift
 * from the render it is repeating — which it did while each route built its
 * own payload: only the submit path clamped 1080p down for the draft tier's
 * Seedance 2.0 Mini, so retrying a 1080p draft job failed at the provider.
 */
export function videoRequestForJob(job: GenerationJobRecord): ArkVideoRequest {
  const input = videoJobInput(job);
  const model = resolveModel(job.kind, job.tier as Tier);
  const imageUrls = videoJobSourceImages(input);
  const sourceVideoUrl = input.sourceVideoUrl?.trim() || null;
  // Seedance 2.5 accepts up to 10 reference video clips (30s combined) —
  // same ceiling as reference audio.
  const referenceVideoUrls = (input.referenceVideoUrls ?? [])
    .map((u) => u.trim())
    .filter(Boolean)
    .slice(0, 10);
  // Seedance 2.5 accepts up to 10 reference audio clips (30s combined).
  const audioUrls = (input.sourceAudioUrls ?? [])
    .map((u) => u.trim())
    .filter(Boolean)
    .slice(0, 10);

  // 1080p is a Seedance 2.5 capability; the 2.0 Mini behind the draft tier
  // doesn't offer it. Clamp rather than fail — the person asked for a clip.
  const requested = input.videoResolution;
  const resolution: "480p" | "720p" | "1080p" =
    requested === "480p"
      ? "480p"
      : requested === "1080p" && model.slug.includes("seedance-2-5")
        ? "1080p"
        : "720p";

  const stored = job.duration_s != null ? Number(job.duration_s) : NaN;
  const duration = Math.min(
    Math.max(Number.isFinite(stored) ? stored : 5, 4),
    model.maxDuration || 30
  );

  return {
    model: model.slug,
    prompt: job.final_prompt,
    negativePrompt: job.negative_prompt || undefined,
    ratio: isAspectRatio(job.aspect)
      ? ASPECT_TO_VIDEO_RATIO[job.aspect]
      : "16:9",
    resolution,
    duration,
    generateAudio: model.supportsAudio,
    imageUrls: imageUrls.length ? imageUrls : undefined,
    videoUrls: sourceVideoUrl ? [sourceVideoUrl] : undefined,
    referenceVideoUrls: referenceVideoUrls.length
      ? referenceVideoUrls
      : undefined,
    audioUrls: audioUrls.length ? audioUrls : undefined,
  };
}

/**
 * Open the Seedance task for a queued job.
 *
 * Safe to call from anywhere, and safe to call twice: the claim inside
 * `claimJobForSubmit` decides who submits, so a poll racing the request that
 * queued the job costs nothing instead of opening a second paid render.
 */
export async function submitVideoJob(jobId: string): Promise<void> {
  const job = await claimJobForSubmit(jobId);
  if (!job) return; // already submitted, or someone else is submitting it
  try {
    const { taskId } = await arkCreateVideoTask(videoRequestForJob(job));
    await attachProviderTask(job.id, taskId);
  } catch (err) {
    const message =
      err instanceof Error ? err.message : "Video submit failed";
    await markJobFailed(job.id, message);
  }
}

/**
 * Copy a finished render into our own storage and write its library row.
 *
 * HEVC clips are converted to H.264 (same resolution, CRF 14) inside
 * `persistOutputToSpaces` so Chrome can paint the picture.
 *
 * Call only with a job claimed through `claimJobForFinalize` — this is the
 * step that inserts a generation, and running it twice is how one clip ends
 * up in the Library twice.
 */
export async function finalizeVideoJob(
  job: GenerationJobRecord,
  providerUrl: string,
  usage?: { completion_tokens?: number; total_tokens?: number } | null
): Promise<void> {
  try {
    const outputUrl = await persistOutputToSpaces(
      providerUrl,
      "video",
      job.kind,
      null
    );

    const model = resolveModel(job.kind, job.tier as Tier);
    const durationS = job.duration_s != null ? Number(job.duration_s) : null;
    const input = videoJobInput(job);
    // The real, token-billed cost ModelArk charged for this task, when we
    // have the usage to compute it — falls back to the flat per-second
    // placeholder only for models this registry doesn't have confirmed
    // rates for.
    const hasVideoInput =
      Boolean(input.sourceVideoUrl?.trim()) ||
      Boolean(input.referenceVideoUrls?.some((u) => u.trim()));
    const realCost = seedanceRealCost(
      model.slug,
      input.videoResolution,
      usage?.total_tokens ?? usage?.completion_tokens ?? null,
      hasVideoInput
    );
    const cost =
      realCost ??
      (model.unit === "second" && durationS != null
        ? model.costPerUnit * durationS
        : model.costPerUnit);

    const sourceImages = videoJobSourceImages(input);
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
        source_video_generation_id: input.sourceVideoGenerationId ?? undefined,
        // The clip(s) referenced for subject/motion/style — not an edit source
        reference_video_urls: input.referenceVideoUrls?.length
          ? input.referenceVideoUrls
          : undefined,
        // The audio clip(s) the render lip-synced to
        source_audio_urls: input.sourceAudioUrls?.length
          ? input.sourceAudioUrls
          : undefined,
        video_resolution: input.videoResolution ?? undefined,
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

    await markJobCompleted(job.id, generation.id);
  } catch (err) {
    const message =
      err instanceof Error ? err.message : "Could not store the finished video";
    await markJobFailed(job.id, message);
  }
}
