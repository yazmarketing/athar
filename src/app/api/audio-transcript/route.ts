import { NextRequest, NextResponse } from "next/server";
import { requireCreator } from "@/lib/authz";
import {
  MAX_UPLOAD_BYTES,
  transcribeChunk,
  whisperApiConfigured,
} from "@/lib/openai-whisper";

export const maxDuration = 120;

/**
 * Read the spoken words out of a lip-sync reference clip.
 *
 * Seedance syncs mouths noticeably better when the prompt spells out the
 * dialogue, but nobody should have to type their own audio back in — this
 * is the Higgsfield-style convenience: attach the clip, the words follow.
 * The transcript is advisory: a failure here must never block attaching
 * the audio, so the route answers `text: null` instead of erroring where
 * it reasonably can.
 */
export async function POST(req: NextRequest) {
  try {
    const auth = await requireCreator();
    if (auth.response) return auth.response;

    const body = (await req.json()) as { url?: string };
    const url = body.url?.trim();
    if (!url || !/^https?:\/\//i.test(url)) {
      return NextResponse.json(
        { error: "An uploaded audio URL is required" },
        { status: 400 }
      );
    }

    // No OpenAI key configured — the manual prompt format still works.
    if (!whisperApiConfigured()) {
      return NextResponse.json({ text: null, configured: false });
    }

    const res = await fetch(url, { signal: AbortSignal.timeout(30_000) });
    if (!res.ok) {
      return NextResponse.json(
        { error: `Could not fetch the audio (HTTP ${res.status})` },
        { status: 502 }
      );
    }
    const audio = await res.arrayBuffer();
    if (audio.byteLength > MAX_UPLOAD_BYTES) {
      // A lip-sync clip is ≤30s; anything past Whisper's 25MB cap isn't one.
      return NextResponse.json({ text: null, configured: true });
    }

    const filename = url.split("/").pop()?.split("?")[0] || "clip.mp3";
    const contentType =
      res.headers.get("content-type")?.split(";")[0]?.trim() || "audio/mpeg";

    const result = await transcribeChunk({
      audio,
      filename,
      contentType,
      offsetS: 0,
    });
    const text = result.segments
      .map((s) => s.text)
      .join(" ")
      .replace(/\s+/g, " ")
      .trim();

    return NextResponse.json({
      text: text || null,
      language: result.language,
      configured: true,
    });
  } catch (err) {
    const message =
      err instanceof Error ? err.message : "Could not transcribe the audio";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
