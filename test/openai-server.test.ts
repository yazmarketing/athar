import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { openaiChat, openaiModel, openaiScoreImages, openaiBrandCheck, OpenAIError } from "@/lib/openai-server";
import { analyzeReferenceStyle } from "@/lib/reference-style";

const fetchMock = vi.fn();
function reply(text: string) {
  return Response.json({ status: "completed", output: [
    { type: "reasoning", summary: [] },
    { type: "message", content: [{ type: "output_text", text }] },
  ] });
}
function payload() { return JSON.parse(fetchMock.mock.calls[0][1].body); }

beforeEach(() => {
  vi.stubEnv("OPENAI_API_KEY", "test-only");
  vi.stubEnv("OPENAI_CHAT_MODEL", "");
  vi.stubEnv("OPENAI_BASE_URL", "https://example.test/v1");
  vi.stubGlobal("fetch", fetchMock);
  fetchMock.mockReset();
});
afterEach(() => { vi.unstubAllGlobals(); vi.unstubAllEnvs(); });

describe("OpenAI Responses client", () => {
  it("defaults to Astra with Responses fields and reasoning headroom", async () => {
    fetchMock.mockResolvedValue(reply("A shot plan"));
    expect(openaiModel()).toBe("gpt-6-astra");
    expect(await openaiChat({ messages: [{ role: "user", content: "Plan" }], maxTokens: 400, temperature: 0.7 })).toBe("A shot plan");
    expect(fetchMock.mock.calls[0][0]).toBe("https://example.test/v1/responses");
    expect(payload()).toMatchObject({ model: "gpt-6-astra", max_output_tokens: 6400, reasoning: { effort: "medium" }, store: false });
    expect(payload()).not.toHaveProperty("temperature");
    expect(payload()).not.toHaveProperty("messages");
  });

  it("honors exact output budget and explicit model override", async () => {
    vi.stubEnv("OPENAI_CHAT_MODEL", "gpt-6-astra-2026-09-01");
    fetchMock.mockResolvedValue(reply("ok"));
    await openaiChat({ messages: [], maxOutputTokens: 9000, reasoningEffort: "high" });
    expect(payload()).toMatchObject({ model: "gpt-6-astra-2026-09-01", max_output_tokens: 9000, reasoning: { effort: "high" } });
  });

  it("retains compatible requests for explicitly configured legacy models", async () => {
    vi.stubEnv("OPENAI_CHAT_MODEL", "gpt-4.1");
    fetchMock.mockResolvedValue(Response.json({ choices: [{ finish_reason: "stop", message: { content: "legacy" } }] }));
    expect(await openaiChat({ messages: [], maxTokens: 500 })).toBe("legacy");
    expect(fetchMock.mock.calls[0][0]).toContain("chat/completions");
    expect(payload().model).toBe("gpt-4.1");
  });

  it("an explicit Astra choice overrides the workspace default", async () => {
    vi.stubEnv("OPENAI_CHAT_MODEL", "gpt-4.1");
    fetchMock.mockResolvedValue(reply("ok"));
    await openaiChat({ model: "gpt-6-astra", messages: [] });
    expect(payload().model).toBe("gpt-6-astra");
    expect(fetchMock.mock.calls[0][0]).toContain("/responses");
  });

  it("keeps provider errors structured without substituting a model", async () => {
    fetchMock.mockResolvedValue(Response.json({ error: { message: "No access", code: "model_not_found", type: "invalid_request_error", param: "model" } }, { status: 404, headers: { "x-request-id": "req-test" } }));
    await expect(openaiChat({ messages: [] })).rejects.toMatchObject({ name: "OpenAIError", status: 404, code: "model_not_found", requestId: "req-test" });
    expect(fetchMock).toHaveBeenCalledTimes(1);
  });

  it("rejects truncated visible text instead of returning an invalid plan", async () => {
    fetchMock.mockResolvedValue(Response.json({ status: "incomplete", incomplete_details: { reason: "max_output_tokens" }, output: [{ type: "message", content: [{ type: "output_text", text: '{"shots":[' }] }] }));
    await expect(openaiChat({ messages: [] })).rejects.toMatchObject({ code: "incomplete_response" });
  });

  it("handles refusals and non-JSON gateway errors", async () => {
    fetchMock.mockResolvedValueOnce(Response.json({ status: "completed", output: [{ type: "message", content: [{ type: "refusal", refusal: "Cannot comply" }] }] }));
    await expect(openaiChat({ messages: [] })).rejects.toMatchObject({ code: "refusal" });
    fetchMock.mockResolvedValueOnce(new Response("Gateway unavailable", { status: 502 }));
    await expect(openaiChat({ messages: [] })).rejects.toBeInstanceOf(OpenAIError);
  });
});

describe("Astra vision callers", () => {
  it("sends image candidates through Responses with JSON output", async () => {
    fetchMock.mockResolvedValue(reply('{"scores":[{"index":0,"score":91,"reason":"Clear and faithful"}]}'));
    expect(await openaiScoreImages({ prompt: "A product", imageUrls: ["https://example.test/product.png"] })).toHaveLength(1);
    expect(payload().input[1].content).toContainEqual({ type: "input_image", image_url: "https://example.test/product.png", detail: "auto" });
    expect(payload().text.format.type).toBe("json_object");
  });

  it("fails a malformed brand review instead of approving it", async () => {
    fetchMock.mockResolvedValue(reply('{}'));
    await expect(openaiBrandCheck({ imageUrl: "https://example.test/a.png", brandLook: "red" })).rejects.toMatchObject({ code: "invalid_review" });
  });

  it("analyzes storyboard references using the same compatible client", async () => {
    fetchMock.mockResolvedValue(reply('{"styleBrief":"Flat watercolour illustration","styleNegative":"photorealism","carriesCast":false,"subjects":"A landscape"}'));
    const result = await analyzeReferenceStyle(["https://example.test/ref.png"]);
    expect(result.styleBrief).toBe("Flat watercolour illustration");
    expect(fetchMock.mock.calls[0][0]).toContain("/responses");
  });
});
