/** App-server fallback (`/api/upload`) buffers the file in memory. */
export const IMAGE_UPLOAD_APP_MAX_BYTES = 8 * 1024 * 1024;

/**
 * Direct-to-Spaces uploads. 32MB covers a 29MB PNG without sending the
 * bytes through the 1 GiB App Platform process.
 */
export const IMAGE_UPLOAD_MAX_BYTES = 32 * 1024 * 1024;

export const IMAGE_UPLOAD_TYPES = new Set([
  "image/jpeg",
  "image/jpg",
  "image/png",
  "image/webp",
]);

/**
 * Reference audio for Seedance lip-sync. Seedance caps reference audio at
 * 30 seconds combined, so 32MB is far beyond any legitimate clip — the
 * limit exists to stop mistakes, not to squeeze real files.
 */
export const AUDIO_UPLOAD_MAX_BYTES = 32 * 1024 * 1024;

export const AUDIO_UPLOAD_TYPES = new Set([
  "audio/mpeg",
  "audio/mp3",
  "audio/wav",
  "audio/x-wav",
  "audio/wave",
  "audio/mp4",
  "audio/m4a",
  "audio/x-m4a",
  "audio/aac",
  "audio/ogg",
]);

/**
 * Reference clips for Seedance subject/motion/style referencing. BytePlus
 * accepts up to 200MB per clip; 100MB is a generous ceiling for a reference
 * (as opposed to a feature-film source) while keeping presigned uploads
 * quick. Always direct-to-Spaces — never the 8MB app-server fallback.
 */
export const VIDEO_UPLOAD_MAX_BYTES = 100 * 1024 * 1024;

export const VIDEO_UPLOAD_TYPES = new Set([
  "video/mp4",
  "video/quicktime",
]);
