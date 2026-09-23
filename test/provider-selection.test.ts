import { beforeEach, describe, expect, it, vi } from "vitest";
import type { TranscriptRecord } from "@/lib/types";
const mocks = vi.hoisted(() => ({ openai: vi.fn(), ark: vi.fn(), configured: vi.fn() }));
vi.mock("@/lib/openai-server", () => ({ openaiChat: mocks.openai, openaiConfigured: mocks.configured }));
vi.mock("@/lib/byteplus-server", () => ({ arkChat: mocks.ark }));
vi.mock("@/lib/brand-kits", () => ({ getBrandKit: vi.fn() }));
import { planShots } from "@/lib/shot-planner";
import { answerQuestion } from "@/lib/transcript-ai";
import { runDirectionPass } from "@/lib/tts-director-ai";

beforeEach(() => {
  mocks.openai.mockReset(); mocks.ark.mockReset(); mocks.configured.mockReset().mockReturnValue(true);
});
describe("configured production intelligence provider", () => {
  it.each([
    ["storyboard", () => planShots({ brief: "An Omani cyclist in sportswear", shotCount: 1 })],
    ["transcript", () => answerQuestion({ speaker_names: {} } as TranscriptRecord, [], "What happened?")],
    ["voice direction", () => runDirectionPass("أهلا وسهلا", {})],
  ] as const)("surfaces %s model failure without a paid fallback", async (_name, run) => {
    mocks.openai.mockRejectedValue(new Error("Selected model unavailable"));
    await expect(run()).rejects.toThrow("Selected model unavailable");
    expect(mocks.ark).not.toHaveBeenCalled();
  });
  it("keeps ModelArk usable when OpenAI was not configured", async () => {
    mocks.configured.mockReturnValue(false);
    mocks.ark.mockResolvedValue('{"answer":"No recording available","citations":[]}');
    const answer = await answerQuestion({ speaker_names: {} } as TranscriptRecord, [], "What happened?");
    expect(answer.answer).toBe("No recording available");
    expect(mocks.openai).not.toHaveBeenCalled();
  });
  it("the storyboard planner preserves context rather than forcing national dress", async () => {
    mocks.openai.mockResolvedValue('{"look":{},"cast":[],"banned":[],"shots":[{"title":"Ride","prompt":"A cyclist","aspect":"16:9"}]}');
    await planShots({ brief: "An Omani cyclist in sportswear", shotCount: 1 });
    const prompt = mocks.openai.mock.calls[0][0].messages[0].content;
    expect(prompt).toContain("national identity alone does not mandate traditional dress");
    expect(prompt).not.toContain("you MUST dress them in that national dress");
    expect(prompt).not.toContain("Emirati/Gulf subjects specifically");
  });
});
