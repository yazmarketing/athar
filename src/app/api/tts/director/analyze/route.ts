import { NextRequest, NextResponse } from "next/server";
import { requireCreator } from "@/lib/authz";
import { resolveDbUserId } from "@/lib/auth-users";
import { logAudit } from "@/lib/audit";
import { MAX_TTS_CHARACTERS } from "@/lib/tts-segments";
import { openaiConfigured, openaiModel } from "@/lib/openai-server";
import {
  runDirectionPass,
  runQuickOptimize,
  ttsDirectorAiConfigured,
} from "@/lib/tts-director-ai";
import { candidatePhoneticEntries } from "@/lib/tts-phonetics";
import {
  createTtsDirectorAnalysis,
  createTtsDirectorSegments,
  updateTtsDirectorAnalysis,
} from "@/lib/tts-director";
import type { TtsDirectorCampaignContext, TtsDirectorMode } from "@/lib/types";

type Body = {
  text?: string;
  campaignContext?: TtsDirectorCampaignContext;
  mode?: TtsDirectorMode;
  registerStrength?: number;
  dialect?: "emirati" | "fusha";
  clientId?: string | null;
  projectId?: string | null;
};

const AI_NOT_CONFIGURED_MESSAGE =
  "VO Director isn't set up yet — ask an admin to add an OpenAI or ModelArk API key.";

export async function POST(req: NextRequest) {
  try {
    const auth = await requireCreator();
    if (auth.response) return auth.response;

    if (!ttsDirectorAiConfigured()) {
      return NextResponse.json({ error: AI_NOT_CONFIGURED_MESSAGE }, { status: 503 });
    }

    const body = (await req.json()) as Body;
    const text = body.text?.trim();
    if (!text) {
      return NextResponse.json({ error: "Nothing to direct" }, { status: 400 });
    }
    if (text.length > MAX_TTS_CHARACTERS) {
      return NextResponse.json(
        {
          error: `${text.length.toLocaleString()} characters — the limit is ${MAX_TTS_CHARACTERS.toLocaleString()}`,
        },
        { status: 400 }
      );
    }

    const mode: TtsDirectorMode = body.mode === "director" ? "director" : "quick";
    const dialect = body.dialect === "fusha" ? "fusha" : "emirati";
    const registerStrength = Math.max(0, Math.min(1, body.registerStrength ?? 0.5));
    const campaignContext = body.campaignContext ?? {};
    const createdBy = await resolveDbUserId(auth.user);
    const model = openaiConfigured() ? openaiModel() : (process.env.ARK_CHAT_MODEL ?? "modelark");

    const analysis = await createTtsDirectorAnalysis({
      mode,
      originalText: text,
      campaignContext,
      registerStrength,
      dialect,
      clientId: body.clientId ?? null,
      projectId: body.projectId ?? null,
      createdBy,
    });

    if (mode === "quick") {
      const dictionary = await candidatePhoneticEntries(text, dialect);
      const result = await runQuickOptimize(text, campaignContext, registerStrength, dictionary);

      const segments = await createTtsDirectorSegments(
        analysis.id,
        result.segments.map((s, idx) => ({
          idx,
          original: s.original,
          spoken: s.spoken,
          tts: s.tts,
          emotion: s.emotion,
          intensity: s.intensity,
          pace: s.pace,
          continuity: s.continuity,
          avoid: s.avoid,
          suggestedStability: s.suggestedStability,
          suggestedSpeed: s.suggestedSpeed,
        }))
      );

      const updated = await updateTtsDirectorAnalysis(analysis.id, {
        status: "complete",
        overallDirection: result.overallDirection,
        model,
      });

      await logAudit({
        userId: auth.user.id,
        userEmail: auth.user.email,
        action: "tts.director.analyze",
        subjectType: "tts_director_analysis",
        subjectId: analysis.id,
        meta: { mode, segments: segments.length },
      });

      return NextResponse.json({ analysis: updated, segments });
    }

    // Director mode: Pass 1 only — dialect/phonetic passes are separate,
    // re-runnable calls (/adapt, /phonetics).
    const result = await runDirectionPass(text, campaignContext);
    const segments = await createTtsDirectorSegments(
      analysis.id,
      result.segments.map((s, idx) => ({
        idx,
        original: s.original,
        emotion: s.emotion,
        intensity: s.intensity,
        pace: s.pace,
        continuity: s.continuity,
        avoid: s.avoid,
        suggestedStability: s.suggestedStability,
        suggestedSpeed: s.suggestedSpeed,
      }))
    );

    const updated = await updateTtsDirectorAnalysis(analysis.id, {
      status: "directed",
      overallDirection: result.overallDirection,
      model,
    });

    await logAudit({
      userId: auth.user.id,
      userEmail: auth.user.email,
      action: "tts.director.analyze",
      subjectType: "tts_director_analysis",
      subjectId: analysis.id,
      meta: { mode, segments: segments.length },
    });

    return NextResponse.json({ analysis: updated, segments });
  } catch (err) {
    const message = err instanceof Error ? err.message : "Analysis failed";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
