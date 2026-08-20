import { NextRequest, NextResponse } from "next/server";
import { requireCreator } from "@/lib/authz";
import {
  appendSegments,
  getTranscript,
  updateTranscript,
} from "@/lib/transcripts";
import { transcribeChunk } from "@/lib/openai-whisper";

type Params = { params: Promise<{ id: string }> };

/**
 * Transcribe one chunk of a recording.
 *
 * The browser drives this: it has already decoded the audio, so it posts each
 * chunk in turn and we forward it to OpenAI. That keeps every request short
 * enough to survive a gateway, and it means the progress bar is counting real
 * work rather than guessing.
 *
 * Each chunk's segments are appended as they land, so a job that is
 * interrupted half way leaves half a transcript rather than nothing.
 */
export const maxDuration = 300;

export async function POST(req: NextRequest, { params }: Params) {
  try {
    const auth = await requireCreator();
    if (auth.response) return auth.response;
    const { id } = await params;

    const form = await req.formData();
    const audio = form.get("audio");
    if (!(audio instanceof File)) {
      return NextResponse.json({ error: "audio is required" }, { status: 400 });
    }
    const index = Number(form.get("index") ?? 0);
    const total = Number(form.get("total") ?? 1);
    const offsetS = Number(form.get("offsetS") ?? 0);
    if (!Number.isFinite(index) || !Number.isFinite(offsetS)) {
      return NextResponse.json({ error: "Bad chunk metadata" }, { status: 400 });
    }

    const transcript = await getTranscript(id);
    if (!transcript) {
      return NextResponse.json({ error: "Not found" }, { status: 404 });
    }
    if (transcript.status === "cancelled") {
      return NextResponse.json({ error: "This job was cancelled" }, { status: 409 });
    }

    const result = await transcribeChunk({
      audio: await audio.arrayBuffer(),
      filename: `chunk-${index}.wav`,
      contentType: "audio/wav",
      offsetS,
      language: transcript.language,
      translate: transcript.task === "translate",
      vocabulary: transcript.vocabulary,
    });

    // The first chunk replaces whatever was there (this may be a re-run);
    // the rest append to it.
    await appendSegments(
      id,
      result.segments.map((segment) => ({
        start_s: segment.start,
        end_s: segment.end,
        text: segment.text,
        words: segment.words,
        speaker: null,
      })),
      { replace: index === 0 }
    );

    const done = index + 1 >= total;
    const updated = await updateTranscript(id, {
      status: done ? "ready" : "running",
      progress: done ? 100 : Math.round(((index + 1) / Math.max(1, total)) * 100),
      stage: done ? "" : "transcribing",
      error: null,
      // Whisper reports the language it heard; the first chunk is the one
      // that decided it.
      language: index === 0 ? languageCode(result.language) : undefined,
      model: "whisper-1",
      device: "openai",
    });

    return NextResponse.json({
      transcript: updated,
      segments: result.segments.length,
      done,
    });
  } catch (err) {
    const message = err instanceof Error ? err.message : "Chunk failed";
    const { id } = await params;
    await updateTranscript(id, { status: "failed", error: message.slice(0, 2000) });
    return NextResponse.json({ error: message }, { status: 502 });
  }
}

/**
 * Whisper answers with a language name ("english"), and everything else here
 * speaks ISO codes.
 */
function languageCode(language: string | null): string | null {
  if (!language) return null;
  const name = language.trim().toLowerCase();
  if (/^[a-z]{2}$/.test(name)) return name;
  const codes: Record<string, string> = {
    english: "en",
    arabic: "ar",
    french: "fr",
    spanish: "es",
    german: "de",
    italian: "it",
    hindi: "hi",
    urdu: "ur",
    turkish: "tr",
    russian: "ru",
    chinese: "zh",
    japanese: "ja",
    korean: "ko",
    portuguese: "pt",
    dutch: "nl",
    persian: "fa",
    hebrew: "he",
  };
  return codes[name] ?? name.slice(0, 2);
}
