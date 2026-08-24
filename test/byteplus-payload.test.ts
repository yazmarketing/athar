import { describe, expect, it } from "vitest";
import { buildArkVideoPayload } from "@/lib/byteplus-server";

const base = {
  model: "seedance-2.5",
  prompt: "a camel walks across a dune",
  ratio: "16:9",
  duration: 8,
};

type ContentItem = {
  type: string;
  role?: string;
  image_url?: { url: string };
  video_url?: { url: string };
  audio_url?: { url: string };
};

function content(payload: Record<string, unknown>): ContentItem[] {
  return payload.content as ContentItem[];
}

describe("buildArkVideoPayload", () => {
  it("text-to-video sends ratio and fixed duration", () => {
    const p = buildArkVideoPayload(base);
    expect(p.ratio).toBe("16:9");
    expect(p.duration).toBe(8);
    expect(content(p)).toHaveLength(1);
  });

  it("a single plain image becomes the first frame and drops ratio", () => {
    const p = buildArkVideoPayload({
      ...base,
      imageUrls: ["https://cdn.example.com/a.png"],
    });
    const img = content(p).find((c) => c.type === "image_url");
    expect(img?.role).toBe("first_frame");
    // ModelArk rejects ratio in first-frame mode
    expect(p.ratio).toBeUndefined();
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
    expect(p.ratio).toBeUndefined();
    const video = content(p).find((c) => c.type === "video_url");
    expect(video?.role).toBe("reference_video");
    const img = content(p).find((c) => c.type === "image_url");
    expect(img?.role).toBe("reference_image");
  });
});
