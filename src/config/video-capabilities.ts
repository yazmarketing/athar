import type { Tier } from "@/config/models";

/** Audited against ModelArk /1520757, 2026-09-13. These are Athar's supported operations. */
export function videoCapabilities(tier: Tier) {
  const full = tier !== "draft";
  return {
    maxImages: full ? 30 : 9,
    maxVideos: full ? 10 : 3,
    maxAudios: full ? 10 : 3,
    maxDuration: full ? 30 : 15,
    resolutions: full ? ["480p", "720p", "1080p"] as const : ["480p", "720p"] as const,
    aspects: ["16:9", "9:16", "1:1", "21:9"] as const,
    audioOnly: full,
    // Athar's edit adapter uses the 2.5 task-type contract exclusively.
    editing: full,
    motionControl: false,
  };
}

export function videoUsesFirstFrame(images: string[], videos: string[], audios: string[]) {
  return images.length === 1 && !images[0].startsWith("asset://") && videos.length === 0 && audios.length === 0;
}

export function validateVideoSettings(input: {
  tier: Tier; images: string[]; videos: string[]; audios: string[];
  source?: string | null; workflow?: string; intent?: string; duration?: number; resolution?: string; aspect?: string;
}) {
  const c = videoCapabilities(input.tier);
  if (input.workflow === "motion") return "Dedicated motion control is not connected in Athar.";
  if (input.workflow && !["create", "edit"].includes(input.workflow)) return "Unsupported video workflow.";
  if (input.intent && !["edit", "extend", "vary"].includes(input.intent)) return "Unsupported video operation.";
  if (input.intent && !input.source) return "This operation requires a source video.";
  if (input.workflow === "create" && input.source) return "Use Edit video for a source clip, or attach it as a reference to create a new video.";
  if (input.workflow === "edit" && !input.source) return "Add a source video to edit.";
  if (input.source && !c.editing) return "Video editing requires Seedance 2.5. Select it before generating.";
  if (input.source && input.videos.length) return "Editing uses one source video. Remove the additional video references.";
  if (input.images.length > c.maxImages) return `This model accepts up to ${c.maxImages} images. Remove extras before changing models.`;
  if (input.videos.length > c.maxVideos) return `This model accepts up to ${c.maxVideos} video references. Remove extras before changing models.`;
  if (input.audios.length > c.maxAudios) return `This model accepts up to ${c.maxAudios} audio references. Remove extras before changing models.`;
  if (!c.audioOnly && input.audios.length && !input.images.length && !input.videos.length && !input.source) return "This model requires an image or video alongside audio.";
  if (input.resolution && !(c.resolutions as readonly string[]).includes(input.resolution)) return "The selected resolution is not supported by this model.";
  if ((!input.source || input.intent === "extend") && input.duration !== undefined && (!Number.isInteger(input.duration) || input.duration < 4 || input.duration > c.maxDuration)) return `Choose a duration from 4 to ${c.maxDuration} seconds.`;
  const sourceRatio = input.source || (input.tier !== "draft" && videoUsesFirstFrame(input.images, input.videos, input.audios));
  if (!sourceRatio && input.aspect && !(c.aspects as readonly string[]).includes(input.aspect)) return "Choose a supported video aspect ratio.";
  return null;
}
