/**
 * Turning a video into something OpenAI will accept.
 *
 * The transcription endpoint takes one file of at most 25MB. A video is far
 * bigger than that and mostly picture, so the browser strips the audio,
 * downsamples it to what Whisper actually listens to — 16kHz mono — and sends
 * it in chunks. A two-hour recording becomes a handful of small uploads
 * instead of one impossible one.
 *
 * Pure functions only, so the arithmetic that decides where chunks fall and
 * how big they are can be tested without a browser.
 */

/** What Whisper resamples to internally; sending more is wasted bytes. */
export const SAMPLE_RATE = 16000;
const BYTES_PER_SAMPLE = 2; // 16-bit PCM
const WAV_HEADER_BYTES = 44;

/** OpenAI's hard limit. */
export const MAX_UPLOAD_BYTES = 25 * 1024 * 1024;

/**
 * Ten minutes: 19.2MB as 16kHz mono WAV, comfortably inside the 25MB cap with
 * room for the header and any rounding.
 */
export const CHUNK_SECONDS = 600;

/** Bytes a WAV of this many seconds will occupy. */
export function wavBytesFor(seconds: number): number {
  return WAV_HEADER_BYTES + Math.ceil(seconds * SAMPLE_RATE) * BYTES_PER_SAMPLE;
}

export type ChunkPlan = {
  index: number;
  startS: number;
  endS: number;
};

/**
 * Split a recording into upload-sized pieces.
 *
 * Chunks are cut on a fixed clock rather than at silence: Whisper is given the
 * chunk's offset and returns timings relative to it, so a word split across a
 * boundary costs one word, not a broken timeline. Silence detection would need
 * the audio decoded twice for a marginal gain.
 */
export function planChunks(
  durationS: number,
  chunkSeconds = CHUNK_SECONDS
): ChunkPlan[] {
  if (!Number.isFinite(durationS) || durationS <= 0) return [];
  const size = Math.max(1, chunkSeconds);
  const chunks: ChunkPlan[] = [];
  for (let start = 0, index = 0; start < durationS; start += size, index++) {
    chunks.push({
      index,
      startS: start,
      endS: Math.min(start + size, durationS),
    });
  }
  return chunks;
}

/** Would a chunk of this length be rejected by the API? */
export function chunkFitsLimit(seconds: number): boolean {
  return wavBytesFor(seconds) <= MAX_UPLOAD_BYTES;
}

/**
 * Encode mono float samples as a 16-bit PCM WAV.
 *
 * WAV rather than a compressed format on purpose: browsers ship no MP3 or
 * Opus encoder, and pulling a WASM one in to save bandwidth on a file that is
 * already small — and deleted moments later — is not a trade worth making.
 */
export function encodeWav(samples: Float32Array, sampleRate = SAMPLE_RATE): ArrayBuffer {
  const buffer = new ArrayBuffer(WAV_HEADER_BYTES + samples.length * BYTES_PER_SAMPLE);
  const view = new DataView(buffer);

  const writeAscii = (offset: number, text: string) => {
    for (let i = 0; i < text.length; i++) view.setUint8(offset + i, text.charCodeAt(i));
  };

  const dataBytes = samples.length * BYTES_PER_SAMPLE;
  writeAscii(0, "RIFF");
  view.setUint32(4, 36 + dataBytes, true);
  writeAscii(8, "WAVE");
  writeAscii(12, "fmt ");
  view.setUint32(16, 16, true); // PCM header size
  view.setUint16(20, 1, true); // format: PCM
  view.setUint16(22, 1, true); // channels: mono
  view.setUint32(24, sampleRate, true);
  view.setUint32(28, sampleRate * BYTES_PER_SAMPLE, true); // byte rate
  view.setUint16(32, BYTES_PER_SAMPLE, true); // block align
  view.setUint16(34, 16, true); // bits per sample
  writeAscii(36, "data");
  view.setUint32(40, dataBytes, true);

  let offset = WAV_HEADER_BYTES;
  for (let i = 0; i < samples.length; i++) {
    // Clamp before scaling: a sample outside [-1, 1] would otherwise wrap
    // around and turn a loud passage into noise.
    const sample = Math.max(-1, Math.min(1, samples[i]));
    view.setInt16(offset, sample < 0 ? sample * 0x8000 : sample * 0x7fff, true);
    offset += BYTES_PER_SAMPLE;
  }
  return buffer;
}
