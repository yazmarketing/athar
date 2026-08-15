/**
 * Athar — Model Registry
 *
 * Single source of truth mapping internal capabilities → provider endpoints.
 * Never hardcode model IDs in components or routes; always resolve through here.
 *
 * Provider strategy: BytePlus ModelArk (Seedream / Seedance) only — the
 * studio runs entirely on the YAZ BytePlus account (decision 14 Aug 2026;
 * the earlier fal.ai gap-filler was removed).
 *
 * Verify BytePlus model IDs in the ModelArk console (they carry version
 * suffixes like seedream-5-0-pro-260628) before wiring.
 */

export type Capability = "t2i" | "i2v" | "t2v" | "v2v";
export type Tier = "draft" | "standard" | "hero";
export type Provider = "byteplus" | "google";

export type ModelEndpoint = {
  provider: Provider;
  /** BytePlus ModelArk model ID */
  slug: string;
  /** Estimated cost per unit (USD). Images: per image. Video: per second. */
  costPerUnit: number;
  /** "image" or "second" — what costPerUnit is billed against */
  unit: "image" | "second";
  /** Max video duration in seconds (0 for stills) */
  maxDuration: number;
  supportsReference: boolean;
  supportsAudio: boolean;
  notes?: string;
};

export type CapabilityConfig = {
  capability: Capability;
  label: string;
  /** Endpoint per tier. draft = fast/cheap, hero = premium. */
  tiers: Record<Tier, ModelEndpoint>;
  /** Ordered fallbacks tried when the primary fails (500/timeout/queue-stuck) */
  fallbacks: ModelEndpoint[];
};

// ---------------------------------------------------------------------------
// Text → Image — BytePlus Seedream primary (Phase 0 core)
// ---------------------------------------------------------------------------

const T2I: CapabilityConfig = {
  capability: "t2i",
  label: "Text → Image",
  tiers: {
    // Verified against the YAZ ModelArk account on 2026-08-06
    draft: {
      provider: "byteplus",
      slug: "seedream-4-0-250828",
      costPerUnit: 0.02,
      unit: "image",
      maxDuration: 0,
      supportsReference: true,
      supportsAudio: false,
      notes: "Drafts / thumbnails / iterations",
    },
    // Verified against the YAZ ModelArk account on 2026-08-06
    standard: {
      provider: "byteplus",
      slug: "seedream-5-0-260128",
      costPerUnit: 0.04,
      unit: "image",
      maxDuration: 0,
      supportsReference: true,
      supportsAudio: false,
    },
    // Verified against the YAZ ModelArk account on 2026-08-06
    hero: {
      provider: "byteplus",
      slug: "dola-seedream-5-0-pro-260628",
      // BytePlus-quoted pricing: $0.045 per 1.5K image, $0.09 per 2K image.
      // We generate at 2K.
      costPerUnit: 0.09,
      unit: "image",
      maxDuration: 0,
      supportsReference: true,
      supportsAudio: false,
      notes: "Hero stills / brand hero images. 1K/2K, multi-reference fusion.",
    },
  },
  // BytePlus-only: the primary is retried twice; no secondary provider
  fallbacks: [],
};

// ---------------------------------------------------------------------------
// Image → Video — BytePlus Seedance primary (Phase 1; registry ready now)
// ---------------------------------------------------------------------------

const I2V: CapabilityConfig = {
  capability: "i2v",
  label: "Image → Video",
  tiers: {
    // VERIFY activation in ModelArk console
    draft: {
      provider: "byteplus",
      slug: "dreamina-seedance-2-0-mini-260615",
      costPerUnit: 0.03,
      unit: "second",
      maxDuration: 12,
      supportsReference: true,
      supportsAudio: false,
      notes: "Seedance 2.0 Mini — cheap iterations",
    },
    // VERIFY — Seedance 2.5 (BytePlus catalog Aug 2026)
    standard: {
      provider: "byteplus",
      slug: "dreamina-seedance-2-5-260628",
      // Token-billed; estimate only — check live ModelArk billing
      costPerUnit: 0.1,
      unit: "second",
      maxDuration: 30,
      supportsReference: true,
      supportsAudio: true,
      notes: "Seedance 2.5 — 4–30s, 480p/720p API",
    },
    // VERIFY — Seedance 2.5 hero path
    hero: {
      provider: "byteplus",
      slug: "dreamina-seedance-2-5-260628",
      costPerUnit: 0.1,
      unit: "second",
      maxDuration: 30,
      supportsReference: true,
      supportsAudio: true,
      notes: "Seedance 2.5 hero — longer clips + audio",
    },
  },
  fallbacks: [],
};

// ---------------------------------------------------------------------------
// Text → Video — BytePlus Seedance primary (Phase 1+)
// ---------------------------------------------------------------------------

const T2V: CapabilityConfig = {
  capability: "t2v",
  label: "Text → Video",
  tiers: {
    // VERIFY activation in ModelArk console
    draft: {
      provider: "byteplus",
      slug: "dreamina-seedance-2-0-mini-260615",
      costPerUnit: 0.03,
      unit: "second",
      maxDuration: 12,
      supportsReference: false,
      supportsAudio: false,
      notes: "Seedance 2.0 Mini — cheap iterations",
    },
    // VERIFY — Seedance 2.5 (BytePlus catalog Aug 2026)
    standard: {
      provider: "byteplus",
      slug: "dreamina-seedance-2-5-260628",
      costPerUnit: 0.1,
      unit: "second",
      maxDuration: 30,
      supportsReference: false,
      supportsAudio: true,
      notes: "Seedance 2.5 — 4–30s, 480p/720p API",
    },
    // VERIFY — Seedance 2.5 hero path
    hero: {
      provider: "byteplus",
      slug: "dreamina-seedance-2-5-260628",
      costPerUnit: 0.1,
      unit: "second",
      maxDuration: 30,
      supportsReference: false,
      supportsAudio: true,
      notes: "Seedance 2.5 hero — longer clips + audio",
    },
  },
  fallbacks: [],
};

// ---------------------------------------------------------------------------
// Video → Video (edit / extend) — Seedance 2.5 reference_video input
// ---------------------------------------------------------------------------

/**
 * Seedance 2.x accepts an existing clip as a reference_video content item,
 * enabling prompt-driven edits ("replace the product in @video1") and scene
 * extension ("continue the scene in @video1"). Requires the full 2.x model —
 * 2.0 Mini has no video-reference support, so every tier maps to 2.5.
 */
const V2V: CapabilityConfig = {
  capability: "v2v",
  label: "Video → Video (edit / extend)",
  tiers: {
    draft: {
      provider: "byteplus",
      slug: "dreamina-seedance-2-5-260628",
      costPerUnit: 0.1,
      unit: "second",
      maxDuration: 30,
      supportsReference: true,
      supportsAudio: true,
      notes: "Seedance 2.5 — reference_video edit/extend",
    },
    standard: {
      provider: "byteplus",
      slug: "dreamina-seedance-2-5-260628",
      costPerUnit: 0.1,
      unit: "second",
      maxDuration: 30,
      supportsReference: true,
      supportsAudio: true,
      notes: "Seedance 2.5 — reference_video edit/extend",
    },
    hero: {
      provider: "byteplus",
      slug: "dreamina-seedance-2-5-260628",
      costPerUnit: 0.1,
      unit: "second",
      maxDuration: 30,
      supportsReference: true,
      supportsAudio: true,
      notes: "Seedance 2.5 — reference_video edit/extend",
    },
  },
  fallbacks: [],
};

// ---------------------------------------------------------------------------
// Image Upscaler — Seedream i2i re-render at a higher resolution level
// ---------------------------------------------------------------------------

export type UpscaleMode = "creative" | "precision";

/**
 * Both modes re-render the source through Seedream image-to-image at 2K/4K.
 * Creative = enhancement prompt (may enrich texture/detail).
 * Precision = strict reproduction prompt (as faithful as the model allows).
 */
export const UPSCALE_MODELS: Record<UpscaleMode, ModelEndpoint> = {
  creative: {
    provider: "byteplus",
    slug: "seedream-4-0-250828",
    costPerUnit: 0.03,
    unit: "image",
    maxDuration: 0,
    supportsReference: true,
    supportsAudio: false,
    notes: "Creative mode — Seedream i2i with detail-enhancement prompt",
  },
  precision: {
    provider: "byteplus",
    slug: "seedream-4-0-250828",
    costPerUnit: 0.03,
    unit: "image",
    maxDuration: 0,
    supportsReference: true,
    supportsAudio: false,
    notes: "Faithful mode — Seedream i2i with strict-reproduction prompt",
  },
};

/** Background removal — Seedream edit (subject cut out onto clean white). */
export const BACKGROUND_REMOVE_MODEL: ModelEndpoint = {
  provider: "byteplus",
  slug: "seedream-4-0-250828",
  costPerUnit: 0.02,
  unit: "image",
  maxDuration: 0,
  supportsReference: true,
  supportsAudio: false,
  notes: "Seedream edit — subject on a plain white background",
};

// ---------------------------------------------------------------------------

export const MODEL_REGISTRY: Record<Capability, CapabilityConfig> = {
  t2i: T2I,
  i2v: I2V,
  t2v: T2V,
  v2v: V2V,
};

/** Resolve the endpoint for a capability + tier. */
export function resolveModel(capability: Capability, tier: Tier): ModelEndpoint {
  return MODEL_REGISTRY[capability].tiers[tier];
}

/** Ordered fallback chain (excluding the primary) for a capability. */
export function resolveFallbacks(capability: Capability): ModelEndpoint[] {
  return MODEL_REGISTRY[capability].fallbacks;
}

/** UI options for picking a model (maps 1:1 to tier today). */
export function listModelOptions(capability: Capability): {
  tier: Tier;
  label: string;
  slug: string;
  provider: Provider;
}[] {
  const config = MODEL_REGISTRY[capability];
  const labels: Record<Tier, string> = {
    draft:
      capability === "t2i"
        ? "Seedream 4.0"
        : capability === "t2v" || capability === "i2v"
          ? "Seedance 2.0 Mini"
          : capability === "v2v"
            ? "Seedance 2.5"
            : "Draft",
    standard:
      capability === "t2i"
        ? "Seedream 5.0"
        : capability === "t2v" || capability === "i2v" || capability === "v2v"
          ? "Seedance 2.5"
          : "Standard",
    hero:
      capability === "t2i"
        ? "Seedream 5.0 Pro"
        : capability === "t2v" || capability === "i2v" || capability === "v2v"
          ? "Seedance 2.5 (Hero)"
          : "Hero",
  };
  return (["draft", "standard", "hero"] as Tier[]).map((tier) => {
    const m = config.tiers[tier];
    return {
      tier,
      label: labels[tier],
      slug: m.slug,
      provider: m.provider,
    };
  });
}

/** Estimate cost in USD before submit. durationS only matters for video. */
export function estimateCost(
  capability: Capability,
  tier: Tier,
  opts: { numOutputs?: number; durationS?: number } = {}
): number {
  const model = resolveModel(capability, tier);
  const n = opts.numOutputs ?? 1;
  if (model.unit === "image") return model.costPerUnit * n;
  return model.costPerUnit * (opts.durationS ?? model.maxDuration) * n;
}

/**
 * Human-facing model name.
 *
 * Stored endpoints are provider slugs with vendor prefixes and build dates
 * ("byteplus:dreamina-seedance-2-5-260628"), which mean nothing to the team.
 * Known slugs map to the name the model is actually known by; anything new
 * falls back to a tidied-up version rather than leaking the raw id.
 */
const MODEL_DISPLAY_NAMES: Record<string, string> = {
  "seedream-4-0-250828": "Seedream 4.0",
  "seedream-5-0-260128": "Seedream 5.0",
  "dola-seedream-5-0-pro-260628": "Seedream 5.0 Pro",
  "dreamina-seedance-2-0-mini-260615": "Seedance 2.0 Mini",
  "dreamina-seedance-2-5-260628": "Seedance 2.5",
  "gemini-2-5-flash-image": "Nano Banana",
  "nano-banana": "Nano Banana",
};

export function friendlyModelName(endpoint: string | null | undefined): string {
  if (!endpoint) return "—";
  const slug = endpoint.replace(/^[a-z0-9_-]+:/i, "").trim();
  if (MODEL_DISPLAY_NAMES[slug]) return MODEL_DISPLAY_NAMES[slug];

  // Fallback: drop the vendor word and trailing build date, then turn the
  // dashed version ("5-0-pro") back into something readable ("5.0 Pro").
  const cleaned = slug
    .replace(/^(dreamina|dola|byteplus|google|fal)-/i, "")
    .replace(/-\d{6,}$/, "");

  return cleaned
    .replace(/(\d)-(\d)/g, "$1.$2")
    .split("-")
    .filter(Boolean)
    .map((w) => (/^\d/.test(w) ? w : w.charAt(0).toUpperCase() + w.slice(1)))
    .join(" ");
}
