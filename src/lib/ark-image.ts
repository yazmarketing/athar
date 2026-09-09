import "server-only";

import { arkGenerateImage } from "@/lib/byteplus-server";
import { uploadPublicObject } from "@/lib/storage";
import type { ModelEndpoint } from "@/config/models";
import {
  ASPECT_TO_ARK_SIZE_1K,
  ASPECT_TO_ARK_SIZE_2K,
} from "@/config/aspects";

/**
 * The Seedream (BytePlus ModelArk) still pipeline, kept OFF the request path.
 *
 * A 2K edit render — fetch the references, inline them, render with retries,
 * download the result and store it — routinely outlives the App Platform
 * gateway, which answers the browser with an HTML 504 page and surfaces as
 * "Unexpected token '<'" wherever the client expected JSON. Routes queue a
 * job and answer immediately; `submitImageJob` runs this afterwards.
 */

function arkSizeFor(aspect: string, resolution: "1K" | "2K"): string {
  const table =
    resolution === "1K" ? ASPECT_TO_ARK_SIZE_1K : ASPECT_TO_ARK_SIZE_2K;
  return (
    table[aspect as keyof typeof table] ??
    (resolution === "1K" ? "1280x720" : "2560x1440")
  );
}

/** Seedream image edits require ≥ ~3.686M pixels (e.g. 2560×1440). */
export const EDIT_MIN_PIXELS = 3_686_400;

/** Scale a "WxH" size up (keeping aspect, multiples of 16) to meet a floor. */
export function ensureMinPixels(size: string, minPixels: number): string {
  const [w, h] = size.split("x").map(Number);
  if (!w || !h || minPixels <= 0 || w * h >= minPixels) return size;
  const scale = Math.sqrt(minPixels / (w * h));
  const nw = Math.ceil((w * scale) / 16) * 16;
  const nh = Math.ceil((h * scale) / 16) * 16;
  return `${nw}x${nh}`;
}

export type ArkImageOutput = {
  url: string;
  seed: number | null;
  requestId: string | null;
  payload: Record<string, unknown>;
};

/**
 * BytePlus often can't fetch third-party CDNs, so edit references are inlined
 * as data URIs. A fetch that fails leaves the URL as-is — the provider may
 * still manage it.
 */
export async function inlineReferenceImages(
  referenceUrls: string[]
): Promise<string[]> {
  return Promise.all(
    referenceUrls.map(async (url) => {
      try {
        const res = await fetch(url);
        if (!res.ok) return url;
        const buf = Buffer.from(await res.arrayBuffer());
        const contentType = res.headers.get("content-type") ?? "image/jpeg";
        if (buf.byteLength > 8_000_000) return url; // keep URL if huge
        return `data:${contentType};base64,${buf.toString("base64")}`;
      } catch {
        return url;
      }
    })
  );
}

async function generateOne(
  model: ModelEndpoint,
  finalPrompt: string,
  aspect: string,
  seed: number,
  referenceUrls: string[],
  resolution: "1K" | "2K"
): Promise<ArkImageOutput> {
  // Edits require ≥ ~3.686M pixels — force 2K when a reference is present
  const sizeRes =
    referenceUrls.length > 0 && resolution === "1K" ? "2K" : resolution;

  /**
   * Two separate floors, whichever is higher wins:
   *
   * - the model's own minimum (Seedream 5.x refuses anything under 2560×1440
   *   on every request, so a 1K frame is rejected outright), and
   * - the edit floor, which applies to any model once a reference is attached.
   *
   * Scaling up beats failing: the alternative is a provider error the person
   * generating can do nothing useful with.
   */
  const floor = Math.max(
    model.minPixels ?? 0,
    referenceUrls.length > 0 ? EDIT_MIN_PIXELS : 0
  );

  const payload: {
    model: string;
    prompt: string;
    size: string;
    seed: number;
    image?: string | string[];
  } = {
    model: model.slug,
    prompt: finalPrompt,
    size: ensureMinPixels(arkSizeFor(aspect, sizeRes), floor),
    seed,
  };
  if (referenceUrls.length > 0) {
    // Seedream edit/i2i — always send as array of URL or data-URI strings
    payload.image =
      referenceUrls.length === 1 ? referenceUrls[0] : referenceUrls;
  }
  const result = await arkGenerateImage(payload);
  return {
    url: result.urls[0],
    seed: result.seed ?? seed,
    requestId: result.requestId ?? null,
    payload,
  };
}

/** Routing rule §2.2 (images): try the primary twice, then the fallback chain. */
export async function renderArkImageWithFallback(opts: {
  primary: ModelEndpoint;
  fallbacks: ModelEndpoint[];
  finalPrompt: string;
  aspect: string;
  seed: number;
  referenceUrls: string[];
  resolution: "1K" | "2K";
}): Promise<{
  output: ArkImageOutput;
  usedModel: ModelEndpoint;
  fallbackNote: string | null;
}> {
  const { primary, fallbacks } = opts;
  let primaryError: unknown = null;
  let lastError: unknown = null;
  for (const model of [primary, ...fallbacks]) {
    const attempts = model === primary ? 2 : 1;
    for (let i = 0; i < attempts; i++) {
      try {
        const output = await generateOne(
          model,
          opts.finalPrompt,
          opts.aspect,
          opts.seed,
          opts.referenceUrls,
          opts.resolution
        );
        return {
          output,
          usedModel: model,
          fallbackNote:
            model === primary
              ? null
              : `Primary ${primary.provider}:${primary.slug} failed; used fallback ${model.provider}:${model.slug}`,
        };
      } catch (err) {
        lastError = err;
        if (model === primary && primaryError === null) primaryError = err;
      }
    }
  }
  // The primary's error is the meaningful one to report
  const errToThrow = primaryError ?? lastError;
  throw errToThrow instanceof Error
    ? errToThrow
    : new Error("All models failed");
}

/**
 * Copy the render into our own storage. The provider link expires; ours is
 * the one the library keeps. If storing fails the provider URL still works
 * as a fallback for a while.
 */
export async function persistArkImage(
  output: ArkImageOutput
): Promise<{ url: string; providerUrl: string | null }> {
  try {
    const res = await fetch(output.url);
    const blob = await res.arrayBuffer();
    const contentType = res.headers.get("content-type") ?? "image/png";
    const ext = contentType.includes("webp")
      ? "webp"
      : contentType.includes("jpeg")
        ? "jpg"
        : "png";
    const path = `t2i/${Date.now()}-${output.seed ?? "v"}.${ext}`;
    const url = await uploadPublicObject(path, blob, contentType);
    return { url, providerUrl: output.url };
  } catch {
    return { url: output.url, providerUrl: output.url };
  }
}
