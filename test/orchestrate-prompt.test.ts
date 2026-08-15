import { describe, expect, it } from "vitest";

/** Mirror of stripMotion in src/app/api/orchestrate/route.ts. */
const MOTION_RE =
  /\b(camera\s+(sweeps?|pans?|tilts?|pushes?|pulls?|tracks?|dollies|glides?|moves?)|sweeps?\s+(from|down|into|across)|pans?\s+(to|across)|zoom(s|ing)?\s+(in|out)|push(es|ing)?\s+in|pull(s|ing)?\s+back|dolly|crane\s+shot|whip\s+pan|match\s+cut|cuts?\s+to|transition(ing|s)?( to)?|slow\s+motion)\b[^.]*\.?/gi;

function stripMotion(text: string): { still: string; motion: string } {
  const found = text.match(MOTION_RE) ?? [];
  const still = text
    .replace(MOTION_RE, "")
    .replace(/\s*,\s*,/g, ",")
    .replace(/\s+\./g, ".")
    .replace(/\.\s*\./g, ".")
    .replace(/^[\s,.]+/, "")
    .replace(/\s{2,}/g, " ")
    .trim();
  return { still, motion: found.join(" ").trim() };
}

// The prompt that produced the rejected lecture-hall image.
const REAL = `The laptop screen transforms into a university lecture hall, where a poised young Emirati woman in a modest professional abaya and shayla stands at a lectern delivering an inspiring presentation to a diverse audience. She speaks with calm authority while students and faculty rise into warm, genuine applause. Modern Emirati campus architecture, presentation light illuminating her face, cinematic shallow depth of field, powerful atmosphere of education, confidence and leadership. Camera sweeps from her face down into the applauding hands, using the movement as the transition., professional photography, photorealistic, sharp focus, natural lighting, high detail`;

describe("stripMotion", () => {
  it("removes the camera direction from the real failing prompt", () => {
    const { still, motion } = stripMotion(REAL);
    expect(still).not.toMatch(/camera sweeps/i);
    expect(still).not.toMatch(/transition/i);
    expect(motion).toMatch(/camera sweeps/i);
  });

  it("leaves the descriptive frame intact", () => {
    const { still } = stripMotion(REAL);
    expect(still).toMatch(/university lecture hall/);
    expect(still).toMatch(/abaya and shayla/);
    expect(still).toMatch(/photorealistic/);
  });

  it("cleans up the punctuation the removal leaves behind", () => {
    const { still } = stripMotion(REAL);
    expect(still).not.toMatch(/,\s*,/);
    expect(still).not.toMatch(/\.\s*\./);
    expect(still).not.toMatch(/\s\./);
  });

  it("is a no-op on a prompt with no camera language", () => {
    const clean = "A wide shot of a courtyard at dusk, warm light, film grain.";
    expect(stripMotion(clean).still).toBe(clean);
    expect(stripMotion(clean).motion).toBe("");
  });
});
