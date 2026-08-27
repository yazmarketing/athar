import { describe, expect, it } from "vitest";
import {
  BACKGROUND_REMOVE_MODEL,
  MODEL_REGISTRY,
  UPSCALE_MODELS,
  resolveModel,
  seedanceRealCost,
  type Capability,
  type Tier,
} from "@/config/models";

const CAPABILITIES = Object.keys(MODEL_REGISTRY) as Capability[];
const TIERS: Tier[] = ["draft", "standard", "hero"];

describe("model registry", () => {
  it("resolves an endpoint for every capability and tier", () => {
    for (const capability of CAPABILITIES) {
      for (const tier of TIERS) {
        const model = resolveModel(capability, tier);
        expect(model.slug, `${capability}/${tier}`).toBeTruthy();
        expect(model.provider).toBe("byteplus");
      }
    }
  });

  it("keeps video durations within Seedance limits", () => {
    for (const tier of TIERS) {
      for (const capability of ["t2v", "i2v", "v2v"] as Capability[]) {
        const model = resolveModel(capability, tier);
        expect(model.maxDuration).toBeGreaterThanOrEqual(4);
        expect(model.maxDuration).toBeLessThanOrEqual(30);
      }
    }
  });

  it("exposes both upscale modes and background removal on BytePlus", () => {
    expect(UPSCALE_MODELS.creative.provider).toBe("byteplus");
    expect(UPSCALE_MODELS.precision.provider).toBe("byteplus");
    expect(BACKGROUND_REMOVE_MODEL.provider).toBe("byteplus");
  });
});

describe("seedanceRealCost", () => {
  it("prices Seedance 2.5 720p from real usage tokens, no video input", () => {
    // $10.70 / M tokens list rate, 720p is not on the current 1080p-only promo
    const cost = seedanceRealCost(
      "dreamina-seedance-2-5-260628",
      "720p",
      108_900,
      false
    );
    expect(cost).toBeCloseTo((108_900 / 1_000_000) * 10.7, 6);
  });

  it("charges the higher with-video rate when a reference video was attached", () => {
    const withoutVideo = seedanceRealCost(
      "dreamina-seedance-2-5-260628",
      "720p",
      1_000_000,
      false
    );
    const withVideo = seedanceRealCost(
      "dreamina-seedance-2-5-260628",
      "720p",
      1_000_000,
      true
    );
    expect(withVideo).toBeLessThan(withoutVideo!);
  });

  it("falls back to null when there is no usage to price from", () => {
    expect(
      seedanceRealCost("dreamina-seedance-2-5-260628", "720p", null, false)
    ).toBeNull();
    expect(
      seedanceRealCost("dreamina-seedance-2-5-260628", "720p", 0, false)
    ).toBeNull();
  });

  it("falls back to null for a model or resolution with no confirmed rate", () => {
    expect(
      seedanceRealCost("some-future-model", "720p", 100_000, false)
    ).toBeNull();
  });
});
