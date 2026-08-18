import { describe, expect, it } from "vitest";
// The real implementation, not a copy — this test guards the shipped rules.
import { stripMotion } from "@/lib/shot-plan";

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
