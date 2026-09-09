import { describe, expect, it } from "vitest";
import {
  coerceStyleFingerprint,
  fingerprintMatches,
} from "@/lib/reference-style";

const URLS = ["https://cdn.example.com/b.png", "https://cdn.example.com/a.png"];

describe("coerceStyleFingerprint", () => {
  it("accepts a well-formed analysis and sorts the source urls", () => {
    const fp = coerceStyleFingerprint(
      {
        styleBrief: "Flat gouache illustration, soft edges.",
        styleNegative: "photorealism, 3d render",
        carriesCast: false,
        subjects: "Children playing among date palms.",
      },
      URLS
    );
    expect(fp?.styleBrief).toContain("gouache");
    expect(fp?.carriesCast).toBe(false);
    expect(fp?.sourceUrls).toEqual([...URLS].sort());
    expect(fp?.analyzedAt).toBeTruthy();
  });

  it("rejects an analysis with no brief — that is a failure, not a style", () => {
    expect(coerceStyleFingerprint({ styleBrief: "  " }, URLS)).toBeNull();
    expect(coerceStyleFingerprint({}, URLS)).toBeNull();
    expect(coerceStyleFingerprint(null, URLS)).toBeNull();
    expect(coerceStyleFingerprint("gouache", URLS)).toBeNull();
  });

  it("clamps runaway fields so the contract cannot drown the shot", () => {
    const fp = coerceStyleFingerprint(
      {
        styleBrief: "x".repeat(5000),
        styleNegative: "y".repeat(5000),
        subjects: "z".repeat(5000),
        carriesCast: "yes", // not a boolean → false
      },
      URLS
    );
    expect(fp?.styleBrief.length).toBeLessThanOrEqual(900);
    expect(fp?.styleNegative.length).toBeLessThanOrEqual(300);
    expect(fp?.subjects.length).toBeLessThanOrEqual(200);
    expect(fp?.carriesCast).toBe(false);
  });
});

describe("fingerprintMatches", () => {
  const fp = coerceStyleFingerprint({ styleBrief: "gouache" }, URLS)!;

  it("matches the same set regardless of order", () => {
    expect(fingerprintMatches(fp, [...URLS].reverse())).toBe(true);
  });

  it("goes stale when a reference is added or removed", () => {
    expect(fingerprintMatches(fp, URLS.slice(0, 1))).toBe(false);
    expect(
      fingerprintMatches(fp, [...URLS, "https://cdn.example.com/c.png"])
    ).toBe(false);
  });

  it("never matches a missing fingerprint", () => {
    expect(fingerprintMatches(null, URLS)).toBe(false);
    expect(fingerprintMatches(undefined, [])).toBe(false);
  });
});
