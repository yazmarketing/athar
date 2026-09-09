import "server-only";

import { openaiModel } from "@/lib/openai-server";
import type { ReferenceStyleFingerprint } from "@/lib/types";

/**
 * Reference style analysis — the step between "a reference is attached" and
 * "every frame matches it".
 *
 * An image model handed reference pixels alone re-interprets them on every
 * render: the scene text (usually written in photographic language by the
 * planner) outvotes the picture, and the same references produce a different-
 * looking board each time. The fix is to look at the references ONCE, write
 * down exactly what they are — medium, technique, palette, lighting, texture,
 * and whether they depict the recurring cast — and inject that written
 * contract into every frame render alongside the pixels. Same references,
 * same words, same look.
 */

const OPENAI_BASE = "https://api.openai.com/v1";

/** Longest style brief we will carry into an image prompt. */
const BRIEF_MAX = 900;
const NEGATIVE_MAX = 300;
const SUBJECTS_MAX = 200;

const SYSTEM_PROMPT = [
  "You are a senior art director doing visual style analysis for a film and",
  "animation studio. You are shown the reference images attached to a",
  "storyboard. Your analysis becomes the binding style contract every frame",
  "is rendered against, so it must be precise enough that an image model",
  "reading it — without seeing the references — would still produce matching",
  "pictures. Describe only what is visibly consistent across the images.",
  'Return ONLY JSON:',
  '{"styleBrief":"60-110 words, imperative present tense. Name the medium and',
  "technique (e.g. flat digital gouache illustration, ink and watercolour on",
  "rough paper, 35mm colour photograph), edge and line quality, the palette as",
  "4-6 specific named colours, the lighting treatment, texture or grain, how",
  "backgrounds are handled, the level of detail, and how human figures are",
  'treated (e.g. tiny simplified figures with no facial features).",',
  '"styleNegative":"comma-separated short phrases that would BREAK this style',
  '(e.g. photorealism, 3d render, sharp fine detail, saturated colours) — at',
  'most 12 phrases",',
  '"carriesCast":boolean — true ONLY if the images depict specific characters',
  "or people whose identity (face, wardrobe) the storyboard should reuse;",
  "false for pure style, mood, environment or product references,",
  '"subjects":"one short sentence: what the images literally show"}',
].join(" ");

/**
 * Clamp and type-check a model reply (or a stored row) into a fingerprint.
 * Returns null when there is no usable brief — the caller treats that as
 * "analysis failed", never as an empty style.
 */
export function coerceStyleFingerprint(
  raw: unknown,
  sourceUrls: string[]
): ReferenceStyleFingerprint | null {
  if (!raw || typeof raw !== "object") return null;
  const o = raw as Record<string, unknown>;
  const styleBrief =
    typeof o.styleBrief === "string" ? o.styleBrief.trim().slice(0, BRIEF_MAX) : "";
  if (!styleBrief) return null;
  return {
    styleBrief,
    styleNegative:
      typeof o.styleNegative === "string"
        ? o.styleNegative.trim().slice(0, NEGATIVE_MAX)
        : "",
    carriesCast: o.carriesCast === true,
    subjects:
      typeof o.subjects === "string"
        ? o.subjects.trim().slice(0, SUBJECTS_MAX)
        : "",
    sourceUrls: [...sourceUrls].sort(),
    analyzedAt: new Date().toISOString(),
  };
}

/** True when a stored fingerprint was made from exactly these references. */
export function fingerprintMatches(
  fingerprint: ReferenceStyleFingerprint | null | undefined,
  urls: string[]
): boolean {
  if (!fingerprint) return false;
  const a = [...(fingerprint.sourceUrls ?? [])].sort();
  const b = [...urls].sort();
  return a.length === b.length && a.every((u, i) => u === b[i]);
}

/**
 * Look at the reference images and write the style contract.
 * Uses OpenAI vision, same pattern as `openaiScoreImages`.
 */
export async function analyzeReferenceStyle(
  imageUrls: string[]
): Promise<ReferenceStyleFingerprint> {
  const key = process.env.OPENAI_API_KEY?.trim();
  if (!key) throw new Error("Missing OPENAI_API_KEY env var");
  const urls = imageUrls.map((u) => u.trim()).filter(Boolean);
  if (urls.length === 0) throw new Error("No reference images to analyze");

  const content: unknown[] = [
    {
      type: "text",
      text: `Analyze the shared visual style of these ${urls.length} reference image(s):`,
    },
    ...urls.map((url) => ({ type: "image_url", image_url: { url } })),
  ];

  const res = await fetch(`${OPENAI_BASE}/chat/completions`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${key}`,
    },
    body: JSON.stringify({
      model: openaiModel(),
      messages: [
        { role: "system", content: SYSTEM_PROMPT },
        { role: "user", content },
      ],
      max_completion_tokens: 700,
      response_format: { type: "json_object" },
    }),
  });

  if (!res.ok) {
    let detail = "";
    try {
      const body = (await res.json()) as { error?: { message?: string } };
      detail = body.error?.message ?? "";
    } catch {
      detail = await res.text().catch(() => "");
    }
    throw new Error(`OpenAI ${res.status}: ${detail.slice(0, 300)}`);
  }

  const json = (await res.json()) as {
    choices?: { message?: { content?: string } }[];
  };
  const raw = json.choices?.[0]?.message?.content?.trim() ?? "{}";
  const fingerprint = coerceStyleFingerprint(JSON.parse(raw), urls);
  if (!fingerprint) {
    throw new Error("Style analysis came back empty — try re-analyzing");
  }
  return fingerprint;
}
