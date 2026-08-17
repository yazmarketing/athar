import { describe, expect, it } from "vitest";
import { DEFAULT_STYLE_ID, resolveStyle } from "@/config/styles";
import { buildPrompt } from "@/lib/prompt";

const LOOK_WORDS = /professional photography|photorealistic|sharp focus|cinematic film still|film grain/i;

describe("default style is raw", () => {
  it("defaults to the raw preset", () => {
    expect(DEFAULT_STYLE_ID).toBe("raw");
    expect(resolveStyle(DEFAULT_STYLE_ID).positive).toBe("");
  });

  it("adds nothing when no style is specified (campaign path)", () => {
    const { finalPrompt } = buildPrompt({ subject: "A camel on a dune" });
    expect(finalPrompt).toBe("A camel on a dune");
    expect(finalPrompt).not.toMatch(LOOK_WORDS);
  });

  it("adds nothing for an explicit raw selection", () => {
    const { finalPrompt } = buildPrompt({
      subject: "A courtyard at dusk",
      styleId: "raw",
    });
    expect(finalPrompt).toBe("A courtyard at dusk");
  });

  it("adds nothing for video either", () => {
    const { finalPrompt } = buildPrompt({
      subject: "A dhow crossing the creek",
      cameraId: undefined,
    });
    expect(finalPrompt).not.toMatch(LOOK_WORDS);
  });

  it("still applies a look when one is deliberately chosen", () => {
    const { finalPrompt } = buildPrompt({
      subject: "A camel on a dune",
      styleId: "photographic",
    });
    expect(finalPrompt).toMatch(/professional photography/i);
  });
});
