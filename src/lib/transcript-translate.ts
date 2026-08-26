import { parsePlannerJson } from "@/lib/shot-plan";

/**
 * Turn a translation-model reply into one string per input line.
 *
 * The model is asked for `{"lines":[{"n":1,"text":"…"}]}` but often returns
 * a bare array, drops `n`, or skips a couple of entries. We accept those
 * shapes and leave holes as null so the caller can retry only the gaps.
 */
export function parseTranslationLines(
  raw: string,
  expected: number
): (string | null)[] {
  const out: (string | null)[] = Array.from({ length: expected }, () => null);
  if (expected <= 0) return out;

  let parsed: unknown;
  try {
    parsed = parsePlannerJson(raw);
  } catch {
    return out;
  }

  const list = Array.isArray(parsed)
    ? parsed
    : Array.isArray((parsed as { lines?: unknown }).lines)
      ? ((parsed as { lines: unknown[] }).lines)
      : null;
  if (!list) return out;

  const texts = list.map((item) => {
    if (typeof item === "string") return item.trim();
    if (item && typeof item === "object") {
      const text = (item as { text?: unknown }).text;
      return typeof text === "string" ? text.trim() : "";
    }
    return "";
  });

  for (const item of list) {
    if (!item || typeof item !== "object") continue;
    const row = item as { n?: unknown; text?: unknown };
    if (row.n === undefined || row.n === null || row.n === "") continue;
    const index = Number(row.n) - 1;
    const text = typeof row.text === "string" ? row.text.trim() : "";
    if (index >= 0 && index < expected && text) out[index] = text;
  }

  // Same count, no usable `n` values — take the array in order.
  if (texts.length === expected) {
    for (let i = 0; i < expected; i++) {
      if (!out[i] && texts[i]) out[i] = texts[i];
    }
  }

  return out;
}
