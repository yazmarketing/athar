import { beforeEach, describe, expect, it, vi } from "vitest";
import { NextRequest } from "next/server";

const mocks = vi.hoisted(() => ({ create: vi.fn(), project: vi.fn(), kit: vi.fn(), after: vi.fn(), spend: vi.fn() }));
vi.mock("next/server", async importOriginal => ({ ...await importOriginal<typeof import("next/server")>(), after: mocks.after }));
vi.mock("@/lib/authz", () => ({ requireCreator: async () => ({ user: { id: "creator", role: "creator" } }) }));
vi.mock("@/lib/jobs", () => ({ createJob: mocks.create }));
vi.mock("@/lib/projects", () => ({ getProject: mocks.project }));
vi.mock("@/lib/brand-kits", () => ({ getBrandKit: mocks.kit }));
vi.mock("@/lib/image-jobs", () => ({ imageJobModelEndpoint: (id: string) => id, submitImageJob: vi.fn() }));
vi.mock("@/lib/video-jobs", () => ({ submitVideoJob: vi.fn() }));
vi.mock("@/lib/render-guardrails", () => ({ checkSpendControls: mocks.spend, similarVideoRenderCount: async () => 0 }));
import { POST } from "@/app/api/generate/route";

const projectId = "11111111-1111-4111-8111-111111111111";
const clientId = "22222222-2222-4222-8222-222222222222";
const refs = (n: number) => Array.from({ length: n }, (_, i) => `https://cdn/${i}.png`);
function request(extra: Record<string, unknown> = {}) {
  return new NextRequest("http://localhost/api/generate", { method: "POST", body: JSON.stringify({ mode: "t2i", tier: "draft", prompt: { subject: "A perfume bottle" }, aspect: "16:9", resolution: "2K", ...extra }) });
}
beforeEach(() => {
  vi.clearAllMocks();
  mocks.project.mockResolvedValue({ id: projectId, client_id: clientId });
  mocks.spend.mockResolvedValue({ allowed: true, alerts: [] });
  mocks.create.mockImplementation(async input => ({ id: "job", ...input }));
});
describe("creative generation contract", () => {
  it("keeps draft Seedream when references are attached", async () => {
    expect((await POST(request({ referenceUrls: refs(2) }))).status).toBe(202);
    expect(mocks.create).toHaveBeenCalledWith(expect.objectContaining({ tier: "draft", modelEndpoint: "byteplus:seedream-4-0-250828", input: expect.objectContaining({ referenceUrls: refs(2) }) }));
  });
  it.each([[undefined, 9], ["nano-banana-pro", 15], ["gpt-image-2", 17]])("rejects excess references for %s instead of dropping them", async (imageModel, n) => {
    expect((await POST(request({ imageModel, referenceUrls: refs(n) }))).status).toBe(400);
    expect(mocks.create).not.toHaveBeenCalled();
    expect(mocks.spend).not.toHaveBeenCalled();
  });
  it("rejects an unknown model instead of substituting Seedream", async () => {
    expect((await POST(request({ imageModel: "typo-model" }))).status).toBe(400);
    expect(mocks.create).not.toHaveBeenCalled();
  });
  it("rejects unsupported resolution instead of silently downgrading", async () => {
    expect((await POST(request({ resolution: "4K" }))).status).toBe(400);
    expect(mocks.create).not.toHaveBeenCalled();
  });
  it("carries a brand kit's exclusions into the saved job", async () => {
    mocks.kit.mockResolvedValue({ brand_tokens: "navy palette", negative_additions: "red packaging" });
    expect((await POST(request({ brandKitId: projectId }))).status).toBe(202);
    expect(mocks.create.mock.calls[0][0].negativePrompt).toContain("red packaging");
  });
  it("accepts the storyboard animation request and resolves its client from the project", async () => {
    expect((await POST(request({ mode: "t2v", tier: "standard", projectId, sourceImageUrls: refs(1) }))).status).toBe(202);
    expect(mocks.create).toHaveBeenCalledWith(expect.objectContaining({ kind: "i2v", projectId, input: expect.objectContaining({ clientId }) }));
  });
  it("still rejects an explicitly mismatched client", async () => {
    expect((await POST(request({ mode: "t2v", tier: "standard", projectId, clientId: projectId }))).status).toBe(400);
    expect(mocks.create).not.toHaveBeenCalled();
  });
  it("still requires a client-linked project", async () => {
    mocks.project.mockResolvedValue({ id: projectId, client_id: null });
    expect((await POST(request({ mode: "t2v", tier: "standard", projectId }))).status).toBe(400);
    expect(mocks.create).not.toHaveBeenCalled();
  });
  it("preserves all 30 video image references for Seedance 2.5", async () => {
    expect((await POST(request({ mode: "t2v", tier: "standard", projectId, sourceImageUrls: refs(30) }))).status).toBe(202);
    expect(mocks.create.mock.calls[0][0].input.sourceImageUrls).toEqual(refs(30));
  });
  it("rejects a Mini video edit instead of silently upgrading the model", async () => {
    expect((await POST(request({ mode: "t2v", tier: "draft", projectId, sourceVideoUrl: "https://cdn/source.mp4" }))).status).toBe(400);
    expect(mocks.create).not.toHaveBeenCalled();
  });
});
