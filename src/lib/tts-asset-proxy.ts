import "server-only";

/**
 * Voice samples and avatars are hosted on the provider's own domain. Routing
 * them through our own origin keeps that domain out of every request the
 * browser makes — the Voice Library never leaks who's behind it, even to
 * someone reading the network tab or right-clicking "copy audio address".
 */
const ALLOWED_HOST_SUFFIX = ".munsit.com";
const ALLOWED_HOST_EXACT = "munsit.com";

export function isAllowedAssetUrl(url: string): boolean {
  try {
    const parsed = new URL(url);
    if (parsed.protocol !== "https:") return false;
    return (
      parsed.hostname === ALLOWED_HOST_EXACT ||
      parsed.hostname.endsWith(ALLOWED_HOST_SUFFIX)
    );
  } catch {
    return false;
  }
}

/** Rewrite a provider asset URL to our own proxy path, or null if there's nothing to rewrite. */
export function proxiedAssetUrl(url: string | null | undefined): string | null {
  if (!url) return null;
  if (!isAllowedAssetUrl(url)) return url;
  return `/api/tts/asset?u=${encodeURIComponent(url)}`;
}
