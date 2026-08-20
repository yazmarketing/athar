import { NextRequest, NextResponse } from "next/server";
import { requireCreator } from "@/lib/authz";
import {
  listSegments,
  mergeSegmentUp,
  splitSegment,
  updateSegment,
} from "@/lib/transcripts";

type Params = { params: Promise<{ id: string }> };

/** Correct one line. Edits set `edited`, so a re-run never clobbers them. */
export async function PATCH(req: NextRequest, { params }: Params) {
  try {
    const auth = await requireCreator();
    if (auth.response) return auth.response;
    await params;

    const body = (await req.json()) as {
      segmentId?: string;
      text?: string;
      speaker?: string | null;
      startS?: number;
      endS?: number;
    };
    if (!body.segmentId) {
      return NextResponse.json({ error: "segmentId is required" }, { status: 400 });
    }

    const segment = await updateSegment(body.segmentId, {
      text: body.text,
      speaker: body.speaker,
      startS: body.startS,
      endS: body.endS,
    });
    if (!segment) {
      return NextResponse.json({ error: "Nothing to update" }, { status: 400 });
    }
    return NextResponse.json({ segment });
  } catch (err) {
    const message = err instanceof Error ? err.message : "Update failed";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}

/**
 * Fix the diarizer's seams: merge a turn it split mid-sentence, or split one
 * where it put two people in the same line.
 */
export async function POST(req: NextRequest, { params }: Params) {
  try {
    const auth = await requireCreator();
    if (auth.response) return auth.response;
    const { id } = await params;

    const body = (await req.json()) as {
      action?: "merge" | "split" | "assign-speaker-below";
      segmentId?: string;
      wordIndex?: number;
      speaker?: string | null;
    };
    if (!body.segmentId) {
      return NextResponse.json({ error: "segmentId is required" }, { status: 400 });
    }

    if (body.action === "merge") {
      const segments = await mergeSegmentUp(body.segmentId);
      if (!segments) {
        return NextResponse.json(
          { error: "Nothing above this line to merge into" },
          { status: 400 }
        );
      }
      return NextResponse.json({ segments });
    }

    if (body.action === "split") {
      const segments = await splitSegment(body.segmentId, body.wordIndex ?? 0);
      if (!segments) {
        return NextResponse.json(
          { error: "Pick a word inside the line to split at" },
          { status: 400 }
        );
      }
      return NextResponse.json({ segments });
    }

    if (body.action === "assign-speaker-below") {
      // Relabelling from a point onwards — the fix when the diarizer swapped
      // two voices halfway through and every line after it is wrong.
      const all = await listSegments(id);
      const from = all.find((s) => s.id === body.segmentId);
      if (!from) {
        return NextResponse.json({ error: "Segment not found" }, { status: 404 });
      }
      const targets = all.filter(
        (s) => s.idx >= from.idx && s.speaker === from.speaker
      );
      for (const target of targets) {
        await updateSegment(target.id, { speaker: body.speaker ?? null });
      }
      return NextResponse.json({ segments: await listSegments(id) });
    }

    return NextResponse.json({ error: "Unknown action" }, { status: 400 });
  } catch (err) {
    const message = err instanceof Error ? err.message : "Action failed";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
