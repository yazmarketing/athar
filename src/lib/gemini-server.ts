import "server-only";

/**
 * Google Gemini image generation — "Nano Banana" (gemini-2.5-flash-image).
 * SERVER ONLY. Key from GEMINI_API_KEY. Returns a data URI so it flows through
 * the same persistOutput path as BytePlus outputs.
 *
 * Docs: https://ai.google.dev/gemini-api/docs/image-generation
 */

const GEMINI_BASE =
  process.env.GEMINI_BASE_URL ??
  "https://generativelanguage.googleapis.com/v1beta";

export const NANO_BANANA_MODEL = "gemini-2.5-flash-image";

export function geminiConfigured(): boolean {
  return Boolean(process.env.GEMINI_API_KEY?.trim());
}

type GeminiPart =
  | { text: string }
  | { inlineData: { mimeType: string; data: string } };

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

/** Generate (or edit, when reference images are supplied) an image. */
export async function geminiGenerateImage(opts: {
  prompt: string;
  imageUrls?: string[];
}): Promise<{ dataUri: string; mimeType: string }> {
  const key = process.env.GEMINI_API_KEY?.trim();
  if (!key) throw new Error("Missing GEMINI_API_KEY env var");

  const parts: GeminiPart[] = [{ text: opts.prompt }];
  for (const url of opts.imageUrls ?? []) {
    const part = await urlToInlinePart(url);
    if (part) parts.push(part);
  }

  const res = await fetch(
    `${GEMINI_BASE}/models/${NANO_BANANA_MODEL}:generateContent?key=${encodeURIComponent(
      key
    )}`,
    {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ contents: [{ role: "user", parts }] }),
    }
  );

  if (!res.ok) {
    let detail = "";
    try {
      const body = (await res.json()) as { error?: { message?: string } };
      detail = body.error?.message ?? "";
    } catch {
      detail = await res.text().catch(() => "");
    }
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
    throw new Error("Nano Banana returned no image — try rephrasing the prompt");
  }
  return {
    dataUri: `data:${image.mimeType};base64,${image.data}`,
    mimeType: image.mimeType,
  };
}
