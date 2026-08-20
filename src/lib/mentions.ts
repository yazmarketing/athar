/**
 * Athar — tagging attached images from inside the prompt.
 *
 * Typing `@` in the prompt offers the images currently attached, and picking
 * one inserts a stable token. On the way to the model those tokens become
 * explicit, indexed instructions.
 *
 * Indexed reference prompting is the point. Re-describing a subject in prose
 * on every shot is what lets a face drift; naming the reference by number —
 * "match reference image 2 exactly" — is what holds it. This is the same
 * convention Seedance already uses for reference video (`@video1`), extended
 * to stills.
 */

/** `@image1`, `@image3` … 1-based to match the badges shown on the thumbnails. */
const MENTION_RE = /@image(\d+)\b/gi;

/** The token for the nth attachment (0-based index in, 1-based token out). */
export function mentionToken(index: number): string {
  return `@image${index + 1}`;
}

/**
 * Which attachments a prompt refers to, as 0-based indices, in first-use
 * order and without duplicates. Out-of-range mentions are dropped — a token
 * left behind after its attachment was removed should not address whatever
 * now sits in that slot.
 */
export function parseMentions(text: string, attachmentCount: number): number[] {
  const seen = new Set<number>();
  const out: number[] = [];
  for (const match of text.matchAll(MENTION_RE)) {
    const index = Number(match[1]) - 1;
    if (index < 0 || index >= attachmentCount || seen.has(index)) continue;
    seen.add(index);
    out.push(index);
  }
  return out;
}

export type MentionTarget = {
  /** What to call it in the picker — a saved reference's name, if it has one. */
  label?: string | null;
};

/** How one attachment is named inside the expanded prompt. */
function describe(index: number, target?: MentionTarget): string {
  const n = index + 1;
  return target?.label?.trim()
    ? `reference image ${n} (${target.label.trim()})`
    : `reference image ${n}`;
}

/**
 * Rewrite `@imageN` into language the model acts on, and append a short
 * instruction binding the mentioned references.
 *
 * A prompt with no mentions comes back untouched — this must never edit a
 * prompt nobody asked it to edit.
 */
export function expandMentions(
  text: string,
  targets: MentionTarget[]
): string {
  const used = parseMentions(text, targets.length);
  if (used.length === 0) return text;

  const inline = text.replace(MENTION_RE, (whole, digits: string) => {
    const index = Number(digits) - 1;
    if (index < 0 || index >= targets.length) return whole;
    return describe(index, targets[index]);
  });

  const names = used.map((i) => describe(i, targets[i]));
  const list =
    names.length === 1
      ? names[0]
      : `${names.slice(0, -1).join(", ")} and ${names[names.length - 1]}`;

  // Close the sentence before starting a new one, or the instruction runs
  // straight on from the description and reads as one garbled clause.
  const body = inline.trim().replace(/[\s,;]+$/, "");
  const stop = /[.!?]$/.test(body) ? "" : ".";

  // Deliberately not "same face, same wardrobe": a reference is as often a
  // product or a location as a person, and wording that assumes a face reads
  // as nonsense against a bottle.
  return (
    `${body}${stop} Match ${list} exactly — the same subject with the same ` +
    "appearance, colours and proportions as the attached image."
  );
}

/**
 * The `@…` the caret is currently inside, if any.
 *
 * Returns the range to replace and what has been typed after the `@`, so the
 * menu can filter as you type and the insert can overwrite cleanly. Only a `@`
 * at a word boundary counts, so an email address doesn't open the menu.
 */
export function activeMentionQuery(
  text: string,
  caret: number
): { start: number; end: number; query: string } | null {
  const before = text.slice(0, caret);
  const at = before.lastIndexOf("@");
  if (at === -1) return null;

  // Must start a word: beginning of input, or preceded by whitespace.
  if (at > 0 && !/\s/.test(before[at - 1])) return null;

  const typed = before.slice(at + 1);
  // A space closes it — mentions are a single token.
  if (/\s/.test(typed)) return null;

  return { start: at, end: caret, query: typed };
}
