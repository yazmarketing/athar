import { describe, expect, it } from "vitest";
import {
  centerCropForAspect,
  needsAspectCrop,
  parseAspect,
} from "@/lib/crop-to-aspect";

describe("crop-to-aspect", () => {
  it("parses dock ratios", () => {
    expect(parseAspect("16:9")).toEqual({ w: 16, h: 9 });
    expect(parseAspect("21:9")).toEqual({ w: 21, h: 9 });
    expect(parseAspect("nope")).toBeNull();
  });

  it("does not crop an image that is already 16:9", () => {
    expect(needsAspectCrop(2560, 1440, 16, 9)).toBe(false);
    expect(centerCropForAspect(2560, 1440, 16, 9)).toBeNull();
  });

  it("crops a 21:9 still to 16:9 by trimming the sides", () => {
    // Seedream 2K 21:9
    const crop = centerCropForAspect(2944, 1264, 16, 9);
    expect(crop).not.toBeNull();
    expect(crop!.height).toBe(1264);
    expect(crop!.width).toBeLessThan(2944);
    expect(crop!.width / crop!.height).toBeCloseTo(16 / 9, 2);
  });

  it("crops a 9:16 still to 16:9 by trimming top and bottom", () => {
    const crop = centerCropForAspect(1440, 2560, 16, 9);
    expect(crop).not.toBeNull();
    expect(crop!.width).toBe(1440);
    expect(crop!.height).toBeLessThan(2560);
    expect(crop!.width / crop!.height).toBeCloseTo(16 / 9, 2);
  });
});
