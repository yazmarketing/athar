import { afterEach, describe, expect, it, vi } from "vitest";
import {
  interpretVerifiedFace,
  pollVerifiedFace,
  VERIFIED_FACE_STILL_CHECKING,
} from "@/lib/verified-face";

function json(body: unknown, status = 200) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { "Content-Type": "application/json" },
  });
}

describe("verified face readiness", () => {
  it("waits until BytePlus marks the photo active", () => {
    expect(
      interpretVerifiedFace({
        status: "completed",
        byteplusId: "asset-face",
        assetStatus: "Processing",
      })
    ).toEqual({ status: "processing" });
    expect(
      interpretVerifiedFace({
        status: "completed",
        byteplusId: "asset-face",
        assetStatus: "Active",
      })
    ).toEqual({ status: "ready", assetId: "asset-face" });
  });

  it("surfaces a rejected photo and ignores a local id", () => {
    expect(
      interpretVerifiedFace({
        status: "failed",
        error: "This photo is too tall for BytePlus. Crop to a single portrait and try again.",
      }).error
    ).toMatch(/too tall/);
    expect(
      interpretVerifiedFace({
        status: "completed",
        byteplusId: "2f4c0c4e-1c2b-4a5d-8e9f-123456789abc",
        assetStatus: "Active",
      })
    ).toEqual({ status: "processing" });
  });
});

describe("verified face polling", () => {
  afterEach(() => {
    vi.useRealTimers();
  });

  it("returns the asset id once the photo is active", async () => {
    vi.useFakeTimers();
    const fetchImpl = vi
      .fn()
      .mockResolvedValueOnce(
        json({ status: "processing", byteplusId: null, assetStatus: null })
      )
      .mockResolvedValueOnce(
        json({
          status: "completed",
          byteplusId: "asset-ready",
          assetStatus: "Active",
        })
      );
    const pending = pollVerifiedFace("reg", {
      fetchImpl: fetchImpl as unknown as typeof fetch,
      pollMs: 1000,
      timeoutMs: 10_000,
    });
    await vi.advanceTimersByTimeAsync(1000);
    await expect(pending).resolves.toEqual({
      status: "ready",
      assetId: "asset-ready",
    });
  });

  it("stops with a library hint when verification outlasts the wait", async () => {
    vi.useFakeTimers();
    const fetchImpl = vi.fn(async () =>
      json({ status: "processing", byteplusId: "asset-wait", assetStatus: "Processing" })
    );
    const pending = pollVerifiedFace("reg", {
      fetchImpl: fetchImpl as unknown as typeof fetch,
      pollMs: 1000,
      timeoutMs: 2500,
    });
    await vi.advanceTimersByTimeAsync(3000);
    await expect(pending).resolves.toEqual({
      status: "failed",
      error: VERIFIED_FACE_STILL_CHECKING,
    });
  });
});
