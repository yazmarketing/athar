import { NextRequest, NextResponse } from "next/server";
import { getSessionUser } from "@/lib/auth-session";
import { requireCreator } from "@/lib/authz";
import { resolveDbUserId } from "@/lib/auth-users";
import { logAudit } from "@/lib/audit";
import { createTranscript, listTranscripts, updateTranscript } from "@/lib/transcripts";
import { whisperApiConfigured } from "@/lib/openai-whisper";

export async function GET(req: NextRequest) {
  try {
    const sessionUser = await getSessionUser();
    if (!sessionUser?.id) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }
    const params = req.nextUrl.searchParams;
    const transcripts = await listTranscripts({
      clientId: params.get("clientId"),
      projectId: params.get("projectId"),
      createdBy: params.get("owner") === "mine" ? sessionUser.id : null,
      includeArchived: params.get("archived") === "true",
      limit: Number(params.get("limit")) || undefined,
    });
    return NextResponse.json({ transcripts });
  } catch (err) {
    const message = err instanceof Error ? err.message : "Query failed";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}

/**
 * Start a transcription. The browser has already decoded the audio. Storage
 * of the WAV is best-effort: a missing CORS rule on the Space used to crash
 * the upload with "Failed to parse body as FormData", so a job can start
 * with no media_url and still transcribe from the chunks in hand.
 */
export async function POST(req: NextRequest) {
  try {
    const auth = await requireCreator();
    if (auth.response) return auth.response;

    const body = (await req.json()) as {
      title?: string;
      mediaUrl?: string;
      mediaKind?: "audio" | "video";
      mediaBytes?: number;
      language?: string | null;
      task?: "transcribe" | "translate";
      diarize?: boolean;
      vocabulary?: string;
      clientId?: string | null;
      projectId?: string | null;
    };

    if (!whisperApiConfigured()) {
      return NextResponse.json(
        {
          error:
            "Transcription is not configured — set OPENAI_API_KEY (see the Transcribe section of the README)",
        },
        { status: 503 }
      );
    }

    const createdBy = await resolveDbUserId(auth.user);

    const transcript = await createTranscript({
      title: body.title ?? "",
      mediaUrl: body.mediaUrl?.trim() ?? "",
      mediaKind: body.mediaKind === "video" ? "video" : "audio",
      mediaBytes: body.mediaBytes ?? null,
      task: body.task === "translate" ? "translate" : "transcribe",
      diarize: body.diarize === true,
      vocabulary: body.vocabulary ?? "",
      language: body.language ?? null,
      clientId: body.clientId ?? null,
      projectId: body.projectId ?? null,
      createdBy,
    });

    // Nothing is submitted here. The browser has the decoded audio and posts
    // it a chunk at a time to /chunk, which is what keeps each request short
    // and the progress bar honest.
    await updateTranscript(transcript.id, { status: "running", stage: "transcribing" });

    await logAudit({
      userId: auth.user.id,
      userEmail: auth.user.email,
      action: "transcript.create",
      subjectType: "transcript",
      subjectId: transcript.id,
      meta: { title: transcript.title, diarize: transcript.diarize },
    });

    return NextResponse.json({ transcript });
  } catch (err) {
    const raw = err instanceof Error ? err.message : "Create failed";
    const message = /foreign key constraint/i.test(raw)
      ? "Could not save the transcript against this account. Sign out and back in, then retry."
      : raw;
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
