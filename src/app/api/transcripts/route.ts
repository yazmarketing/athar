import { NextRequest, NextResponse } from "next/server";
import { getSessionUser } from "@/lib/auth-session";
import { requireCreator } from "@/lib/authz";
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
 * Start a transcription. The media is already in our Space by this point —
 * the browser either uploaded it or picked an existing render — so all this
 * does is write the row and hand the worker a URL.
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

    if (!body.mediaUrl?.trim()) {
      return NextResponse.json({ error: "mediaUrl is required" }, { status: 400 });
    }
    if (!whisperApiConfigured()) {
      return NextResponse.json(
        {
          error:
            "Transcription is not configured — set OPENAI_API_KEY (see the Transcribe section of the README)",
        },
        { status: 503 }
      );
    }

    const transcript = await createTranscript({
      title: body.title ?? "",
      mediaUrl: body.mediaUrl.trim(),
      mediaKind: body.mediaKind === "video" ? "video" : "audio",
      mediaBytes: body.mediaBytes ?? null,
      task: body.task === "translate" ? "translate" : "transcribe",
      diarize: body.diarize === true,
      vocabulary: body.vocabulary ?? "",
      language: body.language ?? null,
      clientId: body.clientId ?? null,
      projectId: body.projectId ?? null,
      createdBy: auth.user.id,
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
    const message = err instanceof Error ? err.message : "Create failed";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
