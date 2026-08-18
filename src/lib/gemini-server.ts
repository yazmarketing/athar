import "server-only";

import {
  GOOGLE_IMAGE_MODELS,
  type GoogleImageModelId,
} from "@/config/models";

/**
 * Google Gemini image generation — "Nano Banana" (gemini-2.5-flash-image) and
 * "Nano Banana Pro" (Gemini 3 Pro Image). SERVER ONLY. Key from
 * GEMINI_API_KEY. Returns a data URI so it flows through the same
 * persistOutput path as BytePlus outputs.
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

export function geminiModelSlug(id: GoogleImageModelId): string {
  return id === "nano-banana-pro" ? NANO_BANANA_PRO_MODEL : NANO_BANANA_MODEL;
}

export function geminiConfigured(): boolean {
  return Boolean(process.env.GEMINI_API_KEY?.trim());
}

type GeminiPart =
  | { text: string }
  | { inlineData: { mimeType: string; data: string } };

type ImageConfig = { imageSize?: string; aspectRatio?: string };

async function urlToInlinePart(url: string): Promise<GeminiPart | null> {
  try {
    const res = await fetch(url);
    if (!res.ok) return null;
    const mimeType = res.headers.get("content-type") ?? "image/png";
    const data = Buffer.from(await res.arrayBuffer()).toString("base64");
    return { inlineData: { mimeType, data } };
  } catch {
    return null;
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
        ...(imageConfig ? { generationConfig: { imageConfig } } : {}),
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
  imageUrls?: string[];
  /** Which Gemini image model to route to. Defaults to Nano Banana. */
  model?: GoogleImageModelId;
  /** Pro only — "1K" | "2K" | "4K". Ignored by models without imageConfig. */
  imageSize?: string;
  /** Pro only — e.g. "16:9". */
  aspectRatio?: string;
}): Promise<{ dataUri: string; mimeType: string; model: string }> {
  const key = process.env.GEMINI_API_KEY?.trim();
  if (!key) throw new Error("Missing GEMINI_API_KEY env var");

  const modelId: GoogleImageModelId = opts.model ?? "nano-banana";
  const model = geminiModelSlug(modelId);
  const label = GOOGLE_IMAGE_MODELS[modelId].label;

  const parts: GeminiPart[] = [{ text: opts.prompt }];
  for (const url of opts.imageUrls ?? []) {
    const part = await urlToInlinePart(url);
    if (part) parts.push(part);
  }

  // Size/aspect are only sent when asked for. Gemini rejects the whole request
  // on an unknown generationConfig field, so a rejected imageConfig is retried
  // once without it rather than failing a render the model could have done.
  const imageConfig: ImageConfig | null =
    opts.imageSize || opts.aspectRatio
      ? {
          ...(opts.imageSize ? { imageSize: opts.imageSize } : {}),
          ...(opts.aspectRatio ? { aspectRatio: opts.aspectRatio } : {}),
        }
      : null;

  let res = await callGemini(key, model, parts, imageConfig);
  if (!res.ok && imageConfig && res.status === 400) {
    const detail = await errorDetail(res);
    if (/image_?config|image_?size|aspect_?ratio/i.test(detail)) {
      res = await callGemini(key, model, parts, null);
    } else {
      throw new Error(`Gemini ${400}: ${detail.slice(0, 300)}`);
    }
  }

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
