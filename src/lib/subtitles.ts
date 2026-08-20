import type { TranscriptWord } from "@/lib/types";

/**
 * Transcript export formats — SRT, VTT, text, Markdown, CSV, JSON.
 *
 * Pure functions, no server imports: the same code renders the download on the
 * server and the live preview in the browser, so what you see is what you get.
 *
 * The subtitle rules here are the ones an editor actually cares about. A raw
 * Whisper segment can be twelve seconds of unbroken text; dropped into Premiere
 * that is an unreadable wall. So cues are split at word boundaries, wrapped to
 * two lines, held long enough to read and never left overlapping the next one.
 */

export type SubtitleSegment = {
  start_s: number;
  end_s: number;
  text: string;
  speaker?: string | null;
  words?: TranscriptWord[];
  translations?: Record<string, string>;
};

export type SubtitleOptions = {
  /** Characters per line before wrapping. 42 is the broadcast convention. */
  maxChars?: number;
  maxLines?: number;
  /** A cue shorter than this is unreadable however few words it holds. */
  minDurationS?: number;
  maxDurationS?: number;
  /** Frame gap between cues so two never sit on screen together. */
  gapS?: number;
  /** Prefix each cue with the speaker's name. */
  speakers?: boolean;
  speakerNames?: Record<string, string>;
  /** Render this translation above the original (bilingual subtitles). */
  bilingualLang?: string | null;
};

const DEFAULTS = {
  maxChars: 42,
  maxLines: 2,
  minDurationS: 1.2,
  maxDurationS: 6,
  gapS: 0.08,
};

/** "SPEAKER_00" → "Yazan", or a tidy "Speaker 1" when nobody named it. */
export function speakerLabel(
  speaker: string | null | undefined,
  names: Record<string, string> = {}
): string {
  if (!speaker) return "";
  const named = names[speaker]?.trim();
  if (named) return named;
  const match = /^SPEAKER_(\d+)$/.exec(speaker);
  if (match) return `Speaker ${Number(match[1]) + 1}`;
  return speaker;
}

/** 3661.5 → "01:01:01,500" (SRT) or "01:01:01.500" (VTT). */
export function formatTimecode(seconds: number, decimalMark = ","): string {
  const clamped = Math.max(0, seconds);
  const whole = Math.floor(clamped);
  const ms = Math.round((clamped - whole) * 1000);
  const hh = Math.floor(whole / 3600);
  const mm = Math.floor((whole % 3600) / 60);
  const ss = whole % 60;
  const pad = (n: number, width = 2) => String(n).padStart(width, "0");
  return `${pad(hh)}:${pad(mm)}:${pad(ss)}${decimalMark}${pad(ms, 3)}`;
}

/** 3661.5 → "1:01:01" — the compact form for reading, not for subtitles. */
export function formatClock(seconds: number): string {
  const whole = Math.max(0, Math.floor(seconds));
  const hh = Math.floor(whole / 3600);
  const mm = Math.floor((whole % 3600) / 60);
  const ss = whole % 60;
  const pad = (n: number) => String(n).padStart(2, "0");
  return hh > 0 ? `${hh}:${pad(mm)}:${pad(ss)}` : `${mm}:${pad(ss)}`;
}

/** Greedy word wrap to at most `maxLines` lines of `maxChars`. */
export function wrapLines(text: string, maxChars: number, maxLines: number): string[] {
  const words = text.trim().split(/\s+/).filter(Boolean);
  const lines: string[] = [];
  let line = "";
  for (const word of words) {
    const candidate = line ? `${line} ${word}` : word;
    if (candidate.length <= maxChars || !line) {
      line = candidate;
    } else {
      lines.push(line);
      line = word;
    }
  }
  if (line) lines.push(line);
  if (lines.length <= maxLines) return lines;
  // Too long even after wrapping — keep the first lines and fold the rest into
  // the last one. buildCues splits before this happens; this is the backstop.
  const head = lines.slice(0, maxLines - 1);
  return [...head, lines.slice(maxLines - 1).join(" ")];
}

export type Cue = {
  start_s: number;
  end_s: number;
  lines: string[];
  speaker?: string | null;
};

/**
 * Turn segments into readable cues: split over-long segments at word
 * boundaries, then enforce minimum duration and the inter-cue gap.
 */
export function buildCues(
  segments: SubtitleSegment[],
  options: SubtitleOptions = {}
): Cue[] {
  const opts = { ...DEFAULTS, ...options };
  const budget = opts.maxChars * opts.maxLines;
  const cues: Cue[] = [];

  for (const segment of segments) {
    const source =
      opts.bilingualLang && segment.translations?.[opts.bilingualLang]
        ? segment.translations[opts.bilingualLang]
        : segment.text;
    const text = source?.trim();
    if (!text) continue;

    const duration = Math.max(0, segment.end_s - segment.start_s);
    const chunks = splitToBudget(text, segment.words ?? [], budget);
    const totalChars = chunks.reduce((sum, c) => sum + c.text.length, 0) || 1;

    let cursor = segment.start_s;
    chunks.forEach((chunk, i) => {
      // Word timings when the decoder gave us them, otherwise share the
      // segment out in proportion to how much text each chunk holds.
      const start = chunk.start ?? cursor;
      const share = (chunk.text.length / totalChars) * duration;
      const end =
        chunk.end ?? (i === chunks.length - 1 ? segment.end_s : start + share);
      cursor = end;
      cues.push({
        start_s: start,
        end_s: Math.max(end, start + 0.2),
        lines: wrapLines(chunk.text, opts.maxChars, opts.maxLines),
        speaker: segment.speaker ?? null,
      });
    });
  }

  // A cue has to be on screen long enough to read, but never so long that it
  // is still there when the next line starts.
  for (let i = 0; i < cues.length; i++) {
    const cue = cues[i];
    const next = cues[i + 1];
    const ceiling = next ? next.start_s - opts.gapS : Infinity;
    const wanted = Math.max(cue.end_s, cue.start_s + opts.minDurationS);
    cue.end_s = Math.min(wanted, Math.max(cue.start_s + 0.2, ceiling));
    cue.end_s = Math.min(cue.end_s, cue.start_s + opts.maxDurationS);
  }

  if (options.bilingualLang) {
    // Bilingual cues carry the original underneath the translation, matched
    // by index because both passes came from the same segment list.
    const originals = buildCues(segments, { ...options, bilingualLang: null });
    return cues.map((cue, i) => ({
      ...cue,
      lines: [...cue.lines, ...(originals[i]?.lines ?? [])],
    }));
  }
  return cues;
}

type Chunk = { text: string; start?: number; end?: number };

/** Split one segment's text into pieces that fit a cue, keeping word timings. */
function splitToBudget(text: string, words: TranscriptWord[], budget: number): Chunk[] {
  if (text.length <= budget) return [{ text }];

  if (words.length > 0) {
    const chunks: Chunk[] = [];
    let current: TranscriptWord[] = [];
    let length = 0;
    for (const word of words) {
      const addition = word.w.length + (current.length ? 1 : 0);
      if (length + addition > budget && current.length) {
        chunks.push(chunkFromWords(current));
        current = [];
        length = 0;
      }
      current.push(word);
      length += addition;
    }
    if (current.length) chunks.push(chunkFromWords(current));
    if (chunks.length) return chunks;
  }

  // No timings — split on words and let the caller share the duration out.
  const parts: Chunk[] = [];
  let line = "";
  for (const word of text.split(/\s+/).filter(Boolean)) {
    const candidate = line ? `${line} ${word}` : word;
    if (candidate.length > budget && line) {
      parts.push({ text: line });
      line = word;
    } else {
      line = candidate;
    }
  }
  if (line) parts.push({ text: line });
  return parts;
}

function chunkFromWords(words: TranscriptWord[]): Chunk {
  return {
    text: words
      .map((w) => w.w.trim())
      .join(" ")
      .replace(/\s+([,.!?؟،])/g, "$1")
      .trim(),
    start: words[0].s,
    end: words[words.length - 1].e,
  };
}

function cueText(cue: Cue, opts: SubtitleOptions): string {
  const label = opts.speakers ? speakerLabel(cue.speaker, opts.speakerNames) : "";
  const lines = [...cue.lines];
  if (label) lines[0] = `${label}: ${lines[0]}`;
  return lines.join("\n");
}

export function toSrt(segments: SubtitleSegment[], options: SubtitleOptions = {}): string {
  const cues = buildCues(segments, options);
  return (
    cues
      .map((cue, i) =>
        [
          i + 1,
          `${formatTimecode(cue.start_s)} --> ${formatTimecode(cue.end_s)}`,
          cueText(cue, options),
        ].join("\n")
      )
      .join("\n\n") + "\n"
  );
}

export function toVtt(segments: SubtitleSegment[], options: SubtitleOptions = {}): string {
  const cues = buildCues(segments, options);
  return (
    "WEBVTT\n\n" +
    cues
      .map((cue) =>
        [
          `${formatTimecode(cue.start_s, ".")} --> ${formatTimecode(cue.end_s, ".")}`,
          cueText(cue, options),
        ].join("\n")
      )
      .join("\n\n") +
    "\n"
  );
}

export type TextOptions = {
  /** How often to stamp a timecode into the flowing text. */
  timestamps?: "none" | "speaker" | "interval" | "segment";
  intervalS?: number;
  speakers?: boolean;
  speakerNames?: Record<string, string>;
  /** Drop "um", "uh" and their Arabic equivalents. */
  clean?: boolean;
};

const FILLERS =
  /\b(um+|uh+|erm+|hmm+|you know|i mean|like,|sort of|kind of|يعني|ايه|اه+)\b/gi;

function cleanText(text: string): string {
  return text
    .replace(FILLERS, "")
    .replace(/\s+([,.!?؟،])/g, "$1")
    .replace(/\s{2,}/g, " ")
    .replace(/^[\s,،]+/, "")
    .trim();
}

/**
 * Flowing text — the format people paste into a doc. Consecutive lines from
 * one speaker join into a paragraph instead of one line per breath.
 */
export function toPlainText(
  segments: SubtitleSegment[],
  options: TextOptions = {}
): string {
  const {
    timestamps = "speaker",
    intervalS = 60,
    speakers = true,
    speakerNames = {},
    clean = false,
  } = options;

  const blocks: string[] = [];
  let currentSpeaker: string | null | undefined;
  let buffer: string[] = [];
  let blockStart = 0;
  let lastStamp = -Infinity;

  const flush = () => {
    if (!buffer.length) return;
    const label = speakers ? speakerLabel(currentSpeaker, speakerNames) : "";
    const stamp =
      timestamps === "none" ? "" : `[${formatClock(blockStart)}]`;
    const head = [stamp, label ? `${label}:` : ""].filter(Boolean).join(" ");
    const body = buffer.join(" ").replace(/\s+/g, " ").trim();
    blocks.push(head ? `${head} ${body}` : body);
    buffer = [];
  };

  segments.forEach((segment) => {
    const text = clean ? cleanText(segment.text) : segment.text.trim();
    if (!text) return;
    const speakerChanged = speakers && segment.speaker !== currentSpeaker;
    const intervalPassed =
      timestamps === "interval" && segment.start_s - lastStamp >= intervalS;
    const perSegment = timestamps === "segment";

    if (!buffer.length || speakerChanged || intervalPassed || perSegment) {
      flush();
      currentSpeaker = segment.speaker;
      blockStart = segment.start_s;
      lastStamp = segment.start_s;
    }
    buffer.push(text);
  });
  flush();

  return blocks.join("\n\n") + "\n";
}

export function toMarkdown(
  segments: SubtitleSegment[],
  options: TextOptions & { title?: string } = {}
): string {
  const head = options.title ? `# ${options.title}\n\n` : "";
  const body = toPlainText(segments, options)
    .split("\n\n")
    .map((block) => block.replace(/^\[([^\]]+)\]\s*/, "**[$1]** "))
    .join("\n\n");
  return head + body;
}

export function toCsv(
  segments: SubtitleSegment[],
  speakerNames: Record<string, string> = {}
): string {
  const escape = (value: string) => `"${value.replace(/"/g, '""')}"`;
  const rows = segments.map((s) =>
    [
      formatTimecode(s.start_s),
      formatTimecode(s.end_s),
      escape(speakerLabel(s.speaker, speakerNames)),
      escape(s.text.trim()),
    ].join(",")
  );
  return ["start,end,speaker,text", ...rows].join("\n") + "\n";
}

export function toJsonExport(
  segments: SubtitleSegment[],
  meta: Record<string, unknown> = {}
): string {
  return JSON.stringify({ ...meta, segments }, null, 2);
}

export type ExportFormat = "srt" | "vtt" | "txt" | "md" | "csv" | "json";

export const EXPORT_MIME: Record<ExportFormat, string> = {
  srt: "application/x-subrip",
  vtt: "text/vtt",
  txt: "text/plain",
  md: "text/markdown",
  csv: "text/csv",
  json: "application/json",
};
