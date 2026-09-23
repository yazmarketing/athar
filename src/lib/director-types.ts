/** Shared, browser-safe contracts for the Director production workspace. */
export type DirectorKind = "social" | "event" | "motion";
export type DirectorFormat = "9:16" | "16:9" | "1:1" | "4:5";
export type DirectorStyle = "editorial" | "cinematic" | "kinetic" | "minimal";

export type DirectorSettings = {
  format: DirectorFormat;
  duration: number;
  language: string;
  locale: string;
  style: DirectorStyle;
  accent: string;
  brandName: string;
  culturalNotes: string;
  preserveSourceAudio: boolean;
  soundtrackLoop: boolean;
};

export const DIRECTOR_DEFAULTS: DirectorSettings = {
  format: "9:16",
  duration: 30,
  language: "English",
  locale: "",
  style: "editorial",
  accent: "#d4ed87",
  brandName: "",
  culturalNotes: "",
  preserveSourceAudio: true,
  soundtrackLoop: true,
};

export type DirectorAsset = {
  id: string;
  name: string;
  kind: "video" | "image" | "audio";
  url: string;
  thumbnailUrl?: string;
  duration: number;
  width?: number;
  height?: number;
  size: number;
  createdAt: string;
  transcript?: string;
  description?: string;
};

export type DirectorScene = {
  id: string;
  assetId: string | null;
  sourceIn: number;
  duration: number;
  title: string;
  caption: string;
  voiceover: string;
  note: string;
  transition: "cut" | "fade";
  fit: "cover" | "contain";
  locked: boolean;
  background: string;
};

export type DirectorCheck = {
  id: string;
  label: string;
  status: "pass" | "warning" | "pending";
  detail: string;
};

export type DirectorExport = {
  id: string;
  url: string;
  thumbnailUrl?: string;
  format: DirectorFormat;
  width: number;
  height: number;
  duration: number;
  createdAt: string;
  version: number;
};

export type DirectorMessage = {
  id: string;
  role: "user" | "assistant" | "system";
  content: string;
  createdAt: string;
};

export type DirectorVersion = {
  version: number;
  createdAt: string;
  label: string;
  scenes: DirectorScene[];
  settings: DirectorSettings;
};

export type DirectorProject = {
  id: string;
  title: string;
  brief: string;
  kind: DirectorKind;
  settings: DirectorSettings;
  assets: DirectorAsset[];
  scenes: DirectorScene[];
  audioAssetId: string | null;
  audioVolume: number;
  status: "draft" | "planning" | "rendering" | "ready" | "failed";
  stage: string;
  progress: number;
  error: string | null;
  model: string | null;
  version: number;
  messages: DirectorMessage[];
  checks: DirectorCheck[];
  exports: DirectorExport[];
  history: DirectorVersion[];
  createdAt: string;
  updatedAt: string;
  clientId?: string | null;
  projectId?: string | null;
  brandKitId?: string | null;
};

export type DirectorCapabilities = {
  astraConfigured: boolean;
  model: string;
  renderAvailable: boolean;
};

export const DIRECTOR_FORMATS: Record<DirectorFormat, { width: number; height: number; label: string }> = {
  "9:16": { width: 1080, height: 1920, label: "Vertical" },
  "16:9": { width: 1920, height: 1080, label: "Landscape" },
  "1:1": { width: 1080, height: 1080, label: "Square" },
  "4:5": { width: 1080, height: 1350, label: "Portrait" },
};

export function directorDuration(scenes: DirectorScene[]): number {
  return scenes.reduce((total, scene) => total + scene.duration, 0);
}

export function directorTime(seconds: number): string {
  const safe = Math.max(0, Number.isFinite(seconds) ? seconds : 0);
  return `${Math.floor(safe / 60)}:${Math.floor(safe % 60).toString().padStart(2, "0")}`;
}
