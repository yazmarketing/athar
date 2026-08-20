import { NextRequest, NextResponse } from "next/server";
import { getSessionUser } from "@/lib/auth-session";
import { requireAdmin, requireCreator } from "@/lib/authz";
import { logAudit } from "@/lib/audit";
import {
  deleteTranscript,
  getTranscript,
  updateTranscript,
} from "@/lib/transcripts";

type Params = { params: Promise<{ id: string }> };

export async function GET(req: NextRequest, { params }: Params) {
  try {
    const sessionUser = await getSessionUser();
    if (!sessionUser?.id) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }
    const { id } = await params;
    // Polling for progress does not need thousands of segments back with it.
    const withSegments = req.nextUrl.searchParams.get("segments") !== "false";
    const transcript = await getTranscript(id, { withSegments });
    if (!transcript) {
      return NextResponse.json({ error: "Not found" }, { status: 404 });
    }
    return NextResponse.json({ transcript });
  } catch (err) {
    const message = err instanceof Error ? err.message : "Query failed";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}

export async function PATCH(req: NextRequest, { params }: Params) {
  try {
    const auth = await requireCreator();
    if (auth.response) return auth.response;
    const { id } = await params;

    const body = (await req.json()) as {
      title?: string;
      clientId?: string | null;
      projectId?: string | null;
      /** { SPEAKER_00: "Yazan" } — merged over what is already stored. */
      speakerNames?: Record<string, string>;
      vocabulary?: string;
      archived?: boolean;
      cancel?: boolean;
    };

    if (body.cancel) {
      // The browser checks this before sending each chunk, so marking the row
      // is the whole of the cancellation.
      const cancelled = await updateTranscript(id, {
        status: "cancelled",
        stage: "",
      });
      return NextResponse.json({ transcript: cancelled });
    }

    let speakerNames: Record<string, string> | undefined;
    if (body.speakerNames) {
      const current = await getTranscript(id);
      if (!current) {
        return NextResponse.json({ error: "Not found" }, { status: 404 });
      }
      speakerNames = { ...current.speaker_names, ...body.speakerNames };
      // An emptied name means "go back to Speaker 1", not "store a blank".
      for (const [key, value] of Object.entries(speakerNames)) {
        if (!value.trim()) delete speakerNames[key];
      }
    }

    const transcript = await updateTranscript(id, {
      title: body.title,
      clientId: body.clientId,
      projectId: body.projectId,
      vocabulary: body.vocabulary,
      archived: body.archived,
      speakerNames,
    });
    if (!transcript) {
      return NextResponse.json({ error: "Not found" }, { status: 404 });
    }
    return NextResponse.json({ transcript });
  } catch (err) {
    const message = err instanceof Error ? err.message : "Update failed";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}

export async function DELETE(_req: NextRequest, { params }: Params) {
  try {
    const auth = await requireAdmin();
    if (auth.response) return auth.response;
    const { id } = await params;

    await deleteTranscript(id);
    await logAudit({
      userId: auth.user.id,
      userEmail: auth.user.email,
      action: "transcript.delete",
      subjectType: "transcript",
      subjectId: id,
    });
    return NextResponse.json({ ok: true });
  } catch (err) {
    const message = err instanceof Error ? err.message : "Delete failed";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
