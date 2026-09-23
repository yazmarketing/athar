import { beforeEach, describe, expect, it, vi } from "vitest";
import { NextRequest } from "next/server";

const mocks = vi.hoisted(() => ({ session: vi.fn(), openai: vi.fn(), ark: vi.fn(), configured: vi.fn() }));
vi.mock("@/lib/auth-session", () => ({ getSessionUser: mocks.session }));
vi.mock("@/lib/openai-server", () => ({ openaiChat: mocks.openai, openaiConfigured: mocks.configured, openaiModel: () => "workspace-model" }));
vi.mock("@/lib/byteplus-server", () => ({ arkChat: mocks.ark }));
import { POST } from "@/app/api/prompt/improve/route";

function request(extra: Record<string, unknown> = {}) {
  return new NextRequest("http://localhost/api/prompt/improve", { method: "POST", body: JSON.stringify({ engine: "astra", mode: "t2v", durationS: 5, prompt: { subject: "An Emirati cyclist in sportswear", cameraId: "orbit", styleId: "raw" }, ...extra }) });
}
beforeEach(() => {
  vi.clearAllMocks();
  mocks.session.mockResolvedValue({ id: "creator", role: "creator" });
  mocks.configured.mockReturnValue(true);
  mocks.openai.mockResolvedValue('{"subject":"A cyclist rides past the camera","action":"Track alongside"}');
});

describe("explicit Astra creative assistance", () => {
  it("uses the requested Astra model, with duration and cultural context", async () => {
    const result = await POST(request());
    expect(result.status).toBe(200);
    expect(await result.json()).toMatchObject({ model: "gpt-6-astra", prompt: { subject: "A cyclist rides past the camera" } });
    const call = mocks.openai.mock.calls[0][0];
    expect(call.model).toBe("gpt-6-astra");
    expect(call.messages[0].content).toContain("Do not blend distinct Gulf or Arab cultures");
    expect(call.messages[1].content).toContain("Output duration: 5 seconds");
    expect(call.messages[1].content).toContain('"cameraId": "orbit"');
    expect(mocks.ark).not.toHaveBeenCalled();
  });
  it("does not substitute another provider when Astra is disconnected", async () => {
    mocks.configured.mockReturnValue(false);
    expect((await POST(request())).status).toBe(503);
    expect(mocks.openai).not.toHaveBeenCalled();
    expect(mocks.ark).not.toHaveBeenCalled();
  });
  it("surfaces model access failure without a second paid attempt", async () => {
    mocks.openai.mockRejectedValue(new Error("OpenAI 404 model_not_found"));
    expect((await POST(request())).status).toBe(503);
    expect(mocks.openai).toHaveBeenCalledTimes(1);
    expect(mocks.ark).not.toHaveBeenCalled();
  });
  it.each([[null, 401], [{ id: "viewer", role: "viewer" }, 403]])("rejects an unauthorized caller", async (user, status) => {
    mocks.session.mockResolvedValue(user);
    expect((await POST(request())).status).toBe(status);
    expect(mocks.openai).not.toHaveBeenCalled();
  });
  it("rejects non-text prompts before calling a provider", async () => {
    expect((await POST(request({ prompt: { subject: 42 } }))).status).toBe(400);
    expect(mocks.openai).not.toHaveBeenCalled();
  });
});
