import type { Capability, Tier } from "@/config/models";

export type GenerationStatus =
  | "queued"
  | "running"
  | "ready"
  | "failed"
  | "qc_flagged";

export type AspectRatio = "16:9" | "9:16" | "1:1" | "4:5" | "21:9";

/** Seedream output resolution tier (maps to pixel sizes per aspect). */
/** 4K is Nano Banana Pro only — Seedream paths clamp it back to 2K. */
export type ImageResolution = "1K" | "2K" | "4K";

/** Structured prompt inputs — never concatenate raw user text (§5.3). */
export type PromptInputs = {
  subject: string;
  action?: string;
  lighting?: string;
  /** Injected from a brand kit later; free-form for Phase 0 */
  brandTokens?: string;
  presetFragment?: string;
  negativeAdditions?: string;
  /** Style preset id (see config/styles.ts) — chooses the look. */
  styleId?: string;
  /** Custom style tokens (from a per-client saved preset) — override styleId. */
  styleTokens?: string;
  styleNegative?: string;
  /** Camera-move preset id (see config/camera.ts) — video motion. */
  cameraId?: string;
};

export type GenerateRequest = {
  mode: Capability;
  tier: Tier;
  /** Image provider/model override — "nano-banana" routes to Google Gemini. */
  imageModel?: string;
  prompt: PromptInputs;
  aspect: AspectRatio;
  /** Image output resolution — ignored for video */
  resolution?: ImageResolution;
  numOutputs?: number;
  /** Video duration in seconds (t2v / i2v). Clamped to the model max. */
  durationS?: number;
  /** Reference image URLs for Seedream edit / i2i */
  referenceUrls?: string[];
  /** Set for Reproduce (exact seed) and Refine; omit for Vary / fresh runs */
  seed?: number;
  /** Assign output to an active project */
  projectId?: string | null;
  /** Apply a brand kit: tokens merged server-side, id stamped on the record */
  brandKitId?: string | null;
  /**
   * Video only: attached image(s). One image = exact first frame (i2v);
   * two or more = reference images blended into the clip.
   */
  sourceImageUrls?: string[] | null;
  /** Lineage: the generation that produced the first attached image */
  sourceGenerationId?: string | null;
  /**
   * Video only: existing clip attached as a Seedance reference video (v2v
   * edit/extend). The prompt addresses it as @video1.
   */
  sourceVideoUrl?: string | null;
  /** Lineage: the generation that produced the attached source video */
  sourceVideoGenerationId?: string | null;
  /** Video output resolution — 480p renders ~2x faster (fast preview) */
  videoResolution?: "480p" | "720p";
};

export type GenerationJobStatus =
  | "queued"
  | "running"
  | "completed"
  | "failed"
  | "cancelled";

/** Mirrors the `generation_jobs` table (durable video/batch jobs). */
export type GenerationJobRecord = {
  id: string;
  kind: "t2v" | "i2v" | "v2v";
  status: GenerationJobStatus;
  provider: string;
  provider_task_id: string | null;
  model_endpoint: string;
  tier: Tier;
  input: Record<string, unknown>;
  final_prompt: string;
  negative_prompt: string;
  aspect: string;
  duration_s: number | null;
  error: string | null;
  generation_id: string | null;
  user_id: string | null;
  project_id: string | null;
  brand_kit_id: string | null;
  created_at: string;
  updated_at: string;
  completed_at: string | null;
};

/** Mirrors the `brand_kits` table. */
export type BrandKitRecord = {
  id: string;
  name: string;
  client: string | null;
  client_id: string | null;
  brand_tokens: string;
  negative_additions: string;
  reference_urls: string[];
  project_id: string | null;
  created_by: string | null;
  archived_at: string | null;
  created_at: string;
  updated_at: string;
};

/** A client's saved style preset (Layer 6) — a named look for the dropdown. */
export type StylePresetRecord = {
  id: string;
  client_id: string | null;
  name: string;
  positive: string;
  negative: string;
  created_by: string | null;
  archived_at: string | null;
  created_at: string;
  updated_at: string;
};

/** A reusable, versioned reference in a client's library (Layer 3). */
export type ReferenceAssetRecord = {
  id: string;
  client_id: string | null;
  project_id: string | null;
  name: string;
  kind: "character" | "product" | "brand" | "style" | "reference";
  url: string;
  notes: string;
  version: number;
  parent_id: string | null;
  created_by: string | null;
  archived_at: string | null;
  created_at: string;
  updated_at: string;
};

/** Top-level entity: a client owns projects and brand kits. */
export type ClientRecord = {
  id: string;
  name: string;
  created_by: string | null;
  archived_at: string | null;
  created_at: string;
  updated_at: string;
  project_count?: number;
  brand_kit_count?: number;
};

/** Mirrors the `projects` table. */
export type ProjectRecord = {
  id: string;
  name: string;
  client: string | null;
  client_id: string | null;
  created_by: string | null;
  archived_at: string | null;
  created_at: string;
  updated_at: string;
  generation_count?: number;
};

/** Mirrors the `generations` table (§7). */
export type GenerationRecord = {
  id: string;
  project_id: string | null;
  user_id: string | null;
  /** Joined from users — who ran this generation. */
  creator_name?: string | null;
  creator_email?: string | null;
  /** Measured render time in ms (null for rows created before this existed). */
  render_ms?: number | null;
  mode: Capability;
  preset_id: string | null;
  brand_kit_id: string | null;
  model_endpoint: string;
  model_version: string | null;
  tier: Tier;
  input_payload: Record<string, unknown>;
  final_prompt: string;
  negative_prompt: string;
  seed: number | null;
  reference_urls: string[];
  status: GenerationStatus;
  output_url: string | null;
  fal_url: string | null;
  request_id: string | null;
  cost: number;
  duration_s: number | null;
  resolution: string | null;
  aspect: string;
  fps: number | null;
  qc_status: string | null;
  qc_score: number | null;
  approved_by: string | null;
  client_ready: boolean;
  brand_flagged?: boolean | null;
  brand_notes?: string | null;
  is_favorite?: boolean;
  created_at: string;
  completed_at: string | null;
};

/** One frame of a storyboard — a still prompt plus the move that follows it. */
export type StoryboardFrameRecord = {
  id: string;
  storyboard_id: string;
  position: number;
  title: string;
  /** Still-frame description only; camera language lives in `motion`. */
  prompt: string;
  motion: string;
  shot_size: string;
  dialogue: string;
  notes: string;
  /** Overrides the board's aspect when set. */
  aspect: string | null;
  /** Intended screen time in seconds — also the clip length when animated. */
  duration_s: number | null;
  /**
   * Render this frame against the board's first rendered frame. Holds identity
   * but also drags composition, so inserts and macros want it off.
   */
  lock_to_anchor: boolean;
  /** A deliberate non-image beat — a black screen. Never generated. */
  is_blank: boolean;
  /**
   * Which cast members appear in this frame. Empty is normal and correct for
   * landscapes, textures and inserts.
   */
  cast_ids: string[];
  image_url: string | null;
  video_url: string | null;
  generation_id: string | null;
  /** Set while an animate-to-clip job is in flight. */
  video_job_id: string | null;
  created_at: string;
  updated_at: string;
};

/**
 * A recurring character on a board. `description` is the fixed identity string
 * reused verbatim wherever they appear — per the image guide, never
 * re-described from memory shot to shot.
 */
export type StoryboardCastMember = {
  id: string;
  name: string;
  description: string;
};

/** The world a whole board shares: where it is, how it is lit, how it is graded. */
export type StoryboardLook = {
  subject: string;
  wardrobe: string;
  location: string;
  lighting: string;
  grade: string;
};

/** Mirrors the `storyboards` table. */
export type StoryboardRecord = {
  id: string;
  title: string;
  brief: string;
  look: StoryboardLook | null;
  client_id: string | null;
  project_id: string | null;
  brand_kit_id: string | null;
  aspect: string;
  /** Board-level finish level — see config/storyboard-styles. */
  style_id: string;
  /** Recurring characters. Frames name which of them they contain. */
  cast_members: StoryboardCastMember[];
  /** Things that must not appear, fed to every frame's negative prompt. */
  banned_elements: string[];
  /** True once the look and cast are approved; re-planning keeps them. */
  look_locked: boolean;
  /**
   * Images every frame is rendered against — the character, the product, the
   * look. Text alone will not hold a face across twelve frames.
   */
  reference_urls: string[];
  created_by: string | null;
  archived_at: string | null;
  created_at: string;
  updated_at: string;
  /** Present on list responses. */
  frame_count?: number;
  rendered_count?: number;
  cover_url?: string | null;
  client_name?: string | null;
  project_name?: string | null;
  /** Present on single-board responses. */
  frames?: StoryboardFrameRecord[];
};
