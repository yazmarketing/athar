import { describe, expect, it } from "vitest";
import { buildPrompt } from "@/lib/prompt";
import { DEFAULT_CAMERA_ID } from "@/config/camera";

describe("buildPrompt", () => {
  // The default look is now "raw", which contributes nothing — a preset only
  // appends its words when someone deliberately picks one. The subject here is
  // deliberately not a Gulf one, so cultural guidance stays out of the way and
  // the ordering is the only thing under test (see cultural.test.ts for that).
  it("joins all provided fragments in spec order (raw default adds nothing)", () => {
    const { finalPrompt } = buildPrompt({
      subject: "an elderly fisherman",
      action: "smiling at the camera",
      presetFragment: "85mm portrait lens",
      lighting: "golden hour",
      brandTokens: "bold black and white",
    });
    expect(finalPrompt).toBe(
      "an elderly fisherman, smiling at the camera, 85mm portrait lens, " +
        "golden hour, bold black and white"
    );
  });

  it("appends the look only when a preset is chosen", () => {
    const { finalPrompt } = buildPrompt({
      subject: "an elderly fisherman",
      styleId: "photographic",
    });
    expect(finalPrompt).toBe(
      "an elderly fisherman, " +
        "professional photography, photorealistic, sharp focus, natural lighting, high detail"
    );
  });

  // Cultural guidance rides along on the same path, after everything the user
  // wrote — it adds, it never replaces.
  it("appends cultural guidance last, for a Gulf subject", () => {
    const { finalPrompt } = buildPrompt({
      subject: "an elderly Emirati woman",
      action: "smiling at the camera",
    });
    expect(finalPrompt).toMatch(
      /^an elderly Emirati woman, smiling at the camera, Culturally accurate:/
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

  it("director presets append Seedance shot language after the camera", () => {
    const { finalPrompt } = buildPrompt({
      subject: "a woman walking through a Dubai souq",
      cameraId: "orbit",
      genreId: "drama",
      shotId: "medium",
      lightLookId: "golden_hour",
    });
    expect(finalPrompt).toContain("orbit");
    expect(finalPrompt).toContain("medium shot");
    expect(finalPrompt).toContain("golden-hour");
    expect(finalPrompt).toContain("dramatic cinematic tone");
    expect(finalPrompt).toContain("at most two camera movements");
  });

  it("raw director fields add nothing to a stills prompt", () => {
    const plain = buildPrompt({ subject: "a desert dune" }).finalPrompt;
    const rawDirector = buildPrompt({
      subject: "a desert dune",
      genreId: "raw",
      shotId: "raw",
    }).finalPrompt;
    expect(rawDirector).toBe(plain);
  });

  it("video prompts get Seedance negatives even with a raw camera", () => {
    const { negativePrompt } = buildPrompt({
      subject: "a desert dune",
      cameraId: "raw",
    });
    expect(negativePrompt).toContain("face distortion");
    expect(negativePrompt).toContain("subtitles");
  });

  it("stills prompts do not get Seedance video negatives", () => {
    const { negativePrompt } = buildPrompt({ subject: "a desert dune" });
    expect(negativePrompt).not.toContain("face distortion");
    expect(negativePrompt).not.toContain("frame skipping");
  });
});

describe("buildPrompt lip-sync dialogue", () => {
  it("appends the Seedance line for a transcribed clip, right after the subject", () => {
    const { finalPrompt } = buildPrompt({
      subject: "a presenter in a studio",
      action: "facing the camera",
      audioTranscripts: ["Welcome to our new store in Dubai"],
    });
    expect(finalPrompt).toBe(
      "a presenter in a studio, " +
        'The character speaks: "Welcome to our new store in Dubai", ' +
        "take @audio1 as a reference, facing the camera"
    );
  });

  it("numbers each clip's line independently", () => {
    const { finalPrompt } = buildPrompt({
      subject: "two hosts on a talk show",
      audioTranscripts: ["First line", "Second line"],
    });
    expect(finalPrompt).toContain('"First line", take @audio1 as a reference');
    expect(finalPrompt).toContain('"Second line", take @audio2 as a reference');
  });

  it("stays out of the way when the prompt already addresses the clip", () => {
    const { finalPrompt } = buildPrompt({
      subject: "The man speaks, take @audio1 as a reference",
      audioTranscripts: ["Welcome to our new store"],
    });
    expect(finalPrompt).not.toContain("The character speaks");
    // @audio10 is not @audio1 — a mention of one must not silence the other
    const many = buildPrompt({
      subject: "use @audio10 here",
      audioTranscripts: ["only clip"],
    });
    expect(many.finalPrompt).toContain("take @audio1 as a reference");
  });

  it("adds nothing for clips that produced no transcript", () => {
    const plain = buildPrompt({ subject: "a desert dune" }).finalPrompt;
    const withEmpty = buildPrompt({
      subject: "a desert dune",
      audioTranscripts: [null, "  "],
    }).finalPrompt;
    expect(withEmpty).toBe(plain);
  });

  it("quoted dialogue does not disable the text/watermark bans", () => {
    const { negativePrompt } = buildPrompt({
      subject: "a presenter in a studio",
      audioTranscripts: ["Welcome to our new store"],
    });
    expect(negativePrompt).toContain("watermark");
    expect(negativePrompt).toContain("text overlay");
  });
});
