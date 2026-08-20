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
  /**
   * Minimum total pixels the provider will accept for this model.
   *
   * Seedream 5.x refuses anything under 3,686,400 px (2560×1440) on *every*
   * request, not just edits — a 1K 16:9 frame is 921,600 px and comes back as
   * InvalidParameter, so the size is scaled up to clear the floor rather than
   * failing the render.
   */
  minPixels?: number;
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
      // Verified against the live API 2026-08-19: below this it returns
      // "image size must be at least 3686400 pixels".
      minPixels: 3_686_400,
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
      minPixels: 3_686_400,
      notes: "Hero stills / brand hero images. 2K+, multi-reference fusion.",
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

// ---------------------------------------------------------------------------
// Google Gemini image models — priced per image, outside the tiered registry
// ---------------------------------------------------------------------------

export type GoogleImageModelId = "nano-banana" | "nano-banana-pro";

/**
 * The Gemini image models the studio can route a still to.
 *
 * `defaultSlug` is the published API id; the server may override it via
 * GEMINI_IMAGE_MODEL / GEMINI_PRO_IMAGE_MODEL when Google promotes a preview
 * to GA under a new id (see lib/gemini-server.ts). Kept here — free of any
 * secret or process.env read — so the picker can import it on the client.
 */
export const GOOGLE_IMAGE_MODELS: Record<
  GoogleImageModelId,
  {
    label: string;
    defaultSlug: string;
    /** USD per image. Pro is quoted per resolution — see costPerImage4K. */
    costPerImage: number;
    costPerImage4K?: number;
    /** Reference images the model fuses in one call. */
    maxReferenceImages: number;
    notes: string;
  }
> = {
  "nano-banana": {
    label: "Nano Banana",
    defaultSlug: "gemini-2.5-flash-image",
    costPerImage: 0.039,
    maxReferenceImages: 8,
    notes: "Readable text/logos, precise edits, character consistency",
  },
  "nano-banana-pro": {
    label: "Nano Banana Pro",
    defaultSlug: "gemini-3-pro-image-preview",
    costPerImage: 0.134,
    costPerImage4K: 0.24,
    maxReferenceImages: 14,
    notes: "Gemini 3 Pro Image — 2K/4K, up to 14 references, best text",
  },
};

export function asGoogleImageModel(
  id: string | null | undefined
): GoogleImageModelId | null {
  return id === "nano-banana" || id === "nano-banana-pro" ? id : null;
}

/**
 * How many reference images one request may carry.
 *
 * Seedream fuses up to 8; Nano Banana Pro holds consistency across 14. The
 * dock and the API agree on this number so the UI never accepts an image the
 * request would silently drop.
 */
export const MAX_REFERENCE_IMAGES = 8;

export function maxReferenceImages(
  imageModel: string | null | undefined
): number {
  const google = asGoogleImageModel(imageModel);
  return google
    ? GOOGLE_IMAGE_MODELS[google].maxReferenceImages
    : MAX_REFERENCE_IMAGES;
}

// ---------------------------------------------------------------------------
// The image-model list every picker reads from
// ---------------------------------------------------------------------------

/**
 * One selectable still model, whichever provider serves it.
 *
 * This is the single source for every image-model picker in the app — the
 * dock, variations, the chat composer — and for the routing guide that
 * recommends one. Add a model here and it appears in all of them, with the
 * right request shape, price, reference ceiling and resolutions; nothing
 * else needs editing.
 */
export type ImageModelChoice = {
  /** Stable id the UI and the routing guide speak. */
  id: string;
  label: string;
  /** Provider model id, shown under the label so the team can see it. */
  slug: string;
  provider: Provider;
  /** Tier to send to /api/generate — null for models outside the registry. */
  tier: Tier | null;
  /** imageModel to send to /api/generate — null for Seedream tiers. */
  imageModel: GoogleImageModelId | null;
  maxReferenceImages: number;
  resolutions: ImageResolutionOption[];
  /** What this model is genuinely best at — used by the routing guide. */
  bestFor: string;
};

export type ImageResolutionOption = "1K" | "2K" | "4K";

const SEEDREAM_RESOLUTIONS: ImageResolutionOption[] = ["1K", "2K"];

/**
 * Seedream 5.x has a hard pixel floor, so 1K is not a thing it can produce.
 * Offering it anyway meant picking "Seedream 5.0 · 1K" could never succeed.
 */
const SEEDREAM_5_RESOLUTIONS: ImageResolutionOption[] = ["2K"];

export const IMAGE_MODEL_CHOICES: ImageModelChoice[] = [
  {
    id: "draft",
    label: "Seedream 4.0",
    slug: T2I.tiers.draft.slug,
    provider: "byteplus",
    tier: "draft",
    imageModel: null,
    maxReferenceImages: MAX_REFERENCE_IMAGES,
    resolutions: SEEDREAM_RESOLUTIONS,
    bestFor: "fast, cheap drafts, iterations and thumbnails",
  },
  {
    id: "standard",
    label: "Seedream 5.0",
    slug: T2I.tiers.standard.slug,
    provider: "byteplus",
    tier: "standard",
    imageModel: null,
    maxReferenceImages: MAX_REFERENCE_IMAGES,
    resolutions: SEEDREAM_5_RESOLUTIONS,
    bestFor: "balanced, general-purpose photorealistic images",
  },
  {
    id: "hero",
    label: "Seedream 5.0 Pro",
    slug: T2I.tiers.hero.slug,
    provider: "byteplus",
    tier: "hero",
    imageModel: null,
    maxReferenceImages: MAX_REFERENCE_IMAGES,
    resolutions: SEEDREAM_5_RESOLUTIONS,
    bestFor:
      "highest-fidelity hero and brand stills, multi-reference fusion, crisp 2K",
  },
  {
    id: "nano",
    label: GOOGLE_IMAGE_MODELS["nano-banana"].label,
    slug: GOOGLE_IMAGE_MODELS["nano-banana"].defaultSlug,
    provider: "google",
    tier: null,
    imageModel: "nano-banana",
    maxReferenceImages: GOOGLE_IMAGE_MODELS["nano-banana"].maxReferenceImages,
    resolutions: SEEDREAM_RESOLUTIONS,
    bestFor:
      "images that need readable text/logos, precise edits, complex compositional instructions, and character/product consistency",
  },
  {
    id: "nano-pro",
    label: GOOGLE_IMAGE_MODELS["nano-banana-pro"].label,
    slug: GOOGLE_IMAGE_MODELS["nano-banana-pro"].defaultSlug,
    provider: "google",
    tier: null,
    imageModel: "nano-banana-pro",
    maxReferenceImages:
      GOOGLE_IMAGE_MODELS["nano-banana-pro"].maxReferenceImages,
    resolutions: ["1K", "2K", "4K"],
    bestFor:
      "the hardest text-heavy work — infographics, slides, posters with long copy — plus 4K output and fusing many references (up to 14) or several people in one frame",
  },
];

export const DEFAULT_IMAGE_MODEL_ID = "standard";

export function imageModelChoice(id: string | null | undefined) {
  return IMAGE_MODEL_CHOICES.find((m) => m.id === id) ?? null;
}

/**
 * Which choice a stored generation came from, so re-runs (variations, chat)
 * open on the model that made the original rather than a default.
 */
export function imageModelIdFrom(
  tier: string | null | undefined,
  imageModel?: string | null
): string {
  const google = asGoogleImageModel(imageModel);
  if (google) {
    return (
      IMAGE_MODEL_CHOICES.find((m) => m.imageModel === google)?.id ??
      DEFAULT_IMAGE_MODEL_ID
    );
  }
  // Guard the null: Google choices carry `tier: null`, so a missing tier
  // would otherwise match one of them and quietly switch provider.
  return (
    (tier ? IMAGE_MODEL_CHOICES.find((m) => m.tier === tier)?.id : null) ??
    DEFAULT_IMAGE_MODEL_ID
  );
}

/**
 * Which choice produced a stored generation, from its `model_endpoint`
 * ("google:gemini-3-pro-image-preview", "byteplus:seedream-5-0-260128") with
 * the tier as fallback. Lets a re-run open on the model that made the
 * original instead of a default.
 */
export function imageModelIdFromEndpoint(
  endpoint: string | null | undefined,
  tier?: string | null
): string {
  const slug = (endpoint ?? "").replace(/^[a-z0-9_-]+:/i, "").trim();
  const bySlug = IMAGE_MODEL_CHOICES.find((m) => m.slug === slug);
  if (bySlug) return bySlug.id;
  // A Google slug we don't recognise (an env override, or a GA rename) is
  // still a Google render — keep it on that provider rather than a Seedream
  // tier the endpoint never used.
  if (/^google:/i.test(endpoint ?? "") || /^gemini-/i.test(slug)) {
    return /pro/i.test(slug) ? "nano-pro" : "nano";
  }
  return imageModelIdFrom(tier);
}

/** The request fields a choice implies. */
export function imageModelRequest(id: string): {
  tier: Tier | undefined;
  imageModel: GoogleImageModelId | undefined;
} {
  const choice = imageModelChoice(id);
  return {
    tier: choice?.tier ?? undefined,
    imageModel: choice?.imageModel ?? undefined,
  };
}

/** Per-image cost for a choice, honouring 4K pricing where it applies. */
export function imageModelCost(
  id: string,
  resolution: ImageResolutionOption,
  numOutputs = 1
): number | null {
  const choice = imageModelChoice(id);
  if (!choice) return null;
  if (choice.imageModel) {
    const spec = GOOGLE_IMAGE_MODELS[choice.imageModel];
    const per =
      resolution === "4K" ? (spec.costPerImage4K ?? spec.costPerImage) : spec.costPerImage;
    return per * numOutputs;
  }
  if (!choice.tier) return null;
  try {
    return estimateCost("t2i", choice.tier, { numOutputs });
  } catch {
    return null;
  }
}

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
  "gemini-2.5-flash-image": "Nano Banana",
  "nano-banana": "Nano Banana",
  "gemini-3-pro-image-preview": "Nano Banana Pro",
  "gemini-3-pro-image": "Nano Banana Pro",
  "nano-banana-pro": "Nano Banana Pro",
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
