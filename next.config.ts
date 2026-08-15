import type { NextConfig } from "next";

const isDev = process.env.NODE_ENV === "development";

/**
 * Content Security Policy.
 *
 * - `script-src` keeps 'unsafe-inline' because Next injects inline bootstrap
 *   and flight-data scripts; dev additionally needs 'unsafe-eval' for the
 *   Turbopack/React Refresh runtime.
 * - `img-src`/`media-src` allow any https origin on purpose: generations are
 *   served from BytePlus CDNs, DigitalOcean Spaces and (for avatars) Google,
 *   and those hostnames vary per account/region.
 * - `frame-ancestors 'none'` is the clickjacking control that actually
 *   matters; X-Frame-Options below is the legacy fallback.
 */
const csp = [
  "default-src 'self'",
  `script-src 'self' 'unsafe-inline'${isDev ? " 'unsafe-eval'" : ""}`,
  "style-src 'self' 'unsafe-inline'",
  "img-src 'self' data: blob: https:",
  "media-src 'self' blob: https:",
  "font-src 'self' data:",
  `connect-src 'self' https:${isDev ? " ws: wss:" : ""}`,
  "frame-ancestors 'none'",
  "frame-src 'none'",
  "object-src 'none'",
  "base-uri 'self'",
  "form-action 'self'",
  "upgrade-insecure-requests",
].join("; ");

const securityHeaders = [
  { key: "Content-Security-Policy", value: csp },
  { key: "X-Frame-Options", value: "DENY" },
  { key: "X-Content-Type-Options", value: "nosniff" },
  { key: "Referrer-Policy", value: "strict-origin-when-cross-origin" },
  {
    key: "Permissions-Policy",
    value: "camera=(), microphone=(), geolocation=(), interest-cohort=()",
  },
  {
    key: "Strict-Transport-Security",
    value: "max-age=63072000; includeSubDomains; preload",
  },
  { key: "X-DNS-Prefetch-Control", value: "off" },
];

const nextConfig: NextConfig = {
  // Hide the Next.js Dev Tools badge (bottom-left N) and its toolbar
  devIndicators: false,

  // Don't advertise the framework/version to attackers.
  poweredByHeader: false,

  async headers() {
    return [
      { source: "/:path*", headers: securityHeaders },
      {
        // Authenticated API responses must never be cached by a shared proxy.
        source: "/api/:path*",
        headers: [{ key: "Cache-Control", value: "no-store, max-age=0" }],
      },
    ];
  },
};

export default nextConfig;
