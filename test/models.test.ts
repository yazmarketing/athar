import { describe, expect, it } from "vitest";
import {
  BACKGROUND_REMOVE_MODEL,
  MODEL_REGISTRY,
  UPSCALE_MODELS,
  resolveModel,
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
