import { describe, expect, it } from "vitest";
import {
  ASPECT_RATIOS,
  ASPECT_TO_ARK_SIZE_1K,
  ASPECT_TO_ARK_SIZE_2K,
  ASPECT_TO_VIDEO_RATIO,
  isAspectRatio,
} from "@/config/aspects";

const SEEDREAM_5_FLOOR = 3_686_400;

const px = (size: string) => {
  const [w, h] = size.split("x").map(Number);
  return w * h;
};

describe("aspect ratios", () => {
  it("pairs every landscape ratio with its portrait (plus 1:1)", () => {
    const pairs: [string, string][] = [
      ["16:9", "9:16"],
      ["4:3", "3:4"],
      ["3:2", "2:3"],
      ["5:4", "4:5"],
      ["21:9", "9:21"],
    ];
    for (const [a, b] of pairs) {
      expect(ASPECT_RATIOS).toContain(a);
      expect(ASPECT_RATIOS).toContain(b);
    }
    expect(ASPECT_RATIOS).toContain("1:1");
  });

  it("gives every ratio a 1K and 2K Seedream size", () => {
    for (const ratio of ASPECT_RATIOS) {
      expect(ASPECT_TO_ARK_SIZE_1K[ratio]).toMatch(/^\d+x\d+$/);
      expect(ASPECT_TO_ARK_SIZE_2K[ratio]).toMatch(/^\d+x\d+$/);
    }
  });

  it("keeps every Seedream dimension a multiple of 16", () => {
    for (const ratio of ASPECT_RATIOS) {
      for (const size of [
        ASPECT_TO_ARK_SIZE_1K[ratio],
        ASPECT_TO_ARK_SIZE_2K[ratio],
      ]) {
        const [w, h] = size.split("x").map(Number);
        expect(w % 16).toBe(0);
        expect(h % 16).toBe(0);
      }
    }
  });

  it("meets the Seedream 5 pixel floor at 2K", () => {
    for (const ratio of ASPECT_RATIOS) {
      expect(px(ASPECT_TO_ARK_SIZE_2K[ratio])).toBeGreaterThanOrEqual(
        SEEDREAM_5_FLOOR
      );
    }
  });

  it("maps video to a Seedance-native ratio", () => {
    for (const ratio of ASPECT_RATIOS) {
      expect(["16:9", "9:16", "1:1"]).toContain(ASPECT_TO_VIDEO_RATIO[ratio]);
    }
  });

  it("rejects unknown tokens", () => {
    expect(isAspectRatio("16:9")).toBe(true);
    expect(isAspectRatio("9:21")).toBe(true);
    expect(isAspectRatio("7:3")).toBe(false);
    expect(isAspectRatio(null)).toBe(false);
  });
});
