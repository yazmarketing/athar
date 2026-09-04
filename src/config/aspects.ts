import type { AspectRatio } from "@/lib/types";

/**
 * Every still/video aspect the dock, variations, chat and storyboards offer.
 *
 * Each landscape ratio has its portrait pair (and 1:1). Pixel sizes for
 * Seedream live here too so a new ratio cannot appear in the picker without
 * a BytePlus size that is a multiple of 16.
 */
export const ASPECT_RATIOS: AspectRatio[] = [
  "16:9",
  "9:16",
  "1:1",
  "4:3",
  "3:4",
  "3:2",
  "2:3",
  "4:5",
  "5:4",
  "21:9",
  "9:21",
];

export function isAspectRatio(
  value: string | null | undefined
): value is AspectRatio {
  return ASPECT_RATIOS.includes(value as AspectRatio);
}

/**
 * BytePlus ModelArk pixel sizes — multiples of 16.
 * 2K meets the Seedream 5.x floor (≥3,686,400 px).
 */
export const ASPECT_TO_ARK_SIZE_2K: Record<AspectRatio, string> = {
  "16:9": "2560x1440",
  "9:16": "1440x2560",
  "1:1": "2048x2048",
  "4:3": "2240x1680",
  "3:4": "1680x2240",
  "3:2": "2400x1600",
  "2:3": "1600x2400",
  "4:5": "1728x2160",
  "5:4": "2160x1728",
  "21:9": "2944x1264",
  "9:21": "1264x2944",
};

export const ASPECT_TO_ARK_SIZE_1K: Record<AspectRatio, string> = {
  "16:9": "1280x720",
  "9:16": "720x1280",
  "1:1": "1024x1024",
  "4:3": "1280x960",
  "3:4": "960x1280",
  "3:2": "1200x800",
  "2:3": "800x1200",
  "4:5": "896x1120",
  "5:4": "1120x896",
  "21:9": "1472x640",
  "9:21": "640x1472",
};

/**
 * Seedance only accepts 16:9 / 9:16 / 1:1. Other dock ratios map to the
 * closest of those so a still aspect still produces a clip.
 */
export const ASPECT_TO_VIDEO_RATIO: Record<AspectRatio, "16:9" | "9:16" | "1:1"> =
  {
    "16:9": "16:9",
    "9:16": "9:16",
    "1:1": "1:1",
    "4:3": "16:9",
    "3:4": "9:16",
    "3:2": "16:9",
    "2:3": "9:16",
    "4:5": "9:16",
    "5:4": "16:9",
    "21:9": "16:9",
    "9:21": "9:16",
  };
