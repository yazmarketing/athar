import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { NextRequest } from "next/server";
import sharp from "sharp";

const mocks = vi.hoisted(() => ({ query: vi.fn(), generate: vi.fn(), save: vi.fn(), upload: vi.fn(), version: vi.fn() }));
vi.mock("@/lib/authz", () => ({ requireCreator: async () => ({ user: { id: "creator" } }) }));
vi.mock("@/lib/db", () => ({ db: () => ({ query: mocks.query }) }));
vi.mock("@/lib/byteplus-server", () => ({ arkGenerateImage: mocks.generate }));
vi.mock("@/lib/generations-store", () => ({ ensureGenerationModes: vi.fn(), insertGeneration: mocks.save, persistOutputToSpaces: async () => "https://cdn/saved.png" }));
vi.mock("@/lib/storage", () => ({ uploadPublicObject: mocks.upload }));
vi.mock("@/lib/reference-assets", () => ({ addReferenceVersion: mocks.version }));
import { POST as finish } from "@/app/api/upscale/route";
import { POST as whiteBackdrop } from "@/app/api/background/remove/route";

const generationId = "11111111-1111-4111-8111-111111111111";
function request(body: Record<string, unknown>) {
  return new NextRequest("http://localhost/api/upscale", { method: "POST", body: JSON.stringify(body) });
}
beforeEach(() => {
  vi.clearAllMocks();
  mocks.query.mockResolvedValue({ rows: [{ id: generationId, output_url: "https://cdn/source.png", mode: "t2i", tier: "standard", final_prompt: "A product", negative_prompt: "", seed: 123, aspect: "16:9", input_payload: {} }] });
  mocks.generate.mockResolvedValue({ urls: ["https://cdn/redraw.png"] });
  mocks.save.mockImplementation(async input => ({ id: "result", ...input }));
  mocks.upload.mockResolvedValue("https://cdn/resized.png");
});
afterEach(() => vi.unstubAllGlobals());
describe("finishing operation promises", () => {
  it("defaults to real resizing with no paid provider call and saves dimensions and lineage", async () => {
    const source = await sharp({ create: { width: 16, height: 9, channels: 4, background: { r: 30, g: 60, b: 90, alpha: 0 } } }).png().toBuffer();
    vi.stubGlobal("fetch", vi.fn().mockResolvedValue(new Response(new Uint8Array(source))));
    const response = await finish(request({ generationId, scale: 2 }));
    expect(response.status).toBe(200);
    expect(mocks.generate).not.toHaveBeenCalled();
    expect(mocks.save).toHaveBeenCalledWith(expect.objectContaining({
      cost: 0, modelEndpoint: "local:lanczos3", seed: null,
      inputPayload: expect.objectContaining({ source_generation_id: generationId, upscale: { mode: "resize", scale: 2, width: 32, height: 18 } }),
    }));
    const output = Buffer.from(mocks.upload.mock.calls[0][1]);
    expect(await sharp(output).metadata()).toMatchObject({ width: 32, height: 18, hasAlpha: true });
  });
  it("keeps conservative redraw explicitly generative and records its resolution, not a false scale factor", async () => {
    expect((await finish(request({ generationId, mode: "precision", scale: 4 }))).status).toBe(200);
    expect(mocks.generate).toHaveBeenCalledWith(expect.objectContaining({ size: "4K", image: "https://cdn/source.png" }));
    expect(mocks.save.mock.calls[0][0].inputPayload.upscale).toEqual({ mode: "precision", targetResolution: "4K" });
    expect(mocks.save.mock.calls[0][0].cost).toBeGreaterThan(0);
  });
  it("records the white-backdrop operation as opaque and generative", async () => {
    expect((await whiteBackdrop(request({ generationId }))).status).toBe(200);
    expect(mocks.generate.mock.calls[0][0].prompt).toContain("plain solid white background");
    expect(mocks.generate.mock.calls[0][0].prompt).toContain("including all existing product labels and logos");
    expect(mocks.save.mock.calls[0][0].inputPayload).toMatchObject({ tool: "white_backdrop", generative: true, transparent: false });
  });
});
