import { describe, expect, it } from "vitest";
import { buildWav, concatWav, parseWav, wavDurationSeconds } from "@/lib/audio-wav";

const FORMAT = { sampleRate: 8000, channels: 1, bitsPerSample: 16 };

/** `seconds` of a constant-value PCM16 tone (silence works fine for tests). */
function makeWav(seconds: number, sampleValue = 0): Buffer {
  const samples = Math.round(seconds * FORMAT.sampleRate);
  const data = Buffer.alloc(samples * 2);
  for (let i = 0; i < samples; i++) data.writeInt16LE(sampleValue, i * 2);
  return buildWav({ ...FORMAT, data });
}

describe("parseWav / buildWav", () => {
  it("round-trips a WAV buffer", () => {
    const original = makeWav(0.5, 1234);
    const parsed = parseWav(original);
    expect(parsed.sampleRate).toBe(FORMAT.sampleRate);
    expect(parsed.channels).toBe(FORMAT.channels);
    expect(parsed.bitsPerSample).toBe(FORMAT.bitsPerSample);
    expect(parsed.data.readInt16LE(0)).toBe(1234);
  });

  it("rejects a non-WAV buffer", () => {
    expect(() => parseWav(Buffer.from("not a wav file at all"))).toThrow();
  });
});

describe("wavDurationSeconds", () => {
  it("reports the duration of a known-length clip", () => {
    expect(wavDurationSeconds(makeWav(1))).toBeCloseTo(1, 3);
    expect(wavDurationSeconds(makeWav(2.5))).toBeCloseTo(2.5, 3);
  });
});

describe("concatWav", () => {
  it("concatenates two clips into one of combined duration", () => {
    const a = makeWav(1);
    const b = makeWav(2);
    const joined = concatWav([a, b]);
    expect(wavDurationSeconds(joined)).toBeCloseTo(3, 3);
  });

  it("inserts silence for the gap before a later clip", () => {
    const a = makeWav(1);
    const b = makeWav(1);
    const joined = concatWav([a, b], [0, 500]); // 500ms gap before b
    expect(wavDurationSeconds(joined)).toBeCloseTo(2.5, 3);
  });

  it("ignores gapsMs[0] — nothing precedes the first clip", () => {
    const a = makeWav(1);
    const b = makeWav(1);
    const joined = concatWav([a, b], [1000, 0]);
    expect(wavDurationSeconds(joined)).toBeCloseTo(2, 3);
  });

  it("throws on a single-clip input with no matching format", () => {
    const a = makeWav(1);
    const differentRate = buildWav({
      sampleRate: 16000,
      channels: 1,
      bitsPerSample: 16,
      data: Buffer.alloc(100),
    });
    expect(() => concatWav([a, differentRate])).toThrow(/format mismatch/i);
  });

  it("throws on an empty list", () => {
    expect(() => concatWav([])).toThrow();
  });
});
