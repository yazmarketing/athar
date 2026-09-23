/**
 * Deterministic punctuation cleanup — Pass 4 of the VO Director pipeline.
 * Pure, no LLM, no server-only import (the UI can preview it live after a
 * manual edit with no network round trip). Runs after the phonetic pass
 * (Pass 3), never before — cleanup must see the final respelled text.
 *
 * Rule: no <break> tag by default. `insertJustifiedBreak` is the only
 * sanctioned way to add one, and it requires a justification string.
 */

/** Coordinating conjunctions that continue the previous clause, not start a new sentence. */
const CONTINUATION_WORDS = ["و", "ف", "لكن", "ثم", "أو", "بل"];

const CONTINUATION_RE = new RegExp(
  `([\\u0600-\\u06FF])[.]\\s+(${CONTINUATION_WORDS.join("|")})([\\s\\u0600-\\u06FF])`,
  "g"
);

/** Every literal `<break .../>` or `<break>...</break>` tag, self-closing or not. */
const BREAK_TAG_RE = /<break\b[^>]*\/?>(?:<\/break>)?/gi;

export function cleanupPunctuation(text: string): { text: string; notes: string[] } {
  const notes: string[] = [];
  let out = text;

  const breakMatches = out.match(BREAK_TAG_RE);
  if (breakMatches?.length) {
    notes.push(
      `Removed ${breakMatches.length} <break> tag${breakMatches.length > 1 ? "s" : ""} — none were justified`
    );
    out = out.replace(BREAK_TAG_RE, " ");
  }

  // "تبني. ويبنون وياها." -> "تبني، ويبنون وياها." — one conceptual unit,
  // not two sentences.
  const beforeContinuation = out;
  out = out.replace(CONTINUATION_RE, "$1، $2$3");
  if (out !== beforeContinuation) {
    notes.push("Merged sentence fragments joined by a conjunction into one clause");
  }

  const beforeEllipsis = out;
  out = out.replace(/\.{3,}/g, "…").replace(/[…]{2,}/g, "…");
  if (out !== beforeEllipsis) notes.push("Normalized ellipsis runs");

  const beforeSpaces = out;
  out = out.replace(/[ \t]{2,}/g, " ");
  if (out !== beforeSpaces) notes.push("Collapsed repeated spaces");

  const beforeLines = out;
  out = out
    .split("\n")
    .map((line) => line.trim())
    .filter((line) => line.length > 0)
    .join("\n");
  if (out !== beforeLines) notes.push("Stripped empty lines");

  out = out.trim();
  return { text: out, notes };
}

/**
 * The ONLY sanctioned way to add a <break> tag — explicit, justified,
 * Director Mode only. `justification` is required and stored alongside the
 * segment (tts_director_segments.break_justification), never emitted
 * automatically by any LLM pass.
 */
export function insertJustifiedBreak(
  text: string,
  position: number,
  ms: number,
  justification: string
): string {
  if (!justification.trim()) {
    throw new Error("A <break> requires an explicit justification");
  }
  const clampedPos = Math.max(0, Math.min(position, text.length));
  const tag = `<break time="${Math.max(0, Math.round(ms))}ms" />`;
  return `${text.slice(0, clampedPos)}${tag}${text.slice(clampedPos)}`;
}
