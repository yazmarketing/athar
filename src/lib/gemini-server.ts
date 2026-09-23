import "server-only";
import { compileImageInstructions } from "@/lib/image-instructions";

import {
  GOOGLE_IMAGE_MODELS,
  type GoogleImageModelId,
} from "@/config/models";

/**
 * Google Gemini image generation — "Nano Banana" (gemini-2.5-flash-image),
 * "Nano Banana 2" (gemini-3.1-flash-image) and "Nano Banana Pro"
 * (Gemini 3 Pro Image). SERVER ONLY. Key from GEMINI_API_KEY. Returns a
 * data URI so it flows through the same persistOutput path as BytePlus
 * outputs.
 *
 * Docs: https://ai.google.dev/gemini-api/docs/image-generation
 */

const GEMINI_BASE =
  process.env.GEMINI_BASE_URL ??
  "https://generativelanguage.googleapis.com/v1beta";

/**
 * Published ids, overridable per model without a deploy — Google renames these
 * when a preview goes GA (Pro is still served as ...-preview as of Aug 2026).
 */
export const NANO_BANANA_MODEL =
  process.env.GEMINI_IMAGE_MODEL?.trim() ||
  GOOGLE_IMAGE_MODELS["nano-banana"].defaultSlug;

export const NANO_BANANA_PRO_MODEL =
  process.env.GEMINI_PRO_IMAGE_MODEL?.trim() ||
  GOOGLE_IMAGE_MODELS["nano-banana-pro"].defaultSlug;

export const NANO_BANANA_2_MODEL =
  process.env.GEMINI_NANO2_IMAGE_MODEL?.trim() ||
  GOOGLE_IMAGE_MODELS["nano-banana-2"].defaultSlug;

export function geminiModelSlug(id: GoogleImageModelId): string {
  if (id === "nano-banana-pro") return NANO_BANANA_PRO_MODEL;
  if (id === "nano-banana-2") return NANO_BANANA_2_MODEL;
  return NANO_BANANA_MODEL;
}

export function geminiConfigured(): boolean {
  return Boolean(process.env.GEMINI_API_KEY?.trim());
}

type GeminiPart =
  | { text: string }
  | { inlineData: { mimeType: string; data: string } };

type ImageConfig = { imageSize?: string; aspectRatio?: string };

async function urlToInlinePart(url: string, index: number): Promise<GeminiPart> {
  try {
    const res = await fetch(url, { signal: AbortSignal.timeout(30_000) });
    if (!res.ok) throw new Error(`HTTP ${res.status}`);
    const mimeType = res.headers.get("content-type") ?? "image/png";
    const buf = Buffer.from(await res.arrayBuffer());
    // Gemini inline data is ~4/3 this size. A 29MB PNG would OOM the
    // 1 GiB instance and exceed the provider request cap.
    if (buf.byteLength > 12_000_000) {
      throw new Error(
        "Reference image is too large for Nano Banana (max about 12MB). Compress the PNG and retry."
      );
    }
    const data = buf.toString("base64");
    return { inlineData: { mimeType, data } };
  } catch (err) {
    throw new Error(`Reference image ${index + 1} could not be loaded. Re-upload it before generating. ${err instanceof Error ? err.message : "Download failed"}`);
  }
}

async function callGemini(
  key: string,
  model: string,
  parts: GeminiPart[],
  imageConfig: ImageConfig | null
) {
  return fetch(
    `${GEMINI_BASE}/models/${model}:generateContent?key=${encodeURIComponent(
      key
    )}`,
    {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        contents: [{ role: "user", parts }],
        ...(imageConfig
          ? {
              generationConfig: {
                // Without this, Gemini 3 image models often ignore imageConfig
                // and fall back to a cinematic 21:9 frame.
                responseModalities: ["TEXT", "IMAGE"],
                imageConfig,
              },
            }
          : {}),
      }),
    }
  );
}

async function errorDetail(res: Response): Promise<string> {
  try {
    const body = (await res.json()) as { error?: { message?: string } };
    return body.error?.message ?? "";
  } catch {
    return await res.text().catch(() => "");
  }
}

/** Generate (or edit, when reference images are supplied) an image. */
export async function geminiGenerateImage(opts: {
  prompt: string;
  negativePrompt?: string;
  imageUrls?: string[];
  /** Which Gemini image model to route to. Defaults to Nano Banana. */
  model?: GoogleImageModelId;
  /** "1K" | "2K" | "4K" — sent when the model supports imageConfig. */
  imageSize?: string;
  /** e.g. "16:9" — sent when the model supports imageConfig. */
  aspectRatio?: string;
}): Promise<{ dataUri: string; mimeType: string; model: string }> {
  const key = process.env.GEMINI_API_KEY?.trim();
  if (!key) throw new Error("Missing GEMINI_API_KEY env var");

  const modelId: GoogleImageModelId = opts.model ?? "nano-banana";
  const model = geminiModelSlug(modelId);
  const label = GOOGLE_IMAGE_MODELS[modelId].label;

  const parts: GeminiPart[] = [{ text: compileImageInstructions(opts.prompt, opts.negativePrompt) }];
  for (const [index, url] of (opts.imageUrls ?? []).entries()) {
    parts.push(await urlToInlinePart(url, index));
  }

  // Preserve requested output settings. A rejected configuration must be visible.
  const imageConfig: ImageConfig | null =
    opts.imageSize || opts.aspectRatio
      ? {
          ...(opts.imageSize ? { imageSize: opts.imageSize } : {}),
          ...(opts.aspectRatio ? { aspectRatio: opts.aspectRatio } : {}),
        }
      : null;

  const res = await callGemini(key, model, parts, imageConfig);

  if (!res.ok) {
    const detail = await errorDetail(res);
    throw new Error(`Gemini ${res.status}: ${detail.slice(0, 300)}`);
  }

  const json = (await res.json()) as {
    candidates?: {
      content?: { parts?: { inlineData?: { mimeType: string; data: string } }[] };
    }[];
  };
  const outParts = json.candidates?.[0]?.content?.parts ?? [];
  const image = outParts.find((p) => p.inlineData?.data)?.inlineData;
  if (!image) {
    throw new Error(`${label} returned no image — try rephrasing the prompt`);
  }
  return {
    dataUri: `data:${image.mimeType};base64,${image.data}`,
    mimeType: image.mimeType,
    model,
  };
}
