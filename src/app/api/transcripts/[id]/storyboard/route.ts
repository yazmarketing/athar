import { NextRequest, NextResponse } from "next/server";
import { requireCreator } from "@/lib/authz";
import { logAudit } from "@/lib/audit";
import { createStoryboard } from "@/lib/storyboards";
import { getTranscript, listSegments } from "@/lib/transcripts";
import { transcriptToBrief } from "@/lib/transcript-ai";

type Params = { params: Promise<{ id: string }> };

export const maxDuration = 120;

/**
 * Recording → storyboard. Writes the brief from what was actually said and
 * opens a board on it, so an interview becomes a shot list without anyone
 * retyping the thing they just listened to.
 */
export async function POST(req: NextRequest, { params }: Params) {
  try {
    const auth = await requireCreator();
    if (auth.response) return auth.response;
    const { id } = await params;

    const body = (await req.json().catch(() => ({}))) as {
      aspect?: string;
      brandKitId?: string | null;
    };

    const transcript = await getTranscript(id);
    if (!transcript) {
      return NextResponse.json({ error: "Not found" }, { status: 404 });
    }
    const segments = await listSegments(id);
    if (segments.length === 0) {
      return NextResponse.json({ error: "Nothing to plan from" }, { status: 409 });
    }

    const brief = await transcriptToBrief(transcript, segments);
    const storyboard = await createStoryboard({
      title: transcript.title || "From a recording",
      brief,
      clientId: transcript.client_id,
      projectId: transcript.project_id,
      brandKitId: body.brandKitId ?? null,
      aspect: body.aspect ?? "16:9",
      createdBy: auth.user.id,
    });

    await logAudit({
      userId: auth.user.id,
      userEmail: auth.user.email,
      action: "transcript.storyboard",
      subjectType: "transcript",
      subjectId: id,
      meta: { storyboard_id: storyboard.id },
    });
    return NextResponse.json({ storyboard, brief });
  } catch (err) {
    const message = err instanceof Error ? err.message : "Could not build a board";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
