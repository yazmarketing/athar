import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { imageEditPrompt } from "@/lib/image-instructions";
import { buildPrompt } from "@/lib/prompt";
import { arkGenerateImage } from "@/lib/byteplus-server";
import { openaiGenerateImage } from "@/lib/openai-image-server";
import { geminiGenerateImage } from "@/lib/gemini-server";

const fetchMock = vi.fn();
beforeEach(() => {
  fetchMock.mockReset();
  vi.stubGlobal("fetch", fetchMock);
  vi.stubEnv("ARK_API_KEY", "test");
  vi.stubEnv("OPENAI_API_KEY", "test");
  vi.stubEnv("GEMINI_API_KEY", "test");
});
afterEach(() => { vi.unstubAllGlobals(); vi.unstubAllEnvs(); });

describe("image editing direction", () => {
  it.each(["Change the background to blue", "Make her look older", "غيّر الإضاءة إلى ضوء المساء"])("preserves identity and carries brand bans for %s", instruction => {
    const inputs = imageEditPrompt(instruction, { subject: "Old brief", action: "Old pose", lighting: "Old lighting", brandTokens: "navy palette", negativeAdditions: "no red packaging" }, true);
    const result = buildPrompt(inputs);
    expect(result.finalPrompt).toContain(instruction);
    expect(result.finalPrompt).toContain("Preserve everything outside the requested change");
    expect(result.finalPrompt).toContain("the same person");
    expect(result.finalPrompt).not.toContain("Avoid: unchanged original face");
    expect(result.finalPrompt).not.toContain("Old lighting");
    expect(result.finalPrompt).not.toContain("Old pose");
    expect(result.finalPrompt).toContain("navy palette");
    expect(result.negativePrompt).toContain("no red packaging");
  });
  it("allows an explicitly requested different person without requiring a keyword detector", () => {
    const { subject } = imageEditPrompt("Replace the model with the person in image 2", { subject: "" }, true);
    expect(subject).toContain("Replace the model with the person in image 2");
    expect(subject).toContain("Change identity only when the requested change explicitly asks");
    expect(subject).toContain("Additional reference images guide only the elements explicitly requested");
  });
});

describe("constraints reach the actual provider request", () => {
  const prompt = "A perfume bottle";
  const negativePrompt = "red packaging, misspelled labels";
  it("sends Seedream constraints in its supported text field", async () => {
    fetchMock.mockResolvedValue(Response.json({ data: [{ url: "https://cdn/result.png" }] }));
    await arkGenerateImage({ model: "seedream-4-0-250828", prompt, negativePrompt, size: "2K" });
    const payload = JSON.parse(fetchMock.mock.calls[0][1].body);
    expect(payload.prompt).toContain(negativePrompt);
    expect(payload.negative_prompt).toBeUndefined();
  });
  it.each([false, true])("sends GPT Image constraints for editing=%s", async editing => {
    if (editing) fetchMock.mockResolvedValueOnce(new Response("image", { headers: { "content-type": "image/png" } }));
    fetchMock.mockResolvedValueOnce(Response.json({ data: [{ b64_json: "aW1hZ2U=" }] }));
    await openaiGenerateImage({ prompt, negativePrompt, imageUrls: editing ? ["https://cdn/reference.png"] : undefined });
    const body = fetchMock.mock.calls.at(-1)![1].body;
    const sent = body instanceof FormData ? body.get("prompt") : JSON.parse(body).prompt;
    expect(sent).toContain(prompt);
    expect(sent).toContain(negativePrompt);
  });
  it("sends Gemini constraints without changing reference order", async () => {
    fetchMock.mockResolvedValueOnce(new Response("first", { headers: { "content-type": "image/png" } }));
    fetchMock.mockResolvedValueOnce(new Response("second", { headers: { "content-type": "image/png" } }));
    fetchMock.mockResolvedValueOnce(Response.json({ candidates: [{ content: { parts: [{ inlineData: { data: "aW1hZ2U=", mimeType: "image/png" } }] } }] }));
    await geminiGenerateImage({ prompt, negativePrompt, imageUrls: ["https://cdn/first.png", "https://cdn/second.png"] });
    const parts = JSON.parse(fetchMock.mock.calls[2][1].body).contents[0].parts;
    expect(parts[0].text).toContain(negativePrompt);
    expect(parts[1].inlineData.data).toBe(Buffer.from("first").toString("base64"));
    expect(parts[2].inlineData.data).toBe(Buffer.from("second").toString("base64"));
  });
  it.each(["http", "network"])("stops before paying when a Gemini reference fails: %s", async failure => {
    if (failure === "http") fetchMock.mockResolvedValue(new Response("missing", { status: 404 }));
    else fetchMock.mockRejectedValue(new Error("network error"));
    await expect(geminiGenerateImage({ prompt, imageUrls: ["https://cdn/missing.png"] })).rejects.toThrow("Reference image 1 could not be loaded");
    expect(fetchMock).toHaveBeenCalledTimes(1);
    expect(fetchMock.mock.calls[0][0]).toBe("https://cdn/missing.png");
  });
  it("does not silently retry Gemini without the requested size or aspect", async () => {
    fetchMock.mockResolvedValue(Response.json({ error: { message: "unsupported imageConfig imageSize" } }, { status: 400 }));
    await expect(geminiGenerateImage({ prompt, model: "nano-banana-pro", imageSize: "4K", aspectRatio: "9:16" })).rejects.toThrow("unsupported imageConfig");
    expect(fetchMock).toHaveBeenCalledTimes(1);
  });
});
