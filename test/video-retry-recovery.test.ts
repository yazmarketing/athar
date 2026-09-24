import { beforeEach, describe, expect, it, vi } from "vitest";
import type { GenerationJobRecord } from "@/lib/types";

const mocks = vi.hoisted(() => ({
  auth: vi.fn(), job: vi.fn(), spend: vi.fn(), submit: vi.fn(), after: vi.fn(), provider: vi.fn(), resume: vi.fn(), requeue: vi.fn(), audit: vi.fn(),
}));
vi.mock("next/server", () => ({ NextResponse: { json: (value: unknown, init?: ResponseInit) => Response.json(value, init) }, after: mocks.after }));
vi.mock("@/lib/authz", () => ({ requireCreator: mocks.auth }));
vi.mock("@/lib/jobs", () => ({ getJob: mocks.job, resumeProviderJob: mocks.resume, markJobRequeued: mocks.requeue }));
vi.mock("@/lib/render-guardrails", () => ({ checkSpendControls: mocks.spend }));
vi.mock("@/lib/video-jobs", () => ({ submitVideoJob: mocks.submit }));
vi.mock("@/lib/image-jobs", () => ({ submitImageJob: vi.fn() }));
vi.mock("@/lib/byteplus-server", () => ({ arkGetVideoTask: mocks.provider }));
vi.mock("@/lib/audit", () => ({ logAudit: mocks.audit }));

import { POST as retry } from "@/app/api/jobs/[id]/retry/route";

const id = "12345678-1234-4123-8123-123456789abc";
const context = { params: Promise.resolve({ id }) };
const request = new Request("http://localhost/api", { method: "POST" }) as Parameters<typeof retry>[0];
const source = {
  id, kind: "i2v", status: "failed", provider: "byteplus", provider_task_id: "paid-task",
  model_endpoint: "byteplus:dreamina-seedance-2-5-260628", tier: "standard",
  input: { videoResolution: "720p", generateAudio: false, sourceImageUrls: ["https://example.com/reference.png"] },
  final_prompt: "The approved shot", negative_prompt: "No text", aspect: "9:16", duration_s: 12,
  user_id: "creator", project_id: "project", brand_kit_id: "brand", estimated_cost: 3,
} as unknown as GenerationJobRecord;

beforeEach(() => {
  vi.resetAllMocks();
  mocks.auth.mockResolvedValue({ user: { id: "creator", role: "creator" } });
  mocks.job.mockResolvedValue(source);
  mocks.spend.mockResolvedValue({ allowed: true });
});

describe("retry recovery", () => {
  const portraitError = "The request failed because the input video 'content[1]' may contain real person. Request id: 021790229346921c41b39946b92a3163d51611244fc4a0ddd7ddb";
  it.each([null, "paid-task"])("rejects unchanged portrait input with provider task %s", async (providerTaskId) => {
    mocks.job.mockResolvedValue({ ...source, error: portraitError, provider_task_id: providerTaskId });
    const response = await retry(request, context);
    expect(response.status).toBe(409);
    expect(await response.json()).toMatchObject({ code: "VIDEO_REFERENCE_REQUIRES_CHANGE" });
    expect(mocks.provider).not.toHaveBeenCalled();
    expect(mocks.spend).not.toHaveBeenCalled();
    expect(mocks.requeue).not.toHaveBeenCalled();
    expect(mocks.after).not.toHaveBeenCalled();
  });
  it("recognizes a portrait rejection discovered during provider recovery", async () => {
    mocks.provider.mockResolvedValue({ status: "failed", error: { message: portraitError } });
    expect((await retry(request, context)).status).toBe(409);
    expect(mocks.requeue).not.toHaveBeenCalled();
    expect(mocks.after).not.toHaveBeenCalled();
  });
  it.each(["succeeded", "running", "queued"])("recovers a %s provider task without resubmission", async (status) => {
    mocks.provider.mockResolvedValue({ status });
    mocks.resume.mockResolvedValue({ ...source, status: "running" });
    expect((await retry(request, context)).status).toBe(200);
    expect(mocks.resume).toHaveBeenCalledWith(id, "paid-task");
    expect(mocks.requeue).not.toHaveBeenCalled();
    expect(mocks.after).not.toHaveBeenCalled();
  });
  it("does not submit when a concurrent retry already claimed the job", async () => {
    mocks.provider.mockResolvedValue({ status: "failed" });
    mocks.requeue.mockResolvedValue(null);
    expect((await retry(request, context)).status).toBe(200);
    expect(mocks.after).not.toHaveBeenCalled();
    expect(mocks.audit).not.toHaveBeenCalled();
  });
  it("does not resubmit when the provider cannot be reached", async () => {
    mocks.provider.mockRejectedValue(new Error("Temporarily unavailable"));
    expect((await retry(request, context)).status).toBe(500);
    expect(mocks.requeue).not.toHaveBeenCalled();
  });
});
