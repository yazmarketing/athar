import { describe, expect, it } from "vitest";
import { buildPrompt } from "@/lib/prompt";

describe("buildPrompt", () => {
  it("joins all provided fragments in spec order", () => {
    const { finalPrompt } = buildPrompt({
      subject: "an elderly Emirati woman",
      action: "smiling at the camera",
      presetFragment: "85mm portrait lens",
      lighting: "golden hour",
      brandTokens: "bold black and white",
    });
    expect(finalPrompt).toBe(
      "an elderly Emirati woman, smiling at the camera, 85mm portrait lens, " +
        "golden hour, bold black and white, " +
        "photorealistic, 4k, film grain, sharp focus, professional photography"
    );
  });

  it("skips empty optional fragments", () => {
    const { finalPrompt } = buildPrompt({ subject: "a desert dune", action: "  " });
    expect(finalPrompt.startsWith("a desert dune, photorealistic")).toBe(true);
    expect(finalPrompt).not.toContain(", ,");
  });

  it("always includes global negative bans", () => {
    const { negativePrompt } = buildPrompt({ subject: "x" });
    expect(negativePrompt).toContain("watermark");
    expect(negativePrompt).toContain("low quality");
  });

  it("appends brand negative additions after global bans", () => {
    const { negativePrompt } = buildPrompt({
      subject: "x",
      negativeAdditions: "neon colors, cartoon style",
    });
    expect(negativePrompt.endsWith("neon colors, cartoon style")).toBe(true);
  });
});
