import { describe, expect, it } from "vitest";
import { culturalGuidance } from "@/config/cultural";
import { buildPrompt } from "@/lib/prompt";

describe("culturalGuidance", () => {
  it("stays out of prompts with no Gulf subject", () => {
    expect(culturalGuidance("a wide shot of a desert at dawn")).toBeNull();
    expect(culturalGuidance("a woman in a Paris cafe")).toBeNull();
  });

  it("describes the abaya and shayla as constructions, not labels", () => {
    const g = culturalGuidance("an Emirati woman in a modern office")!;
    expect(g.positive).toMatch(/abaya/);
    expect(g.positive).toMatch(/drapes rather than hangs shapeless/);
    expect(g.positive).toMatch(/shayla/);
    expect(g.positive).toMatch(/away from the face/);
  });

  it("bans what the model would otherwise draw instead", () => {
    const g = culturalGuidance("an Emirati woman walking through a majlis")!;
    expect(g.negative).toContain("chador");
    expect(g.negative).toContain("south asian features");
    expect(g.negative).toContain("tightly wrapped hijab pinned under the chin");
    expect(g.negative).toContain("niqab");
  });

  it("leaves a face covering alone when it was asked for", () => {
    const g = culturalGuidance("an elderly Emirati woman wearing a niqab")!;
    expect(g.negative).not.toContain("niqab");
    expect(g.negative).toContain("chador");
  });

  it("does not put a second person in the frame", () => {
    const man = culturalGuidance("an Emirati man at a desk")!;
    expect(man.positive).toMatch(/kandura/);
    expect(man.positive).not.toMatch(/abaya/);

    const woman = culturalGuidance("an Emirati woman at a desk")!;
    expect(woman.positive).toMatch(/abaya/);
    expect(woman.positive).not.toMatch(/kandura/);
  });

  it("dresses children as children", () => {
    const boy = culturalGuidance("an Emirati boy running through a farm")!;
    expect(boy.positive).toMatch(/without the ghutra and agal/);
    const girl = culturalGuidance("an Emirati girl planting a seed")!;
    expect(girl.positive).toMatch(/uncovered as is normal/);
  });

  it("covers both when the prompt names neither", () => {
    const g = culturalGuidance("an Emirati family at home")!;
    expect(g.positive).toMatch(/abaya/);
    expect(g.positive).toMatch(/kandura/);
  });

  it("fires on the garment alone, without a nationality", () => {
    expect(culturalGuidance("a woman in an abaya crossing a courtyard")).not.toBeNull();
  });
});

describe("buildPrompt applies it on every path", () => {
  it("adds guidance and negatives to an ordinary dock prompt", () => {
    const { finalPrompt, negativePrompt } = buildPrompt({
      subject: "an Emirati woman presenting to a boardroom",
    });
    expect(finalPrompt).toMatch(/Culturally accurate/);
    expect(finalPrompt).toMatch(/shayla/);
    expect(negativePrompt).toContain("chador");
  });

  it("leaves unrelated prompts exactly as they were", () => {
    const { finalPrompt, negativePrompt } = buildPrompt({
      subject: "a red sports car on a wet road",
    });
    expect(finalPrompt).not.toMatch(/Culturally accurate/);
    expect(negativePrompt).not.toContain("chador");
  });
});
