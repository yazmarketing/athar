import "server-only";

/**
 * Munsit — Arabic-first text-to-speech. SERVER ONLY.
 * Docs: https://docs.munsit.com
 *
 * One request synthesizes one voice; there is no multi-speaker call. Athar's
 * multi-speaker generation (see /api/tts/generate) makes one request per
 * speaker block and stitches the WAVs together — see audio-wav.ts.
 */

const MUNSIT_BASE = process.env.MUNSIT_BASE_URL ?? "https://api.munsit.com/api/v1";
export const DEFAULT_MUNSIT_MODEL = process.env.MUNSIT_MODEL_ID?.trim() || "faseeh-v1-preview";

export function munsitApiConfigured(): boolean {
  return Boolean(process.env.MUNSIT_API_KEY?.trim());
}

/**
 * There's no billing API to read a real charge back from (checked their
 * OpenAPI spec directly — nothing for account/credits/usage exists), so this
 * is an estimate from published pricing, same as WHISPER_COST_PER_MINUTE.
 * Faseeh TTS costs 2 credits/character; the Pro plan ($10/200,000 credits)
 * prices a credit at $0.00005, so 2 × $0.00005 = $0.0001/character.
 * Override with MUNSIT_COST_PER_CHAR if the account is on a different plan.
 */
export const DEFAULT_MUNSIT_COST_PER_CHAR = 0.0001;

export function munsitCost(charCount: number): number {
  const rate = Number(process.env.MUNSIT_COST_PER_CHAR) || DEFAULT_MUNSIT_COST_PER_CHAR;
  return Math.max(0, charCount) * rate;
}

function apiKey(): string {
  const key = process.env.MUNSIT_API_KEY?.trim();
  if (!key) throw new Error("Missing MUNSIT_API_KEY env var");
  return key;
}

async function munsitError(res: Response): Promise<string> {
  try {
    const body = (await res.json()) as { errorMessage?: string; message?: string };
    return body.errorMessage ?? body.message ?? `Munsit ${res.status}`;
  } catch {
    return `Munsit ${res.status}: ${(await res.text().catch(() => "")).slice(0, 300)}`;
  }
}

export type MunsitVoiceApi = {
  voice_id: string;
  name: string;
  description: string | null;
  gender: "male" | "female" | null;
  age: string | null;
  languages: string[];
  dialect: string[];
  type: string | null;
  sample_url: string | null;
  avatar_url?: string | null;
};

export async function listMunsitVoices(): Promise<MunsitVoiceApi[]> {
  const res = await fetch(`${MUNSIT_BASE}/voices`, {
    headers: { "x-api-key": apiKey() },
  });
  if (!res.ok) throw new Error(await munsitError(res));
  const json = (await res.json()) as MunsitVoiceApi[] | { voices?: MunsitVoiceApi[] };
  return Array.isArray(json) ? json : (json.voices ?? []);
}

export type MunsitModel = { model_id: string; model_name: string; description?: string };

export async function listMunsitModels(): Promise<MunsitModel[]> {
  const res = await fetch(`${MUNSIT_BASE}/models`, {
    headers: { "x-api-key": apiKey() },
  });
  if (!res.ok) throw new Error(await munsitError(res));
  const json = (await res.json()) as MunsitModel[] | { models?: MunsitModel[] };
  return Array.isArray(json) ? json : (json.models ?? []);
}

export type SynthesizeOptions = {
  modelId?: string;
  voiceId: string;
  text: string;
  stability: number;
  speed?: number;
  sampleRate?: number;
  dialect?: "auto" | "emirati" | "fusha";
};

/** One synth call → a complete WAV buffer. */
export async function synthesizeSpeech(opts: SynthesizeOptions): Promise<Buffer> {
  const res = await fetch(
    `${MUNSIT_BASE}/text-to-speech/${encodeURIComponent(opts.modelId ?? DEFAULT_MUNSIT_MODEL)}`,
    {
      method: "POST",
      headers: { "x-api-key": apiKey(), "Content-Type": "application/json" },
      body: JSON.stringify({
        voice_id: opts.voiceId,
        text: opts.text,
        stability: opts.stability,
        speed: opts.speed ?? 1.0,
        sample_rate: opts.sampleRate ?? 24000,
        dialect: opts.dialect ?? "auto",
        streaming: false,
      }),
    }
  );
  if (!res.ok) throw new Error(await munsitError(res));
  return Buffer.from(await res.arrayBuffer());
}

/** Same request, piped straight through as a live PCM16 stream (no buffering). */
export async function synthesizeSpeechStream(opts: SynthesizeOptions): Promise<Response> {
  const res = await fetch(
    `${MUNSIT_BASE}/text-to-speech/${encodeURIComponent(opts.modelId ?? DEFAULT_MUNSIT_MODEL)}`,
    {
      method: "POST",
      headers: { "x-api-key": apiKey(), "Content-Type": "application/json" },
      body: JSON.stringify({
        voice_id: opts.voiceId,
        text: opts.text,
        stability: opts.stability,
        speed: opts.speed ?? 1.0,
        sample_rate: opts.sampleRate ?? 24000,
        dialect: opts.dialect ?? "auto",
        streaming: true,
      }),
    }
  );
  if (!res.ok) throw new Error(await munsitError(res));
  return res;
}

export type CharAlignment = {
  characters: string[];
  character_start_times_seconds: number[];
  character_end_times_seconds: number[];
};

/**
 * with-timestamps returns NDJSON: audio chunks first, then one alignment
 * line. Timings are per character — the caller derives words by splitting
 * on whitespace (see tts-segments.ts).
 */
export async function synthesizeWithTimestamps(
  opts: SynthesizeOptions
): Promise<{ audio: Buffer; alignment: CharAlignment | null }> {
  const res = await fetch(
    `${MUNSIT_BASE}/text-to-speech/${encodeURIComponent(opts.modelId ?? DEFAULT_MUNSIT_MODEL)}/with-timestamps`,
    {
      method: "POST",
      headers: { "x-api-key": apiKey(), "Content-Type": "application/json" },
      body: JSON.stringify({
        voice_id: opts.voiceId,
        text: opts.text,
        stability: opts.stability,
        speed: opts.speed ?? 1.0,
        sample_rate: opts.sampleRate ?? 24000,
        dialect: opts.dialect ?? "auto",
      }),
    }
  );
  if (!res.ok) throw new Error(await munsitError(res));

  const raw = await res.text();
  const audioChunks: Buffer[] = [];
  let alignment: CharAlignment | null = null;
  for (const line of raw.split("\n")) {
    const trimmed = line.trim();
    if (!trimmed) continue;
    const parsed = JSON.parse(trimmed) as {
      audio_base64?: string;
      alignment?: CharAlignment | null;
    };
    if (parsed.audio_base64) audioChunks.push(Buffer.from(parsed.audio_base64, "base64"));
    if (parsed.alignment) alignment = parsed.alignment;
  }

  // Chunks here are raw PCM16, not WAV — wrap once, same shape as a normal
  // synth response, so downstream code (concatWav, wavDurationSeconds) never
  // needs to know timestamps went through a different endpoint.
  const pcm = Buffer.concat(audioChunks);
  const header = Buffer.alloc(44);
  const sampleRate = opts.sampleRate ?? 24000;
  header.write("RIFF", 0, "ascii");
  header.writeUInt32LE(36 + pcm.length, 4);
  header.write("WAVE", 8, "ascii");
  header.write("fmt ", 12, "ascii");
  header.writeUInt32LE(16, 16);
  header.writeUInt16LE(1, 20);
  header.writeUInt16LE(1, 22);
  header.writeUInt32LE(sampleRate, 24);
  header.writeUInt32LE(sampleRate * 2, 28);
  header.writeUInt16LE(2, 32);
  header.writeUInt16LE(16, 34);
  header.write("data", 36, "ascii");
  header.writeUInt32LE(pcm.length, 40);

  return { audio: Buffer.concat([header, pcm]), alignment };
}

export type PreviewOptions = {
  file: Blob;
  filename: string;
  text: string;
  similarity: number;
  modelId?: string;
  speed?: number;
  sampleRate?: number;
};

/** Preview a clone before saving it — returns raw PCM16, mono. */
export async function previewClonedVoice(opts: PreviewOptions): Promise<Buffer> {
  const form = new FormData();
  form.append("file", opts.file, opts.filename);
  form.append("text", opts.text);
  form.append("similarity", String(opts.similarity));
  form.append("model_id", opts.modelId ?? DEFAULT_MUNSIT_MODEL);
  if (opts.speed) form.append("speed", String(opts.speed));
  if (opts.sampleRate) form.append("sample_rate", String(opts.sampleRate));

  const res = await fetch(`${MUNSIT_BASE}/voices/preview`, {
    method: "POST",
    headers: { "x-api-key": apiKey() },
    body: form,
  });
  if (!res.ok) throw new Error(await munsitError(res));
  return Buffer.from(await res.arrayBuffer());
}

export type CloneOptions = {
  voiceFile: Blob;
  voiceFilename: string;
  referenceAudioFile: Blob;
  referenceAudioFilename: string;
  text: string;
  stability: number;
  name: string;
  modelId?: string;
  description?: string;
  gender?: string;
  age?: string;
  languages?: string[];
  dialects?: string[];
  avatarUrl?: string;
};

export async function cloneVoice(opts: CloneOptions): Promise<MunsitVoiceApi> {
  const form = new FormData();
  form.append("voice_file", opts.voiceFile, opts.voiceFilename);
  form.append("reference_audio_file", opts.referenceAudioFile, opts.referenceAudioFilename);
  form.append("text", opts.text);
  form.append("stability", String(opts.stability));
  form.append("name", opts.name);
  form.append("model", opts.modelId ?? DEFAULT_MUNSIT_MODEL);
  if (opts.description) form.append("description", opts.description);
  if (opts.gender) form.append("gender", opts.gender);
  if (opts.age) form.append("age", opts.age);
  if (opts.languages?.length) form.append("languages", opts.languages.join(","));
  if (opts.dialects?.length) form.append("dialects", opts.dialects.join(","));
  if (opts.avatarUrl) form.append("avatar_url", opts.avatarUrl);

  const res = await fetch(`${MUNSIT_BASE}/voices/clone`, {
    method: "POST",
    headers: { "x-api-key": apiKey() },
    body: form,
  });
  if (!res.ok) throw new Error(await munsitError(res));
  return (await res.json()) as MunsitVoiceApi;
}

export async function diacritizeText(text: string): Promise<string> {
  const res = await fetch(`${MUNSIT_BASE}/tashkil/diacritize`, {
    method: "POST",
    headers: { "x-api-key": apiKey(), "Content-Type": "application/json" },
    body: JSON.stringify({ text }),
  });
  if (!res.ok) throw new Error(await munsitError(res));
  const json = (await res.json()) as { data?: { diacritized_text?: string } };
  return json.data?.diacritized_text ?? text;
}
