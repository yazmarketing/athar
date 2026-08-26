import { NextRequest, NextResponse } from "next/server";
import { requireCreator } from "@/lib/authz";
import { resolveDbUserId } from "@/lib/auth-users";
import { logAudit } from "@/lib/audit";
import { cloneVoice, munsitApiConfigured } from "@/lib/munsit-tts";
import { createTtsVoice } from "@/lib/tts";
import { NOT_CONFIGURED_MESSAGE } from "@/lib/tts-segments";

/**
 * Finalize a clone. `voiceFile` is the preview audio (from /voices/preview)
 * and `referenceAudioFile` is the original sample it was generated from —
 * Munsit requires both, matching what was previewed.
 */
export async function POST(req: NextRequest) {
  try {
    const auth = await requireCreator();
    if (auth.response) return auth.response;

    if (!munsitApiConfigured()) {
      return NextResponse.json(
        { error: NOT_CONFIGURED_MESSAGE },
        { status: 503 }
      );
    }

    const form = await req.formData();
    const voiceFile = form.get("voice_file");
    const referenceAudioFile = form.get("reference_audio_file");
    const text = String(form.get("text") ?? "").trim();
    const name = String(form.get("name") ?? "").trim();
    const stability = Number(form.get("stability") ?? 0.5);

    if (!(voiceFile instanceof File) || !(referenceAudioFile instanceof File)) {
      return NextResponse.json({ error: "Missing audio files" }, { status: 400 });
    }
    if (!name) {
      return NextResponse.json({ error: "Give this voice a name" }, { status: 400 });
    }

    const description = form.get("description");
    const gender = form.get("gender");
    const age = form.get("age");
    const languages = String(form.get("languages") ?? "")
      .split(",")
      .map((s) => s.trim())
      .filter(Boolean);
    const dialects = String(form.get("dialects") ?? "")
      .split(",")
      .map((s) => s.trim())
      .filter(Boolean);

    const cloned = await cloneVoice({
      voiceFile,
      voiceFilename: voiceFile.name || "preview.wav",
      referenceAudioFile,
      referenceAudioFilename: referenceAudioFile.name || "reference.wav",
      text,
      stability,
      name,
      description: typeof description === "string" ? description : undefined,
      gender: typeof gender === "string" ? gender : undefined,
      age: typeof age === "string" ? age : undefined,
      languages,
      dialects,
    });

    const createdBy = await resolveDbUserId(auth.user);
    const record = await createTtsVoice({
      munsitVoiceId: cloned.voice_id,
      name: cloned.name,
      description: cloned.description,
      gender: cloned.gender,
      age: cloned.age,
      languages: cloned.languages,
      dialects: cloned.dialect,
      sampleUrl: cloned.sample_url,
      avatarUrl: cloned.avatar_url ?? null,
      createdBy,
    });

    await logAudit({
      userId: auth.user.id,
      userEmail: auth.user.email,
      action: "tts.voice.clone",
      subjectType: "tts_voice",
      subjectId: record.id,
      meta: { name: record.name },
    });

    return NextResponse.json({ voice: record });
  } catch (err) {
    const message = err instanceof Error ? err.message : "Clone failed";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
