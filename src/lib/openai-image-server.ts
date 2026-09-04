import "server-only";

import { OPENAI_IMAGE_MODELS, type OpenAIImageModelId } from "@/config/models";
import { isAspectRatio, openaiSizeFor } from "@/config/aspects";
import type { AspectRatio } from "@/lib/types";

/**
 * OpenAI GPT Image 2 — text-to-image and image edits. SERVER ONLY.
 * Key from OPENAI_API_KEY (the same one chat/Whisper already use).
 * Returns a data URI so it flows through persistDataUriImage like Gemini.
 *
 * Docs: https://developers.openai.com/api/docs/models/gpt-image-2
 */

const OPENAI_BASE = process.env.OPENAI_BASE_URL ?? "https://api.openai.com/v1";

export const GPT_IMAGE_2_MODEL =
  process.env.OPENAI_IMAGE_MODEL?.trim() ||
  OPENAI_IMAGE_MODELS["gpt-image-2"].defaultSlug;

export function openaiImageSlug(_id: OpenAIImageModelId = "gpt-image-2"): string {
  return GPT_IMAGE_2_MODEL;
}

function openaiKey(): string {
  const key = process.env.OPENAI_API_KEY?.trim();
  if (!key) throw new Error("Missing OPENAI_API_KEY env var");
  return key;
}

type OpenAIImageResponse = {
  data?: { b64_json?: string; url?: string }[];
  error?: { message?: string };
};

async function errorDetail(res: Response): Promise<string> {
  try {
    const body = (await res.json()) as { error?: { message?: string } };
    return body.error?.message ?? "";
  } catch {
    return await res.text().catch(() => "");
  }
}

function asDataUri(json: OpenAIImageResponse, label: string): string {
  const item = json.data?.[0];
  if (item?.b64_json) return `data:image/png;base64,${item.b64_json}`;
  if (item?.url) return item.url;
  throw new Error(`${label} returned no image — try rephrasing the prompt`);
}

async function urlToBlob(url: string): Promise<Blob> {
  const res = await fetch(url);
  if (!res.ok) {
    throw new Error(`Could not fetch reference image (${res.status})`);
  }
  const buf = Buffer.from(await res.arrayBuffer());
  if (buf.byteLength > 25_000_000) {
    throw new Error(
      "Reference image is too large for GPT Image 2 (max about 25MB). Compress the PNG and retry."
    );
  }
  const mimeType = res.headers.get("content-type") ?? "image/png";
  return new Blob([buf], { type: mimeType.split(";")[0] });
}

function aspectOf(value: string | undefined): AspectRatio {
  return isAspectRatio(value) ? value : "16:9";
}

/** Generate (or edit, when reference images are supplied) an image. */
export async function openaiGenerateImage(opts: {
  prompt: string;
  imageUrls?: string[];
  model?: OpenAIImageModelId;
  imageSize?: "1K" | "2K" | "4K";
  aspectRatio?: string;
}): Promise<{ dataUri: string; mimeType: string; model: string }> {
  const key = openaiKey();
  const modelId: OpenAIImageModelId = opts.model ?? "gpt-image-2";
  const model = openaiImageSlug(modelId);
  const label = OPENAI_IMAGE_MODELS[modelId].label;
  const size = openaiSizeFor(
    aspectOf(opts.aspectRatio),
    opts.imageSize ?? "2K"
  );
  const refs = (opts.imageUrls ?? []).filter(Boolean);

  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), 240_000);

  try {
    let res: Response;
    if (refs.length > 0) {
      const form = new FormData();
      form.append("model", model);
      form.append("prompt", opts.prompt);
      form.append("size", size);
      form.append("quality", "high");
      for (let i = 0; i < refs.length; i++) {
        const blob = await urlToBlob(refs[i]);
        const ext = blob.type.includes("jpeg")
          ? "jpg"
          : blob.type.includes("webp")
            ? "webp"
            : "png";
        form.append("image", blob, `reference-${i + 1}.${ext}`);
      }
      res = await fetch(`${OPENAI_BASE}/images/edits`, {
        method: "POST",
        headers: { Authorization: `Bearer ${key}` },
        body: form,
        signal: controller.signal,
      });
    } else {
      res = await fetch(`${OPENAI_BASE}/images/generations`, {
        method: "POST",
        headers: {
          Authorization: `Bearer ${key}`,
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          model,
          prompt: opts.prompt,
          size,
          quality: "high",
          output_format: "png",
        }),
        signal: controller.signal,
      });
    }

    if (!res.ok) {
      const detail = await errorDetail(res);
      throw new Error(`OpenAI ${res.status}: ${detail.slice(0, 300)}`);
    }

    const json = (await res.json()) as OpenAIImageResponse;
    const dataUri = asDataUri(json, label);
    return { dataUri, mimeType: "image/png", model };
  } catch (err) {
    if (err instanceof Error && err.name === "AbortError") {
      throw new Error(`${label} timed out — try again or drop the resolution`);
    }
    throw err;
  } finally {
    clearTimeout(timer);
  }
}
