import { describe, expect, it } from "vitest";
import { promptSimilarity } from "@/lib/render-guardrails";

describe("promptSimilarity", () => {
  it("recognises a lightly reworded repeat", () => {
    expect(promptSimilarity(
      "Wide cinematic shot of a red sports car driving through Dubai at sunset",
      "A wide cinematic shot of the red sports car driving through Dubai, at sunset"
    )).toBeGreaterThanOrEqual(0.82);
  });

  it("does not flag an unrelated prompt", () => {
    expect(promptSimilarity(
      "Wide cinematic shot of a red sports car driving through Dubai at sunset",
      "Macro product shot of perfume on black marble with studio lighting"
    )).toBeLessThan(0.5);
  });

  it("works for Arabic prompts", () => {
    expect(promptSimilarity(
      "لقطة سينمائية واسعة لسيارة حمراء تسير في دبي وقت الغروب",
      "لقطة سينمائية واسعة لسيارة حمراء تسير في دبي وقت الغروب بهدوء"
    )).toBeGreaterThanOrEqual(0.82);
  });
});
