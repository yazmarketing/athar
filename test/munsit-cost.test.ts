import { describe, expect, it, afterEach } from "vitest";
import { DEFAULT_MUNSIT_COST_PER_CHAR, munsitCost } from "@/lib/munsit-tts";

describe("munsitCost", () => {
  const originalRate = process.env.MUNSIT_COST_PER_CHAR;

  afterEach(() => {
    if (originalRate === undefined) delete process.env.MUNSIT_COST_PER_CHAR;
    else process.env.MUNSIT_COST_PER_CHAR = originalRate;
  });

  it("falls back to the Pro-plan estimate when no rate is configured", () => {
    delete process.env.MUNSIT_COST_PER_CHAR;
    expect(munsitCost(1000)).toBeCloseTo(1000 * DEFAULT_MUNSIT_COST_PER_CHAR, 6);
  });

  it("scales linearly with character count once a rate is set", () => {
    process.env.MUNSIT_COST_PER_CHAR = "0.0001";
    expect(munsitCost(1000)).toBeCloseTo(0.1, 6);
    expect(munsitCost(2000)).toBeCloseTo(0.2, 6);
  });

  it("matches a hand-computed example", () => {
    process.env.MUNSIT_COST_PER_CHAR = "0.00003";
    expect(munsitCost(500)).toBeCloseTo(0.015, 6);
  });

  it("never goes negative on bad input", () => {
    process.env.MUNSIT_COST_PER_CHAR = "0.0001";
    expect(munsitCost(-500)).toBe(0);
    expect(munsitCost(0)).toBe(0);
  });
});
