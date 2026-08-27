import { describe, expect, it } from "vitest";
import { videoRequestForJob } from "@/lib/video-jobs";
import type { GenerationJobRecord } from "@/lib/types";

function job(over: Partial<GenerationJobRecord> = {}): GenerationJobRecord {
  return {
    id: "00000000-0000-4000-8000-000000000000",
    kind: "t2v",
    status: "queued",
    provider: "byteplus",
    provider_task_id: null,
    model_endpoint: "byteplus:seedance",
    tier: "hero",
    input: {},
    final_prompt: "a camel walks across a dune",
    negative_prompt: "",
    aspect: "16:9",
    duration_s: 8,
    error: null,
    generation_id: null,
    user_id: null,
    project_id: null,
    brand_kit_id: null,
    created_at: "2026-08-20T00:00:00.000Z",
    updated_at: "2026-08-20T00:00:00.000Z",
    completed_at: null,
    finalizing_at: null,
    ...over,
  };
}

describe("videoRequestForJob", () => {
  it("carries the stored prompt, aspect and duration through", () => {
    const req = videoRequestForJob(job());
    expect(req.prompt).toBe("a camel walks across a dune");
    expect(req.ratio).toBe("16:9");
    expect(req.duration).toBe(8);
  });

  it("maps an unsupported aspect to the closest Seedance ratio", () => {
    expect(videoRequestForJob(job({ aspect: "4:5" })).ratio).toBe("9:16");
    expect(videoRequestForJob(job({ aspect: "21:9" })).ratio).toBe("16:9");
  });

  it("carries the negative prompt through for the payload builder to fold in", () => {
    const req = videoRequestForJob(job({ negative_prompt: "blurry, subtitles" }));
    expect(req.negativePrompt).toBe("blurry, subtitles");
    expect(videoRequestForJob(job()).negativePrompt).toBeUndefined();
  });

  it("clamps 1080p down on a tier whose model can't render it", () => {
    const draft = videoRequestForJob(
      job({ tier: "draft", input: { videoResolution: "1080p" } })
    );
    expect(draft.model).not.toContain("seedance-2-5");
    expect(draft.resolution).toBe("720p");

    const hero = videoRequestForJob(
      job({ tier: "hero", input: { videoResolution: "1080p" } })
    );
    expect(hero.model).toContain("seedance-2-5");
    expect(hero.resolution).toBe("1080p");
  });

  it("defaults to 720p and keeps an explicit 480p", () => {
    expect(videoRequestForJob(job()).resolution).toBe("720p");
    expect(
      videoRequestForJob(job({ input: { videoResolution: "480p" } })).resolution
    ).toBe("480p");
  });

  it("passes attached stills through as image urls", () => {
    const req = videoRequestForJob(
      job({
        kind: "i2v",
        input: { sourceImageUrls: ["https://cdn.example.com/a.png"] },
      })
    );
    expect(req.imageUrls).toEqual(["https://cdn.example.com/a.png"]);
    expect(req.videoUrls).toBeUndefined();
  });

  it("still reads the single-image shape older jobs were stored with", () => {
    const req = videoRequestForJob(
      job({ kind: "i2v", input: { sourceImageUrl: "https://cdn/a.png" } })
    );
    expect(req.imageUrls).toEqual(["https://cdn/a.png"]);
  });

  it("sends an attached clip as a reference video", () => {
    const req = videoRequestForJob(
      job({ kind: "v2v", input: { sourceVideoUrl: "https://cdn/a.mp4" } })
    );
    expect(req.videoUrls).toEqual(["https://cdn/a.mp4"]);
    expect(req.imageUrls).toBeUndefined();
  });

  it("passes subject/motion/style reference clips separately from the edit source", () => {
    const req = videoRequestForJob(
      job({
        input: {
          referenceVideoUrls: ["https://cdn/motion.mp4", "https://cdn/style.mp4"],
        },
      })
    );
    expect(req.referenceVideoUrls).toEqual([
      "https://cdn/motion.mp4",
      "https://cdn/style.mp4",
    ]);
    expect(req.videoUrls).toBeUndefined();
  });

  it("clamps reference videos to the Seedance limit of 10", () => {
    const urls = Array.from({ length: 12 }, (_, i) => `https://cdn/v${i}.mp4`);
    const req = videoRequestForJob(job({ input: { referenceVideoUrls: urls } }));
    expect(req.referenceVideoUrls).toHaveLength(10);
  });

  it("omits referenceVideoUrls when nothing is attached", () => {
    expect(videoRequestForJob(job()).referenceVideoUrls).toBeUndefined();
  });

  it("passes attached lip-sync audio through as audio urls", () => {
    const req = videoRequestForJob(
      job({ input: { sourceAudioUrls: ["https://cdn/line.mp3"] } })
    );
    expect(req.audioUrls).toEqual(["https://cdn/line.mp3"]);
  });

  it("clamps reference audio to the Seedance limit of 10", () => {
    const urls = Array.from({ length: 12 }, (_, i) => `https://cdn/${i}.mp3`);
    const req = videoRequestForJob(job({ input: { sourceAudioUrls: urls } }));
    expect(req.audioUrls).toHaveLength(10);
  });

  it("omits audioUrls when nothing is attached", () => {
    expect(videoRequestForJob(job()).audioUrls).toBeUndefined();
  });

  it("holds the duration inside what the model accepts", () => {
    expect(videoRequestForJob(job({ duration_s: 1 })).duration).toBe(4);
    expect(videoRequestForJob(job({ duration_s: 900 })).duration).toBe(30);
    expect(videoRequestForJob(job({ duration_s: null })).duration).toBe(5);
  });
});
