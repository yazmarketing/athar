/**
 * Word-level diff between an original line and its adapted form — powers the
 * "View TTS Script" / Pronunciation Editor's inline highlight-and-edit. Pure,
 * no server import, so it can run client-side against whatever the server
 * last returned. Arabic has no compounding spaces issue, so a plain
 * whitespace split is enough.
 */

export type DiffSpan = {
  /** Stable key for React + click targets. */
  key: number;
  /** The adapted text this span renders (empty for a pure deletion). */
  text: string;
  changed: boolean;
};

function splitWords(text: string): string[] {
  return text.split(/\s+/).filter(Boolean);
}

/** Longest common subsequence of two word arrays, by index. */
function lcsTable(a: string[], b: string[]): number[][] {
  const table = Array.from({ length: a.length + 1 }, () => new Array(b.length + 1).fill(0));
  for (let i = a.length - 1; i >= 0; i--) {
    for (let j = b.length - 1; j >= 0; j--) {
      table[i][j] =
        a[i] === b[j] ? table[i + 1][j + 1] + 1 : Math.max(table[i + 1][j], table[i][j + 1]);
    }
  }
  return table;
}

/**
 * Diff `original` against `adapted`, grouping consecutive changed words into
 * one editable span. Unchanged runs render as plain text.
 */
export function diffWords(original: string, adapted: string): DiffSpan[] {
  const a = splitWords(original);
  const b = splitWords(adapted);
  if (a.length === 0) return b.map((w, i) => ({ key: i, text: w, changed: true }));
  if (b.length === 0) return [];

  const table = lcsTable(a, b);
  const ops: { type: "equal" | "change"; word?: string }[] = [];
  let i = 0;
  let j = 0;
  while (i < a.length && j < b.length) {
    if (a[i] === b[j]) {
      ops.push({ type: "equal", word: b[j] });
      i++;
      j++;
    } else if (table[i + 1][j] >= table[i][j + 1]) {
      i++; // word only in `original` — dropped, no span emitted
    } else {
      ops.push({ type: "change", word: b[j] });
      j++;
    }
  }
  while (j < b.length) {
    ops.push({ type: "change", word: b[j] });
    j++;
  }

  // Merge consecutive same-type ops into spans.
  const spans: DiffSpan[] = [];
  let buffer: string[] = [];
  let bufferType: "equal" | "change" | null = null;
  const flush = () => {
    if (buffer.length === 0) return;
    spans.push({ key: spans.length, text: buffer.join(" "), changed: bufferType === "change" });
    buffer = [];
  };
  for (const op of ops) {
    if (op.type !== bufferType) {
      flush();
      bufferType = op.type;
    }
    if (op.word) buffer.push(op.word);
  }
  flush();
  return spans;
}

/** Rebuild the flat text from a (possibly edited) span list. */
export function joinDiffSpans(spans: DiffSpan[]): string {
  return spans
    .map((s) => s.text)
    .filter(Boolean)
    .join(" ");
}
