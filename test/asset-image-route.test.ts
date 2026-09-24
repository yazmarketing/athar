import { beforeEach, describe, expect, it, vi } from "vitest";
const mocks = vi.hoisted(() => ({ auth: vi.fn(), load: vi.fn(), persist: vi.fn(), after: vi.fn() }));
vi.mock("@/lib/auth-session", () => ({ getSessionUser: mocks.auth }));
vi.mock("@/lib/asset-preview", () => ({ loadAssetPreview: mocks.load, persistAssetPreview: mocks.persist }));
vi.mock("next/server", () => ({ NextResponse: Response, after: mocks.after }));
import { GET } from "@/app/api/assets/[id]/image/route";
const request = new Request("https://app/api/assets/asset-one/image");
const context = { params: Promise.resolve({ id: "asset-one" }) };
beforeEach(() => { vi.resetAllMocks(); mocks.auth.mockResolvedValue({ id: "user" }); });

describe("asset image route", () => {
  it("authenticates even when the image is cached", async () => {
    mocks.auth.mockResolvedValue(null);
    expect((await GET(request, context)).status).toBe(401);
    expect(mocks.load).not.toHaveBeenCalled();
  });
  it("rejects invalid asset IDs before loading", async () => {
    expect((await GET(request, { params: Promise.resolve({ id: "../other" }) })).status).toBe(400);
    expect(mocks.load).not.toHaveBeenCalled();
  });
  it("returns the image before scheduling its persistent cache write", async () => {
    const bytes = new Uint8Array([1, 2]).buffer;
    mocks.load.mockResolvedValue({ bytes, contentType: "image/png", needsPersist: true });
    const response = await GET(request, context);
    expect(response.headers.get("content-type")).toBe("image/png");
    expect(await response.arrayBuffer()).toEqual(bytes);
    expect(mocks.after).toHaveBeenCalledOnce();
    expect(mocks.persist).not.toHaveBeenCalled();
  });
  it("returns an uncached placeholder on provider timeout instead of a broken image", async () => {
    mocks.load.mockRejectedValue(new Error("timeout"));
    const response = await GET(request, context);
    expect(response.status).toBe(200);
    expect(response.headers.get("cache-control")).toContain("no-store");
    expect(response.headers.get("content-type")).toBe("image/svg+xml");
    expect(mocks.after).not.toHaveBeenCalled();
  });
});
