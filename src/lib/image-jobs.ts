import "server-only";

import {
  GOOGLE_IMAGE_MODELS,
  asGoogleImageModel,
  asOpenAIImageModel,
  googleImageCost,
  openaiImageCost,
  type GoogleImageModelId,
  type ImageResolutionOption,
  type OpenAIImageModelId,
} from "@/config/models";
import { geminiGenerateImage, geminiModelSlug } from "@/lib/gemini-server";
import {
  openaiGenerateImage,
  openaiImageSlug,
} from "@/lib/openai-image-server";
import { insertGeneration } from "@/lib/generations-store";
import {
  claimJobForSubmit,
  markJobCompleted,
  markJobFailed,
} from "@/lib/jobs";
import { uploadPublicObject } from "@/lib/storage";
import type { GenerationJobRecord, PromptInputs } from "@/lib/types";

/**
 * The slow Gemini / OpenAI round-trip, kept off the request path.
 *
 * Nano Banana Pro and GPT Image 2 often take longer than the App Platform
 * gateway will wait, which is how a still used to surface as a 504. Routes
 * now queue a t2i job, answer immediately, and run this once the response
 * is out — same pattern as `submitVideoJob`.
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

function jobResolution(value: string | undefined): ImageResolutionOption {
  return value === "1K" || value === "2K" || value === "4K" ? value : "2K";
}

function jobSeed(value: unknown): number | null {
  return typeof value === "number" && Number.isFinite(value) ? value : null;
}

/**
 * Render a queued still job, store it, and write its library row.
 *
 * Safe to call twice: `claimJobForSubmit` decides who runs it, so a poll
 * racing the request that queued the job costs nothing instead of a second
 * paid provider call.
 */
export async function submitImageJob(jobId: string): Promise<void> {
  const job = await claimJobForSubmit(jobId);
  if (!job) return;

  const input = imageJobInput(job);
  const openaiModel = asOpenAIImageModel(input.imageModel);
  if (openaiModel) {
    await runOpenAIJob(job, input, openaiModel);
    return;
  }

  const modelId: GoogleImageModelId =
    asGoogleImageModel(input.imageModel) ?? "nano-banana";
  await runGeminiJob(job, input, modelId);
}

async function runGeminiJob(
  job: GenerationJobRecord,
  input: ImageJobInput,
  modelId: GoogleImageModelId
): Promise<void> {
  const spec = GOOGLE_IMAGE_MODELS[modelId];
  const sendImageConfig = spec.supportsImageConfig;
  const resolution = jobResolution(input.resolution);
  const seed = jobSeed(input.seed);
  const referenceUrls = (input.referenceUrls ?? []).filter(Boolean);

  const renderStart = Date.now();
  try {
    const { dataUri, model: usedSlug } = await geminiGenerateImage({
      prompt: job.final_prompt,
      imageUrls: referenceUrls.length > 0 ? referenceUrls : undefined,
      model: modelId,
      imageSize: sendImageConfig ? resolution : undefined,
      aspectRatio: sendImageConfig ? job.aspect : undefined,
    });

    const outputUrl = await persistDataUriImage(dataUri, seed);
    const cost = googleImageCost(modelId, resolution);

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

async function runOpenAIJob(
  job: GenerationJobRecord,
  input: ImageJobInput,
  modelId: OpenAIImageModelId
): Promise<void> {
  const resolution = jobResolution(input.resolution);
  const seed = jobSeed(input.seed);
  const referenceUrls = (input.referenceUrls ?? []).filter(Boolean);

  const renderStart = Date.now();
  try {
    const { dataUri, model: usedSlug } = await openaiGenerateImage({
      prompt: job.final_prompt,
      imageUrls: referenceUrls.length > 0 ? referenceUrls : undefined,
      model: modelId,
      imageSize: resolution,
      aspectRatio: job.aspect,
    });

    const outputUrl = await persistDataUriImage(dataUri, seed);
    const cost = openaiImageCost(modelId, resolution);

    const generation = await insertGeneration({
      mode: "t2i",
      tier: job.tier,
      modelEndpoint: `openai:${usedSlug}`,
      inputPayload: {
        provider: "openai",
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

export function imageJobModelEndpoint(
  modelId: GoogleImageModelId | OpenAIImageModelId
): string {
  const openai = asOpenAIImageModel(modelId);
  if (openai) return `openai:${openaiImageSlug(openai)}`;
  return `google:${geminiModelSlug(modelId as GoogleImageModelId)}`;
}
