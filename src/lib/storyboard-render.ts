import "server-only";
import { arkGenerateImage } from "@/lib/byteplus-server";
import { geminiConfigured, geminiGenerateImage } from "@/lib/gemini-server";
import {
  openaiConfigured,
  openaiContinuityCheck,
} from "@/lib/openai-server";
import {
  ensureGenerationModes,
  insertGeneration,
  persistOutputToSpaces,
} from "@/lib/generations-store";
import {
  GOOGLE_IMAGE_MODELS,
  resolveModel,
  type GoogleImageModelId,
} from "@/config/models";

/**
 * Rendering one storyboard image.
 *
 * Panels are the one place where the model choice genuinely decides the
 * outcome: a panel carries several reference sheets at once — two characters
 * plus a location plus a style plate — and holding all of them together is
 * what Nano Banana Pro is for. Seedream is the fallback when no Google key is
 * configured; it fuses fewer references, so boards drift more, but a board
 * that renders beats a board that errors.
 */

const PRO: GoogleImageModelId = "nano-banana-pro";

const ASPECT_TO_ARK_SIZE: Record<string, string> = {
  "16:9": "2560x1440",
  "9:16": "1440x2560",
  "1:1": "2048x2048",
  "4:5": "1728x2160",
  "21:9": "2944x1264",
};

export type RenderedImage = {
  outputUrl: string;
  modelEndpoint: string;
  cost: number;
  seed: number | null;
  /** The Library row this render produced, for panel lineage. */
  generationId: string;
};

/**
 * Render one image against a set of reference sheets and store it.
 *
 * Everything lands in the Library like any other generation, so a panel is
 * a first-class asset — searchable, shareable, and re-usable as a reference
 * for the next thing.
 */
export async function renderStoryboardImage(input: {
  prompt: string;
  referenceUrls: string[];
  aspect: string;
  seed: number | null;
  /** Stamped on the Library row so a panel's origin is legible later. */
  payload: Record<string, unknown>;
  userId: string | null;
  projectId: string | null;
  brandKitId: string | null;
}): Promise<RenderedImage> {
  const renderStart = Date.now();
  const useGoogle = geminiConfigured();

  let providerUrl: string;
  let modelEndpoint: string;
  let cost: number;
  let requestId: string | null = null;

  if (useGoogle) {
    const spec = GOOGLE_IMAGE_MODELS[PRO];
    const { dataUri, model } = await geminiGenerateImage({
      prompt: input.prompt,
      imageUrls: input.referenceUrls.length ? input.referenceUrls : undefined,
      model: PRO,
      imageSize: "2K",
      aspectRatio: input.aspect,
    });
    providerUrl = dataUri;
    modelEndpoint = `google:${model}`;
    cost = spec.costPerImage;
  } else {
    const model = resolveModel("t2i", "hero");
    const result = await arkGenerateImage({
      model: model.slug,
      prompt: input.prompt,
      size: ASPECT_TO_ARK_SIZE[input.aspect] ?? ASPECT_TO_ARK_SIZE["16:9"],
      seed: input.seed ?? undefined,
      // Seedream takes a single reference; the sheet most specific to the
      // frame is the one worth spending it on.
      image: input.referenceUrls[0],
    });
    providerUrl = result.urls[0];
    modelEndpoint = `${model.provider}:${model.slug}`;
    cost = model.costPerUnit;
    requestId = result.requestId ?? null;
  }

  const outputUrl = await persistOutputToSpaces(
    providerUrl,
    "image",
    "storyboard",
    input.seed
  );

  // Gemini hands the image back inline as a data URI — that is the payload,
  // not a reference, and it must never be stored or returned.
  const inline = providerUrl.startsWith("data:");
  if (inline && outputUrl === providerUrl) {
    throw new Error("Could not store the rendered panel");
  }

  await ensureGenerationModes();
  const generation = await insertGeneration({
    mode: "t2i",
    tier: "hero",
    modelEndpoint,
    inputPayload: { ...input.payload, tool: "storyboard" },
    finalPrompt: input.prompt,
    negativePrompt: "",
    seed: input.seed,
    referenceUrls: input.referenceUrls,
    outputUrl,
    providerUrl: inline ? null : providerUrl,
    requestId,
    cost,
    aspect: input.aspect,
    durationS: null,
    userId: input.userId,
    projectId: input.projectId,
    brandKitId: input.brandKitId,
    renderMs: Date.now() - renderStart,
  });

  return {
    outputUrl,
    modelEndpoint,
    cost,
    seed: input.seed,
    generationId: generation.id,
  };
}

export type ContinuityVerdict = {
  score: number;
  notes: string;
};

/**
 * Does this panel actually match the bible?
 *
 * Returns null when no vision model is configured — a board without checking
 * is still a board, so this never blocks a render. The threshold lives with
 * the caller, which decides whether to retry or flag.
 */
export async function checkContinuity(input: {
  panelUrl: string;
  referenceUrls: string[];
  expectation: string;
}): Promise<ContinuityVerdict | null> {
  if (!openaiConfigured()) return null;
  if (input.referenceUrls.length === 0) return null;
  try {
    return await openaiContinuityCheck(input);
  } catch {
    // Checking is advisory — never fail a rendered panel over it.
    return null;
  }
}
