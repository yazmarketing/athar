import { expect, it, vi } from "vitest";
vi.mock("../src/lib/director/http", async (original) => ({
  ...await original<typeof import("../src/lib/director/http")>(),
  directorUser: async () => ({ id: "owner", role: "creator" }),
}));
vi.mock("../src/lib/director/store", async (original) => ({
  ...await original<typeof import("../src/lib/director/store")>(),
  getProject: vi.fn(async () => ({ id: "project" })),
}));
vi.mock("../src/lib/director/media", () => ({ addAsset: vi.fn(async (_id, _owner, file: File) => ({ asset: { size: file.size } })) }));
import { POST } from "../src/app/api/director/projects/[id]/assets/route";
import config from "../next.config";
const context = { params: Promise.resolve({ id: "project" }) };
it("allows a multipart video above the old 10 MB proxy limit", async () => {
  const size = 11 * 1024 * 1024;
  const form = new FormData(); form.set("file", new File([new Uint8Array(size)], "DJI.MP4", { type: "video/mp4" }));
  const req = new Request("http://localhost/upload", { method: "POST", body: form });
  const response = await POST(req, context);
  expect(response.status).toBe(201);
  expect(await response.json()).toEqual({ asset: { size } });
  expect(Number(config.experimental?.proxyClientMaxBodySize)).toBeGreaterThan(100 * 1024 * 1024);
});
it("returns an actionable 400 for a truncated multipart upload", async () => {
  const response = await POST(new Request("http://localhost/upload", { method: "POST", headers: { "content-type": "multipart/form-data; boundary=missing" }, body: "truncated" }), context);
  expect(response.status).toBe(400);
  expect((await response.json()).error).toContain("Please retry");
});
it("rejects oversized requests before parsing", async () => {
  const response = await POST(new Request("http://localhost/upload", { method: "POST", headers: { "content-length": String(102 * 1024 * 1024) }, body: "oversized" }), context);
  expect(response.status).toBe(413);
});
