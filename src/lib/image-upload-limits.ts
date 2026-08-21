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
