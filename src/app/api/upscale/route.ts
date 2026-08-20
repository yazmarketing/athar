import { NextRequest, NextResponse } from "next/server";
import { requireCreator } from "@/lib/authz";
import { arkGenerateImage } from "@/lib/byteplus-server";
import { db } from "@/lib/db";
import {
  ensureGenerationModes,
  insertGeneration,
  persistOutputToSpaces,
} from "@/lib/generations-store";
import { addReferenceVersion } from "@/lib/reference-assets";
import { UPSCALE_MODELS, type UpscaleMode, type Tier } from "@/config/models";
import type { GenerationRecord } from "@/lib/types";

export const maxDuration = 300;

const UUID_RE =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

type UpscaleRequest = {
  generationId?: string;
  /** Public image URL — used when upscaling an uploaded Assets photo. */
  imageUrl?: string;
  name?: string;
  projectId?: string | null;
  /** If set, the Assets card is bumped to this upscaled file as a new version. */
  referenceAssetId?: string;
  mode?: UpscaleMode;
  /** Upscale factor, 2 or 4 (2 → 2K render, 4 → 4K render) */
  scale?: number;
};

/**
 * Seedream has no dedicated upscaler, so we re-render the image through
 * image-to-image at a higher resolution level (2K/4K) with a prompt that
 * pins the content. Creative allows richer texture; precision asks for a
 * strict reproduction.
 */
const CREATIVE_PROMPT =
  "Upscale this image to a higher resolution. Keep the exact same composition, subject, framing, colors and lighting while enhancing fine detail, texture and sharpness. Do not add, remove or move any objects.";
const PRECISION_PROMPT =
  "Reproduce this exact image at a higher resolution. Identical composition, subject, framing, colors, lighting and details. No reinterpretation, no new elements, no style changes.";

function isHttpUrl(value: string): boolean {
  try {
    const url = new URL(value);
    return url.protocol === "http:" || url.protocol === "https:";
  } catch {
    return false;
  }
}

export async function POST(req: NextRequest) {
  const auth = await requireCreator();
  if (auth.response) return auth.response;
  const sessionUser = auth.user;

  let body: UpscaleRequest;
  try {
    body = (await req.json()) as UpscaleRequest;
  } catch {
    return NextResponse.json({ error: "Invalid JSON body" }, { status: 400 });
  }

  const mode: UpscaleMode = body.mode === "precision" ? "precision" : "creative";
  const scale = body.scale === 4 ? 4 : 2;

  let sourceImage: string;
  let source: GenerationRecord | null = null;
  let finalPrompt: string;
  let negativePrompt = "";
  let seed: number | null = null;
  let aspect = "1:1";
  let tier: Tier = "hero";
  let projectId: string | null = null;
  let brandKitId: string | null = null;
  let promptInputs: unknown;

  if (body.generationId) {
    if (!UUID_RE.test(body.generationId)) {
      return NextResponse.json({ error: "Invalid generationId" }, { status: 400 });
    }
    const { rows } = await db().query(
      `select * from generations where id = $1`,
      [body.generationId]
    );
    source = (rows[0] as GenerationRecord | undefined) ?? null;
    if (!source) {
      return NextResponse.json({ error: "Generation not found" }, { status: 404 });
    }
    if (!source.output_url) {
      return NextResponse.json({ error: "Source has no output" }, { status: 400 });
    }
    if (
      source.mode === "t2v" ||
      source.mode === "i2v" ||
      source.output_url.includes(".mp4")
    ) {
      return NextResponse.json(
        { error: "Upscale works on still images only" },
        { status: 400 }
      );
    }
    sourceImage = source.output_url;
    finalPrompt = source.final_prompt;
    negativePrompt = source.negative_prompt;
    seed = source.seed;
    aspect = source.aspect;
    tier = source.tier;
    projectId = source.project_id;
    brandKitId = source.brand_kit_id;
    promptInputs = (source.input_payload as { prompt_inputs?: unknown })
      .prompt_inputs;
  } else if (body.imageUrl?.trim()) {
    sourceImage = body.imageUrl.trim();
    if (!isHttpUrl(sourceImage)) {
      return NextResponse.json({ error: "Invalid imageUrl" }, { status: 400 });
    }
    finalPrompt = body.name?.trim() || "Upscale uploaded image";
    if (body.projectId && UUID_RE.test(body.projectId)) {
      projectId = body.projectId;
    }
  } else {
    return NextResponse.json(
      { error: "Provide generationId or imageUrl" },
      { status: 400 }
    );
  }

  const referenceAssetId =
    body.referenceAssetId && UUID_RE.test(body.referenceAssetId)
      ? body.referenceAssetId
      : null;

  const model = UPSCALE_MODELS[mode];

  const renderStart = Date.now();
  let providerUrl: string;
  let requestId: string | null = null;
  try {
    const result = await arkGenerateImage({
      model: model.slug,
      prompt: mode === "creative" ? CREATIVE_PROMPT : PRECISION_PROMPT,
      // Resolution level: 2× → 2K, 4× → 4K (Seedream renders at that level)
      size: scale === 4 ? "4K" : "2K",
      seed: seed ?? undefined,
      image: sourceImage,
    });
    providerUrl = result.urls[0];
    requestId = result.requestId ?? null;
  } catch (err) {
    const message = err instanceof Error ? err.message : "Upscale failed";
    return NextResponse.json({ error: message }, { status: 502 });
  }

  const outputUrl = await persistOutputToSpaces(
    providerUrl,
    "image",
    "upscale",
    seed
  );

  try {
    await ensureGenerationModes();
    const generation = await insertGeneration({
      mode: "upscale",
      tier,
      modelEndpoint: `${model.provider}:${model.slug}`,
      inputPayload: {
        prompt_inputs: promptInputs,
        source_generation_id: source?.id,
        source_image_url: sourceImage,
        source_reference_asset_id: referenceAssetId,
        upscale: { mode, scale },
      },
      finalPrompt,
      negativePrompt,
      seed,
      referenceUrls: [sourceImage],
      outputUrl,
      providerUrl,
      requestId,
      cost: model.costPerUnit,
      aspect,
      durationS: null,
      userId: sessionUser.id,
      projectId,
      brandKitId,
      renderMs: Date.now() - renderStart,
    });

    if (referenceAssetId) {
      try {
        await addReferenceVersion(
          referenceAssetId,
          outputUrl,
          `Upscaled ${scale}× (${mode})`
        );
      } catch {
        // Library row is already saved — don't fail the request if versioning misses.
      }
    }

    return NextResponse.json({ generation });
  } catch (err) {
    const message = err instanceof Error ? err.message : "unknown error";
    return NextResponse.json(
      { error: `Upscaled but failed to save record: ${message}` },
      { status: 500 }
    );
  }
}
