import { describe, expect, it } from "vitest";
import { mergeWordsIntoSegments } from "@/lib/openai-whisper";

/**
 * The API returns segments and words as two unlinked lists. Pairing them back
 * up — and shifting both onto the full recording's timeline — is the only
 * real logic on our side of the call.
 */
const response = {
  language: "english",
  duration: 6,
  text: "Good morning. That works for us.",
  segments: [
    { start: 0, end: 2.5, text: " Good morning." },
    { start: 2.5, end: 6, text: " That works for us." },
  ],
  words: [
    { word: "Good", start: 0.1, end: 0.5 },
    { word: "morning", start: 0.5, end: 1.2 },
    { word: "That", start: 2.6, end: 2.9 },
    { word: "works", start: 2.9, end: 3.3 },
    { word: "for", start: 3.3, end: 3.6 },
    { word: "us", start: 3.6, end: 3.9 },
  ],
};

describe("mergeWordsIntoSegments", () => {
  it("puts each word in the segment it belongs to", () => {
    const [first, second] = mergeWordsIntoSegments(response);
    expect(first.words.map((w) => w.w)).toEqual(["Good", "morning"]);
    expect(second.words.map((w) => w.w)).toEqual(["That", "works", "for", "us"]);
  });

  it("trims the leading space the API puts on every segment", () => {
    expect(mergeWordsIntoSegments(response)[0].text).toBe("Good morning.");
  });

  it("shifts every timestamp onto the full recording's timeline", () => {
    // This chunk started 10 minutes into the video.
    const shifted = mergeWordsIntoSegments(response, 600);
    expect(shifted[0].start).toBe(600);
    expect(shifted[0].words[0].s).toBe(600.1);
    expect(shifted[1].end).toBe(606);
  });

  it("consumes each word exactly once across all segments", () => {
    const all = mergeWordsIntoSegments(response).flatMap((s) => s.words);
    expect(all).toHaveLength(response.words.length);
  });

  it("keeps text that came back with no segments at all", () => {
    // A very short chunk returns text and words but an empty segment list.
    const out = mergeWordsIntoSegments({
      duration: 0.8,
      text: "Yes.",
      words: [{ word: "Yes", start: 0.1, end: 0.4 }],
    }, 30);
    expect(out).toHaveLength(1);
    expect(out[0].text).toBe("Yes.");
    expect(out[0].start).toBe(30);
    expect(out[0].words[0].s).toBe(30.1);
  });

  it("returns nothing for silence", () => {
    expect(mergeWordsIntoSegments({ duration: 5, text: "", segments: [], words: [] })).toEqual([]);
  });

  it("handles a translated response, which carries no word timings", () => {
    const out = mergeWordsIntoSegments({
      duration: 4,
      segments: [{ start: 0, end: 4, text: " We start in Riyadh." }],
    });
    expect(out[0].text).toBe("We start in Riyadh.");
    expect(out[0].words).toEqual([]);
  });
});
