import { NextRequest, NextResponse } from "next/server";
import { requireCreator } from "@/lib/authz";
import { logAudit } from "@/lib/audit";
import { runPhoneticPass, ttsDirectorAiConfigured } from "@/lib/tts-director-ai";
import { cleanupPunctuation } from "@/lib/tts-punctuation";
import {
  candidatePhoneticEntries,
  incrementPhoneticUsage,
  suggestPhoneticEntry,
} from "@/lib/tts-phonetics";
import {
  getTtsDirectorAnalysis,
  listTtsDirectorSegments,
  patchTtsDirectorSegment,
  updateTtsDirectorAnalysis,
} from "@/lib/tts-director";

type Body = { analysisId?: string };

/** Pass 3 (phonetic adaptation) + Pass 4 (deterministic punctuation cleanup). */
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

    const spokenLines = segments.map((s) => s.spoken || s.original);
    const combinedText = spokenLines.join("\n");
    const dictionary = await candidatePhoneticEntries(combinedText, analysis.dialect);

    const results = await runPhoneticPass(spokenLines, dictionary);

    const suggestions: { canonical: string; respelling: string; reason: string }[] = [];
    const updatedSegments = await Promise.all(
      segments.map(async (s, i) => {
        const cleaned = cleanupPunctuation(results[i].tts);
        for (const applied of results[i].applied) {
          await incrementPhoneticUsage(applied.canonical, analysis.dialect);
        }
        for (const proposed of results[i].newMappings) {
          await suggestPhoneticEntry({
            canonical: proposed.canonical,
            respelling: proposed.respelling,
            dialect: analysis.dialect,
            notes: proposed.reason,
          });
          suggestions.push(proposed);
        }
        return patchTtsDirectorSegment(s.id, {
          tts: cleaned.text,
          phoneticNotes: results[i].applied.map((a) => ({ ...a, applied: true })),
        });
      })
    );

    const updated = await updateTtsDirectorAnalysis(analysisId, { status: "phonetics_ready" });

    await logAudit({
      userId: auth.user.id,
      userEmail: auth.user.email,
      action: "tts.director.phonetics",
      subjectType: "tts_director_analysis",
      subjectId: analysisId,
      meta: { suggestions: suggestions.length },
    });

    return NextResponse.json({ analysis: updated, segments: updatedSegments, dictionarySuggestions: suggestions });
  } catch (err) {
    const message = err instanceof Error ? err.message : "Phonetic adaptation failed";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
