import { describe, expect, it } from "vitest";
import {
  MAX_TTS_CHARACTERS,
  flattenSegments,
  offsetAlignment,
  totalCharCount,
  validateSegments,
  wordsFromAlignment,
} from "@/lib/tts-segments";
import type { TtsSegment } from "@/lib/types";

const speech = (text: string, voiceId = "majed"): TtsSegment => ({
  type: "speech",
  voiceId,
  voiceName: "Majed",
  text,
});

describe("totalCharCount / flattenSegments", () => {
  it("counts only speech segments, not pauses", () => {
    const segments: TtsSegment[] = [speech("مرحبا"), { type: "pause", ms: 500 }, speech("بك")];
    expect(totalCharCount(segments)).toBe(7);
    expect(flattenSegments(segments)).toBe("مرحبا\nبك");
  });
});

describe("validateSegments", () => {
  it("rejects an empty request", () => {
    expect(validateSegments([])).toEqual({ ok: false, error: expect.any(String) });
  });

  it("rejects when every speech segment is blank", () => {
    const result = validateSegments([speech("   ")]);
    expect(result.ok).toBe(false);
  });

  it("rejects a segment missing a voice", () => {
    const result = validateSegments([speech("hello", "")]);
    expect(result.ok).toBe(false);
  });

  it("accepts a normal single-speaker request", () => {
    expect(validateSegments([speech("مرحبا بك في أثر")])).toEqual({ ok: true });
  });

  it("rejects over Munsit's character cap", () => {
    const result = validateSegments([speech("a".repeat(MAX_TTS_CHARACTERS + 1))]);
    expect(result.ok).toBe(false);
  });

  it("rejects over the pause-tag budget (20 tags)", () => {
    const segments: TtsSegment[] = [
      speech("hi"),
      ...Array.from({ length: 21 }, () => ({ type: "pause" as const, ms: 100 })),
    ];
    const result = validateSegments(segments);
    expect(result.ok).toBe(false);
  });

  it("rejects over the 30s total pause budget", () => {
    const segments: TtsSegment[] = [
      speech("hi"),
      { type: "pause", ms: 20_000 },
      { type: "pause", ms: 15_000 },
    ];
    const result = validateSegments(segments);
    expect(result.ok).toBe(false);
  });
});

describe("wordsFromAlignment", () => {
  it("groups per-character timings into words on whitespace", () => {
    // "hi there" — 8 characters including the space at index 2.
    const alignment = {
      characters: ["h", "i", " ", "t", "h", "e", "r", "e"],
      startS: [0, 0.1, 0.2, 0.3, 0.4, 0.5, 0.6, 0.7],
      endS: [0.1, 0.2, 0.2, 0.4, 0.5, 0.6, 0.7, 0.8],
    };
    const words = wordsFromAlignment(alignment);
    expect(words).toEqual([
      { word: "hi", startS: 0, endS: 0.2 },
      { word: "there", startS: 0.3, endS: 0.8 },
    ]);
  });

  it("handles a trailing word with no closing whitespace", () => {
    const alignment = { characters: ["o", "k"], startS: [0, 0.1], endS: [0.1, 0.2] };
    expect(wordsFromAlignment(alignment)).toEqual([{ word: "ok", startS: 0, endS: 0.2 }]);
  });
});

describe("offsetAlignment", () => {
  it("shifts every timing forward by offsetS", () => {
    const alignment = { characters: ["a"], startS: [0], endS: [0.1] };
    expect(offsetAlignment(alignment, 2)).toEqual({
      characters: ["a"],
      startS: [2],
      endS: [2.1],
    });
  });
});
