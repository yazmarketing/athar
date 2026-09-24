import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  requireCreator: vi.fn(),
  getAssetRegistration: vi.fn(),
  getAsset: vi.fn(),
}));

vi.mock("@/lib/authz", () => ({ requireCreator: mocks.requireCreator }));
vi.mock("@/lib/asset-registrations", () => ({
  getAssetRegistration: mocks.getAssetRegistration,
}));
vi.mock("@/lib/byteplus-assets", () => ({ getAsset: mocks.getAsset }));
vi.mock("next/server", () => ({ NextResponse: Response }));

import { GET } from "@/app/api/assets/registrations/[id]/route";

const id = "2f4c0c4e-1c2b-41d8-8e9f-123456789abc";
const context = { params: Promise.resolve({ id }) };

beforeEach(() => {
  vi.resetAllMocks();
  mocks.requireCreator.mockResolvedValue({ user: { id: "user" } });
});

describe("verified face status", () => {
  it("requires a creator", async () => {
    mocks.requireCreator.mockResolvedValue({
      response: new Response(JSON.stringify({ error: "Unauthorized" }), { status: 401 }),
    });
    expect((await GET(new Request("https://app"), context)).status).toBe(401);
    expect(mocks.getAssetRegistration).not.toHaveBeenCalled();
  });

  it("returns the BytePlus status for a registration", async () => {
    mocks.getAssetRegistration.mockResolvedValue({
      id,
      status: "completed",
      byteplus_id: "asset-face",
      error: null,
      name: "Layla",
    });
    mocks.getAsset.mockResolvedValue({ Id: "asset-face", Status: "Active" });
    const response = await GET(new Request("https://app"), context);
    expect(response.status).toBe(200);
    await expect(response.json()).resolves.toMatchObject({
      status: "completed",
      byteplusId: "asset-face",
      assetStatus: "Active",
      name: "Layla",
    });
  });

  it("keeps polling when BytePlus status cannot be read", async () => {
    mocks.getAssetRegistration.mockResolvedValue({
      id,
      status: "completed",
      byteplus_id: "asset-face",
      error: null,
      name: "Layla",
    });
    mocks.getAsset.mockRejectedValue(new Error("timeout"));
    const response = await GET(new Request("https://app"), context);
    expect(response.status).toBe(200);
    await expect(response.json()).resolves.toMatchObject({ assetStatus: null });
  });
});
