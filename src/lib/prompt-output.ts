import type { AspectRatio } from "@/lib/types";
import { ASPECT_RATIOS } from "@/config/aspects";

/**
 * Pull output format out of a director-style prompt.
 *
 * Seedance's `ratio` field is what actually sizes the frame — "shot vertical"
 * in the text is ignored when the dock is still on 16:9. These prompts usually
 * name the format in an OUTPUT SETTINGS block; we read that so the request
 * matches what the person wrote.
 *
 * Duration is inferred only as a fallback when the request omits `durationS`.
 * The dock chip is the source of truth; camera timestamps (`0.0s to 10.0s`)
 * stay in the prompt as direction for the model.
 */

export type InferredOutputSettings = {
  aspect?: AspectRatio;
  durationS?: number;
};

const RATIO_TOKEN_RE = new RegExp(
  `\\b(${[...ASPECT_RATIOS]
    .sort((a, b) => b.length - a.length)
    .map((r) => r.replace(":", "\\s*[:/]\\s*"))
    .join("|")})\\b`,
  "gi"
);

const RATIO_NORM: Record<string, AspectRatio> = Object.fromEntries(
  ASPECT_RATIOS.map((r) => [r, r])
) as Record<string, AspectRatio>;

function lastRatioToken(text: string): AspectRatio | undefined {
  let last: AspectRatio | undefined;
  for (const match of text.matchAll(RATIO_TOKEN_RE)) {
    const key = match[1].replace(/\s+/g, "").replace("/", ":");
    const ratio = RATIO_NORM[key];
    if (ratio) last = ratio;
  }
  return last;
}

/** Orientation language, used only when no `9:16` / `16:9` token is present. */
function orientationAspect(text: string): AspectRatio | undefined {
  const vertical =
    /\b(?:shot|filmed|framed)\s+vertical(?:ly)?\b/i.test(text) ||
    /\bvertical(?:ly)?\s+(?:shot|frame|framing)\b/i.test(text) ||
    /\btall frame\b/i.test(text) ||
    /\bportrait (?:orientation|mode|format|frame|video)\b/i.test(text);

  const horizontal =
    /\b(?:shot|filmed|framed)\s+horizontal(?:ly)?\b/i.test(text) ||
    /\bhorizontal(?:ly)?\s+(?:shot|frame|framing)\b/i.test(text) ||
    /\blandscape (?:orientation|mode|format|frame)\b/i.test(text);

  const square = /\bsquare (?:frame|format|1:1)\b/i.test(text);

  // Last matching orientation wins when both appear.
  const verticalAt = vertical
    ? Math.max(
        text.search(/\b(?:shot|filmed|framed)\s+vertical(?:ly)?\b/i),
        text.search(/\bvertical(?:ly)?\s+(?:shot|frame|framing)\b/i),
        text.search(/\btall frame\b/i),
        text.search(/\bportrait (?:orientation|mode|format|frame|video)\b/i)
      )
    : -1;
  const horizontalAt = horizontal
    ? Math.max(
        text.search(/\b(?:shot|filmed|framed)\s+horizontal(?:ly)?\b/i),
        text.search(/\bhorizontal(?:ly)?\s+(?:shot|frame|framing)\b/i),
        text.search(/\blandscape (?:orientation|mode|format|frame)\b/i)
      )
    : -1;

  if (square && verticalAt < 0 && horizontalAt < 0) return "1:1";
  if (verticalAt >= 0 && verticalAt >= horizontalAt) return "9:16";
  if (horizontalAt >= 0) return "16:9";
  return undefined;
}

const SEEDANCE_MIN_S = 4;
const SEEDANCE_MAX_S = 30;

function clampDuration(n: number): number | undefined {
  if (!Number.isFinite(n)) return undefined;
  const rounded = Math.round(n);
  if (rounded < SEEDANCE_MIN_S || rounded > SEEDANCE_MAX_S) return undefined;
  return rounded;
}

function inferDuration(text: string): number | undefined {
  const explicit = text.match(
    /\b(?:duration|length|runtime|clip length)\s*[:=]?\s*(\d{1,2}(?:\.\d+)?)\s*(?:s|sec|seconds?)?\b/i
  ) ?? text.match(
    /\b(\d{1,2}(?:\.\d+)?)\s*(?:s|sec|seconds?)\s+(?:clip|shot|video|duration)\b/i
  );
  if (explicit) {
    const fromLabel = clampDuration(Number(explicit[1]));
    if (fromLabel) return fromLabel;
  }

  // Camera schedules (`0.0s to 2.0s` … `9.3s to 10.0s`) — take the last beat.
  const stamps = [...text.matchAll(/(\d{1,2}(?:\.\d+)?)\s*s\b/gi)]
    .map((m) => Number(m[1]))
    .filter((n) => Number.isFinite(n) && n >= 1 && n <= SEEDANCE_MAX_S);
  if (stamps.length >= 3) {
    return clampDuration(Math.max(...stamps));
  }
  return undefined;
}

export function inferOutputSettings(text: string): InferredOutputSettings {
  const trimmed = text.trim();
  if (!trimmed) return {};
  return {
    aspect: lastRatioToken(trimmed) ?? orientationAspect(trimmed),
    durationS: inferDuration(trimmed),
  };
}
