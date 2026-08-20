import { describe, expect, it } from "vitest";
import {
  streamHasAudio,
  videoStreamLooksBrowserSafe,
} from "@/lib/video-compat";

const HEVC = `
  Duration: 00:00:05.00, start: 0.000000, bitrate: 8000 kb/s
    Stream #0:0: Video: hevc (Main) (hvc1 / 0x31637668), yuv420p(tv), 1280x720, 24 fps
    Stream #0:1: Audio: aac (LC), 44100 Hz, stereo, fltp
`;

const H264 = `
  Duration: 00:00:05.00, start: 0.000000, bitrate: 4000 kb/s
    Stream #0:0: Video: h264 (High) (avc1 / 0x31637661), yuv420p(progressive), 1920x1080, 24 fps
    Stream #0:1: Audio: aac (LC), 48000 Hz, stereo, fltp
`;

const H264_10BIT = `
    Stream #0:0: Video: h264 (High 10), yuv420p10le, 1920x1080, 24 fps
`;

describe("videoStreamLooksBrowserSafe", () => {
  it("rejects HEVC even when the pixel format is 4:2:0", () => {
    expect(videoStreamLooksBrowserSafe(HEVC)).toBe(false);
  });

  it("accepts 8-bit H.264 yuv420p", () => {
    expect(videoStreamLooksBrowserSafe(H264)).toBe(true);
  });

  it("rejects 10-bit H.264", () => {
    expect(videoStreamLooksBrowserSafe(H264_10BIT)).toBe(false);
  });
});

describe("streamHasAudio", () => {
  it("sees an audio stream", () => {
    expect(streamHasAudio(HEVC)).toBe(true);
  });

  it("is false when there is only video", () => {
    expect(streamHasAudio(H264_10BIT)).toBe(false);
  });
});
