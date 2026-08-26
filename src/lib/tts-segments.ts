import type { TtsAlignment, TtsSegment } from "@/lib/types";

/** The underlying provider's own limits — enforced here so a bad request never reaches them. */
export const MAX_TTS_CHARACTERS = 10_000;
export const MAX_PAUSE_TAGS = 20;
export const MAX_PAUSE_BUDGET_MS = 30_000;

/** Shown to users — never names the provider or its env var. */
export const NOT_CONFIGURED_MESSAGE =
  "Text-to-speech isn't set up yet — ask an admin to add the API key.";

export type SegmentValidation = { ok: true } | { ok: false; error: string };

/** Total characters across every speech segment — what the UI counter shows. */
export function totalCharCount(segments: TtsSegment[]): number {
  return segments.reduce(
    (sum, seg) => sum + (seg.type === "speech" ? seg.text.length : 0),
    0
  );
}

/**
 * Validate a generation request before it costs anything: the char cap, the
 * pause-tag budget the provider enforces per request, and that there is
 * something to say at all.
 */
export function validateSegments(segments: TtsSegment[]): SegmentValidation {
  if (segments.length === 0) {
    return { ok: false, error: "Add at least one line to generate" };
  }
  const speechSegments = segments.filter((s) => s.type === "speech");
  if (speechSegments.every((s) => !s.text.trim())) {
    return { ok: false, error: "Add some text to generate" };
  }
  if (speechSegments.some((s) => !s.voiceId)) {
    return { ok: false, error: "Pick a voice for every speaker" };
  }

  const chars = totalCharCount(segments);
  if (chars > MAX_TTS_CHARACTERS) {
    return {
      ok: false,
      error: `${chars.toLocaleString()} characters — the limit is ${MAX_TTS_CHARACTERS.toLocaleString()}`,
    };
  }

  const pauses = segments.filter((s) => s.type === "pause");
  if (pauses.length > MAX_PAUSE_TAGS) {
    return { ok: false, error: `Too many pauses — up to ${MAX_PAUSE_TAGS} allowed` };
  }
  const pauseBudget = pauses.reduce((sum, p) => sum + p.ms, 0);
  if (pauseBudget > MAX_PAUSE_BUDGET_MS) {
    return {
      ok: false,
      error: `Total pause time is over the ${MAX_PAUSE_BUDGET_MS / 1000}s budget`,
    };
  }

  return { ok: true };
}

/** Flattened transcript text, for search and the `text` column. */
export function flattenSegments(segments: TtsSegment[]): string {
  return segments
    .filter((s): s is Extract<TtsSegment, { type: "speech" }> => s.type === "speech")
    .map((s) => s.text.trim())
    .filter(Boolean)
    .join("\n");
}

/**
 * Munsit returns per-character timings, not per-word. Group characters into
 * words by breaking on whitespace — a word's start is its first character's
 * start, its end is its last character's end.
 */
export function wordsFromAlignment(
  alignment: TtsAlignment
): { word: string; startS: number; endS: number }[] {
  const words: { word: string; startS: number; endS: number }[] = [];
  let current: { chars: string[]; startS: number; endS: number } | null = null;

  alignment.characters.forEach((ch, i) => {
    if (/\s/.test(ch)) {
      if (current) {
        words.push({ word: current.chars.join(""), startS: current.startS, endS: current.endS });
        current = null;
      }
      return;
    }
    if (!current) {
      current = { chars: [ch], startS: alignment.startS[i], endS: alignment.endS[i] };
    } else {
      current.chars.push(ch);
      current.endS = alignment.endS[i];
    }
  });
  if (current) {
    const c: { chars: string[]; startS: number; endS: number } = current;
    words.push({ word: c.chars.join(""), startS: c.startS, endS: c.endS });
  }
  return words;
}

/** Shift every timing in an alignment forward by `offsetS` seconds. */
export function offsetAlignment(alignment: TtsAlignment, offsetS: number): TtsAlignment {
  return {
    characters: alignment.characters,
    startS: alignment.startS.map((s) => s + offsetS),
    endS: alignment.endS.map((e) => e + offsetS),
  };
}
