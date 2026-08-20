/**
 * What counts as transcribable media, and what to call it on disk.
 *
 * Browsers are unreliable about MIME types — a .m4a recorded on an iPhone
 * arrives as everything from audio/x-m4a to an empty string — so the extension
 * is checked as well as the type, and neither is trusted alone.
 */

const AUDIO_EXT = new Set([
  "mp3",
  "m4a",
  "wav",
  "aac",
  "flac",
  "ogg",
  "oga",
  "opus",
  "wma",
  "aiff",
  "aif",
  "caf",
  "amr",
]);

const VIDEO_EXT = new Set([
  "mp4",
  "mov",
  "m4v",
  "webm",
  "mkv",
  "avi",
  "wmv",
  "mpg",
  "mpeg",
  "3gp",
  "mts",
]);

export function extensionOf(filename: string): string {
  const match = /\.([a-z0-9]+)$/i.exec(filename.trim());
  return match ? match[1].toLowerCase() : "";
}

/** "audio" | "video" | null when it is neither. */
export function mediaKindFor(
  contentType: string,
  filename = ""
): "audio" | "video" | null {
  const type = contentType.toLowerCase();
  const ext = extensionOf(filename);
  if (type.startsWith("video/") || VIDEO_EXT.has(ext)) return "video";
  if (type.startsWith("audio/") || AUDIO_EXT.has(ext)) return "audio";
  // Some browsers send nothing at all for .m4a and .mkv.
  if (!type && ext) return null;
  return null;
}

/** A sane storage extension, preferring the one the user's file already had. */
export function mediaExtension(contentType: string, filename = ""): string {
  const ext = extensionOf(filename);
  if (AUDIO_EXT.has(ext) || VIDEO_EXT.has(ext)) return ext;
  const type = contentType.toLowerCase();
  if (type.includes("mpeg") && type.startsWith("audio")) return "mp3";
  if (type.includes("wav")) return "wav";
  if (type.includes("webm")) return "webm";
  if (type.includes("ogg")) return "ogg";
  if (type.includes("quicktime")) return "mov";
  if (type.includes("mp4")) return type.startsWith("audio") ? "m4a" : "mp4";
  return type.startsWith("video") ? "mp4" : "m4a";
}
