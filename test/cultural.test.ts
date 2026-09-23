import { describe, expect, it } from "vitest";
import { culturalGuidance } from "@/config/cultural";
import { buildPrompt } from "@/lib/prompt";

describe("culturalGuidance", () => {
  it("leaves unrelated subjects alone", () => {
    for (const prompt of ["desert at dawn", "a woman in a Paris cafe", "Roman architecture"]) {
      expect(culturalGuidance(prompt)).toBeNull();
    }
  });

  it.each([
    ["Emirati", "United Arab Emirates"], ["Saudi", "Saudi Arabia"],
    ["Qatari", "Qatar"], ["Kuwaiti", "Kuwait"],
    ["Bahraini", "Bahrain"], ["Omani", "Oman"],
    ["امرأة سعودية", "Saudi Arabia"],
  ])("keeps %s context specific", (subject, country) => {
    const g = culturalGuidance(`${subject} cyclist in sportswear`)!;
    expect(g.positive).toContain(country);
    if (country !== "United Arab Emirates") expect(g.positive).not.toContain("United Arab Emirates");
    expect(g.positive).not.toMatch(/she wears|he wears|white kandura|black abaya/);
    expect(g.negative).toBe("");
  });

  it("preserves explicit clothing, place, time and creative direction", () => {
    const prompt = "An Emirati woman in a red suit, uncovered hair, in 1920s Paris, painted in gouache";
    const { finalPrompt } = buildPrompt({ subject: prompt });
    expect(finalPrompt).toContain(prompt);
    expect(finalPrompt).toContain("Preserve the requested place, era, clothing");
    expect(finalPrompt).not.toMatch(/modern Emirati setting|high-specification|shayla|abaya/);
  });

  it("does not infer a country from a shared garment or unspecified Gulf context", () => {
    expect(culturalGuidance("woman in an abaya")!.positive).toContain("garment name alone");
    const regional = culturalGuidance("a Khaleeji family at home")!;
    expect(regional.positive).toContain("without a specific country");
    expect(regional.positive).not.toContain("Emirati");
  });

  it("does not merge national traditions, add people or dress children", () => {
    const g = culturalGuidance("an Omani father and Emirati daughter at a museum")!;
    expect(g.positive).toContain("Oman");
    expect(g.positive).toContain("United Arab Emirates");
    expect(g.positive).toContain("keep regional traditions distinct");
    expect(g.positive).toContain("without adding unrequested garments or people");
  });

  it("respects coverings and excludes no ethnic appearance", () => {
    const g = culturalGuidance("Saudi woman wearing a niqab")!;
    expect(g.positive).toContain("face coverings");
    expect(g.positive).toContain("Nationality does not prescribe a face");
    expect(g.negative).toBe("");
    expect(g.positive).not.toMatch(/not South Asian|Levantine|North African/);
  });
});
