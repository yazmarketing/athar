import { NextRequest, NextResponse } from "next/server";
import { requireCreator } from "@/lib/authz";
import { arkGenerateImage } from "@/lib/byteplus-server";
import { db } from "@/lib/db";
import {
  ensureGenerationModes,
  insertGeneration,
  persistOutputToSpaces,
} from "@/lib/generations-store";
import { BACKGROUND_REMOVE_MODEL } from "@/config/models";
import type { GenerationRecord } from "@/lib/types";

export const maxDuration = 120;

const UUID_RE =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

export async function POST(req: NextRequest) {
  const auth = await requireCreator();
  if (auth.response) return auth.response;
  const sessionUser = auth.user;

  let body: { generationId?: string };
  try {
    body = (await req.json()) as { generationId?: string };
  } catch {
    return NextResponse.json({ error: "Invalid JSON body" }, { status: 400 });
  }
  if (!body.generationId || !UUID_RE.test(body.generationId)) {
    return NextResponse.json({ error: "Invalid generationId" }, { status: 400 });
  }

  const { rows } = await db().query(
    `select * from generations where id = $1`,
    [body.generationId]
  );
  const source = rows[0] as GenerationRecord | undefined;
  if (!source?.output_url) {
    return NextResponse.json({ error: "Generation not found" }, { status: 404 });
  }
  if (
    source.mode === "t2v" ||
    source.mode === "i2v" ||
    source.output_url.includes(".mp4")
  ) {
    return NextResponse.json(
      { error: "Background removal works on still images only" },
      { status: 400 }
    );
  }

  const model = BACKGROUND_REMOVE_MODEL;
  const renderStart = Date.now();
  let providerUrl: string;
  let requestId: string | null = null;
  try {
    // Seedream edit: cut the subject out onto a clean studio-white backdrop
    const result = await arkGenerateImage({
      model: model.slug,
      prompt:
        "Remove the background completely. Keep the main subject exactly as it is — same pose, colors, lighting and details — cut out cleanly and placed on a plain solid white background. No shadows, no props, no text, nothing else in the frame.",
      size: "2K",
      seed: source.seed ?? undefined,
      image: source.output_url,
    });
    providerUrl = result.urls[0];
    requestId = result.requestId ?? null;
  } catch (err) {
    const message =
      err instanceof Error ? err.message : "Background removal failed";
    return NextResponse.json({ error: message }, { status: 502 });
  }

  const outputUrl = await persistOutputToSpaces(
    providerUrl,
    "image",
    "edit",
    source.seed
  );

  try {
    await ensureGenerationModes();
    const generation = await insertGeneration({
      mode: "edit",
      tier: source.tier,
      modelEndpoint: `${model.provider}:${model.slug}`,
      inputPayload: {
        prompt_inputs: (source.input_payload as { prompt_inputs?: unknown })
          .prompt_inputs,
        source_generation_id: source.id,
        source_image_url: source.output_url,
        tool: "remove_background",
      },
      finalPrompt: source.final_prompt,
      negativePrompt: source.negative_prompt,
      seed: source.seed,
      referenceUrls: [source.output_url],
      outputUrl,
      providerUrl,
      requestId,
      cost: model.costPerUnit,
      aspect: source.aspect,
      durationS: null,
      userId: sessionUser.id,
      projectId: source.project_id,
      brandKitId: source.brand_kit_id,
      renderMs: Date.now() - renderStart,
    });
    return NextResponse.json({ generation });
  } catch (err) {
    const message = err instanceof Error ? err.message : "unknown error";
    return NextResponse.json(
      { error: `Processed but failed to save record: ${message}` },
      { status: 500 }
    );
  }
}
