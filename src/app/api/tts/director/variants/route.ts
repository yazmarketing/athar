import { NextRequest, NextResponse } from "next/server";
import { requireCreator } from "@/lib/authz";
import { resolveDbUserId } from "@/lib/auth-users";
import { logAudit } from "@/lib/audit";
import { DEFAULT_MUNSIT_MODEL, munsitApiConfigured, munsitCost, synthesizeSpeech } from "@/lib/munsit-tts";
import { wavDurationSeconds } from "@/lib/audio-wav";
import { NOT_CONFIGURED_MESSAGE } from "@/lib/tts-segments";
import { uploadPublicObject } from "@/lib/storage";
import { createTtsDirectorTake, getTtsDirectorSegment } from "@/lib/tts-director";
import { DEFAULT_TAKE_PRESETS } from "@/config/tts-director";

type Body = {
  segmentId?: string;
  voiceId?: string;
  presets?: { id?: string; label: string; stability: number; speed: number }[];
};

/** Generate N variant takes for one segment — Director Mode's Take A/B/C row. */
export async function POST(req: NextRequest) {
  try {
    const auth = await requireCreator();
    if (auth.response) return auth.response;

    if (!munsitApiConfigured()) {
      return NextResponse.json({ error: NOT_CONFIGURED_MESSAGE }, { status: 503 });
    }

    const body = (await req.json()) as Body;
    const segmentId = body.segmentId?.trim();
    if (!segmentId) {
      return NextResponse.json({ error: "segmentId is required" }, { status: 400 });
    }

    const segment = await getTtsDirectorSegment(segmentId);
    if (!segment) {
      return NextResponse.json({ error: "Segment not found" }, { status: 404 });
    }

    const voiceId = body.voiceId?.trim() || segment.voice_id;
    if (!voiceId) {
      return NextResponse.json({ error: "Pick a voice for this segment first" }, { status: 400 });
    }

    const text = segment.tts || segment.spoken || segment.original;
    if (!text.trim()) {
      return NextResponse.json({ error: "This segment has no text yet" }, { status: 400 });
    }

    // Each default preset keeps its own distinct stability/speed character —
    // collapsing all three onto the segment's single suggested value would
    // make them identical takes (and risk an out-of-range speed Munsit
    // rejects outright, since suggested_speed isn't preset-specific).
    const presets = body.presets && body.presets.length > 0 ? body.presets : DEFAULT_TAKE_PRESETS;

    const createdBy = await resolveDbUserId(auth.user);
    const charCount = text.length;

    const sleep = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms));

    const synthesizeTake = async (preset: (typeof presets)[number]) => {
      try {
        // Munsit's concurrent-request counter appears to lag its own
        // response, so even fully-awaited sequential calls can trip a low
        // account cap back-to-back — one retry after a short backoff clears it.
        let audio: Buffer;
        try {
          audio = await synthesizeSpeech({
            modelId: DEFAULT_MUNSIT_MODEL,
            voiceId,
            text,
            stability: preset.stability,
            speed: preset.speed,
          });
        } catch (err) {
          if (!(err instanceof Error) || !/concurrency limit/i.test(err.message)) throw err;
          await sleep(1500);
          audio = await synthesizeSpeech({
            modelId: DEFAULT_MUNSIT_MODEL,
            voiceId,
            text,
            stability: preset.stability,
            speed: preset.speed,
          });
        }
        const path = `tts/director/takes/${Date.now()}-${Math.random().toString(36).slice(2, 8)}.wav`;
        const outputUrl = await uploadPublicObject(
          path,
          new Uint8Array(audio).buffer as ArrayBuffer,
          "audio/wav"
        );
        return createTtsDirectorTake({
          segmentId,
          preset: (["natural", "controlled", "expressive"].includes(preset.id ?? "")
            ? preset.id
            : "custom") as "natural" | "controlled" | "expressive" | "custom",
          voiceId,
          stability: preset.stability,
          speed: preset.speed,
          text,
          status: "ready",
          outputUrl,
          durationS: wavDurationSeconds(audio),
          charCount,
          cost: munsitCost(charCount),
          createdBy,
        });
      } catch (err) {
        return createTtsDirectorTake({
          segmentId,
          preset: "custom",
          voiceId,
          stability: preset.stability,
          speed: preset.speed,
          text,
          status: "failed",
          error: err instanceof Error ? err.message : "Synthesis failed",
          charCount,
          cost: 0,
          createdBy,
        });
      }
    };

    // Sequential, not Promise.all — Munsit accounts have a low concurrent-
    // request cap (as low as 2), and firing every preset at once reliably
    // trips it, failing whichever take lands third.
    const takes = [];
    for (const preset of presets) {
      if (takes.length > 0) await sleep(400);
      takes.push(await synthesizeTake(preset));
    }

    await logAudit({
      userId: auth.user.id,
      userEmail: auth.user.email,
      action: "tts.director.variants",
      subjectType: "tts_director_segment",
      subjectId: segmentId,
      meta: { count: takes.length },
    });

    return NextResponse.json({ takes });
  } catch (err) {
    const message = err instanceof Error ? err.message : "Variant generation failed";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
