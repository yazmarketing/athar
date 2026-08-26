import { NextRequest, NextResponse } from "next/server";
import { requireCreator } from "@/lib/authz";
import { resolveDbUserId } from "@/lib/auth-users";
import { logAudit } from "@/lib/audit";
import {
  DEFAULT_MUNSIT_MODEL,
  munsitApiConfigured,
  munsitCost,
  synthesizeSpeech,
  synthesizeSpeechStream,
  synthesizeWithTimestamps,
  type CharAlignment,
} from "@/lib/munsit-tts";
import { buildWav, concatWav, silence, wavDurationSeconds } from "@/lib/audio-wav";
import {
  NOT_CONFIGURED_MESSAGE,
  flattenSegments,
  offsetAlignment,
  totalCharCount,
  validateSegments,
} from "@/lib/tts-segments";
import { createTtsGeneration } from "@/lib/tts";
import { uploadPublicObject } from "@/lib/storage";
import type { TtsAlignment, TtsSegment } from "@/lib/types";

type GenerateBody = {
  title?: string;
  clientId?: string | null;
  projectId?: string | null;
  /** Continues an existing work's version history — omit to start a new one. */
  groupId?: string | null;
  model?: string;
  stability?: number;
  speed?: number;
  sampleRate?: number;
  dialect?: "auto" | "emirati" | "fusha";
  streaming?: boolean;
  wordTimestamps?: boolean;
  segments?: TtsSegment[];
};

const AUDIO_FORMAT = { channels: 1, bitsPerSample: 16 };

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

    const body = (await req.json()) as GenerateBody;
    const segments = body.segments ?? [];
    const validation = validateSegments(segments);
    if (!validation.ok) {
      return NextResponse.json({ error: validation.error }, { status: 400 });
    }

    const model = body.model?.trim() || DEFAULT_MUNSIT_MODEL;
    const stability = body.stability ?? 0.5;
    const speed = body.speed ?? 1.0;
    const sampleRate = body.sampleRate ?? 24000;
    const dialect = body.dialect ?? "auto";
    const wordTimestamps = body.wordTimestamps === true;
    const charCount = totalCharCount(segments);
    const createdBy = await resolveDbUserId(auth.user);

    // Streaming is only honored for the simplest case — one speaker, no
    // pauses, no timestamps — where a straight pass-through actually helps
    // latency. Anything else always goes through the stitch-then-URL path,
    // matching what the settings panel disables the toggle for.
    const canStream =
      body.streaming === true &&
      !wordTimestamps &&
      segments.length === 1 &&
      segments[0].type === "speech";

    if (canStream) {
      const seg = segments[0] as Extract<TtsSegment, { type: "speech" }>;
      const munsitRes = await synthesizeSpeechStream({
        modelId: model,
        voiceId: seg.voiceId,
        text: seg.text,
        stability,
        speed,
        sampleRate,
        dialect,
      });
      const reader = munsitRes.body!.getReader();
      const chunks: Uint8Array[] = [];
      const startedAt = Date.now();

      const stream = new ReadableStream<Uint8Array>({
        async pull(controller) {
          const { done, value } = await reader.read();
          if (done) {
            controller.close();
            // Best-effort: the client already has its audio. A failure here
            // only costs a missing History entry, never a broken generation.
            void persistStreamed({
              pcm: Buffer.concat(chunks),
              sampleRate,
              renderMs: Date.now() - startedAt,
              title: body.title,
              segments,
              text: flattenSegments(segments),
              model,
              stability,
              speed,
              dialect,
              charCount,
              clientId: body.clientId ?? null,
              projectId: body.projectId ?? null,
              groupId: body.groupId ?? null,
              createdBy,
            }).catch((err) => console.error("tts: streamed persist failed", err));
            return;
          }
          chunks.push(value);
          controller.enqueue(value);
        },
      });

      return new NextResponse(stream, {
        headers: {
          "Content-Type": `audio/raw;codec=pcm16;rate=${sampleRate};channels=1`,
        },
      });
    }

    const startedAt = Date.now();
    const { audio, timestamps } = await synthesizeSegments(segments, {
      model,
      stability,
      speed,
      sampleRate,
      dialect,
      wordTimestamps,
    });
    const renderMs = Date.now() - startedAt;

    const path = `tts/${Date.now()}-${Math.random().toString(36).slice(2, 8)}.wav`;
    const outputUrl = await uploadPublicObject(
      path,
      new Uint8Array(audio).buffer as ArrayBuffer,
      "audio/wav"
    );

    const generation = await createTtsGeneration({
      title: body.title,
      status: "ready",
      segments,
      text: flattenSegments(segments),
      model,
      stability,
      speed,
      sampleRate,
      dialect,
      wordTimestamps,
      timestamps,
      charCount,
      cost: munsitCost(charCount),
      outputUrl,
      durationS: wavDurationSeconds(audio),
      renderMs,
      clientId: body.clientId ?? null,
      projectId: body.projectId ?? null,
      groupId: body.groupId ?? null,
      createdBy,
    });

    await logAudit({
      userId: auth.user.id,
      userEmail: auth.user.email,
      action: "tts.generate",
      subjectType: "tts_generation",
      subjectId: generation.id,
      meta: { charCount, speakers: new Set(
        segments.filter((s) => s.type === "speech").map((s) => s.voiceId)
      ).size },
    });

    return NextResponse.json({ generation });
  } catch (err) {
    const message = err instanceof Error ? err.message : "Generation failed";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}

/**
 * Fetch every speech segment (in parallel — each is an independent Munsit
 * call), then stitch them into one track in the original order, inserting
 * silence for pause segments. Munsit synthesizes one voice per call, so this
 * is what makes multi-speaker generation possible at all.
 */
async function synthesizeSegments(
  segments: TtsSegment[],
  opts: {
    model: string;
    stability: number;
    speed: number;
    sampleRate: number;
    dialect: "auto" | "emirati" | "fusha";
    wordTimestamps: boolean;
  }
): Promise<{ audio: Buffer; timestamps: TtsAlignment[] | null }> {
  type Plan = { segIndex: number; voiceId: string; text: string; gapBeforeMs: number };
  const plans: Plan[] = [];
  let pendingGapMs = 0;

  segments.forEach((seg, segIndex) => {
    if (seg.type === "pause") {
      pendingGapMs += seg.ms;
      return;
    }
    plans.push({ segIndex, voiceId: seg.voiceId, text: seg.text, gapBeforeMs: pendingGapMs });
    pendingGapMs = 0;
  });
  const trailingGapMs = pendingGapMs;

  const results = await Promise.all(
    plans.map((p) =>
      opts.wordTimestamps
        ? synthesizeWithTimestamps({
            modelId: opts.model,
            voiceId: p.voiceId,
            text: p.text,
            stability: opts.stability,
            speed: opts.speed,
            sampleRate: opts.sampleRate,
            dialect: opts.dialect,
          })
        : synthesizeSpeech({
            modelId: opts.model,
            voiceId: p.voiceId,
            text: p.text,
            stability: opts.stability,
            speed: opts.speed,
            sampleRate: opts.sampleRate,
            dialect: opts.dialect,
          }).then((audio) => ({ audio, alignment: null as CharAlignment | null }))
    )
  );

  const silenceWav = (ms: number) =>
    buildWav({ ...AUDIO_FORMAT, sampleRate: opts.sampleRate, data: silence(ms, { ...AUDIO_FORMAT, sampleRate: opts.sampleRate }) });

  const clips: { buffer: Buffer; gapMs: number }[] = [];
  const timestamps: TtsAlignment[] | null = opts.wordTimestamps ? [] : null;
  let elapsedS = 0;

  plans.forEach((p, i) => {
    const { audio, alignment } = results[i];
    if (i === 0 && p.gapBeforeMs > 0) {
      clips.push({ buffer: silenceWav(p.gapBeforeMs), gapMs: 0 });
      elapsedS += p.gapBeforeMs / 1000;
    } else if (i > 0) {
      elapsedS += p.gapBeforeMs / 1000;
    }
    clips.push({ buffer: audio, gapMs: i === 0 ? 0 : p.gapBeforeMs });

    if (timestamps && alignment) {
      timestamps.push(
        offsetAlignment(
          {
            characters: alignment.characters,
            startS: alignment.character_start_times_seconds,
            endS: alignment.character_end_times_seconds,
          },
          elapsedS
        )
      );
    }
    elapsedS += wavDurationSeconds(audio);
  });

  if (trailingGapMs > 0) {
    clips.push({ buffer: silenceWav(trailingGapMs), gapMs: 0 });
  }

  const audio = concatWav(
    clips.map((c) => c.buffer),
    clips.map((c) => c.gapMs)
  );
  return { audio, timestamps };
}

async function persistStreamed(opts: {
  pcm: Buffer;
  sampleRate: number;
  renderMs: number;
  title?: string;
  segments: TtsSegment[];
  text: string;
  model: string;
  stability: number;
  speed: number;
  dialect: string;
  charCount: number;
  clientId: string | null;
  projectId: string | null;
  groupId: string | null;
  createdBy: string | null;
}) {
  const wav = buildWav({ ...AUDIO_FORMAT, sampleRate: opts.sampleRate, data: opts.pcm });
  const path = `tts/${Date.now()}-${Math.random().toString(36).slice(2, 8)}.wav`;
  const outputUrl = await uploadPublicObject(
    path,
    new Uint8Array(wav).buffer as ArrayBuffer,
    "audio/wav"
  );
  await createTtsGeneration({
    title: opts.title,
    status: "ready",
    segments: opts.segments,
    text: opts.text,
    model: opts.model,
    stability: opts.stability,
    speed: opts.speed,
    sampleRate: opts.sampleRate,
    dialect: opts.dialect,
    wordTimestamps: false,
    charCount: opts.charCount,
    cost: munsitCost(opts.charCount),
    outputUrl,
    durationS: wavDurationSeconds(wav),
    renderMs: opts.renderMs,
    clientId: opts.clientId,
    projectId: opts.projectId,
    groupId: opts.groupId,
    createdBy: opts.createdBy,
  });
}
