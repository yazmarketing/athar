import type { Capability, Tier } from "@/config/models";

export type GenerationStatus =
  | "queued"
  | "running"
  | "ready"
  | "failed"
  | "qc_flagged";

export type AspectRatio =
  | "16:9"
  | "9:16"
  | "1:1"
  | "4:3"
  | "3:4"
  | "3:2"
  | "2:3"
  | "4:5"
  | "5:4"
  | "21:9"
  | "9:21";

/** Seedream output resolution tier (maps to pixel sizes per aspect). */
/** 4K is Nano Banana 2 / Pro only — Seedream paths clamp it back to 2K. */
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
  /** Seedance director pickers (see config/director.ts) — video only. */
  genreId?: string;
  shotId?: string;
  lightLookId?: string;
  gradeId?: string;
  emotionId?: string;
  eraId?: string;
  tempoId?: string;
  /** Montage pacing (Cinema Studio) — cut rhythm as prompt language. */
  pacingId?: string;
  /**
   * Names for the attached references, positionally. Lets `@image2` in the
   * prompt expand to "reference image 2 (Fatima)" instead of a bare number.
   */
  referenceLabels?: (string | null)[];
  /**
   * The spoken words of each attached lip-sync audio clip, positionally
   * (Whisper transcripts). When the prompt doesn't already address a clip,
   * the server appends the Seedance lip-sync line for it — so attaching an
   * audio file is enough, nobody types their own recording back in.
   */
  audioTranscripts?: (string | null)[];
};

export type GenerateRequest = {
  mode: Capability;
  tier: Tier;
  /** Image provider/model override — "nano-banana" / "nano-banana-2" / "nano-banana-pro" routes to Google Gemini. */
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
  /** Length of the attached source clip. Seedance output follows this. */
  sourceDurationS?: number | null;
  /** Lineage: the generation that produced the attached source video */
  sourceVideoGenerationId?: string | null;
  /**
   * Video only: reference audio clip(s) for Seedance 2.5 lip-sync. The
   * prompt addresses them as @audio1, @audio2, … (e.g. "@character speaks:
   * '…' take @audio1 as a reference"). Up to 10, 30 seconds combined.
   */
  sourceAudioUrls?: string[] | null;
  /**
   * Video only: reference clip(s) used purely for their subject, motion or
   * style — not an edit/extend source, so duration and ratio stay whatever
   * the request asks for. Distinct from `sourceVideoUrl`: that field is the
   * ONE clip being edited or extended (locked duration/ratio); this is up to
   * 10 clips (30s combined) informing a fresh generation. The prompt
   * addresses them as @video1, @video2, … Mutually exclusive with
   * `sourceVideoUrl` in the studio UI.
   */
  referenceVideoUrls?: string[] | null;
  /** Video output resolution — 480p renders ~2x faster (fast preview) */
  videoResolution?: "480p" | "720p" | "1080p";
};

export type GenerationJobStatus =
  | "queued"
  | "running"
  | "completed"
  | "failed"
  | "cancelled";

export type GenerationJobKind = "t2v" | "i2v" | "v2v" | "t2i";

export function isImageJob(job: { kind: string }): boolean {
  return job.kind === "t2i";
}

/** Mirrors the `generation_jobs` table (durable video/batch jobs). */
export type GenerationJobRecord = {
  id: string;
  kind: GenerationJobKind;
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
  /** Set while a poll is storing the finished clip — see `claimJobForFinalize`. */
  finalizing_at: string | null;
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
  /** Subfolders: the parent project, or null for a top-level project. */
  parent_id?: string | null;
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
  /**
   * The viewing user's own rating of this generation, when they made it.
   * 1 = good, -1 = not good, null/undefined = not rated.
   */
  my_rating?: 1 | -1 | null;
  my_reasons?: string[] | null;
  my_note?: string | null;
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

export type TranscriptStatus =
  | "queued"
  | "running"
  | "ready"
  | "failed"
  | "cancelled";

/** One decoded word with its position on the timeline. */
export type TranscriptWord = {
  w: string;
  s: number;
  e: number;
};

/** Mirrors the `transcript_segments` table. */
export type TranscriptSegmentRecord = {
  id: string;
  transcript_id: string;
  idx: number;
  start_s: number;
  end_s: number;
  /** Raw diarization label (SPEAKER_00) — display name lives on the parent. */
  speaker: string | null;
  text: string;
  words: TranscriptWord[];
  translations: Record<string, string>;
  edited: boolean;
  created_at: string;
  updated_at: string;
};

/** A social-ready pull quote the AI pass found, with its in/out points. */
export type TranscriptClip = {
  start_s: number;
  end_s: number;
  quote: string;
  caption: string;
  why: string;
};

export type TranscriptChapter = {
  start_s: number;
  title: string;
};

export type TranscriptActionItem = {
  task: string;
  owner: string;
  start_s: number;
};

/** The cached output of the "read this for me" pass. */
export type TranscriptInsights = {
  summary: string;
  key_points: string[];
  action_items: TranscriptActionItem[];
  chapters: TranscriptChapter[];
  clips: TranscriptClip[];
  generated_at: string;
  model: string;
};

/** Mirrors the `transcripts` table. */
export type TranscriptRecord = {
  id: string;
  title: string;
  status: TranscriptStatus;
  progress: number;
  stage: string;
  error: string | null;
  media_url: string;
  media_kind: "audio" | "video";
  media_bytes: number | null;
  duration_s: number | null;
  language: string | null;
  language_probability: number | null;
  task: "transcribe" | "translate";
  model: string | null;
  device: string | null;
  diarize: boolean;
  /** { SPEAKER_00: "Yazan" } — renaming a speaker once renames it everywhere. */
  speaker_names: Record<string, string>;
  vocabulary: string;
  insights: TranscriptInsights | null;
  client_id: string | null;
  project_id: string | null;
  created_by: string | null;
  render_ms: number | null;
  /** OpenAI whisper-1 spend, estimated from the audio it actually processed. */
  cost: number;
  archived_at: string | null;
  created_at: string;
  updated_at: string;
  completed_at: string | null;
  /** Present on list responses. */
  client_name?: string | null;
  project_name?: string | null;
  created_by_name?: string | null;
  segment_count?: number;
  speaker_count?: number;
  /** Present on single-transcript responses. */
  segments?: TranscriptSegmentRecord[];
};

// ---------------------------------------------------------------------------
// Text-to-speech (Munsit)
// ---------------------------------------------------------------------------

export type TtsStatus = "ready" | "failed";

/** One block of a generation request, in the order it was spoken. */
export type TtsSegment =
  | { type: "speech"; voiceId: string; voiceName: string; text: string }
  | { type: "pause"; ms: number };

/** Per-character alignment for one speech segment, offset onto the full track. */
export type TtsAlignment = {
  characters: string[];
  startS: number[];
  endS: number[];
};

/** Mirrors the `tts_generations` table. */
export type TtsGenerationRecord = {
  id: string;
  title: string;
  status: TtsStatus;
  error: string | null;
  segments: TtsSegment[];
  text: string;
  model: string;
  stability: number;
  speed: number;
  sample_rate: number;
  dialect: string;
  word_timestamps: boolean;
  timestamps: TtsAlignment[] | null;
  char_count: number;
  cost: number;
  output_url: string | null;
  duration_s: number | null;
  render_ms: number | null;
  client_id: string | null;
  project_id: string | null;
  created_by: string | null;
  /** Every regenerate of the same script shares this — see tts.ts. */
  group_id: string;
  archived_at: string | null;
  created_at: string;
  updated_at: string;
  completed_at: string | null;
  /** Present on list responses. */
  client_name?: string | null;
  project_name?: string | null;
  created_by_name?: string | null;
};

/** A built-in Munsit voice, fetched live from GET /voices. */
export type MunsitVoice = {
  voice_id: string;
  name: string;
  description: string | null;
  gender: "male" | "female" | null;
  age: string | null;
  languages: string[];
  dialect: string[];
  type: string | null;
  sample_url: string | null;
  avatar_url?: string | null;
  /** Present once merged with our own cloned voices — see /api/tts/voices. */
  source?: "library" | "cloned";
  /** The tts_voices row id — only set for cloned voices, used to delete them. */
  id?: string;
};

/** Mirrors the `tts_voices` table — our team's cloned voices. */
export type TtsVoiceRecord = {
  id: string;
  munsit_voice_id: string;
  name: string;
  description: string | null;
  gender: string | null;
  age: string | null;
  languages: string[];
  dialects: string[];
  sample_url: string | null;
  avatar_url: string | null;
  created_by: string | null;
  created_at: string;
};

/** Mirrors the `tts_voice_favorites` table — shared across the team, not per-user. */
export type TtsFavoriteVoice = {
  id: string;
  voice_id: string;
  voice_name: string;
  /** Null means every client. */
  client_id: string | null;
  created_by: string | null;
  created_at: string;
};

// ---------------------------------------------------------------------------
// VO Director — script analysis, performance direction, phonetic adaptation
// ---------------------------------------------------------------------------

export type TtsDirectorMode = "quick" | "director";
export type TtsDirectorAnalysisStatus =
  | "draft"
  | "directed"
  | "adapted"
  | "phonetics_ready"
  | "complete"
  | "failed";

export type TtsDirectorOverallDirection = {
  dialect: string;
  register: string;
  emotional_arc: string;
};

export type TtsDirectorCampaignContext = {
  speaker?: string;
  audience?: string;
  intention?: string;
  notes?: string;
};

/** Mirrors the `tts_director_analyses` table. */
export type TtsDirectorAnalysis = {
  id: string;
  mode: TtsDirectorMode;
  status: TtsDirectorAnalysisStatus;
  error: string | null;
  original_text: string;
  campaign_context: TtsDirectorCampaignContext;
  overall_direction: TtsDirectorOverallDirection | null;
  register_strength: number;
  dialect: "emirati" | "fusha";
  model: string | null;
  client_id: string | null;
  project_id: string | null;
  created_by: string | null;
  created_at: string;
  updated_at: string;
};

export type TtsPhoneticNote = { canonical: string; respelling: string; applied: boolean };

/** Mirrors the `tts_director_segments` table. */
export type TtsDirectorSegment = {
  id: string;
  analysis_id: string;
  idx: number;
  speaker_label: string | null;
  voice_id: string | null;
  original: string;
  spoken: string;
  tts: string;
  emotion: string | null;
  intensity: number | null;
  pace: "slow" | "normal" | "fast" | null;
  continuity: string | null;
  avoid: string[];
  suggested_stability: number | null;
  suggested_speed: number | null;
  break_justification: string | null;
  phonetic_notes: TtsPhoneticNote[];
  selected_take_id: string | null;
  created_at: string;
  updated_at: string;
  /** Present when a route includes each segment's takes inline. */
  takes?: TtsDirectorTake[];
};

/** Mirrors the `tts_director_takes` table — one generated variant. */
export type TtsDirectorTake = {
  id: string;
  segment_id: string;
  preset: "natural" | "controlled" | "expressive" | "custom";
  voice_id: string;
  stability: number;
  speed: number;
  text: string;
  status: "ready" | "failed";
  error: string | null;
  output_url: string | null;
  duration_s: number | null;
  char_count: number;
  cost: number;
  created_by: string | null;
  created_at: string;
};

/** Mirrors the `tts_director_selection_events` table — the learning loop's log. */
export type TtsDirectorSelectionEvent = {
  id: string;
  segment_id: string;
  take_id: string;
  voice_id: string;
  outcome: "selected" | "rejected";
  context: { emotion?: string; pace?: string; dialect?: string; register_strength?: number };
  stability: number;
  speed: number;
  created_by: string | null;
  created_at: string;
};

/** Mirrors the `tts_phonetic_dictionary` table. */
export type TtsPhoneticEntry = {
  id: string;
  canonical: string;
  respelling: string;
  dialect: string;
  notes: string | null;
  example_context: string | null;
  source: "seed" | "manual" | "llm_suggested";
  status: "active" | "pending_review" | "rejected";
  usage_count: number;
  created_by: string | null;
  created_at: string;
  updated_at: string;
};
