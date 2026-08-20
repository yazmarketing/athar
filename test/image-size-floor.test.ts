import { describe, expect, it } from "vitest";
import { ensureMinPixels } from "@/app/api/generate/route";
import { IMAGE_MODEL_CHOICES, resolveModel } from "@/config/models";

/**
 * Verified against the live BytePlus API on 2026-08-19: Seedream 5.x rejects
 * anything below this with "image size must be at least 3686400 pixels" — on
 * every request, not just edits.
 */
const SEEDREAM_5_FLOOR = 3_686_400;

/** The 1K sizes the app derives from each aspect. */
const SIZES_1K = ["1280x720", "720x1280", "1024x1024", "896x1120", "1472x640"];

const px = (size: string) => {
  const [w, h] = size.split("x").map(Number);
  return w * h;
};

describe("ensureMinPixels", () => {
  it("lifts every 1K aspect over the Seedream 5 floor", () => {
    for (const size of SIZES_1K) {
      const out = ensureMinPixels(size, SEEDREAM_5_FLOOR);
      expect(px(out)).toBeGreaterThanOrEqual(SEEDREAM_5_FLOOR);
    }
  });

  it("keeps the aspect ratio while scaling", () => {
    const out = ensureMinPixels("1280x720", SEEDREAM_5_FLOOR);
    const [w, h] = out.split("x").map(Number);
    expect(Math.abs(w / h - 16 / 9)).toBeLessThan(0.02);
  });

  it("keeps every dimension a multiple of 16", () => {
    for (const size of SIZES_1K) {
      const [w, h] = ensureMinPixels(size, SEEDREAM_5_FLOOR).split("x").map(Number);
      expect(w % 16).toBe(0);
      expect(h % 16).toBe(0);
    }
  });

  it("leaves a size that already clears the floor alone", () => {
    expect(ensureMinPixels("2560x1440", SEEDREAM_5_FLOOR)).toBe("2560x1440");
  });

  it("does nothing when there is no floor", () => {
    expect(ensureMinPixels("1280x720", 0)).toBe("1280x720");
  });
});

describe("model configuration matches what the provider accepts", () => {
  it("declares the floor on both Seedream 5 endpoints", () => {
    expect(resolveModel("t2i", "standard").minPixels).toBe(SEEDREAM_5_FLOOR);
    expect(resolveModel("t2i", "hero").minPixels).toBe(SEEDREAM_5_FLOOR);
  });

  it("leaves Seedream 4 without one — it accepts 1K", () => {
    expect(resolveModel("t2i", "draft").minPixels).toBeUndefined();
  });

  it("never offers a resolution a model cannot produce", () => {
    // Picking "Seedream 5.0 · 1K" used to be a guaranteed provider error.
    for (const choice of IMAGE_MODEL_CHOICES) {
      const model = choice.tier ? resolveModel("t2i", choice.tier) : null;
      if (!model?.minPixels) continue;
      expect(choice.resolutions).not.toContain("1K");
    }
  });
});
