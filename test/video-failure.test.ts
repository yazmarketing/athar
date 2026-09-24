import { describe, expect, it } from "vitest";
import { videoFailure } from "@/lib/video-failure";

describe("video reference rejection", () => {
  it("explains the provider error without exposing its content index as a clip number", () => {
    const failure = videoFailure("The request failed because the input video 'content[1]' may contain real person. Request id: abc");
    expect(failure?.message).toContain("Replace the clip");
    expect(failure?.message).not.toContain("content[1]");
    expect(failure?.message).not.toContain("abc");
  });
  it.each([null, "Network timeout", "The input image may contain real person", "The input video has invalid duration"])("does not misclassify %s", (error) => {
    expect(videoFailure(error)).toBeNull();
  });
});
