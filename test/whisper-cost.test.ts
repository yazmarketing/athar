import { describe, expect, it } from "vitest";
import { whisperCost, WHISPER_COST_PER_MINUTE } from "@/lib/openai-whisper";

describe("whisperCost", () => {
  it("prices a minute of audio at the per-minute rate", () => {
    expect(whisperCost(60)).toBeCloseTo(WHISPER_COST_PER_MINUTE, 6);
  });

  it("scales linearly with duration", () => {
    expect(whisperCost(600)).toBeCloseTo(WHISPER_COST_PER_MINUTE * 10, 6);
  });

  it("never goes negative on bad input", () => {
    expect(whisperCost(-30)).toBe(0);
    expect(whisperCost(0)).toBe(0);
  });
});
