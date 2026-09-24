import { beforeEach, describe, expect, it, vi } from "vitest";
const mocks = vi.hoisted(() => ({ query: vi.fn(), upload: vi.fn(), convert: vi.fn(), fetch: vi.fn() }));
vi.mock("@/lib/db", () => ({ db: () => ({ query: mocks.query }) }));
vi.mock("@/lib/storage", () => ({ uploadPublicObject: mocks.upload }));
vi.mock("@/lib/video-compat", () => ({ ensureBrowserMp4: mocks.convert }));
import { persistVideoOutput, resolveOriginalVideoReferences } from "@/lib/video-originals";
const base = { model: "seedance", prompt: "Edit", duration: 5, ratio: "16:9" as const };
beforeEach(() => { vi.resetAllMocks(); vi.stubGlobal("fetch", mocks.fetch); });

describe("original video storage", () => {
  it("archives untouched bytes before converting and stores a separate preview", async () => {
    mocks.fetch.mockResolvedValue(new Response(new Uint8Array([1, 2, 3]), { headers: { "content-type": "video/quicktime" } }));
    mocks.upload.mockImplementation(async (path: string) => `https://cdn/${path}`);
    mocks.convert.mockImplementation(async () => {
      expect(mocks.upload).toHaveBeenCalledTimes(1);
      return new Uint8Array([4, 5]).buffer;
    });
    const result = await persistVideoOutput("https://provider/video.mov", "job");
    expect(new Uint8Array(mocks.upload.mock.calls[0][1])).toEqual(new Uint8Array([1, 2, 3]));
    expect(result).toEqual({ originalUrl: "https://cdn/video-originals/job.mov", outputUrl: "https://cdn/video-previews/job.mp4" });
  });
  it("does not archive an expired download error as a video", async () => {
    mocks.fetch.mockResolvedValue(new Response("expired", { status: 403 }));
    await expect(persistVideoOutput("https://provider/expired", "job")).rejects.toThrow("403");
    expect(mocks.upload).not.toHaveBeenCalled();
  });
  it("keeps the original accessible if preview storage fails", async () => {
    mocks.fetch.mockResolvedValue(new Response(new Uint8Array([1])));
    mocks.upload.mockResolvedValueOnce("https://cdn/original").mockRejectedValueOnce(new Error("storage"));
    mocks.convert.mockResolvedValue(new Uint8Array([2]).buffer);
    expect(await persistVideoOutput("https://provider/video", "job")).toEqual({ originalUrl: "https://cdn/original", outputUrl: "https://cdn/original" });
  });
});

describe("original video reference routing", () => {
  it("replaces edit and reference playback URLs without changing uploads or order", async () => {
    mocks.query.mockResolvedValue({ rows: [{ id: "a", output_url: "preview", input_payload: { original_video_url: "original" } }] });
    const result = await resolveOriginalVideoReferences({ ...base, videoUrls: ["preview"], referenceVideoUrls: ["upload", "preview"] });
    expect(result.videoUrls).toEqual(["original"]);
    expect(result.referenceVideoUrls).toEqual(["upload", "original"]);
    expect(mocks.fetch).not.toHaveBeenCalled();
  });
  it("repairs a legacy render from its provider download and saves the original URL", async () => {
    mocks.query.mockResolvedValueOnce({ rows: [{ id: "a", output_url: "preview", fal_url: "https://provider/video", input_payload: {} }] }).mockResolvedValue({ rows: [] });
    mocks.fetch.mockResolvedValue(new Response(new Uint8Array([1, 2])));
    mocks.upload.mockResolvedValue("https://cdn/original");
    expect((await resolveOriginalVideoReferences({ ...base, videoUrls: ["preview"] })).videoUrls).toEqual(["https://cdn/original"]);
    expect(mocks.query.mock.calls[1][1]).toEqual(["a", "https://cdn/original"]);
    expect(mocks.convert).not.toHaveBeenCalled();
  });
  it("explains an unrecoverable legacy original instead of submitting a converted clip", async () => {
    mocks.query.mockResolvedValue({ rows: [{ id: "a", output_url: "preview", fal_url: "expired", input_payload: {} }] });
    mocks.fetch.mockResolvedValue(new Response("expired", { status: 403 }));
    await expect(resolveOriginalVideoReferences({ ...base, videoUrls: ["preview"] })).rejects.toThrow("older video");
    expect(mocks.upload).not.toHaveBeenCalled();
  });
  it("does not query the library for text-only generation", async () => {
    expect(await resolveOriginalVideoReferences(base)).toBe(base);
    expect(mocks.query).not.toHaveBeenCalled();
  });
});
