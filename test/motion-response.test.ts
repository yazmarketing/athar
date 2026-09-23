import { afterEach, beforeEach, expect, it, vi } from "vitest";
import { motionResponse, motionResponseText, MOTION_RECOVERY_BUDGET } from "@/lib/motion/response";
const fetchMock = vi.fn();
beforeEach(() => { vi.stubEnv("OPENAI_API_KEY", "test-only"); vi.stubEnv("OPENAI_BASE_URL", "https://example.test/v1"); vi.stubGlobal("fetch", fetchMock); fetchMock.mockReset(); });
afterEach(() => { vi.unstubAllGlobals(); vi.unstubAllEnvs(); });
it("submits exact Astra in background and retrieves the existing response", async () => {
  fetchMock.mockImplementation(async () => Response.json({ id: "resp_test", status: "queued" }));
  await motionResponse([{ role: "user", content: "Design motion" }]);
  expect(JSON.parse(fetchMock.mock.calls[0][1].body)).toMatchObject({ model: "gpt-6-astra", background: true, store: true, reasoning: { effort: "high" }, max_output_tokens: 64000 });
  await motionResponse("resp_test");
  expect(fetchMock.mock.calls[1][0]).toBe("https://example.test/v1/responses/resp_test");
  expect(fetchMock.mock.calls[1][1]).toMatchObject({ method: "GET" });
  expect(fetchMock.mock.calls[1][1].body).toBeUndefined();
});
it("rejects partial output, refusals, and missing text", () => {
  expect(() => motionResponseText({ id: "r", status: "incomplete" })).toThrow("could not finish");
  expect(() => motionResponseText({ id: "r", status: "completed", output: [{ type: "message", content: [{ type: "refusal", refusal: "No" }] }] })).toThrow("declined");
  expect(() => motionResponseText({ id: "r", status: "completed" })).toThrow("no design");
  expect(motionResponseText({ id: "r", status: "completed", output: [{ type: "message", content: [{ type: "output_text", text: "{}" }] }] })).toBe("{}");
});
it("does not silently fall back or repeat a rejected submission", async () => {
  fetchMock.mockResolvedValue(Response.json({ error: { message: "Access denied" } }, { status: 403 }));
  await expect(motionResponse([])).rejects.toMatchObject({ status: 403 }); expect(fetchMock).toHaveBeenCalledTimes(1);
});

it("uses the expanded budget only when requested and rejects invalid limits", async () => {
  fetchMock.mockImplementation(async () => Response.json({ id: "resp_test", status: "queued" }));
  await motionResponse([], MOTION_RECOVERY_BUDGET);
  expect(JSON.parse(fetchMock.mock.calls[0][1].body).max_output_tokens).toBe(128000);
  await expect(motionResponse([], 900000)).rejects.toThrow("Invalid motion");
});
