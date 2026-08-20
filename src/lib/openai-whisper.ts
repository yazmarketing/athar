import "server-only";

/**
 * OpenAI's hosted Whisper — the same model as github.com/openai/whisper, run
 * by OpenAI. SERVER ONLY.
 *
 * `whisper-1` specifically, and deliberately: it is the only transcription
 * model OpenAI offers with word-level timestamps, which is the whole point of
 * this feature. The newer gpt-4o-transcribe models score better on accuracy
 * and return no timings at all.
 *
 * The endpoint takes one file per request and caps it at 25MB, so callers send
 * short chunks and stitch the results — see `audio-chunks.ts` for the
 * arithmetic and `/api/transcripts/[id]/chunk` for the flow.
 */

const OPENAI_BASE = process.env.OPENAI_BASE_URL ?? "https://api.openai.com/v1";

/** OpenAI's own hard limit on an audio upload. */
export const MAX_UPLOAD_BYTES = 25 * 1024 * 1024;

export function whisperApiConfigured(): boolean {
  return Boolean(process.env.OPENAI_API_KEY?.trim());
}

export type WhisperWord = { w: string; s: number; e: number };

export type WhisperSegment = {
  start: number;
  end: number;
  text: string;
  words: WhisperWord[];
};

type VerboseJson = {
  language?: string;
  duration?: number;
  text?: string;
  segments?: { start: number; end: number; text: string }[];
  words?: { word: string; start: number; end: number }[];
};

export type ChunkResult = {
  segments: WhisperSegment[];
  language: string | null;
  duration: number;
};

/**
 * Transcribe one chunk of audio.
 *
 * `offsetS` shifts every timestamp back onto the original recording's
 * timeline, so the caller can concatenate chunks without doing the arithmetic
 * twice.
 */
export async function transcribeChunk(opts: {
  audio: ArrayBuffer;
  filename: string;
  contentType: string;
  /** Seconds into the full recording that this chunk begins. */
  offsetS: number;
  /** ISO code to force, or null to let the model detect it. */
  language?: string | null;
  /** Render a non-English recording as English instead. */
  translate?: boolean;
  /** Names and product words biased into the decode (224 tokens max). */
  vocabulary?: string;
}): Promise<ChunkResult> {
  const key = process.env.OPENAI_API_KEY?.trim();
  if (!key) throw new Error("Missing OPENAI_API_KEY env var");
  if (opts.audio.byteLength > MAX_UPLOAD_BYTES) {
    throw new Error(
      `Chunk is ${(opts.audio.byteLength / 1024 / 1024).toFixed(1)}MB — OpenAI accepts 25MB`
    );
  }

  const form = new FormData();
  form.append("file", new Blob([opts.audio], { type: opts.contentType }), opts.filename);
  form.append("model", "whisper-1");
  form.append("response_format", "verbose_json");
  if (opts.vocabulary?.trim()) {
    // Whisper takes this as the "previous" text and continues its style, so
    // names spelled here come back spelled the same way.
    form.append("prompt", opts.vocabulary.trim().slice(0, 900));
  }

  /**
   * Translation is a different endpoint, always renders English, and does not
   * accept word granularity — so a translated transcript is timed per segment
   * rather than per word, and the UI simply has no word highlight for it.
   */
  const path = opts.translate ? "/audio/translations" : "/audio/transcriptions";
  if (!opts.translate) {
    form.append("timestamp_granularities[]", "segment");
    form.append("timestamp_granularities[]", "word");
    if (opts.language) form.append("language", opts.language);
  }

  const res = await fetch(`${OPENAI_BASE}${path}`, {
    method: "POST",
    headers: { Authorization: `Bearer ${key}` },
    body: form,
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

  const json = (await res.json()) as VerboseJson;
  return {
    segments: mergeWordsIntoSegments(json, opts.offsetS),
    language: json.language ?? null,
    duration: json.duration ?? 0,
  };
}

/**
 * Fold the flat word list back into its segments.
 *
 * The API returns segments and words as two parallel lists with no link
 * between them, so each word is placed in the segment its start time falls
 * inside. Everything is shifted by `offset` on the way through.
 */
export function mergeWordsIntoSegments(
  json: VerboseJson,
  offset = 0
): WhisperSegment[] {
  const rawSegments = json.segments ?? [];
  const rawWords = json.words ?? [];

  // No segments at all (a very short chunk) but text came back — keep it
  // rather than dropping the audio on the floor.
  if (rawSegments.length === 0) {
    const text = json.text?.trim();
    if (!text) return [];
    return [
      {
        start: offset,
        end: offset + (json.duration ?? 0),
        text,
        words: rawWords.map((w) => ({
          w: w.word.trim(),
          s: w.start + offset,
          e: w.end + offset,
        })),
      },
    ];
  }

  let cursor = 0;
  return rawSegments.map((segment) => {
    const words: WhisperWord[] = [];
    // The word list is in order, so this walks it once across all segments
    // rather than scanning it per segment.
    while (cursor < rawWords.length && rawWords[cursor].start < segment.end) {
      const word = rawWords[cursor];
      if (word.start >= segment.start || words.length === 0) {
        words.push({
          w: word.word.trim(),
          s: word.start + offset,
          e: word.end + offset,
        });
      }
      cursor++;
    }
    return {
      start: segment.start + offset,
      end: segment.end + offset,
      text: segment.text.trim(),
      words,
    };
  });
}
