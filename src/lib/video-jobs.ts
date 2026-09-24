import "server-only";
import { videoCapabilities } from "@/config/video-capabilities";
import {
  arkCancelVideoTask,
  arkCreateVideoTask,
  type ArkVideoRequest,
} from "@/lib/byteplus-server";
import { fitVideoRequestFirstFrame } from "@/lib/fit-video-first-frame";
import { resolveModel, seedanceRealCost, SEEDANCE_PRICING_VERSION, type Tier } from "@/config/models";
import { ASPECT_TO_VIDEO_RATIO, isAspectRatio } from "@/config/aspects";
import {
  ensureGenerationModes,
  insertGeneration,
} from "@/lib/generations-store";
import { registerVerifiedVideoUrl } from "@/lib/asset-registrations";
import { persistVideoOutput, resolveOriginalVideoReferences } from "@/lib/video-originals";
import {
  attachProviderTask,
  claimJobForSubmit,
  getJob,
  markJobCompleted,
  markJobFailed,
  touchUnsubmittedJob,
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
  generateAudio?: boolean;
  videoIntent?: "edit" | "extend" | "vary";
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
  // Preserve versioned endpoints; legacy records may only say byteplus:seedance.
  const storedSlug = job.model_endpoint.replace(/^byteplus:/, "");
  const modelSlug = /^dreamina-seedance-/.test(storedSlug) ? storedSlug : model.slug;
  const imageUrls = videoJobSourceImages(input);
  const sourceVideoUrl = input.sourceVideoUrl?.trim() || null;
  // Seedance 2.5 accepts up to 10 reference video clips (30s combined) —
  // same ceiling as reference audio.
  const referenceVideoUrls = (input.referenceVideoUrls ?? [])
    .map((u) => u.trim())
    .filter(Boolean);
  // Seedance 2.5 accepts up to 10 reference audio clips (30s combined).
  const audioUrls = (input.sourceAudioUrls ?? [])
    .map((u) => u.trim())
    .filter(Boolean);
  const limits = videoCapabilities(modelSlug.includes("mini") ? "draft" : "standard");
  if (imageUrls.length > limits.maxImages || referenceVideoUrls.length > limits.maxVideos || audioUrls.length > limits.maxAudios) {
    throw new Error(`Too many references for this model (${limits.maxImages} images, ${limits.maxVideos} videos, ${limits.maxAudios} audio clips maximum). Remove extras and start a new render; references have not been discarded.`);
  }

  // 1080p is a Seedance 2.5 capability; the 2.0 Mini behind the draft tier
  // doesn't offer it. Clamp rather than fail — the person asked for a clip.
  const requested = input.videoResolution;
  const resolution: "480p" | "720p" | "1080p" =
    requested === "480p"
      ? "480p"
      : requested === "1080p" && modelSlug.includes("seedance-2-5")
        ? "1080p"
        : "720p";

  const stored = job.duration_s != null ? Number(job.duration_s) : NaN;
  const duration = Math.min(
    Math.max(Number.isFinite(stored) ? stored : 5, 4),
    model.maxDuration || 30
  );

  return {
    model: modelSlug,
    prompt: job.final_prompt,
    negativePrompt: job.negative_prompt || undefined,
    ratio: isAspectRatio(job.aspect)
      ? ASPECT_TO_VIDEO_RATIO[job.aspect]
      : "16:9",
    resolution,
    duration,
    generateAudio: model.supportsAudio && (input.generateAudio ?? true),
    taskType: sourceVideoUrl ? (input.videoIntent === "extend" ? "extend" : "edit") : undefined,
    imageUrls: imageUrls.length ? imageUrls : undefined,
    videoUrls: sourceVideoUrl ? [sourceVideoUrl] : undefined,
    referenceVideoUrls: referenceVideoUrls.length
      ? referenceVideoUrls
      : undefined,
    audioUrls: audioUrls.length ? audioUrls : undefined,
  };
}

/** Register each clip and keep only the BytePlus asset id for Seedance. */
async function verifyVideoUrls(urls: string[] | undefined, label: string) {
  if (!urls?.length) return urls;
  const verified: string[] = [];
  for (const [index, url] of urls.entries()) {
    verified.push(await registerVerifiedVideoUrl(url, `${label} ${index + 1}`));
  }
  return verified;
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
  const beat = setInterval(() => {
    void touchUnsubmittedJob(job.id);
  }, 30_000);
  try {
    const prepared = await fitVideoRequestFirstFrame(
      await resolveOriginalVideoReferences(videoRequestForJob(job))
    );
    const req = {
      ...prepared,
      videoUrls: await verifyVideoUrls(prepared.videoUrls, "Edit source"),
      referenceVideoUrls: await verifyVideoUrls(
        prepared.referenceVideoUrls,
        "Reference video"
      ),
    };
    const { taskId } = await arkCreateVideoTask(req);
    await attachProviderTask(job.id, taskId);
    // Cancelled while we were talking to Seedance — drop the paid task.
    const latest = await getJob(job.id);
    if (latest?.status === "cancelled") {
      await arkCancelVideoTask(taskId).catch(() => {});
    }
  } catch (err) {
    const message =
      err instanceof Error ? err.message : "Video submit failed";
    await markJobFailed(job.id, message);
  } finally {
    clearInterval(beat);
  }
}

/**
 * Copy a finished render into our own storage and write its library row.
 *
 * Keep the untouched provider original for subsequent references and a
 * separate browser-compatible copy for playback.
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
    const latest = await getJob(job.id);
    if (!latest || latest.status === "cancelled") return;

    let outputUrl = providerUrl;
    let originalUrl: string | null = null;
    try {
      const saved = await persistVideoOutput(providerUrl, job.id);
      outputUrl = saved.outputUrl;
      originalUrl = saved.originalUrl;
    } catch (err) {
      const timedOut = err instanceof Error && /took too long to copy|aborted due to timeout/i.test(err.message);
      if (!timedOut) throw err;
      console.error("Could not copy finished video; keeping the provider URL", job.id, err);
    }

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

    const stillActive = await getJob(job.id);
    if (!stillActive || stillActive.status === "cancelled") return;

    const generation = await insertGeneration({
      mode: job.kind,
      tier: job.tier,
      modelEndpoint: job.model_endpoint,
      inputPayload: {
        prompt_inputs: input.prompt,
        duration_s: durationS,
        job_id: job.id,
        provider_task_id: job.provider_task_id,
        original_video_url: originalUrl,
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
        generate_audio: input.generateAudio ?? true,
        video_intent: input.videoIntent,
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
      providerTokens: usage?.total_tokens ?? usage?.completion_tokens ?? null,
      resolution: input.videoResolution ?? "720p",
      hasVideoInput,
      pricingVersion: SEEDANCE_PRICING_VERSION,
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
