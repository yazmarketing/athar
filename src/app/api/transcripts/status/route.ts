import { NextResponse } from "next/server";
import { getSessionUser } from "@/lib/auth-session";
import { whisperApiConfigured } from "@/lib/openai-whisper";

/**
 * Is transcription configured, and what can it do?
 *
 * There is nothing to ping — a hosted API is either reachable when a chunk is
 * sent or it is not, and a health request per page load would be a billable
 * round trip to learn nothing.
 */
export async function GET() {
  const sessionUser = await getSessionUser();
  if (!sessionUser?.id) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const configured = whisperApiConfigured();
  return NextResponse.json({
    configured,
    ok: configured,
    label: "Whisper",
    detail: "whisper-1 · OpenAI",
    capabilities: {
      // whisper-1 has no speaker diarization at all — the UI hides the option
      // rather than offering something that silently does nothing.
      diarization: false,
      translate: true,
      progress: true,
    },
    error: configured
      ? undefined
      : "Transcription is not configured — set OPENAI_API_KEY",
  });
}
