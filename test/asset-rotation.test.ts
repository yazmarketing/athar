import { describe, expect, it } from "vitest";
import {
  ASSET_LIBRARY_LIMIT,
  oldestVerifiedAsset,
  type AssetRecord,
} from "@/lib/byteplus-assets";

describe("verified asset rotation", () => {
  it("keeps the provider plan limit explicit", () => {
    expect(ASSET_LIBRARY_LIMIT).toBe(50);
  });

  it("selects the oldest verified asset and never a processing upload", () => {
    const assets: AssetRecord[] = [
      { Id: "asset-new", Status: "Active", CreateTime: "2026-09-23T12:00:00Z" },
      { Id: "asset-processing", Status: "Processing", CreateTime: "2026-01-01T00:00:00Z" },
      { Id: "asset-old", Status: "Active", CreateTime: "2026-02-01T00:00:00Z" },
    ];
    expect(oldestVerifiedAsset(assets)?.Id).toBe("asset-old");
  });

  it("uses the last verified list item when legacy records have no date", () => {
    expect(oldestVerifiedAsset([
      { Id: "asset-new", Status: "Active" },
      { Id: "asset-old", Status: "Active" },
    ])?.Id).toBe("asset-old");
  });

  it("refuses to rotate an unverified asset", () => {
    expect(oldestVerifiedAsset([
      { Id: "asset-processing", Status: "Processing" },
      { Id: "asset-failed", Status: "Failed" },
    ])).toBeNull();
  });
});
