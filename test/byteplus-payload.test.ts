import { describe, expect, it } from "vitest";
import { buildArkVideoPayload } from "@/lib/byteplus-server";

const base = {
  model: "seedance-2-5-260807",
  prompt: "a camel walks across a dune",
  ratio: "16:9",
  duration: 8,
};

type ContentItem = {
  type: string;
  role?: string;
  text?: string;
  image_url?: { url: string };
  video_url?: { url: string };
  audio_url?: { url: string };
};

function content(payload: Record<string, unknown>): ContentItem[] {
  return payload.content as ContentItem[];
}

describe("buildArkVideoPayload", () => {
  it("sends distinct reference, edit and extension operations to the provider", () => {
    const source = { ...base, videoUrls: ["https://cdn/source.mp4"] };
    expect(buildArkVideoPayload({ ...source, taskType: "edit" })).toMatchObject({ omni_reference_task_type: "edit", duration: -1, ratio: "adaptive" });
    expect(buildArkVideoPayload({ ...source, taskType: "extend", duration: 12 })).toMatchObject({ omni_reference_task_type: "extend", duration: 12, ratio: "adaptive" });
    expect(buildArkVideoPayload({ ...base, referenceVideoUrls: source.videoUrls, taskType: "reference" })).toMatchObject({ omni_reference_task_type: "reference", duration: 8, ratio: "16:9" });
  });
  it("keeps Mini's supported first-frame ratio without sending a 2.5-only task field", () => {
    const payload = buildArkVideoPayload({ ...base, model: "dreamina-seedance-2-0-mini-260615", imageUrls: ["https://cdn/image.png"], ratio: "21:9", generateAudio: false });
    expect(payload).toMatchObject({ ratio: "21:9", generate_audio: false });
    expect(payload.omni_reference_task_type).toBeUndefined();
  });
  it("text-to-video sends ratio and fixed duration", () => {
    const p = buildArkVideoPayload(base);
    expect(p.ratio).toBe("16:9");
    expect(p.duration).toBe(8);
    expect(content(p)).toHaveLength(1);
  });

  it("folds the negative prompt into the same text field Seedance reads", () => {
    const p = buildArkVideoPayload({
      ...base,
      negativePrompt: "face distortion, subtitles",
    });
    const text = content(p).find((c) => c.type === "text")?.text as string;
    expect(text).toBe(
      "a camel walks across a dune\nNegative prompt: face distortion, subtitles"
    );
  });

  it("leaves the text untouched when there is nothing to avoid", () => {
    const p = buildArkVideoPayload({ ...base, negativePrompt: "" });
    const text = content(p).find((c) => c.type === "text")?.text as string;
    expect(text).toBe("a camel walks across a dune");
  });

  it("reference videos (not an edit source) keep duration and ratio free", () => {
    const p = buildArkVideoPayload({
      ...base,
      referenceVideoUrls: [
        "https://cdn.example.com/motion.mp4",
        "https://cdn.example.com/style.mp4",
      ],
    });
    expect(p.duration).toBe(8);
    expect(p.ratio).toBe("16:9");
    expect(p.output_format).toBeUndefined();
    const videoItems = content(p).filter((c) => c.type === "video_url");
    expect(videoItems).toHaveLength(2);
    expect(videoItems.map((c) => c.role)).toEqual([
      "reference_video",
      "reference_video",
    ]);
  });

  it("an edit source still locks duration/ratio even alongside reference videos", () => {
    const p = buildArkVideoPayload({
      ...base,
      videoUrls: ["https://cdn.example.com/source.mp4"],
      referenceVideoUrls: ["https://cdn.example.com/style.mp4"],
    });
    expect(p.duration).toBe(-1);
    expect(p.ratio).toBe("adaptive");
    expect(p.output_format).toBe("mov");
    expect(content(p).filter((c) => c.type === "video_url")).toHaveLength(2);
  });

  it("mov output for edit/extend tasks (a reference video is attached)", () => {
    const p = buildArkVideoPayload({
      ...base,
      videoUrls: ["https://cdn.example.com/clip.mp4"],
    });
    expect(p.output_format).toBe("mov");
    expect(buildArkVideoPayload(base).output_format).toBeUndefined();
  });

  it("a single plain image becomes the first frame and inherits its ratio", () => {
    const p = buildArkVideoPayload({
      ...base,
      imageUrls: ["https://cdn.example.com/a.png"],
    });
    const img = content(p).find((c) => c.type === "image_url");
    expect(img?.role).toBe("first_frame");
    // Seedance 2.5 requires adaptive ratio in first-frame mode
    expect(p.ratio).toBe("adaptive");
  });

  it("tells the model to hold the reference image's subject in first-frame mode", () => {
    const p = buildArkVideoPayload({
      ...base,
      imageUrls: ["https://cdn.example.com/a.png"],
    });
    const text = content(p).find((c) => c.type === "text")?.text as string;
    expect(text).toContain("completely consistent with the reference image");
  });

  it("does not add the consistency clause for multi-image reference mode", () => {
    const p = buildArkVideoPayload({
      ...base,
      imageUrls: ["https://cdn.example.com/a.png", "https://cdn.example.com/b.png"],
    });
    const text = content(p).find((c) => c.type === "text")?.text as string;
    expect(text).not.toContain("completely consistent");
  });

  it("multiple images become reference images and keep ratio", () => {
    const p = buildArkVideoPayload({
      ...base,
      imageUrls: ["https://x/a.png", "https://x/b.png"],
    });
    const roles = content(p)
      .filter((c) => c.type === "image_url")
      .map((c) => c.role);
    expect(roles).toEqual(["reference_image", "reference_image"]);
    expect(p.ratio).toBe("16:9");
  });

  it("a verified asset is always a reference image, never a first frame", () => {
    const p = buildArkVideoPayload({
      ...base,
      imageUrls: ["asset://asset-2026-abc"],
    });
    const img = content(p).find((c) => c.type === "image_url");
    expect(img?.role).toBe("reference_image");
  });

  it("reference audio is sent as an audio_url content item", () => {
    const p = buildArkVideoPayload({
      ...base,
      audioUrls: ["https://cdn.example.com/line.mp3"],
    });
    const audio = content(p).find((c) => c.type === "audio_url");
    expect(audio?.role).toBe("reference_audio");
    expect(audio?.audio_url?.url).toBe("https://cdn.example.com/line.mp3");
    // Audio doesn't dictate the frame, so ratio and duration stay explicit
    expect(p.ratio).toBe("16:9");
    expect(p.duration).toBe(8);
  });

  it("reference audio forces generate_audio on — lip-sync needs sound", () => {
    const p = buildArkVideoPayload({
      ...base,
      generateAudio: false,
      audioUrls: ["https://cdn/line.mp3"],
    });
    expect(p.generate_audio).toBe(true);
  });

  it("a single image with reference audio is a reference, not a first frame", () => {
    const p = buildArkVideoPayload({
      ...base,
      imageUrls: ["https://x/a.png"],
      audioUrls: ["https://x/line.mp3"],
    });
    const img = content(p).find((c) => c.type === "image_url");
    expect(img?.role).toBe("reference_image");
    expect(p.ratio).toBe("16:9");
  });

  it("a reference video forces duration -1, no ratio, and reference images", () => {
    const p = buildArkVideoPayload({
      ...base,
      imageUrls: ["https://x/a.png"],
      videoUrls: ["https://x/clip.mp4"],
    });
    expect(p.duration).toBe(-1);
    expect(p.ratio).toBe("adaptive");
    const video = content(p).find((c) => c.type === "video_url");
    expect(video?.role).toBe("reference_video");
    expect(video?.video_url?.url).toBe("https://x/clip.mp4");
    const img = content(p).find((c) => c.type === "image_url");
    expect(img?.role).toBe("reference_image");
  });

  it("sends a verified video asset id instead of a file URL", () => {
    const p = buildArkVideoPayload({
      ...base,
      videoUrls: ["asset://asset-clip"],
      taskType: "edit",
    });
    const video = content(p).find((c) => c.type === "video_url");
    expect(video?.video_url?.url).toBe("asset://asset-clip");
    expect(video?.role).toBe("reference_video");
  });
});
