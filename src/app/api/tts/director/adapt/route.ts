import { NextRequest, NextResponse } from "next/server";
import { requireCreator } from "@/lib/authz";
import { logAudit } from "@/lib/audit";
import { runDialectPass, ttsDirectorAiConfigured } from "@/lib/tts-director-ai";
import {
  getTtsDirectorAnalysis,
  listTtsDirectorSegments,
  patchTtsDirectorSegment,
  updateTtsDirectorAnalysis,
} from "@/lib/tts-director";

type Body = { analysisId?: string; registerStrength?: number };

/** Pass 2 — written-to-spoken dialect adaptation. Re-runnable when the register dial moves. */
export async function POST(req: NextRequest) {
  try {
    const auth = await requireCreator();
    if (auth.response) return auth.response;

    if (!ttsDirectorAiConfigured()) {
      return NextResponse.json(
        { error: "VO Director isn't set up yet — ask an admin to add an OpenAI or ModelArk API key." },
        { status: 503 }
      );
    }

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
      return NextResponse.json({ error: "Run the direction pass first" }, { status: 400 });
    }

    const registerStrength = Math.max(
      0,
      Math.min(1, body.registerStrength ?? Number(analysis.register_strength))
    );

    const results = await runDialectPass(
      segments.map((s) => ({
        original: s.original,
        emotion: s.emotion ?? "neutral",
        pace: s.pace ?? "normal",
        continuity: s.continuity ?? "",
      })),
      analysis.overall_direction?.register ?? "",
      registerStrength
    );

    const updatedSegments = await Promise.all(
      segments.map((s, i) => patchTtsDirectorSegment(s.id, { spoken: results[i].spoken }))
    );

    const updated = await updateTtsDirectorAnalysis(analysisId, {
      status: "adapted",
      registerStrength,
    });

    await logAudit({
      userId: auth.user.id,
      userEmail: auth.user.email,
      action: "tts.director.adapt",
      subjectType: "tts_director_analysis",
      subjectId: analysisId,
      meta: { registerStrength },
    });

    return NextResponse.json({ analysis: updated, segments: updatedSegments });
  } catch (err) {
    const message = err instanceof Error ? err.message : "Dialect adaptation failed";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
