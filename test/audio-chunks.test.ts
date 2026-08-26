import { describe, expect, it } from "vitest";
import {
  APP_FORMDATA_MAX_BYTES,
  CHUNK_SECONDS,
  MAX_UPLOAD_BYTES,
  SAMPLE_RATE,
  chunkFitsLimit,
  concatWavChunks,
  encodeWav,
  planChunks,
  wavBytesFor,
} from "@/lib/audio-chunks";

describe("wavBytesFor", () => {
  it("is 32KB per second at 16kHz mono 16-bit", () => {
    expect(wavBytesFor(1)).toBe(44 + 32000);
    expect(wavBytesFor(60)).toBe(44 + 60 * 32000);
  });
});

describe("the chunk size", () => {
  it("fits inside the app-server FormData ceiling", () => {
    expect(wavBytesFor(CHUNK_SECONDS)).toBeLessThan(APP_FORMDATA_MAX_BYTES);
  });

  it("fits inside OpenAI's 25MB limit with room to spare", () => {
    expect(chunkFitsLimit(CHUNK_SECONDS)).toBe(true);
    expect(wavBytesFor(CHUNK_SECONDS)).toBeLessThan(MAX_UPLOAD_BYTES);
  });

  it("knows when a chunk would be rejected", () => {
    // ~14 minutes is where 16kHz mono WAV crosses 25MB.
    expect(chunkFitsLimit(900)).toBe(false);
  });
});

describe("planChunks", () => {
  it("returns a single chunk for a short video", () => {
    expect(planChunks(180)).toEqual([{ index: 0, startS: 0, endS: 180 }]);
  });

  it("covers the whole recording with no gaps or overlap", () => {
    const chunks = planChunks(1500);
    expect(chunks).toHaveLength(7);
    expect(chunks[0]).toEqual({ index: 0, startS: 0, endS: 240 });
    expect(chunks[6]).toEqual({ index: 6, startS: 1440, endS: 1500 });
    // Every second of the recording belongs to exactly one chunk.
    chunks.forEach((chunk, i) => {
      if (i > 0) expect(chunk.startS).toBe(chunks[i - 1].endS);
    });
    expect(chunks[chunks.length - 1].endS).toBe(1500);
  });

  it("never emits a chunk bigger than the upload limit", () => {
    for (const chunk of planChunks(7200)) {
      expect(chunkFitsLimit(chunk.endS - chunk.startS)).toBe(true);
    }
  });

  it("returns nothing for an empty or nonsense duration", () => {
    expect(planChunks(0)).toEqual([]);
    expect(planChunks(-5)).toEqual([]);
    expect(planChunks(NaN)).toEqual([]);
  });
});

describe("encodeWav", () => {
  const samples = new Float32Array([0, 0.5, -0.5, 1, -1]);

  it("writes a RIFF/WAVE header the API will recognise", () => {
    const view = new DataView(encodeWav(samples));
    const ascii = (offset: number, length: number) =>
      String.fromCharCode(
        ...Array.from({ length }, (_, i) => view.getUint8(offset + i))
      );
    expect(ascii(0, 4)).toBe("RIFF");
    expect(ascii(8, 4)).toBe("WAVE");
    expect(ascii(12, 4)).toBe("fmt ");
    expect(ascii(36, 4)).toBe("data");
  });

  it("declares mono, 16-bit, at the sample rate Whisper wants", () => {
    const view = new DataView(encodeWav(samples));
    expect(view.getUint16(22, true)).toBe(1); // channels
    expect(view.getUint32(24, true)).toBe(SAMPLE_RATE);
    expect(view.getUint16(34, true)).toBe(16); // bits per sample
  });

  it("sizes the buffer and its declared lengths consistently", () => {
    const buffer = encodeWav(samples);
    const view = new DataView(buffer);
    expect(buffer.byteLength).toBe(44 + samples.length * 2);
    expect(view.getUint32(40, true)).toBe(samples.length * 2);
    expect(view.getUint32(4, true)).toBe(36 + samples.length * 2);
  });

  it("clamps rather than wrapping a sample that overshoots", () => {
    // Without the clamp this wraps to a large negative — a loud passage
    // turning into a burst of noise, which is worse than clipping.
    const view = new DataView(encodeWav(new Float32Array([2, -2])));
    expect(view.getInt16(44, true)).toBe(32767);
    expect(view.getInt16(46, true)).toBe(-32768);
  });
});

describe("concatWavChunks", () => {
  it("returns a single chunk unchanged", () => {
    const one = encodeWav(new Float32Array([0.1, -0.1]));
    expect(concatWavChunks([one])).toBe(one);
  });

  it("joins PCM and rewrites the header lengths", () => {
    const a = encodeWav(new Float32Array([0.5, -0.5]));
    const b = encodeWav(new Float32Array([1, -1, 0]));
    const joined = concatWavChunks([a, b]);
    const view = new DataView(joined);
    expect(joined.byteLength).toBe(44 + 5 * 2);
    expect(view.getUint32(40, true)).toBe(10);
    expect(view.getUint32(4, true)).toBe(36 + 10);
    expect(view.getInt16(44, true)).toBe(new DataView(a).getInt16(44, true));
    expect(view.getInt16(48, true)).toBe(new DataView(b).getInt16(44, true));
  });
});
