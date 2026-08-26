import { NextRequest, NextResponse } from "next/server";
import { requireCreator } from "@/lib/authz";
import { munsitApiConfigured, previewClonedVoice } from "@/lib/munsit-tts";
import { buildWav } from "@/lib/audio-wav";
import { NOT_CONFIGURED_MESSAGE } from "@/lib/tts-segments";

/** Preview a clone before saving it — passes the uploaded sample straight through. */
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
    const file = form.get("file");
    const text = String(form.get("text") ?? "");
    const similarity = Number(form.get("similarity") ?? 0.8);
    if (!(file instanceof File)) {
      return NextResponse.json({ error: "Missing audio sample" }, { status: 400 });
    }
    if (text.trim().length < 10) {
      return NextResponse.json(
        { error: "Preview text needs at least 10 characters" },
        { status: 400 }
      );
    }

    const pcm = await previewClonedVoice({
      file,
      filename: file.name || "sample.wav",
      text: text.trim(),
      similarity,
    });
    // Munsit returns raw PCM16 for a preview — wrap it in a WAV header so an
    // <audio> element can play it without the browser needing to know the
    // codec out of band.
    const wav = buildWav({ sampleRate: 24000, channels: 1, bitsPerSample: 16, data: pcm });

    return new NextResponse(new Uint8Array(wav), {
      headers: { "Content-Type": "audio/wav" },
    });
  } catch (err) {
    const message = err instanceof Error ? err.message : "Preview failed";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
