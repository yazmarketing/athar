import { describe, expect, it } from "vitest";
import {
  compileDirector,
  DEFAULT_DIRECTOR_ID,
  DIRECTOR_CONSTRAINT,
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
});
