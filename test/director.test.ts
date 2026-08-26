import { describe, expect, it } from "vitest";
import {
  compileDirector,
  DEFAULT_DIRECTOR_ID,
  DIRECTOR_CONSTRAINT,
  MONTAGE_CONSTRAINT,
  PACING_PRESETS,
} from "@/config/director";

describe("compileDirector", () => {
  it("raw defaults contribute nothing", () => {
    const result = compileDirector({
      genreId: DEFAULT_DIRECTOR_ID,
      shotId: DEFAULT_DIRECTOR_ID,
    });
    expect(result.activeCount).toBe(0);
    expect(result.fragments).toEqual([]);
    expect(result.summary).toBe("");
  });

  it("orders shot language before genre and adds the Seedance constraint", () => {
    const result = compileDirector({
      shotId: "close_up",
      genreId: "epic",
    });
    expect(result.activeCount).toBe(2);
    expect(result.fragments[0]).toMatch(/close-up/i);
    expect(result.fragments.at(-1)).toBe(DIRECTOR_CONSTRAINT);
    expect(result.summary).toContain("Close-up");
    expect(result.summary).toContain("Epic");
  });

  it("montage pacing swaps the single-shot constraint for the montage one", () => {
    const result = compileDirector({ pacingId: "chaotic" });
    expect(result.activeCount).toBe(1);
    expect(result.fragments[0]).toMatch(/fast-cut montage/i);
    expect(result.fragments.at(-1)).toBe(MONTAGE_CONSTRAINT);
    // The default constraint bans jump cuts — it must not ride along.
    expect(result.fragments).not.toContain(DIRECTOR_CONSTRAINT);
    expect(result.negatives.join(" ")).toMatch(/static locked frame/i);
  });

  it("single-shot pacing keeps the single-shot constraint and bans cuts", () => {
    const result = compileDirector({ pacingId: "single_shot" });
    expect(result.fragments.at(-1)).toBe(DIRECTOR_CONSTRAINT);
    expect(result.negatives.join(" ")).toMatch(/jump cuts/i);
  });

  it("every pacing preset has a usable shape", () => {
    for (const p of PACING_PRESETS) {
      expect(p.id).toBeTruthy();
      expect(p.label).toBeTruthy();
      if (p.id !== "raw") expect(p.fragment.length).toBeGreaterThan(10);
    }
  });
});
