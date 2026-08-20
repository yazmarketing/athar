import "server-only";

import {
  GOOGLE_IMAGE_MODELS,
  asGoogleImageModel,
  type GoogleImageModelId,
} from "@/config/models";
import { geminiGenerateImage, geminiModelSlug } from "@/lib/gemini-server";
import { insertGeneration } from "@/lib/generations-store";
import {
  claimJobForSubmit,
  markJobCompleted,
  markJobFailed,
} from "@/lib/jobs";
import { uploadPublicObject } from "@/lib/storage";
import type { GenerationJobRecord, PromptInputs } from "@/lib/types";

/**
 * The slow Gemini round-trip, kept off the request path.
 *
 * Nano Banana Pro often takes longer than the App Platform gateway will wait,
 * which is how a still used to surface as a 504. Routes now queue a t2i job,
 * answer immediately, and run this once the response is out — same pattern
 * as `submitVideoJob`.
 */

type ImageJobInput = {
  prompt?: PromptInputs;
  imageModel?: string;
  resolution?: string;
  seed?: number;
  referenceUrls?: string[] | null;
};

export function imageJobInput(job: GenerationJobRecord): ImageJobInput {
  return (job.input ?? {}) as ImageJobInput;
}

async function persistDataUriImage(
  dataUri: string,
  seed: number | null
): Promise<string> {
  const res = await fetch(dataUri);
  const blob = await res.arrayBuffer();
  const contentType = res.headers.get("content-type") ?? "image/png";
  const ext = contentType.includes("webp")
    ? "webp"
    : contentType.includes("jpeg")
      ? "jpg"
      : "png";
  const path = `t2i/${Date.now()}-${seed ?? "v"}.${ext}`;
  return uploadPublicObject(path, blob, contentType);
}

/**
 * Render a queued Nano Banana job, store the still, and write its library row.
 *
 * Safe to call twice: `claimJobForSubmit` decides who runs it, so a poll
 * racing the request that queued the job costs nothing instead of a second
 * paid Gemini call.
 */
export async function submitImageJob(jobId: string): Promise<void> {
  const job = await claimJobForSubmit(jobId);
  if (!job) return;

  const input = imageJobInput(job);
  const modelId: GoogleImageModelId =
    asGoogleImageModel(input.imageModel) ?? "nano-banana";
  const spec = GOOGLE_IMAGE_MODELS[modelId];
  const isPro = modelId === "nano-banana-pro";
  const resolution =
    input.resolution === "1K" ||
    input.resolution === "2K" ||
    input.resolution === "4K"
      ? input.resolution
      : "2K";
  const seed =
    typeof input.seed === "number" && Number.isFinite(input.seed)
      ? input.seed
      : null;
  const referenceUrls = (input.referenceUrls ?? []).filter(Boolean);

  const renderStart = Date.now();
  try {
    const { dataUri, model: usedSlug } = await geminiGenerateImage({
      prompt: job.final_prompt,
      imageUrls: referenceUrls.length > 0 ? referenceUrls : undefined,
      model: modelId,
      imageSize: isPro ? resolution : undefined,
      aspectRatio: isPro ? job.aspect : undefined,
    });

    const outputUrl = await persistDataUriImage(dataUri, seed);
    const cost =
      isPro && resolution === "4K"
        ? (spec.costPerImage4K ?? spec.costPerImage)
        : spec.costPerImage;

    const generation = await insertGeneration({
      mode: "t2i",
      tier: job.tier,
      modelEndpoint: `google:${usedSlug}`,
      inputPayload: {
        provider: "google",
        model: usedSlug,
        prompt_inputs: input.prompt,
        job_id: job.id,
        is_edit: referenceUrls.length > 0,
        resolution,
      },
      finalPrompt: job.final_prompt,
      negativePrompt: job.negative_prompt,
      seed,
      referenceUrls,
      outputUrl,
      providerUrl: null,
      requestId: null,
      cost,
      aspect: job.aspect,
      durationS: null,
      userId: job.user_id,
      projectId: job.project_id,
      brandKitId: job.brand_kit_id,
      renderMs: Date.now() - renderStart,
    });

    await markJobCompleted(job.id, generation.id);
  } catch (err) {
    const message =
      err instanceof Error ? err.message : "Image generation failed";
    await markJobFailed(job.id, message);
  }
}

export function imageJobModelEndpoint(modelId: GoogleImageModelId): string {
  return `google:${geminiModelSlug(modelId)}`;
}
