import type { Capability, Tier } from "@/config/models";

export type GenerationStatus =
  | "queued"
  | "running"
  | "ready"
  | "failed"
  | "qc_flagged";

export type AspectRatio = "16:9" | "9:16" | "1:1" | "4:5" | "21:9";

/** Seedream output resolution tier (maps to pixel sizes per aspect). */
export type ImageResolution = "1K" | "2K";

/** Structured prompt inputs — never concatenate raw user text (§5.3). */
export type PromptInputs = {
  subject: string;
  action?: string;
  lighting?: string;
  /** Injected from a brand kit later; free-form for Phase 0 */
  brandTokens?: string;
  presetFragment?: string;
  negativeAdditions?: string;
};

export type GenerateRequest = {
  mode: Capability;
  tier: Tier;
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
  brand_tokens: string;
  negative_additions: string;
  reference_urls: string[];
  project_id: string | null;
  created_by: string | null;
  archived_at: string | null;
  created_at: string;
  updated_at: string;
};

/** Mirrors the `projects` table. */
export type ProjectRecord = {
  id: string;
  name: string;
  client: string | null;
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
  is_favorite?: boolean;
  created_at: string;
  completed_at: string | null;
};
