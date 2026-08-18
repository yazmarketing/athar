import { describe, expect, it } from "vitest";
import { buildPrompt } from "@/lib/prompt";
import { DEFAULT_CAMERA_ID } from "@/config/camera";

describe("buildPrompt", () => {
  // The default look is now "raw", which contributes nothing — a preset only
  // appends its words when someone deliberately picks one.
  it("joins all provided fragments in spec order (raw default adds nothing)", () => {
    const { finalPrompt } = buildPrompt({
      subject: "an elderly Emirati woman",
      action: "smiling at the camera",
      presetFragment: "85mm portrait lens",
      lighting: "golden hour",
      brandTokens: "bold black and white",
    });
    expect(finalPrompt).toBe(
      "an elderly Emirati woman, smiling at the camera, 85mm portrait lens, " +
        "golden hour, bold black and white"
    );
  });

  it("appends the look only when a preset is chosen", () => {
    const { finalPrompt } = buildPrompt({
      subject: "an elderly Emirati woman",
      styleId: "photographic",
    });
    expect(finalPrompt).toBe(
      "an elderly Emirati woman, " +
        "professional photography, photorealistic, sharp focus, natural lighting, high detail"
    );
  });

  it("skips empty optional fragments", () => {
    const { finalPrompt } = buildPrompt({ subject: "a desert dune", action: "  " });
    expect(finalPrompt).toBe("a desert dune");
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

  it("Raw style appends no look tokens", () => {
    const { finalPrompt } = buildPrompt({
      subject: "a plain grey box",
      styleId: "raw",
    });
    expect(finalPrompt).toBe("a plain grey box");
    expect(finalPrompt).not.toMatch(/photograph|film grain|illustration/i);
  });

  it("Illustration style adds its look and bans photorealism", () => {
    const { finalPrompt, negativePrompt } = buildPrompt({
      subject: "a mascot",
      styleId: "illustration",
    });
    expect(finalPrompt).toContain("digital illustration");
    expect(finalPrompt).not.toMatch(/photorealistic|film grain/);
    expect(negativePrompt).toContain("photorealistic");
    expect(negativePrompt).toContain("film grain");
  });

  it("Cinematic is the only default look that adds film grain", () => {
    const { finalPrompt } = buildPrompt({
      subject: "a lone car on a highway",
      styleId: "cinematic",
    });
    expect(finalPrompt).toContain("film grain");
    expect(finalPrompt).toContain("cinematic film still");
  });

  it("Studio product look adds no grain", () => {
    const { finalPrompt } = buildPrompt({
      subject: "a perfume bottle",
      styleId: "studio_product",
    });
    expect(finalPrompt).toContain("studio product photography");
    expect(finalPrompt).not.toContain("film grain");
  });

  it("injects the camera-move fragment for video prompts", () => {
    const { finalPrompt } = buildPrompt({
      subject: "a sports car on a coastal road",
      cameraId: "orbit",
    });
    expect(finalPrompt).toContain("orbit");
  });

  it("raw camera adds no motion text, and is what you get by default", () => {
    const raw = buildPrompt({ subject: "x", cameraId: "raw" }).finalPrompt;
    const noCam = buildPrompt({ subject: "x" }).finalPrompt;
    expect(raw).toBe(noCam);
    expect(DEFAULT_CAMERA_ID).toBe("raw");
  });

  it("locked-off pins the camera rather than staying silent", () => {
    const locked = buildPrompt({ subject: "x", cameraId: "locked" })
      .finalPrompt;
    expect(locked).not.toBe(buildPrompt({ subject: "x" }).finalPrompt);
    expect(locked).toMatch(/locked-off|no camera movement/i);
  });

  it("unknown styleId falls back to the default look", () => {
    const known = buildPrompt({ subject: "x" }).finalPrompt;
    const unknown = buildPrompt({ subject: "x", styleId: "does-not-exist" })
      .finalPrompt;
    expect(unknown).toBe(known);
  });
});
