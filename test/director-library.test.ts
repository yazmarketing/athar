import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
const mocks = vi.hoisted(() => ({ generation: vi.fn(), voice: vi.fn(), add: vi.fn(), project: vi.fn(), update: vi.fn() }));
vi.mock("../src/lib/generations-store", () => ({ getGeneration: mocks.generation }));
vi.mock("../src/lib/tts", () => ({ getTtsGeneration: mocks.voice }));
vi.mock("../src/lib/director/media", () => ({ addAsset: mocks.add }));
vi.mock("../src/lib/director/store", async (original) => ({ ...await original<typeof import("../src/lib/director/store")>(), getProject: mocks.project, withRecord: mocks.update }));
import { importLibraryAsset, libraryMediaUrl } from "../src/lib/director/library-import";

const sourceId = "da602ed4-d96b-4bc1-b3ec-dd781fcefa35";
const fetchMock = vi.fn();
beforeEach(() => {
  vi.resetAllMocks(); vi.stubGlobal("fetch", fetchMock);
  vi.stubEnv("DO_SPACES_CDN_URL", "https://athar.example.com");
  vi.stubEnv("DO_SPACES_BUCKET", "athar"); vi.stubEnv("DO_SPACES_REGION", "fra1");
  mocks.project.mockResolvedValue({ id: "project" });
});
afterEach(() => { vi.unstubAllGlobals(); vi.unstubAllEnvs(); });

describe("Director imports existing Athar creations", () => {
  it("rejects arbitrary URLs, deceptive hosts and credentials", () => {
    expect(libraryMediaUrl("https://athar.example.com/voice.mp3").hostname).toBe("athar.example.com");
    for (const url of ["http://athar.example.com/a", "https://athar.example.com.attacker.net/a", "https://user:pass@athar.example.com/a", "https://127.0.0.1/a"]) {
      expect(() => libraryMediaUrl(url)).toThrow("temporary provider storage");
    }
  });
  it("checks private production ownership before looking up shared library data", async () => {
    mocks.project.mockRejectedValue(new Error("Not found"));
    await expect(importLibraryAsset("private", "other", "voice", sourceId)).rejects.toThrow("Not found");
    expect(mocks.voice).not.toHaveBeenCalled(); expect(fetchMock).not.toHaveBeenCalled();
  });
  it("rejects unfinished creations without downloading them", async () => {
    mocks.generation.mockResolvedValue({ status: "running", output_url: "https://athar.example.com/a.png" });
    await expect(importLibraryAsset("project", "owner", "generation", sourceId)).rejects.toThrow("has not finished");
    expect(fetchMock).not.toHaveBeenCalled();
  });
  it("bounds streamed data even when no content length was supplied", async () => {
    mocks.generation.mockResolvedValue({ status: "ready", output_url: "https://athar.example.com/a.mp4", final_prompt: "A film", mode: "t2v" });
    const large = new Uint8Array(51 * 1024 * 1024);
    fetchMock.mockResolvedValue(new Response(new ReadableStream({ start(controller) { controller.enqueue(large); controller.enqueue(large); controller.close(); } })));
    await expect(importLibraryAsset("project", "owner", "generation", sourceId)).rejects.toMatchObject({ status: 413 });
    expect(mocks.add).not.toHaveBeenCalled();
  });
  it("imports a voice and keeps its script as source evidence without following redirects", async () => {
    mocks.voice.mockResolvedValue({ status: "ready", output_url: "https://athar.example.com/voice.mp3", title: "Arabic launch", text: "أثر يبقى", archived_at: null });
    fetchMock.mockResolvedValue(new Response(new Uint8Array([1, 2, 3]), { headers: { "content-type": "audio/mpeg" } }));
    mocks.add.mockResolvedValue({ asset: { id: "imported" } });
    const project = { assets: [{ id: "imported", transcript: "" }] };
    mocks.update.mockImplementation(async (_id, update) => update({ project }));
    const result = await importLibraryAsset("project", "owner", "voice", sourceId);
    expect(result.asset.transcript).toBe("أثر يبقى");
    expect(fetchMock.mock.calls[0][1].redirect).toBe("error");
    expect(mocks.add.mock.calls[0][2]).toMatchObject({ type: "audio/mpeg", name: "Arabic launch.mp3" });
  });
});
