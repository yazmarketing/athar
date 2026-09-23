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
import { fetchResizeSource, resizeImage } from "@/lib/resize-image";
import { uploadPublicObject } from "@/lib/storage";
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
  mode?: UpscaleMode | "resize";
  /** Resize: exact multiplier. AI redraws: legacy 2/4 values mean 2K/4K. */
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

  if (body.mode !== undefined && !["resize", "precision", "creative"].includes(body.mode)) {
    return NextResponse.json({ error: "Choose Resize, Conservative redraw, or Creative redraw." }, { status: 400 });
  }
  if (body.scale !== undefined && body.scale !== 2 && body.scale !== 4) {
    return NextResponse.json({ error: "Choose a scale of 2 or 4." }, { status: 400 });
  }
  const mode = body.mode ?? "resize";
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

  const model = mode === "resize" ? null : UPSCALE_MODELS[mode];

  const renderStart = Date.now();
  let providerUrl: string | null = null;
  let outputUrl: string;
  let dimensions: { width: number; height: number } | undefined;
  let requestId: string | null = null;
  try {
    if (mode === "resize") {
      const resized = await resizeImage(await fetchResizeSource(sourceImage), scale);
      dimensions = { width: resized.width, height: resized.height };
      outputUrl = await uploadPublicObject(`upscale/${crypto.randomUUID()}.png`, new Uint8Array(resized.data).buffer, "image/png");
    } else {
      const result = await arkGenerateImage({
        model: UPSCALE_MODELS[mode].slug,
        prompt: mode === "creative" ? CREATIVE_PROMPT : PRECISION_PROMPT,
        // AI redraws target a resolution level, not a multiplier of the source.
        size: scale === 4 ? "4K" : "2K",
        seed: seed ?? undefined,
        image: sourceImage,
      });
      providerUrl = result.urls[0];
      requestId = result.requestId ?? null;
      outputUrl = await persistOutputToSpaces(providerUrl, "image", "upscale", seed);
    }
  } catch (err) {
    const message = err instanceof Error ? err.message : "Upscale failed";
    return NextResponse.json({ error: message }, { status: 502 });
  }

  try {
    await ensureGenerationModes();
    const generation = await insertGeneration({
      mode: "upscale",
      tier,
      modelEndpoint: model ? `${model.provider}:${model.slug}` : "local:lanczos3",
      inputPayload: {
        prompt_inputs: promptInputs,
        source_generation_id: source?.id,
        source_image_url: sourceImage,
        source_reference_asset_id: referenceAssetId,
        upscale: { mode, ...(mode === "resize" ? { scale } : { targetResolution: `${scale}K` }), ...dimensions },
        provider_prompt: mode === "resize" ? null : mode === "creative" ? CREATIVE_PROMPT : PRECISION_PROMPT,
      },
      finalPrompt,
      negativePrompt,
      seed: mode === "resize" ? null : seed,
      referenceUrls: [sourceImage],
      outputUrl,
      providerUrl,
      requestId,
      cost: model?.costPerUnit ?? 0,
      aspect,
      durationS: null,
      userId: sessionUser.id,
      projectId,
      brandKitId,
      renderMs: Date.now() - renderStart,
      resolution: dimensions ? `${dimensions.width}×${dimensions.height}` : `${scale}K`,
    });

    if (referenceAssetId) {
      try {
        await addReferenceVersion(
          referenceAssetId,
          outputUrl,
          mode === "resize" ? `Resized ${scale}× without AI` : `AI redraw at ${scale}K (${mode}) — review details before use`
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
