import "server-only";
import { arkChat } from "@/lib/byteplus-server";
import { openaiChat, openaiConfigured } from "@/lib/openai-server";
import { parsePlannerJson } from "@/lib/shot-plan";
import { formatClock, speakerLabel } from "@/lib/subtitles";
import type {
  TranscriptInsights,
  TranscriptRecord,
  TranscriptSegmentRecord,
} from "@/lib/types";

/**
 * The reading layer — what turns an hour of audio into something a person can
 * act on in a minute: a summary, the decisions, the chapters, and the pull
 * quotes worth cutting.
 *
 * Everything here works off a timecoded rendering of the transcript, so every
 * claim the model makes can be traced back to a point in the audio.
 */

class TranscriptAiError extends Error {}

/** OpenAI first, ModelArk second — the same order the shot planner uses. */
async function chat(opts: {
  messages: { role: "system" | "user" | "assistant"; content: string }[];
  temperature?: number;
  maxTokens?: number;
}): Promise<string> {
  const providers = openaiConfigured() ? [openaiChat, arkChat] : [arkChat];
  let firstError: Error | null = null;
  for (const provider of providers) {
    try {
      const text = await provider(opts);
      if (text) return text;
    } catch (err) {
      firstError ??= err instanceof Error ? err : new Error(String(err));
    }
  }
  throw firstError ?? new TranscriptAiError("No text model responded");
}

/**
 * Render the transcript for a prompt: one timecoded line per speaker turn.
 *
 * Long recordings are sampled rather than truncated — taking the first N
 * characters of a two-hour interview would summarise the small talk and miss
 * the decision at the end.
 */
export function transcriptToText(
  segments: TranscriptSegmentRecord[],
  speakerNames: Record<string, string> = {},
  opts: { maxChars?: number } = {}
): string {
  const maxChars = opts.maxChars ?? 48000;
  const lines: string[] = [];
  let currentSpeaker: string | null | undefined;
  let buffer: string[] = [];
  let blockStart = 0;

  const flush = () => {
    if (!buffer.length) return;
    const label = speakerLabel(currentSpeaker, speakerNames);
    const head = `[${formatClock(blockStart)}]${label ? ` ${label}:` : ""}`;
    lines.push(`${head} ${buffer.join(" ").replace(/\s+/g, " ").trim()}`);
    buffer = [];
  };

  segments.forEach((segment) => {
    if (!segment.text.trim()) return;
    if (!buffer.length || segment.speaker !== currentSpeaker) {
      flush();
      currentSpeaker = segment.speaker;
      blockStart = segment.start_s;
    }
    buffer.push(segment.text.trim());
  });
  flush();

  const full = lines.join("\n");
  if (full.length <= maxChars) return full;

  // Keep the opening and the close whole, and thin the middle evenly.
  const head = Math.floor(maxChars * 0.35);
  const tail = Math.floor(maxChars * 0.35);
  const middleBudget = maxChars - head - tail;
  const middle = full.slice(head, full.length - tail);
  const step = Math.max(1, Math.ceil(middle.length / middleBudget));
  const thinned = middle
    .split("\n")
    .filter((_, i) => i % step === 0)
    .join("\n");
  return [
    full.slice(0, head),
    "\n[… middle of the recording sampled for length …]\n",
    thinned,
    full.slice(full.length - tail),
  ].join("\n");
}

const INSIGHTS_SYSTEM = [
  "You are a sharp producer at a creative agency reading a transcript.",
  "Every line is prefixed with its timecode as [m:ss] or [h:mm:ss].",
  "Return ONLY JSON with these keys:",
  '{"summary":"3-5 sentences, what this recording is and what came out of it",',
  '"key_points":["…"],',
  '"action_items":[{"task":"…","owner":"name or Unassigned","timecode":"m:ss"}],',
  '"chapters":[{"timecode":"m:ss","title":"short title"}],',
  '"clips":[{"start":"m:ss","end":"m:ss","quote":"the words said, verbatim",',
  '"caption":"a social caption in the speaker\'s own register","why":"why it lands"}]}',
  "Rules: use ONLY timecodes that appear in the transcript. Quotes must be",
  "verbatim. Pick 3-5 clips, each 15-45 seconds, that stand alone without",
  "context — a claim, a number, a story, or a line with real feeling. Write in",
  "the language the transcript is in; if it is Arabic, write Arabic.",
].join(" ");

/** "1:02:03" / "4:07" / "17" → seconds. */
export function parseTimecode(value: unknown): number {
  if (typeof value === "number" && Number.isFinite(value)) return Math.max(0, value);
  if (typeof value !== "string") return 0;
  const parts = value
    .replace(/[[\]]/g, "")
    .trim()
    .split(":")
    .map((p) => Number(p.trim()));
  if (parts.some((p) => !Number.isFinite(p))) return 0;
  return Math.max(0, parts.reduce((total, part) => total * 60 + part, 0));
}

function asString(value: unknown, fallback = ""): string {
  return typeof value === "string" ? value.trim() : fallback;
}

export async function generateInsights(
  transcript: TranscriptRecord,
  segments: TranscriptSegmentRecord[]
): Promise<TranscriptInsights> {
  if (segments.length === 0) {
    throw new TranscriptAiError("Nothing to read — this transcript is empty");
  }
  const body = transcriptToText(segments, transcript.speaker_names);
  const raw = await chat({
    messages: [
      { role: "system", content: INSIGHTS_SYSTEM },
      {
        role: "user",
        content: `Title: ${transcript.title}\n\nTranscript:\n${body}`,
      },
    ],
    temperature: 0.3,
    maxTokens: 2600,
  });

  let parsed: Record<string, unknown>;
  try {
    parsed = parsePlannerJson(raw) as Record<string, unknown>;
  } catch {
    throw new TranscriptAiError("Could not read the summary — try again");
  }

  const duration = transcript.duration_s ?? Infinity;
  const inRange = (s: number) => s >= 0 && s <= duration;

  const clips = (Array.isArray(parsed.clips) ? parsed.clips : [])
    .map((clip) => {
      const c = clip as Record<string, unknown>;
      const start = parseTimecode(c.start);
      const end = parseTimecode(c.end);
      return {
        start_s: start,
        // A clip the model gave no end for still needs an out point.
        end_s: end > start ? end : start + 30,
        quote: asString(c.quote),
        caption: asString(c.caption),
        why: asString(c.why),
      };
    })
    .filter((clip) => clip.quote && inRange(clip.start_s));

  return {
    summary: asString(parsed.summary),
    key_points: (Array.isArray(parsed.key_points) ? parsed.key_points : [])
      .map((p) => asString(p))
      .filter(Boolean),
    action_items: (Array.isArray(parsed.action_items) ? parsed.action_items : [])
      .map((item) => {
        const i = item as Record<string, unknown>;
        return {
          task: asString(i.task),
          owner: asString(i.owner, "Unassigned"),
          start_s: parseTimecode(i.timecode ?? i.start),
        };
      })
      .filter((item) => item.task),
    chapters: (Array.isArray(parsed.chapters) ? parsed.chapters : [])
      .map((chapter) => {
        const c = chapter as Record<string, unknown>;
        return {
          start_s: parseTimecode(c.timecode ?? c.start),
          title: asString(c.title),
        };
      })
      .filter((chapter) => chapter.title)
      .sort((a, b) => a.start_s - b.start_s),
    clips,
    generated_at: new Date().toISOString(),
    model: openaiConfigured() ? "openai" : "modelark",
  };
}

export type TranscriptAnswer = {
  answer: string;
  citations: { start_s: number; quote: string }[];
};

/** Ask the recording a question and get the timecodes it is answered at. */
export async function answerQuestion(
  transcript: TranscriptRecord,
  segments: TranscriptSegmentRecord[],
  question: string
): Promise<TranscriptAnswer> {
  const body = transcriptToText(segments, transcript.speaker_names);
  const raw = await chat({
    messages: [
      {
        role: "system",
        content: [
          "Answer questions about this transcript and nothing else.",
          "Every line is prefixed with its timecode.",
          'Return ONLY JSON: {"answer":"…","citations":[{"timecode":"m:ss","quote":"verbatim words"}]}',
          "If the recording does not answer it, say so plainly in `answer` and",
          "return an empty citations array. Never invent a timecode or a quote.",
          "Answer in the language the question was asked in.",
        ].join(" "),
      },
      { role: "user", content: `Transcript:\n${body}\n\nQuestion: ${question}` },
    ],
    temperature: 0.2,
    maxTokens: 1200,
  });

  try {
    const parsed = parsePlannerJson(raw) as Record<string, unknown>;
    return {
      answer: asString(parsed.answer, raw.trim()),
      citations: (Array.isArray(parsed.citations) ? parsed.citations : [])
        .map((citation) => {
          const c = citation as Record<string, unknown>;
          return {
            start_s: parseTimecode(c.timecode ?? c.start),
            quote: asString(c.quote),
          };
        })
        .filter((c) => c.quote),
    };
  } catch {
    // A model that answered in prose still answered.
    return { answer: raw.trim(), citations: [] };
  }
}

/**
 * Translate segments for bilingual subtitles.
 *
 * Batched and index-keyed rather than one call per line: subtitle timing is
 * already fixed, so the only job is to return exactly as many lines as went
 * in, in the same order.
 */
export async function translateSegments(
  segments: TranscriptSegmentRecord[],
  targetLanguage: string,
  batchSize = 40
): Promise<Record<string, string>> {
  const out: Record<string, string> = {};
  const usable = segments.filter((s) => s.text.trim());

  for (let i = 0; i < usable.length; i += batchSize) {
    const batch = usable.slice(i, i + batchSize);
    const numbered = batch.map((s, n) => `${n + 1}. ${s.text.trim()}`).join("\n");
    const raw = await chat({
      messages: [
        {
          role: "system",
          content: [
            `Translate each numbered line into ${targetLanguage}.`,
            "These are subtitles: keep each line roughly the same length as the",
            "original, keep the tone, and do not merge or split lines.",
            'Return ONLY JSON: {"lines":[{"n":1,"text":"…"}]} with one entry per',
            "input line, same numbering.",
          ].join(" "),
        },
        { role: "user", content: numbered },
      ],
      temperature: 0.2,
      maxTokens: 2400,
    });

    try {
      const parsed = parsePlannerJson(raw) as { lines?: unknown };
      const lines = Array.isArray(parsed.lines) ? parsed.lines : [];
      for (const line of lines) {
        const l = line as Record<string, unknown>;
        const index = Number(l.n) - 1;
        const text = asString(l.text);
        if (batch[index] && text) out[batch[index].id] = text;
      }
    } catch {
      // Skip the batch rather than fail the whole file — a gap in the
      // translation is recoverable, a lost hour of work is not.
      continue;
    }
  }
  return out;
}

/**
 * Turn a recording into a brief the storyboard planner can plan against.
 * This is the handoff: interview in, shot list out, without retyping anything.
 */
export async function transcriptToBrief(
  transcript: TranscriptRecord,
  segments: TranscriptSegmentRecord[]
): Promise<string> {
  const body = transcriptToText(segments, transcript.speaker_names, {
    maxChars: 24000,
  });
  return chat({
    messages: [
      {
        role: "system",
        content: [
          "You turn a recording into a film brief for a storyboard planner.",
          "Write 120-200 words of plain prose — no headings, no bullet points,",
          "no JSON. Say what the piece is about, who is in it, the tone, the",
          "setting, and the story beats in order. Use what was actually said;",
          "quote a line if it belongs on screen. Do not invent a client or a",
          "product that never comes up.",
        ].join(" "),
      },
      { role: "user", content: `Title: ${transcript.title}\n\n${body}` },
    ],
    temperature: 0.4,
    maxTokens: 700,
  });
}
