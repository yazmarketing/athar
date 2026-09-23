import { NextRequest, NextResponse } from "next/server";
import { requireCreator } from "@/lib/authz";
import { resolveDbUserId } from "@/lib/auth-users";
import { logAudit } from "@/lib/audit";
import {
  getTtsDirectorAnalysis,
  getTtsDirectorSegment,
  getTtsDirectorTake,
  recordTtsDirectorSelection,
} from "@/lib/tts-director";

type Body = { segmentId?: string; selectedTakeId?: string; rejectedTakeIds?: string[] };

/** Record a take pick + its rejects — this log is the learning loop's only input. */
export async function POST(req: NextRequest) {
  try {
    const auth = await requireCreator();
    if (auth.response) return auth.response;

    const body = (await req.json()) as Body;
    const segmentId = body.segmentId?.trim();
    const selectedTakeId = body.selectedTakeId?.trim();
    if (!segmentId || !selectedTakeId) {
      return NextResponse.json(
        { error: "segmentId and selectedTakeId are required" },
        { status: 400 }
      );
    }

    const [segment, selectedTake] = await Promise.all([
      getTtsDirectorSegment(segmentId),
      getTtsDirectorTake(selectedTakeId),
    ]);
    if (!segment) return NextResponse.json({ error: "Segment not found" }, { status: 404 });
    if (!selectedTake) return NextResponse.json({ error: "Take not found" }, { status: 404 });

    const analysis = await getTtsDirectorAnalysis(segment.analysis_id);
    const createdBy = await resolveDbUserId(auth.user);

    await recordTtsDirectorSelection({
      segmentId,
      selectedTakeId,
      rejectedTakeIds: (body.rejectedTakeIds ?? []).filter((id) => id !== selectedTakeId),
      voiceId: selectedTake.voice_id,
      context: {
        emotion: segment.emotion,
        pace: segment.pace,
        dialect: analysis?.dialect,
        register_strength: analysis ? Number(analysis.register_strength) : undefined,
      },
      createdBy,
    });

    await logAudit({
      userId: auth.user.id,
      userEmail: auth.user.email,
      action: "tts.director.select",
      subjectType: "tts_director_segment",
      subjectId: segmentId,
      meta: { selectedTakeId },
    });

    return NextResponse.json({ ok: true });
  } catch (err) {
    const message = err instanceof Error ? err.message : "Selection failed";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
