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
 * (as opposed to a feature-film source).
 *
 * The Space keys cannot set CORS (`AccessDenied` on Get/PutBucketCors), so
 * the browser cannot PUT these clips. They go through `/api/upload/multipart`
 * in 5MB parts — S3's minimum part size except the last — instead of the
 * 8MB `/api/upload` buffer that would OOM a 1 GiB instance at 100MB.
 */
export const VIDEO_UPLOAD_MAX_BYTES = 100 * 1024 * 1024;

/** Same-origin multipart part size. Must stay ≥5MB for S3/Spaces. */
export const VIDEO_UPLOAD_PART_BYTES = 5 * 1024 * 1024;

/** Reject a part bigger than this so one request cannot fill RAM. */
export const VIDEO_UPLOAD_PART_MAX_BYTES = 6 * 1024 * 1024;

export const VIDEO_UPLOAD_TYPES = new Set([
  "video/mp4",
  "video/quicktime",
]);
