import { describe, expect, it } from "vitest";
import { buildPrompt } from "@/lib/prompt";

describe("negative prompt vs requested text", () => {
  // The real prompt behind the misspelled "IO Distent" robot.
  const LOGO_PROMPT =
    'make me this robot by adding IO District logo attached accurately and hyperealistically with blue light on the robot itself';

  it("does not ban logos when the prompt asks for one", () => {
    const { negativePrompt } = buildPrompt({ subject: LOGO_PROMPT });
    expect(negativePrompt).not.toMatch(/\blogo\b/);
    expect(negativePrompt).not.toMatch(/text overlay/);
  });

  it("still bans the quality problems", () => {
    const { negativePrompt } = buildPrompt({ subject: LOGO_PROMPT });
    expect(negativePrompt).toMatch(/low quality/);
    expect(negativePrompt).toMatch(/blurry/);
  });

  it("keeps banning stray text when none was asked for", () => {
    const { negativePrompt } = buildPrompt({ subject: "a camel on a dune" });
    expect(negativePrompt).toMatch(/watermark/);
    expect(negativePrompt).toMatch(/\blogo\b/);
  });

  it("detects a quoted string as wanting text", () => {
    const { negativePrompt } = buildPrompt({
      subject: 'a shopfront where the sign reads "OPEN"',
    });
    expect(negativePrompt).not.toMatch(/text overlay/);
  });

  it("detects text intent from any prompt field, not just the subject", () => {
    const { negativePrompt } = buildPrompt({
      subject: "a robot",
      brandTokens: "the IO District wordmark across the chest",
    });
    expect(negativePrompt).not.toMatch(/\blogo\b/);
  });
});
