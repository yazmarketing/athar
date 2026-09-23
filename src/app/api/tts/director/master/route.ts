import { NextRequest, NextResponse } from "next/server";
import { requireCreator } from "@/lib/authz";
import { resolveDbUserId } from "@/lib/auth-users";
import { logAudit } from "@/lib/audit";
import { concatWav, wavDurationSeconds } from "@/lib/audio-wav";
import { flattenSegments } from "@/lib/tts-segments";
import { DEFAULT_MUNSIT_MODEL } from "@/lib/munsit-tts";
import { uploadPublicObject } from "@/lib/storage";
import { createTtsGeneration } from "@/lib/tts";
import {
  getTtsDirectorAnalysis,
  getTtsDirectorTake,
  listTtsDirectorSegments,
  updateTtsDirectorAnalysis,
} from "@/lib/tts-director";
import type { TtsSegment } from "@/lib/types";

type Body = {
  analysisId?: string;
  title?: string;
  clientId?: string | null;
  projectId?: string | null;
  groupId?: string | null;
};

/**
 * Stitch every segment's SELECTED take audio into a final master. References
 * already-rendered take audio — never re-synthesizes — so what the user
 * heard when picking a take is exactly what ships.
 */
export async function POST(req: NextRequest) {
  try {
    const auth = await requireCreator();
    if (auth.response) return auth.response;

    const body = (await req.json()) as Body;
    const analysisId = body.analysisId?.trim();
    if (!analysisId) {
      return NextResponse.json({ error: "analysisId is required" }, { status: 400 });
    }

    const analysis = await getTtsDirectorAnalysis(analysisId);
    if (!analysis) {
      return NextResponse.json({ error: "Analysis not found" }, { status: 404 });
    }

    const segments = await listTtsDirectorSegments(analysisId);
    if (segments.length === 0) {
      return NextResponse.json({ error: "This analysis has no segments" }, { status: 400 });
    }
    const missing = segments.filter((s) => !s.selected_take_id);
    if (missing.length > 0) {
      return NextResponse.json(
        { error: `${missing.length} segment(s) still need a take picked before generating the master` },
        { status: 400 }
      );
    }

    const takes = await Promise.all(
      segments.map((s) => getTtsDirectorTake(s.selected_take_id as string))
    );
    const failedIdx = takes.findIndex((t) => !t || t.status !== "ready" || !t.output_url);
    if (failedIdx >= 0) {
      return NextResponse.json(
        { error: `Segment ${failedIdx + 1}'s selected take has no usable audio` },
        { status: 400 }
      );
    }

    const buffers = await Promise.all(
      takes.map(async (t) => {
        const res = await fetch(t!.output_url as string);
        if (!res.ok) throw new Error(`Could not fetch take audio (${res.status})`);
        return Buffer.from(await res.arrayBuffer());
      })
    );

    // v1: takes are concatenated back-to-back with no inserted silence —
    // pause blocks between beats aren't modeled at the director-segment
    // level yet. See the plan's punctuation cleanup for in-line pacing.
    const audio = concatWav(buffers);

    const path = `tts/${Date.now()}-${Math.random().toString(36).slice(2, 8)}.wav`;
    const outputUrl = await uploadPublicObject(
      path,
      new Uint8Array(audio).buffer as ArrayBuffer,
      "audio/wav"
    );

    const builtSegments: TtsSegment[] = segments.map((s, i) => ({
      type: "speech",
      voiceId: takes[i]!.voice_id,
      voiceName: takes[i]!.voice_id,
      text: s.tts || s.spoken || s.original,
    }));

    const charCount = takes.reduce((sum, t) => sum + (t?.char_count ?? 0), 0);
    const cost = takes.reduce((sum, t) => sum + (t?.cost ?? 0), 0);
    const avgStability = takes.reduce((sum, t) => sum + (t?.stability ?? 0.5), 0) / takes.length;
    const avgSpeed = takes.reduce((sum, t) => sum + (t?.speed ?? 1.0), 0) / takes.length;
    const createdBy = await resolveDbUserId(auth.user);

    const generation = await createTtsGeneration({
      title: body.title,
      status: "ready",
      segments: builtSegments,
      text: flattenSegments(builtSegments),
      model: analysis.model ?? DEFAULT_MUNSIT_MODEL,
      stability: avgStability,
      speed: avgSpeed,
      sampleRate: 24000,
      dialect: analysis.dialect,
      wordTimestamps: false,
      charCount,
      cost,
      outputUrl,
      durationS: wavDurationSeconds(audio),
      clientId: body.clientId ?? analysis.client_id,
      projectId: body.projectId ?? analysis.project_id,
      groupId: body.groupId ?? null,
      directorAnalysisId: analysisId,
      createdBy,
    });

    await updateTtsDirectorAnalysis(analysisId, { status: "complete" });

    await logAudit({
      userId: auth.user.id,
      userEmail: auth.user.email,
      action: "tts.director.master",
      subjectType: "tts_generation",
      subjectId: generation.id,
      meta: { analysisId, segments: segments.length },
    });

    return NextResponse.json({ generation });
  } catch (err) {
    const message = err instanceof Error ? err.message : "Master generation failed";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
