import { beforeEach, describe, expect, it, vi } from "vitest";
const mocks = vi.hoisted(() => ({ resolve: vi.fn(), upload: vi.fn(), read: vi.fn(), fetch: vi.fn() }));
vi.mock("@/lib/byteplus-assets", () => ({ resolveAssetImageUrl: mocks.resolve, isBytePlusMediaUrl: (url: string) => url.startsWith("https://media.byteplusapi.com/") }));
vi.mock("@/lib/storage", () => ({ readPrivateObject: mocks.read, uploadPrivateObject: mocks.upload }));
import { loadAssetPreview, persistAssetPreview } from "@/lib/asset-preview";
const photo = () => new Response(new Uint8Array([1, 2, 3]), { headers: { "content-type": "image/jpeg" } });
beforeEach(() => { vi.resetAllMocks(); mocks.read.mockResolvedValue(null); vi.stubGlobal("fetch", mocks.fetch); });

describe("asset previews", () => {
  it("serves the durable cache without calling BytePlus", async () => {
    mocks.read.mockResolvedValue(photo());
    const preview = await loadAssetPreview("asset-one");
    expect(preview.needsPersist).toBe(false);
    expect(mocks.resolve).not.toHaveBeenCalled();
    await persistAssetPreview("asset-one", preview);
    expect(mocks.upload).not.toHaveBeenCalled();
  });
  it("refreshes an expired provider URL once and caches the successful image", async () => {
    mocks.fetch.mockResolvedValueOnce(new Response(null, { status: 403 })).mockResolvedValueOnce(photo());
    mocks.resolve.mockResolvedValueOnce("https://media.byteplusapi.com/old").mockResolvedValueOnce("https://media.byteplusapi.com/new");
    const preview = await loadAssetPreview("asset-two");
    expect(mocks.resolve.mock.calls.map((call) => call[1].refresh)).toEqual([false, true]);
    expect(preview.needsPersist).toBe(true);
    await persistAssetPreview("asset-two", preview);
    expect(mocks.upload).toHaveBeenCalledWith("asset-previews/asset-two", preview.bytes, "image/jpeg");
  });
  it("shares concurrent requests for the same thumbnail", async () => {
    mocks.read.mockResolvedValue(photo());
    const [a, b] = await Promise.all([loadAssetPreview("asset-three"), loadAssetPreview("asset-three")]);
    expect(a).toBe(b);
    expect(mocks.read).toHaveBeenCalledTimes(1);
  });
  it("does not fetch an untrusted provider URL", async () => {
    mocks.resolve.mockResolvedValue("http://127.0.0.1/private");
    await expect(loadAssetPreview("asset-four")).rejects.toThrow("unavailable");
    expect(mocks.read).toHaveBeenCalledTimes(1);
  });
  it("does not cache a provider HTML error returned with status 200", async () => {
    mocks.fetch.mockResolvedValueOnce(new Response("error", { headers: { "content-type": "text/html" } }));
    mocks.resolve.mockResolvedValue("https://media.byteplusapi.com/photo");
    await expect(loadAssetPreview("asset-five")).rejects.toThrow("not an image");
    expect(mocks.upload).not.toHaveBeenCalled();
  });
  it("releases failed requests so the next visit can recover", async () => {
    mocks.read.mockRejectedValueOnce(new Error("storage timeout"));
    mocks.resolve.mockRejectedValueOnce(new Error("provider timeout"));
    await expect(loadAssetPreview("asset-six")).rejects.toThrow("provider timeout");
    mocks.read.mockResolvedValueOnce(photo());
    expect((await loadAssetPreview("asset-six")).contentType).toBe("image/jpeg");
  });
});
