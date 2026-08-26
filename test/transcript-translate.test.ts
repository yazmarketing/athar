import { describe, expect, it } from "vitest";
import { parseTranslationLines } from "@/lib/transcript-translate";

describe("parseTranslationLines", () => {
  it("reads numbered JSON lines", () => {
    const raw = JSON.stringify({
      lines: [
        { n: 1, text: "Hello" },
        { n: 2, text: "World" },
      ],
    });
    expect(parseTranslationLines(raw, 2)).toEqual(["Hello", "World"]);
  });

  it("fills by order when n is missing but the count matches", () => {
    const raw = JSON.stringify({
      lines: [{ text: "One" }, { text: "Two" }, { text: "Three" }],
    });
    expect(parseTranslationLines(raw, 3)).toEqual(["One", "Two", "Three"]);
  });

  it("accepts a bare array of strings", () => {
    expect(parseTranslationLines('["Alpha","Beta"]', 2)).toEqual([
      "Alpha",
      "Beta",
    ]);
  });

  it("keeps holes when a line is skipped so the caller can retry", () => {
    const raw = JSON.stringify({
      lines: [
        { n: 1, text: "First" },
        { n: 3, text: "Third" },
      ],
    });
    expect(parseTranslationLines(raw, 3)).toEqual(["First", null, "Third"]);
  });

  it("reads JSON inside a markdown fence", () => {
    const raw = "```json\n{\"lines\":[{\"n\":1,\"text\":\"Hi\"}]}\n```";
    expect(parseTranslationLines(raw, 1)).toEqual(["Hi"]);
  });
});
