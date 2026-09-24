import { describe, expect, it } from "vitest";
import { validateVideoSettings, videoCapabilities } from "@/config/video-capabilities";

const base = { tier: "standard" as const, images: [], videos: [], audios: [] };
describe("video workflow and model contract", () => {
  it("rejects incompatible attachments when changing to Mini", () => {
    expect(validateVideoSettings({ ...base, tier: "draft", images: Array(10).fill("https://cdn/i.png") })).toMatch(/9 images/);
    expect(validateVideoSettings({ ...base, tier: "draft", videos: Array(4).fill("https://cdn/v.mp4") })).toMatch(/3 video/);
    expect(validateVideoSettings({ ...base, tier: "draft", audios: ["https://cdn/a.mp3"] })).toMatch(/alongside audio/);
    expect(validateVideoSettings({ ...base, tier: "draft", audios: ["https://cdn/a.mp3"], images: ["https://cdn/i.png"] })).toBeNull();
  });
  it("accepts 30 images on 2.5 and rejects an excess instead of dropping it", () => {
    expect(validateVideoSettings({ ...base, images: Array(30).fill("https://cdn/i.png") })).toBeNull();
    expect(validateVideoSettings({ ...base, images: Array(31).fill("https://cdn/i.png") })).toMatch(/30 images/);
  });
  it("requires a supported model and source for edits", () => {
    expect(validateVideoSettings({ ...base, workflow: "edit" })).toMatch(/source video/);
    expect(validateVideoSettings({ ...base, tier: "draft", source: "https://cdn/source.mp4" })).toMatch(/Seedance 2.5/);
    expect(validateVideoSettings({ ...base, workflow: "create", source: "https://cdn/source.mp4" })).toMatch(/Edit video/);
    expect(validateVideoSettings({ ...base, source: "https://cdn/source.mp4", videos: ["https://cdn/ref.mp4"] })).toMatch(/one source/);
  });
  it("does not pretend to provide dedicated motion control", () => {
    expect(videoCapabilities("standard").motionControl).toBe(false);
    expect(validateVideoSettings({ ...base, workflow: "motion" })).toMatch(/not connected/);
  });
  it("validates duration, aspect and resolution only when controllable", () => {
    expect(validateVideoSettings({ ...base, tier: "draft", duration: 15 })).toBeNull();
    expect(validateVideoSettings({ ...base, tier: "draft", duration: 16 })).toMatch(/15 seconds/);
    expect(validateVideoSettings({ ...base, tier: "draft", resolution: "1080p" })).toMatch(/resolution/);
    expect(validateVideoSettings({ ...base, aspect: "4:3" })).toBeNull();
    expect(validateVideoSettings({ ...base, aspect: "3:4" })).toBeNull();
    expect(validateVideoSettings({ ...base, aspect: "21:9" })).toBeNull();
    expect(validateVideoSettings({ ...base, aspect: "4:5" })).toMatch(/aspect ratio/);
    expect(validateVideoSettings({ ...base, aspect: "9:21" })).toMatch(/aspect ratio/);
    expect(validateVideoSettings({ ...base, images: ["https://cdn/i.png"], aspect: "4:5" })).toBeNull();
    expect(validateVideoSettings({ ...base, source: "https://cdn/s.mp4", intent: "extend", duration: 40 })).toMatch(/30 seconds/);
  });
});
