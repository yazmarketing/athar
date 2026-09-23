"use client";

import { MotionStudio } from "@/components/motion/motion-studio";
import { useCallback, useEffect, useMemo, useRef, useState, useSyncExternalStore } from "react";
import { toast } from "sonner";
import {
  Aperture,
  ArrowUpToLine,
  AudioLines,
  BarChart3,
  Boxes,
  Check,
  CheckSquare,
  ChevronDown,
  Clapperboard,
  Clock,
  Cpu,
  Film,
  FolderKanban,
  Gem,
  Heart,
  HelpCircle,
  Home,
  Menu,
  ImageIcon,
  Images,
  Library,
  Loader2,
  Mic,
  Moon,
  Paperclip,
  Plus,
  RefreshCw,
  Search,
  ShieldCheck,
  Shuffle,
  Sparkles,
  SquarePen,
  Sun,
  Plug,
  Trash2,
  Users,
  Wand2,
  X,
} from "lucide-react";
import { useTheme } from "next-themes";
import { useSession } from "next-auth/react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { cn, readJson, postJson, postFetch } from "@/lib/utils";
import { prepareVerifiedFaceImage, uploadImageFile } from "@/lib/upload-image";
import { uploadAudioFile } from "@/lib/upload-audio";
import { isVideoFile, uploadVideoFile } from "@/lib/upload-video";
import {
  ChipPopover,
  CameraControlPanel,
  EmotionWheel,
  PacingCards,
  PresetList,
  VisualPresetGrid,
} from "@/components/cinema-studio/controls";
import { AspectIcon } from "@/components/aspect-icon";
import { Slider } from "@/components/ui/slider";
import { Switch } from "@/components/ui/switch";
import { ImageChat } from "@/components/image-chat";
import { ImageDetail } from "@/components/image-detail";
import { Storyboards } from "@/components/storyboard";
import { Transcribe } from "@/components/transcribe";
import { TextToSpeech } from "@/components/text-to-speech";
import { WelcomeCelebration } from "@/components/welcome-celebration";
import {
  OnboardingTour,
  persistTourCompleted,
  shouldRunTour,
  type TourStep,
} from "@/components/onboarding-tour";
import { GenerationRating } from "@/components/generation-rating";
import { activeMentionQuery, mentionToken } from "@/lib/mentions";
import { inferOutputSettings } from "@/lib/prompt-output";
import { SidebarUser } from "@/components/sidebar-user";
import {
  UpscaleDialog,
  fromGeneration,
  type UpscaleSource,
} from "@/components/upscale-dialog";
import { UsagePanel } from "@/components/usage-panel";
import { ClientProjectsWorkspace } from "@/components/client-projects-workspace";
import { VideoDetail } from "@/components/video-detail";
import { SortableThumbs, moveItem } from "@/components/sortable-thumbs";
import {
  GenerationPlaceholderCard,
  JobPlaceholderCard,
} from "@/components/generation-progress";
import {
  VariationsPanel,
  type VaryStrength,
} from "@/components/variations-panel";
import {
  estimateCost,
  listModelOptions,
  listVideoModelOptions,
  resolveModel,
  maxReferenceImages,
  imageModelChoice,
  imageModelCost,
  imageModelIdFromEndpoint,
  imageModelRequest,
  DEFAULT_IMAGE_MODEL_ID,
  type Capability,
  type GoogleImageModelId,
  type OpenAIImageModelId,
  type ImageModelChoice,
  type ImageResolutionOption,
  type Tier,
} from "@/config/models";
import { ImageModelSelect } from "@/components/image-model-select";
import { VideoThumb } from "@/components/video-thumb";
import { ASPECT_RATIOS, isAspectRatio } from "@/config/aspects";
import { STYLE_PRESETS, DEFAULT_STYLE_ID } from "@/config/styles";
import {
  APERTURE_PRESETS,
  CAMERA_BODY_PRESETS,
  CAMERA_PRESETS,
  DEFAULT_CAMERA_ID,
  LENS_PRESETS,
} from "@/config/camera";
import {
  DEFAULT_DIRECTOR_ID,
  EMOTION_PRESETS,
  ERA_PRESETS,
  GENRE_PRESETS,
  GRADE_PRESETS,
  LIGHT_LOOK_PRESETS,
  MONTAGE_PACING_IDS,
  PACING_PRESETS,
  SHOT_PRESETS,
  TEMPO_PRESETS,
} from "@/config/director";
import {
  isImageJob,
  type AspectRatio,
  type BrandKitRecord,
  type ClientRecord,
  type GenerationJobRecord,
  type GenerationRecord,
  type ImageResolution,
  type ProjectRecord,
  type PromptInputs,
  type ReferenceAssetRecord,
  type StylePresetRecord,
  type TranscriptRecord,
  type TtsGenerationRecord,
} from "@/lib/types";
import {
  ACTIVE_CLIENT_STORAGE_KEY,
  ClientPicker,
} from "@/components/client-picker";
import {
  ACTIVE_PROJECT_STORAGE_KEY,
  ProjectPicker,
} from "@/components/project-picker";
import {
  ACTIVE_BRAND_KIT_STORAGE_KEY,
  BrandKitPicker,
} from "@/components/brand-kit-picker";
import { ReferenceLibrary } from "@/components/reference-library";
import { Orchestrator } from "@/components/orchestrator";
import { StudioHome } from "@/components/studio-home";
import { SearchPicker } from "@/components/search-picker";
import { VideoExplore } from "@/components/video-explore";
import { VideoWorkspaceControls, type VideoWorkflow } from "@/components/video-workspace-controls";
import { videoCapabilities, videoUsesFirstFrame, validateVideoSettings } from "@/config/video-capabilities";
import type { VideoRecipe } from "@/config/video-recipes";
import { TeamManagement } from "@/components/team-management";
import { ConfirmDialog } from "@/components/confirm-dialog";
import {
  AssetLibraryDialog,
  type AssetCategory,
  type LibraryAsset,
} from "@/components/asset-library-dialog";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { AtharLogo, ATHAR_LOCKUP_MIN_HEIGHT } from "@/components/athar-logo";
import { Waveform } from "@/components/waveform";
import { YazMediaLogo } from "@/components/yaz-media-logo";
import {
  NotificationsBell,
  type AppNotification,
} from "@/components/notifications-bell";

const RESOLUTIONS: { value: ImageResolution; label: string }[] = [
  { value: "1K", label: "1K" },
  { value: "2K", label: "2K" },
  { value: "4K", label: "4K" },
];

// Seedance 2.0 series accepts up to 9 reference images (2.5 allows more)

/** Seedance 2.5 lip-sync: up to 10 reference audio clips, 30s combined. */

/**
 * Seedance 2.5 subject/motion/style reference clips: up to 10, 30s combined.
 * Distinct from the single `videoEditSource` (v2v edit/extend) — these feed
 * a fresh generation and never lock its duration or aspect ratio.
 */

/** Mention tokens the prompt box tints — split() keeps them via the capture. */
const PROMPT_TOKEN_RE = /(@(?:image|video|audio)\d+\b)/gi;

/**
 * A selected Library card's outer glow — a soft blurred halo peeking out
 * past the rounded corners of the card's own (overflow-hidden) inner box.
 * Shared across every card kind (render/voice/transcript) so "selected"
 * reads the same way everywhere, not just as a plain ring.
 */
function SELECTED_GLOW_CLASS(selected: boolean) {
  return (
    selected &&
    "after:pointer-events-none after:absolute after:-inset-1.5 after:-z-10 after:rounded-[1.25rem] after:bg-gold after:opacity-60 after:blur-lg"
  );
}

/**
 * Overlay and textarea must share this exactly. The Textarea primitive
 * ships `md:text-sm`, which is 14px — one pixel off the overlay's 15px
 * is enough for the caret to sit on the second-last letter.
 */
const PROMPT_FIELD_TYPE =
  "px-3 py-2.5 font-sans text-[15px] leading-6 break-words whitespace-pre-wrap md:text-[15px]";


/** Cinema Studio director picks (video dock). Camera movement stays in `camera`. */
type CinemaControls = {
  cameraBodyId: string;
  lensId: string;
  apertureId: string;
  genreId: string;
  eraId: string;
  shotId: string;
  gradeId: string;
  lightLookId: string;
  emotionId: string;
  tempoId: string;
  pacingId: string;
};

const CINEMA_DEFAULTS: CinemaControls = {
  cameraBodyId: DEFAULT_DIRECTOR_ID,
  lensId: DEFAULT_DIRECTOR_ID,
  apertureId: DEFAULT_DIRECTOR_ID,
  genreId: DEFAULT_DIRECTOR_ID,
  eraId: DEFAULT_DIRECTOR_ID,
  shotId: DEFAULT_DIRECTOR_ID,
  gradeId: DEFAULT_DIRECTOR_ID,
  lightLookId: DEFAULT_DIRECTOR_ID,
  emotionId: DEFAULT_DIRECTOR_ID,
  tempoId: DEFAULT_DIRECTOR_ID,
  pacingId: DEFAULT_DIRECTOR_ID,
};

function presetLabel(
  presets: { id: string; label: string }[],
  id: string
): string {
  const p = presets.find((x) => x.id === id);
  return !p || p.id === "raw" ? "Auto" : p.label;
}
const NOTIFICATIONS_STORAGE_KEY = "yaz-motion-notifications";

/**
 * The dock's live cost estimate, hidden for now. Flip to true to bring the
 * chip back — the onboarding step for it is gated on this too, so the tour
 * never points at an element that isn't rendered.
 */
const SHOW_COST_ESTIMATE = false;


type StudioMode = Extract<Capability, "t2i" | "t2v">;
type SubmitOptions = {
  seed?: number;
  tier?: Tier;
  mode?: StudioMode;
  durationS?: number;
  sourceImages?: { url: string; generationId: string | null }[];
  sourceVideo?: { url: string; generationId: string | null; durationS?: number | null; intent?: "edit" | "extend" | "vary" } | null;
  stayOnView?: boolean;
  imageModel?: GoogleImageModelId | OpenAIImageModelId | "seedream";
  resolution?: ImageResolution;
  longRenderApproved?: boolean;
  duplicatePromptApproved?: boolean;
};

type RenderApproval = {
  kind: "long" | "duplicate";
  prompt: PromptInputs;
  opts: SubmitOptions;
  estimatedCost?: number;
  similarCount?: number;
};
type View =
  | "motion"
  | "home"
  | "create"
  | "library"
  | "edit"
  | "vary"
  | "usage"
  | "assets"
  | "orchestrate"
  | "effects"
  | "storyboard"
  | "transcribe"
  | "tts"
  | "team"
  | "clients";

function isVideo(g: GenerationRecord) {
  return (
    g.mode === "t2v" ||
    g.mode === "i2v" ||
    g.mode === "v2v" ||
    Boolean(g.output_url?.includes(".mp4"))
  );
}

/** First Library page; extra pages come from Load more. Capped on refresh. */
const LIBRARY_PAGE_SIZE = 48;
const LIBRARY_MAX_LIMIT = 240;

/** Poll still-image jobs until they land (used by Create / Vary / Edit). */
async function waitForImageJobs(
  jobs: GenerationJobRecord[],
  allowPartial = false
): Promise<GenerationRecord[]> {
  const pending = new Set(jobs.map((j) => j.id));
  const results: GenerationRecord[] = [];
  let failure: string | null = null;
  const deadline = Date.now() + 8 * 60 * 1000;
  while (pending.size > 0) {
    if (Date.now() > deadline) {
      throw new Error(
        "The render is still working — check Library in a minute"
      );
    }
    await new Promise((r) => setTimeout(r, 3000));
    for (const id of [...pending]) {
      const res = await fetch(`/api/jobs/${id}`);
      const json = (await res.json()) as {
        job?: GenerationJobRecord;
        generation?: GenerationRecord | null;
        error?: string;
      };
      if (!res.ok || !json.job) continue;
      if (json.job.status === "completed") {
        if (json.generation) results.push(json.generation);
        pending.delete(id);
      } else if (
        json.job.status === "failed" ||
        json.job.status === "cancelled"
      ) {
        pending.delete(id);
        failure = json.job.error ?? (json.job.status === "cancelled" ? "Image render cancelled" : "Image render failed");
        if (!allowPartial) throw new Error(failure);
      }
    }
  }
  if (!results.length && failure) throw new Error(failure);
  return results;
}

function subscribeToDesktopSidebar(onChange: () => void) {
  const media = window.matchMedia("(min-width: 768px)");
  media.addEventListener("change", onChange);
  return () => media.removeEventListener("change", onChange);
}

function subscribeToHydration() {
  return () => {};
}

export function Studio() {
  const [selectedView, setView] = useState<View | null>(null);
  const view: View = selectedView ?? "home";
  const currentViewRef = useRef<View>(view);
  useEffect(() => { currentViewRef.current = view; }, [view]);
  useEffect(() => {
    const url = new URL(window.location.href);
    url.searchParams.delete("view");
    window.history.replaceState(null, "", url);
  }, [selectedView]);
  const [mode, setMode] = useState<StudioMode>("t2v");
  const [subject, setSubject] = useState("");
  const [action, setAction] = useState("");
  const [lighting, setLighting] = useState("");
  const [brandTokens, setBrandTokens] = useState("");
  const [negativeAdditions, setNegativeAdditions] = useState("");
  const [tier, setTier] = useState<Tier>("draft");
  // Which still model the dock is on, as an IMAGE_MODEL_CHOICES id. Tier and
  // googleModel below are what the request actually carries; this is the one
  // the picker speaks, so every surface names models the same way.
  const [imageModelId, setImageModelId] = useState<string>(
    DEFAULT_IMAGE_MODEL_ID
  );
  const [googleModel, setGoogleModel] =
    useState<GoogleImageModelId | OpenAIImageModelId | null>(null);
  const [style, setStyle] = useState<string>(DEFAULT_STYLE_ID);
  const [camera, setCamera] = useState<string>(DEFAULT_CAMERA_ID);
  const [clientStyles, setClientStyles] = useState<StylePresetRecord[]>([]);
  const [smartMode, setSmartMode] = useState(false);
  const [smartStage, setSmartStage] = useState<string | null>(null);
  // Each submitted batch owns one continuation into ranking/finishing.
  // The general job poller must not separately surface every candidate.
  const submittedImageJobsRef = useRef(new Set<string>());
  const claimedImageRunsRef = useRef(new Set<string>());
  const [saveStyleOpen, setSaveStyleOpen] = useState(false);
  const [saveStyleName, setSaveStyleName] = useState("");
  const [saveStyleTokens, setSaveStyleTokens] = useState("");
  const [savingStyle, setSavingStyle] = useState(false);
  const [aspect, setAspect] = useState<AspectRatio>("16:9");
  // Last ratio inferred from the prompt. We only move the chip when this
  // *changes* (a pasted 9:16 director block), so a manual 16:9 pick survives
  // further typing in a prompt that still mentions another ratio.
  const lastInferredAspect = useRef<AspectRatio | undefined>(undefined);
  // 1K by default — cheaper and quicker; 2K/4K are a deliberate choice.
  const [resolution, setResolution] = useState<ImageResolution>("2K");
  const [numOutputs, setNumOutputs] = useState(1);
  const [durationS, setDurationS] = useState(5);
  const [videoResolution, setVideoResolution] = useState<
    "480p" | "720p" | "1080p"
  >("480p");
  const [generating, setGenerating] = useState(false);
  const [renderApproval, setRenderApproval] = useState<RenderApproval | null>(null);
  /**
   * Collapses the prompt editor to a slim summary row once Generate is
   * clicked, for the life of the render — not just the ~1s request that
   * queues it (that's what `generating` alone covers). Reset in `openTool`,
   * so every fresh-session entry point (Vary, Edit, Extend, Reuse, a mode
   * switch) still opens with the editor visible.
   */
  const [composerCollapsed, setComposerCollapsed] = useState(false);
  /**
   * What the last generate produced, kept on the Create view until the next
   * run replaces it. Results used to vanish into the Library the moment the
   * detail modal was closed.
   */
  const [lastRun, setLastRun] = useState<GenerationRecord[]>([]);
  const [generations, setGenerations] = useState<GenerationRecord[] | null>(
    null
  );
  /** True while a scope-changing gallery fetch is in flight (see loadGallery). */
  const [galleryLoading, setGalleryLoading] = useState(true);
  const [clients, setClients] = useState<ClientRecord[]>([]);
  const [activeClientId, setActiveClientId] = useState<string | null>(null);
  // Briefly rings the client chip when Generate is pressed with none set, so
  // the eye goes straight to what needs fixing instead of hunting for it.
  const [clientNudge, setClientNudge] = useState(false);
  const [projects, setProjects] = useState<ProjectRecord[]>([]);
  const [activeProjectId, setActiveProjectId] = useState<string | null>(null);
  const [projectsReady, setProjectsReady] = useState(false);
  const [brandKits, setBrandKits] = useState<BrandKitRecord[]>([]);
  const [activeBrandKitId, setActiveBrandKitId] = useState<string | null>(null);
  const [videoJobs, setVideoJobs] = useState<GenerationJobRecord[]>([]);
  const [cancellingJobIds, setCancellingJobIds] = useState<Set<string>>(
    () => new Set()
  );
  const [notifications, setNotifications] = useState<AppNotification[]>([]);
  const [videoDetailTarget, setVideoDetailTarget] =
    useState<GenerationRecord | null>(null);
  const [videoSources, setVideoSources] = useState<
    { url: string; generationId: string | null }[]
  >([]);
  // Existing clip attached as a Seedance reference video (v2v edit/extend/vary)
  const [videoEditSource, setVideoEditSource] = useState<{
    url: string;
    generationId: string | null;
    intent: "edit" | "extend" | "vary";
    durationS?: number | null;
  } | null>(null);
  const [uploadingVideoSource, setUploadingVideoSource] = useState(false);
  const [requestedVideoWorkflow, setVideoWorkflow] = useState<VideoWorkflow>("create");
  const videoWorkflow = videoEditSource ? "edit" : requestedVideoWorkflow;
  const editVideoFileInput = useRef<HTMLInputElement>(null);
  // Subject/motion/style reference clips (Seedance 2.5) — a fresh
  // generation, not an edit source; mutually exclusive with videoEditSource.
  const [videoRefSources, setVideoRefSources] = useState<
    { url: string; generationId: string | null }[]
  >([]);
  const [uploadingVideoRef, setUploadingVideoRef] = useState(false);
  const videoRefFileInput = useRef<HTMLInputElement>(null);
  // Lip-sync reference audio (Seedance 2.5) — url + Whisper transcript
  const [audioSources, setAudioSources] = useState<
    { url: string; name: string; transcript: string | null }[]
  >([]);
  const [uploadingAudio, setUploadingAudio] = useState(false);
  const [assetIdOpen, setAssetIdOpen] = useState(false);
  const [libraryAssets, setLibraryAssets] = useState<
    LibraryAsset[] | null
  >(null);
  const [assetsLoading, setAssetsLoading] = useState(false);
  const assetsRequest = useRef<Promise<void> | null>(null);
  const lastAssetWarning = useRef<string | null>(null);
  const [registeringAsset, setRegisteringAsset] = useState(false);
  const [deletingAssetId, setDeletingAssetId] = useState<string | null>(null);
  const [assetToDelete, setAssetToDelete] = useState<{
    id: string;
    name: string;
  } | null>(null);
  const videoFileInput = useRef<HTMLInputElement>(null);
  const audioFileInput = useRef<HTMLInputElement>(null);
  const [upscaleTargets, setUpscaleTargets] = useState<
    UpscaleSource[] | null
  >(null);
  const [assetsReload, setAssetsReload] = useState(0);
  const [assetCatalog, setAssetCatalog] = useState<ReferenceAssetRecord[]>([]);
  const [selectMode, setSelectMode] = useState(false);
  const [selectedIds, setSelectedIds] = useState<string[]>([]);
  const [bulkDeleteOpen, setBulkDeleteOpen] = useState(false);
  const [bulkDeleting, setBulkDeleting] = useState(false);
  const [typeFilter, setTypeFilter] = useState<
    "all" | "image" | "video" | "voice" | "transcript"
  >("all");
  const [libraryVoices, setLibraryVoices] = useState<TtsGenerationRecord[] | null>(null);
  const [libraryTranscripts, setLibraryTranscripts] = useState<TranscriptRecord[] | null>(
    null
  );
  const [voiceDetailTarget, setVoiceDetailTarget] = useState<TtsGenerationRecord | null>(
    null
  );
  /** Every version of the group voiceDetailTarget belongs to, newest first. */
  const [voiceDetailVersions, setVoiceDetailVersions] = useState<TtsGenerationRecord[]>([]);
  /** Set by "Continue editing" in the Library voice modal, consumed once by the Voice page. */
  const [continueVoiceGeneration, setContinueVoiceGeneration] =
    useState<TtsGenerationRecord | null>(null);
  /** Set right before switching to Transcribe from a Library transcript card. */
  const [libraryOpenTranscriptId, setLibraryOpenTranscriptId] = useState<string | null>(
    null
  );
  /** "all" | "mine" | a specific team member's user id (admins only). */
  const [ownerFilter, setOwnerFilter] = useState<string>("all");
  const [ownerFilterName, setOwnerFilterName] = useState<string | null>(null);
  const [teamMembers, setTeamMembers] = useState<
    { id: string; name: string | null; email: string }[] | null
  >(null);
  const [teamMembersLoading, setTeamMembersLoading] = useState(false);
  const loadTeamMembers = () => {
    if (teamMembers !== null || teamMembersLoading) return;
    setTeamMembersLoading(true);
    void fetch("/api/users")
      .then((res) => res.json())
      .then((json) => setTeamMembers(json.users ?? []))
      .catch(() => setTeamMembers([]))
      .finally(() => setTeamMembersLoading(false));
  };
  const [ownerSearchQuery, setOwnerSearchQuery] = useState("");
  /** Favourites are marked on cards; this is how you actually get to them. */
  const [favoritesOnly, setFavoritesOnly] = useState(false);
  const [sortOrder, setSortOrder] = useState<"newest" | "oldest">("newest");
  const [galleryHasMore, setGalleryHasMore] = useState(false);
  const [galleryLoadingMore, setGalleryLoadingMore] = useState(false);
  const [detailsOpen, setDetailsOpen] = useState(false);
  /** Cinema Studio: director chips stay hidden until this is on. */
  const [cinemaOn, setCinemaOn] = useState(false);
  const [cinema, setCinema] = useState<CinemaControls>(CINEMA_DEFAULTS);
  const [generateAudio, setGenerateAudio] = useState(true);
  const [query, setQuery] = useState("");
  const [searchQ, setSearchQ] = useState("");
  const [referenceUrls, setReferenceUrls] = useState<string[]>([]);
  /**
   * Friendly names for attached references, keyed by URL. Only library picks
   * have one; a drag-and-dropped file is just "image 2" in the @ menu.
   */
  const [referenceNames, setReferenceNames] = useState<Record<string, string>>(
    {}
  );
  /** The `@…` the caret is inside, and where to put the menu. */
  const [mention, setMention] = useState<{
    start: number;
    end: number;
    query: string;
  } | null>(null);
  const [mentionIndex, setMentionIndex] = useState(0);
  const promptRef = useRef<HTMLTextAreaElement>(null);
  const promptHighlightRef = useRef<HTMLDivElement>(null);
  const [uploadingRef, setUploadingRef] = useState(false);
  const [dragOver, setDragOver] = useState(false);
  const [editTarget, setEditTarget] = useState<GenerationRecord | null>(null);
  const [varyTarget, setVaryTarget] = useState<GenerationRecord | null>(null);
  const [detailTarget, setDetailTarget] = useState<GenerationRecord | null>(
    null
  );
  const [connectionsOpen, setConnectionsOpen] = useState(false);
  const [tourOpen, setTourOpen] = useState(false);
  const [welcomeOpen, setWelcomeOpen] = useState(false);
  const [refAdviceOpen, setRefAdviceOpen] = useState(false);
  const [refAdviceDismissed, setRefAdviceDismissed] = useState(false);

  /**
   * True when the prompt names something the model can only approximate —
   * a logo, wordmark or named person — and nothing has been attached to
   * anchor it. Attaching the real artwork is the difference between the
   * actual mark and a misspelled lookalike.
   */
  const needsReferenceAsset = () => {
    if (mode !== "t2i") return false;
    if (referenceUrls.length > 0) return false;
    const text = `${subject} ${brandTokens}`.toLowerCase();
    return /\b(logo|wordmark|brand ?mark|emblem|insignia|monogram|crest|badge|watermark)\b/.test(
      text
    );
  };
  const [sidebarOpen, setSidebarOpen] = useState(false);
  const sidebarRef = useRef<HTMLElement>(null);
  const menuButtonRef = useRef<HTMLButtonElement>(null);
  const isDesktopSidebar = useSyncExternalStore(
    subscribeToDesktopSidebar,
    () => window.matchMedia("(min-width: 768px)").matches,
    () => false
  );

  useEffect(() => {
    if (!sidebarOpen || isDesktopSidebar) return;
    const sidebar = sidebarRef.current;
    const menuButton = menuButtonRef.current;
    if (!sidebar) return;
    const focusable = () => Array.from(sidebar.querySelectorAll<HTMLElement>(
      'button:not([disabled]), a[href], input:not([disabled]), [tabindex="0"]'
    )).filter((element) => element.getClientRects().length > 0);
    const frame = window.requestAnimationFrame(() => focusable()[0]?.focus());
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === "Escape" && !sidebar.querySelector('[role="menu"]')) {
        event.preventDefault();
        setSidebarOpen(false);
      }
      if (event.key !== "Tab") return;
      const elements = focusable();
      const first = elements[0];
      const last = elements[elements.length - 1];
      if (event.shiftKey && document.activeElement === first) {
        event.preventDefault();
        last?.focus();
      } else if (!event.shiftKey && document.activeElement === last) {
        event.preventDefault();
        first?.focus();
      }
    };
    sidebar.addEventListener("keydown", onKeyDown);
    return () => {
      window.cancelAnimationFrame(frame);
      sidebar.removeEventListener("keydown", onKeyDown);
      if (!window.matchMedia("(min-width: 768px)").matches) menuButton?.focus();
    };
  }, [sidebarOpen, isDesktopSidebar]);

  /**
   * Onboarding walks the generate bar, and those controls only render on the
   * Create view in image mode — so put the app there before opening it.
   */
  const startTour = useCallback(() => {
    setView("create");
    setMode("t2i");
    setTourOpen(true);
  }, []);

  const [generateMenuOpen, setGenerateMenuOpen] = useState(false);
  const generateButtonRef = useRef<HTMLButtonElement>(null);
  const generateMenuRef = useRef<HTMLDivElement>(null);
  useEffect(() => {
    if (!generateMenuOpen) return;
    const frame = window.requestAnimationFrame(() => {
      generateMenuRef.current?.querySelector<HTMLButtonElement>('[role="menuitem"]')?.focus();
    });
    return () => window.cancelAnimationFrame(frame);
  }, [generateMenuOpen]);
  const [refLibOpen, setRefLibOpen] = useState(false);
  const [referenceChooserOpen, setReferenceChooserOpen] = useState(false);
  const [saveRefUrl, setSaveRefUrl] = useState<string | null>(null);
  const [saveRefName, setSaveRefName] = useState("");
  const [saveRefKind, setSaveRefKind] = useState("character");
  const [saveRefClientId, setSaveRefClientId] = useState<string | null>(null);
  const [saveRefProjectId, setSaveRefProjectId] = useState<string | null>(null);
  const [savingRef, setSavingRef] = useState(false);
  const [connectionStatus, setConnectionStatus] = useState<{
    modelArk: boolean;
    spaces: boolean;
    database: "ok" | "error" | "missing";
  } | null>(null);
  const [statusLoading, setStatusLoading] = useState(false);
  const { resolvedTheme, setTheme } = useTheme();
  const { data: session } = useSession();
  const isManagement = session?.user?.role === "admin";

  /**
   * Move the dock onto a model, keeping everything that depends on it honest:
   * the tier/provider the request carries, the resolution (4K exists on some
   * models only) and the references it can actually fuse.
   */
  const applyImageModel = (id: string, choice: ImageModelChoice) => {
    if (referenceUrls.length > choice.maxReferenceImages) {
      toast.error(`Remove extra references first. ${choice.label} accepts ${choice.maxReferenceImages}.`);
      return false;
    }
    setImageModelId(id);
    setGoogleModel(choice.imageModel);
    if (choice.tier) setTier(choice.tier);
    if (!choice.resolutions.includes(resolution as ImageResolutionOption)) {
      setResolution(choice.resolutions[choice.resolutions.length - 1]);
    }
    return true;
  };

  /**
   * References the selected model will actually fuse. Seedream takes 8; Nano
   * Banana Pro holds consistency across 14. The dock matches the API cap so it
   * never accepts an image the request would quietly drop.
   */
  const maxRefs =
    imageModelChoice(imageModelId)?.maxReferenceImages ??
    maxReferenceImages(googleModel);
  const videoCaps = videoCapabilities(tier);
  const MAX_VIDEO_IMAGES = videoCaps.maxImages;
  const MAX_REFERENCE_VIDEOS = videoCaps.maxVideos;
  const firstFrame = videoUsesFirstFrame(videoSources.map(s => s.url), [...videoRefSources.map(s => s.url), ...(videoEditSource ? [videoEditSource.url] : [])], audioSources.map(s => s.url));
  const videoRatioLocked = videoWorkflow === "edit" || (tier !== "draft" && firstFrame);
  const selectVideoTier = (next: Tier) => {
    const error = validateVideoSettings({ tier: next, images: videoSources.map(s => s.url), videos: videoRefSources.map(s => s.url), audios: audioSources.map(s => s.url), source: videoEditSource?.url });
    if (error) { toast.error(error); return; }
    const caps = videoCapabilities(next);
    setTier(next);
    setDurationS(d => Math.min(d, caps.maxDuration));
    if (!(caps.resolutions as readonly string[]).includes(videoResolution)) setVideoResolution("720p");
  };

  /**
   * Live cost estimate for the current dock settings. The Google models are
   * priced per image outside the tiered registry, so they're handled
   * separately.
   */
  const estimatedCost = useMemo(() => {
    if (!SHOW_COST_ESTIMATE) return null;
    // The dock only ever drives t2i or t2v; i2v/v2v are entered from an
    // existing asset and priced on their own paths.
    if (mode === "t2i") {
      return imageModelCost(
        imageModelId,
        resolution as ImageResolutionOption,
        numOutputs
      );
    }
    try {
      return estimateCost("t2v", tier, { numOutputs: 1, durationS });
    } catch {
      // Unknown tier/capability pairing — better to show nothing than a wrong
      // number the team might budget against.
      return null;
    }
  }, [mode, tier, imageModelId, resolution, numOutputs, durationS]);


  /**
   * Onboarding: how to actually make something, in the order you'd do it.
   * Steps declare the view they need via `onEnter`; role-gated steps are
   * filtered out here rather than guessed at from the DOM.
   */
  const tourSteps = useMemo<TourStep[]>(() => {
    const toCreate = () => {
      setView("create");
      setMode("t2i");
      // On mobile the drawer would sit on top of the dock being explained.
      setSidebarOpen(false);
    };
    /** Steps that point at the sidebar need it on-screen to be highlightable. */
    const toSidebar = () => setSidebarOpen(true);
    const steps: TourStep[] = [
      {
        target: "new-generation",
        title: "Start a new generation",
        body: "This is the way in. The dropdown picks what you're making — Image for stills, Video for a clip, and the image-to-video and edit options for building on something you already have. Each one opens the same dock, tuned for that job.",
        placement: "right",
        onEnter: toSidebar,
      },
      {
        target: "prompt",
        title: "Describe the shot",
        body: "Plain language, like a brief to a photographer: subject, setting, lighting, mood. No prompt syntax to learn — Athar structures it for you. ⌘↵ generates.",
        placement: "top",
        onEnter: toCreate,
      },
      {
        target: "client",
        title: "Who it's for — required",
        body: "Every generation is attributed to a client, so nothing lands unfiled and cost reporting stays accurate. Generate stays disabled until one is set. Create or rename clients from this same menu.",
        placement: "top",
        onEnter: toCreate,
      },
      {
        target: "project",
        title: "Group it into a project — optional",
        body: "Projects keep one campaign's shots together. Set one and everything you make is tagged to it; leave it as “No project” for quick one-offs.",
        placement: "top",
        onEnter: toCreate,
      },
      {
        target: "brand-kit",
        title: "Lock the brand — optional",
        body: "A brand kit carries the client's palette, tone and the things to avoid. Attach one and every prompt inherits it, so you're not retyping brand rules each time.",
        placement: "top",
        onEnter: toCreate,
      },
      {
        target: "model",
        title: "Pick the model",
        body: "Draft is fast and cheap for exploring. Standard is the everyday default. Hero costs more and is worth it for finals. Nano Banana is best at edits and text. Not sure? Leave it — Athar suggests a better fit when your prompt calls for one.",
        placement: "top",
        onEnter: toCreate,
      },
      {
        target: "style",
        title: "Set the look",
        body: "A style preset steers the whole aesthetic — photographic, cinematic, editorial and so on. Saved looks for this client appear at the top of the list.",
        placement: "top",
        onEnter: toCreate,
      },
      {
        target: "save-look",
        title: "Save look",
        body: "Landed on an aesthetic that works for this client? Save it as a named preset and the whole team can pick it from the style menu instead of recreating it.",
        placement: "top",
        onEnter: toCreate,
      },
      {
        target: "output",
        title: "Aspect, resolution, how many",
        body: "Set the frame, the output size, and how many variations to render in one go. More variations costs more, but gives you options to choose between.",
        placement: "top",
        onEnter: toCreate,
      },
      {
        target: "smart",
        title: "Smart mode",
        body: "Turn this on and Athar runs the batch, picks the strongest frame, upscales it, and brand-checks it against the kit — automatically, in one pass.",
        placement: "top",
        onEnter: toCreate,
      },
      {
        target: "prompt-details",
        title: "Creative details",
        body: "Add action, lighting and brand direction here when your image needs it. The controls stay with your prompt; no separate editor is needed.",
        placement: "top",
        onEnter: toCreate,
      },
      {
        target: "generate",
        title: "Generate",
        body: "Renders your shot. Stills come back in seconds; video takes longer and keeps working in the background, so you can carry on elsewhere.",
        placement: "top",
        onEnter: toCreate,
      },
      {
        target: "notifications",
        title: "Notifications",
        body: "Long video renders finish here. The bell tells you when a job is done — click through to jump straight to the result.",
        placement: "bottom",
        onEnter: toCreate,
      },
      {
        target: "search",
        title: "Search your back catalogue",
        body: "Searches across every generation's prompt, mode and model — so “camel dune” or “seedance” finds the shot you half-remember. Pair it with the filters beside it to narrow by client, project, type or favourites.",
        placement: "bottom",
        onEnter: () => {
          setView("library");
          setSidebarOpen(false);
        },
      },
      {
        target: "library",
        title: "Everything lands here",
        body: "The Library holds every generation. Favourite the keepers and filter to them, and open any image to upscale, cut the background, or download it.",
        placement: "right",
        onEnter: toSidebar,
      },
      {
        target: "campaign",
        onEnter: toSidebar,
        title: "A whole campaign at once",
        body: "Campaign takes one brief and fans it out into a full set of on-brand shots, instead of prompting them one at a time.",
        placement: "right",
      },
      {
        target: "storyboard",
        onEnter: toSidebar,
        title: "Storyboard the piece",
        body: "For anything with a sequence — a film, a reel, an ad — plan it here first. The brief breaks into numbered frames you can rewrite and reorder, each with its own camera move, and the whole board renders anchored to one look. Animate any frame into a clip when it's right.",
        placement: "right",
      },
      {
        target: "transcribe",
        onEnter: toSidebar,
        title: "Turn talking into text",
        body: "Drop in a video and get the voice-over back as timecoded text \u2014 down to the word, so clicking any word jumps the player to it. Correct a line by double-clicking it, search across every recording the studio has, and export subtitles or a clean script. It also reads the piece for you: summary, chapters, and the clips worth cutting. The audio is pulled out in your browser, so only a few MB is ever sent.",
        placement: "right",
      },
    ];

    if (isManagement) {
      steps.push({
        target: "usage",
        onEnter: toSidebar,
        title: "What it's costing",
        body: "Usage tracks spend by model, project and person, so you can see what a campaign actually cost to produce.",
        placement: "right",
      });
    }

    steps.push({
      target: "help",
      onEnter: toSidebar,
      title: "That's it — go make something",
      body: "Replay this walkthrough any time from this button. It stays here even after you finish.",
      placement: "top",
    });

    return steps;
  }, [isManagement]);
  const firstName =
    (session?.user?.name || session?.user?.email?.split("@")[0] || "")
      .trim()
      .split(/\s+/)[0] || "there";
  const themeReady = useSyncExternalStore(subscribeToHydration, () => true, () => false);
  const refFileInput = useRef<HTMLInputElement>(null);
  const dragDepth = useRef(0);

  const model = useMemo(() => resolveModel(mode, tier), [mode, tier]);
  const modelOptions = useMemo(() => mode === "t2v" ? listVideoModelOptions() : listModelOptions(mode), [mode]);
  const selectedModelLabel =
    modelOptions.find((m) => m.tier === tier)?.label ?? modelOptions.find((m) => m.slug === model.slug)?.label ?? model.slug;
  const selectedStyleLabel =
    clientStyles.find((s) => s.id === style)?.name ??
    STYLE_PRESETS.find((s) => s.id === style)?.label ??
    "Style";
  const selectedCameraLabel =
    CAMERA_PRESETS.find((c) => c.id === camera)?.label ?? "Camera";
  const openTool = (
    next: StudioMode,
    seed?: Partial<PromptInputs> | null
  ) => {
    setMode(next);
    if (next === "t2i") {
      const choice = imageModelChoice(imageModelId);
      if (choice) {
        setGoogleModel(choice.imageModel);
        if (choice.tier) setTier(choice.tier);
        if (!choice.resolutions.includes(resolution as ImageResolutionOption)) setResolution(choice.resolutions[choice.resolutions.length - 1]);
      }
    }
    if (next === "t2v") {
      // Iteration is intentionally cheap and quick by default. Longer,
      // premium settings remain an explicit choice and are guarded server-side.
      setTier("draft");
      setDurationS(5);
      setVideoResolution("480p");
      setGoogleModel(null);
      setImageModelId(DEFAULT_IMAGE_MODEL_ID);
      // 4K rides with Nano Banana Pro; video has its own resolution control.
      if (resolution === "4K") setResolution("2K");
    }
    if (next === "t2v") setNumOutputs(1);
    setSubject(seed?.subject ?? "");
    setAction(seed?.action ?? "");
    setLighting(seed?.lighting ?? "");
    setBrandTokens(seed?.brandTokens ?? "");
    setNegativeAdditions(seed?.negativeAdditions ?? "");
    setStyle(seed?.styleId ?? DEFAULT_STYLE_ID);
    setCamera(seed?.cameraId ?? DEFAULT_CAMERA_ID);
    setReferenceUrls([]);
    setLastRun([]);
    setVideoSources([]);
    setVideoRefSources([]);
    setVideoEditSource(null);
    setVideoWorkflow("create");
    setAudioSources([]);
    setReferenceNames({});
    setCinema({
      ...CINEMA_DEFAULTS,
      genreId: seed?.genreId ?? DEFAULT_DIRECTOR_ID,
      cameraBodyId: seed?.cameraBodyId ?? DEFAULT_DIRECTOR_ID,
      lensId: seed?.lensId ?? DEFAULT_DIRECTOR_ID,
      apertureId: seed?.apertureId ?? DEFAULT_DIRECTOR_ID,
      eraId: seed?.eraId ?? DEFAULT_DIRECTOR_ID,
      shotId: seed?.shotId ?? DEFAULT_DIRECTOR_ID,
      gradeId: seed?.gradeId ?? DEFAULT_DIRECTOR_ID,
      lightLookId: seed?.lightLookId ?? DEFAULT_DIRECTOR_ID,
      emotionId: seed?.emotionId ?? DEFAULT_DIRECTOR_ID,
      tempoId: seed?.tempoId ?? DEFAULT_DIRECTOR_ID,
      pacingId: seed?.pacingId ?? DEFAULT_DIRECTOR_ID,
    });
    setCinemaOn(Boolean(seed?.genreId || seed?.eraId || seed?.shotId || seed?.gradeId || seed?.lightLookId || seed?.emotionId || seed?.tempoId || seed?.pacingId || seed?.cameraBodyId || seed?.lensId || seed?.apertureId));
    setDetailsOpen(
      Boolean(
        seed?.action ||
          seed?.lighting ||
          seed?.brandTokens ||
          seed?.negativeAdditions
      )
    );
    setGenerateAudio(true);
    if (next === "t2v" && aspect === "4:5") setAspect("9:16");
    setComposerCollapsed(false);
    setView("create");
  };

  // Keep the ratio chip in step with a director prompt that already names
  // it ("9:16 vertical"). Only update when the inferred ratio *changes*, so
  // picking 16:9 by hand is not undone by the next keystroke. Duration stays
  // on the dock chip — camera timestamps are direction, not a length override.
  useEffect(() => {
    const inferred = inferOutputSettings(subject);
    if (inferred.aspect && inferred.aspect !== lastInferredAspect.current) {
      lastInferredAspect.current = inferred.aspect;
      setAspect(inferred.aspect);
    } else if (!inferred.aspect) {
      lastInferredAspect.current = undefined;
    }
  }, [subject]);

  useEffect(() => {
    const nextQuery = query.trim();
    const t = window.setTimeout(
      () => setSearchQ(nextQuery),
      nextQuery ? 300 : 0
    );
    return () => window.clearTimeout(t);
  }, [query]);

  const generationsLenRef = useRef(0);
  useEffect(() => {
    generationsLenRef.current = generations?.length ?? 0;
  }, [generations?.length]);
  const gallerySeq = useRef(0);

  const gallerySearchParams = useCallback(() => {
    const params = new URLSearchParams();
    if (activeProjectId) params.set("projectId", activeProjectId);
    // A generation's client comes through its project, so the server has to
    // resolve it — filtering here would only ever see the rows it fetched.
    if (activeClientId) params.set("clientId", activeClientId);
    if (ownerFilter !== "all") params.set("createdBy", ownerFilter);
    if (sortOrder === "oldest") params.set("sort", "oldest");
    if (typeFilter === "image" || typeFilter === "video") {
      params.set("type", typeFilter);
    }
    if (favoritesOnly) params.set("favorites", "1");
    if (searchQ) params.set("q", searchQ);
    return params;
  }, [
    activeProjectId,
    activeClientId,
    ownerFilter,
    sortOrder,
    typeFilter,
    favoritesOnly,
    searchQ,
  ]);

  const openRecipe = (recipe: VideoRecipe) => {
    openTool("t2v", recipe.prompt);
    setCinemaOn(true);
    setSidebarOpen(false);
    toast.success(`${recipe.title} loaded. Edit the subject or add a reference before generating.`);
    window.requestAnimationFrame(() => promptRef.current?.focus());
  };

  /**
   * `showLoader` is for reloads that change which generations are in scope
   * (project / client / owner / sort / type / favourites). Those must show
   * the loader, otherwise the previous result set stays on screen — and if
   * it was empty the user reads "No matches" until the new rows appear.
   *
   * Background refreshes after a generation finishes deliberately pass
   * nothing, so the grid updates in place without flashing a spinner. Those
   * keep the already-loaded window so Load more is not thrown away.
   */
  const loadGallery = useCallback(async (opts: { showLoader?: boolean } = {}) => {
    const seq = ++gallerySeq.current;
    if (opts.showLoader) setGalleryLoading(true);
    setGalleryLoadingMore(false);
    try {
      const params = gallerySearchParams();
      if (!opts.showLoader) {
        const keep = Math.min(
          LIBRARY_MAX_LIMIT,
          Math.max(LIBRARY_PAGE_SIZE, generationsLenRef.current)
        );
        if (keep > LIBRARY_PAGE_SIZE) params.set("limit", String(keep));
      }
      const qs = params.size ? `?${params.toString()}` : "";
      const res = await fetch(`/api/generations${qs}`);
      const json = await res.json();
      if (!res.ok) throw new Error(json.error);
      if (seq !== gallerySeq.current) return;
      setGenerations(
        Array.isArray(json.generations) ? json.generations : []
      );
      setGalleryHasMore(Boolean(json.hasMore));
      // Keep the sidebar's per-project item counts in sync with the gallery,
      // scoped to the active client so the project list stays consistent.
      try {
        if (!activeClientId) {
          setProjects([]);
          setActiveProjectId(null);
          return;
        }
        const pQs = `?clientId=${encodeURIComponent(activeClientId)}`;
        const resProjects = await fetch(`/api/projects${pQs}`);
        const jsonProjects = await resProjects.json();
        if (resProjects.ok && seq === gallerySeq.current) {
          setProjects(jsonProjects.projects);
        }
      } catch {
        // counts refresh is best-effort
      }
    } catch (err) {
      if (seq !== gallerySeq.current) return;
      toast.error(err instanceof Error ? err.message : "Failed to load gallery");
      setGenerations([]);
      setGalleryHasMore(false);
    } finally {
      if (opts.showLoader && seq === gallerySeq.current) {
        setGalleryLoading(false);
      }
    }
  }, [gallerySearchParams, activeClientId]);

  const loadMoreGallery = useCallback(async () => {
    if (galleryLoadingMore || !galleryHasMore) return;
    const offset = generationsLenRef.current;
    if (offset === 0) return;
    const seq = gallerySeq.current;
    setGalleryLoadingMore(true);
    try {
      const params = gallerySearchParams();
      params.set("offset", String(offset));
      const res = await fetch(`/api/generations?${params.toString()}`);
      const json = await res.json();
      if (!res.ok) throw new Error(json.error);
      if (seq !== gallerySeq.current) return;
      const incoming = (json.generations as GenerationRecord[]) ?? [];
      setGenerations((prev) => {
        const seen = new Set((prev ?? []).map((g) => g.id));
        return [...(prev ?? []), ...incoming.filter((g) => !seen.has(g.id))];
      });
      setGalleryHasMore(Boolean(json.hasMore));
    } catch (err) {
      if (seq !== gallerySeq.current) return;
      toast.error(err instanceof Error ? err.message : "Could not load more");
    } finally {
      if (seq === gallerySeq.current) setGalleryLoadingMore(false);
    }
  }, [galleryHasMore, galleryLoadingMore, gallerySearchParams]);

  /**
   * Voice-overs and transcripts for the Library — same scope rules as
   * loadGallery, but only Library actually needs them (Create's gallery
   * strip is images/videos only, so this stays off that path).
   */
  const loadLibraryExtras = useCallback(async () => {
    const params = new URLSearchParams();
    if (activeProjectId) params.set("projectId", activeProjectId);
    if (activeClientId) params.set("clientId", activeClientId);
    if (ownerFilter !== "all") params.set("owner", ownerFilter);
    const qs = params.size ? `?${params.toString()}` : "";
    try {
      const [ttsRes, transcriptsRes] = await Promise.all([
        fetch(`/api/tts${qs}`),
        fetch(`/api/transcripts${qs}`),
      ]);
      const ttsJson = await ttsRes.json().catch(() => ({}));
      const transcriptsJson = await transcriptsRes.json().catch(() => ({}));
      setLibraryVoices(ttsRes.ok ? (ttsJson.generations ?? []) : []);
      setLibraryTranscripts(transcriptsRes.ok ? (transcriptsJson.transcripts ?? []) : []);
    } catch {
      setLibraryVoices([]);
      setLibraryTranscripts([]);
    }
  }, [activeProjectId, activeClientId, ownerFilter]);

  useEffect(() => {
    if (view !== "library") return;
    // Coalesce rapid scope switches before starting an external request.
    const frame = window.requestAnimationFrame(() => void loadLibraryExtras());
    return () => window.cancelAnimationFrame(frame);
  }, [view, loadLibraryExtras]);

  useEffect(() => {
    if (view !== "create") return;
    const params = new URLSearchParams();
    if (activeClientId) params.set("clientId", activeClientId);
    const qs = params.size ? `?${params.toString()}` : "";
    let cancelled = false;
    void fetch(`/api/reference-assets${qs}`)
      .then((res) => res.json())
      .then((json: { references?: ReferenceAssetRecord[] }) => {
        if (!cancelled) setAssetCatalog(json.references ?? []);
      })
      .catch(() => {
        if (!cancelled) setAssetCatalog([]);
      });
    return () => {
      cancelled = true;
    };
  }, [view, activeClientId, assetsReload]);

  useEffect(() => {
    // Restore browser-only selections after hydration. A cancelled mount
    // must not start a gallery request using partially restored context.
    const restoreFrame = window.requestAnimationFrame(() => {
    const storedClient = localStorage.getItem(ACTIVE_CLIENT_STORAGE_KEY);
    if (storedClient) setActiveClientId(storedClient);
    const stored = localStorage.getItem(ACTIVE_PROJECT_STORAGE_KEY);
    if (stored) setActiveProjectId(stored);
    const storedKit = localStorage.getItem(ACTIVE_BRAND_KIT_STORAGE_KEY);
    if (storedKit) setActiveBrandKitId(storedKit);
    try {
      const rawNotifs = localStorage.getItem(NOTIFICATIONS_STORAGE_KEY);
      if (rawNotifs) {
        setNotifications(JSON.parse(rawNotifs) as AppNotification[]);
      }
    } catch {
      // corrupted storage — start fresh
    }
    setProjectsReady(true);
    });

    let cancelled = false;
    let waitForAnchors = 0;
    void shouldRunTour().then((run) => {
      if (cancelled || !run) return;
      setView("create");
      setMode("t2i");
      let tries = 0;
      waitForAnchors = window.setInterval(() => {
        if (document.querySelector('[data-tour="prompt"]')) {
          window.clearInterval(waitForAnchors);
          if (!cancelled) setTourOpen(true);
        } else if (++tries > 40) {
          window.clearInterval(waitForAnchors);
        }
      }, 100);
    });

    // Clients belong to the whole app, not to the generate dock. They used to
    // be fetched only by the ClientPicker, which lives inside the dock and is
    // mounted only on the Create view — so anything else needing the list
    // (Storyboard's client dropdown) found it empty.
    void (async () => {
      try {
        const res = await fetch("/api/clients", { cache: "no-store" });
        const json = await res.json();
        if (!cancelled && res.ok) setClients(json.clients as ClientRecord[]);
      } catch {
        // The pickers still work; they just start empty until a retry.
      }
    })();

    return () => {
      cancelled = true;
      window.cancelAnimationFrame(restoreFrame);
      window.clearInterval(waitForAnchors);
    };
  }, []);

  useEffect(() => {
    if (!projectsReady) return;
    localStorage.setItem(
      NOTIFICATIONS_STORAGE_KEY,
      JSON.stringify(notifications)
    );
  }, [notifications, projectsReady]);

  // User switched client — clear stale project/kit selections that belong to
  // the previous client. (Restoring from storage sets the id directly, so this
  // only fires on an actual click, not on initial load.)
  const onActiveClientChange = useCallback((id: string | null) => {
    setActiveClientId(id);
    setActiveProjectId(null);
    setActiveBrandKitId(null);
  }, []);

  const pushNotification = useCallback(
    (n: Omit<AppNotification, "id" | "createdAt" | "read">) => {
      setNotifications((prev) =>
        [
          {
            ...n,
            id: crypto.randomUUID(),
            createdAt: Date.now(),
            read: false,
          },
          ...prev,
        ].slice(0, 30)
      );
    },
    []
  );

  useEffect(() => {
    if (!projectsReady) return;
    if (activeClientId) {
      localStorage.setItem(ACTIVE_CLIENT_STORAGE_KEY, activeClientId);
    } else {
      localStorage.removeItem(ACTIVE_CLIENT_STORAGE_KEY);
    }
  }, [activeClientId, projectsReady]);

  useEffect(() => {
    if (!projectsReady) return;
    if (activeProjectId) {
      localStorage.setItem(ACTIVE_PROJECT_STORAGE_KEY, activeProjectId);
    } else {
      localStorage.removeItem(ACTIVE_PROJECT_STORAGE_KEY);
    }
  }, [activeProjectId, projectsReady]);

  useEffect(() => {
    if (!projectsReady) return;
    if (activeBrandKitId) {
      localStorage.setItem(ACTIVE_BRAND_KIT_STORAGE_KEY, activeBrandKitId);
    } else {
      localStorage.removeItem(ACTIVE_BRAND_KIT_STORAGE_KEY);
    }
  }, [activeBrandKitId, projectsReady]);

  const activeProject = useMemo(
    () => projects.find((p) => p.id === activeProjectId) ?? null,
    [projects, activeProjectId]
  );

  const activeClient = useMemo(
    () => clients.find((c) => c.id === activeClientId) ?? null,
    [clients, activeClientId]
  );

  // Load the active client's saved style presets for the Style dropdown.
  useEffect(() => {
    void (async () => {
      try {
        const qs = activeClientId
          ? `?clientId=${encodeURIComponent(activeClientId)}`
          : "";
        const res = await fetch(`/api/style-presets${qs}`);
        const json = await res.json();
        if (res.ok) setClientStyles(json.presets as StylePresetRecord[]);
      } catch {
        // best-effort — dropdown just shows the built-in looks
      }
    })();
  }, [activeClientId]);

  const activeClientStyle = useMemo(
    () => clientStyles.find((s) => s.id === style) ?? null,
    [clientStyles, style]
  );

  const activeVideoJobs = useMemo(
    () =>
      videoJobs.filter(
        (j) => j.status === "running" || j.status === "queued"
      ),
    [videoJobs]
  );

  // Restore in-flight / recently failed video renders after a refresh
  useEffect(() => {
    void (async () => {
      try {
        const res = await fetch("/api/jobs?limit=10");
        const json = await res.json();
        if (!res.ok) return;
        const dayAgo = Date.now() - 24 * 3600 * 1000;
        setVideoJobs(
          (json.jobs as GenerationJobRecord[]).filter(
            (j) =>
              j.status === "running" ||
              j.status === "queued" ||
              (j.status === "failed" &&
                new Date(j.created_at).getTime() > dayAgo)
          )
        );
      } catch {
        // jobs list is a convenience — ignore load errors
      }
    })();
  }, []);

  const activeJobsKey = useMemo(
    () =>
      videoJobs
        .filter((j) => j.status === "running" || j.status === "queued")
        .map((j) => j.id)
        .join(","),
    [videoJobs]
  );

  // Poll active jobs; the status endpoint finalizes finished renders
  useEffect(() => {
    if (!activeJobsKey) return;
    const ids = activeJobsKey.split(",");
    const tick = async () => {
      for (const id of ids) {
        try {
          const res = await fetch(`/api/jobs/${id}`);
          const json = await res.json();
          if (!res.ok || !json.job) continue;
          const next = json.job as GenerationJobRecord;
          if (next.status === "completed") {
            const image = isImageJob(next);
            if (image && submittedImageJobsRef.current.has(next.id)) {
              // submit() owns this batch's one finishing continuation. Polling
              // still restores progress, but must not reopen every candidate.
              if (json.generation) {
                const generation = json.generation as GenerationRecord;
                setLastRun((previous) => previous.some((item) => item.id === generation.id) ? previous : [...previous, generation]);
              }
              void loadGallery();
              continue;
            }
            toast.success(image ? "Image ready" : "Video ready");
            pushNotification({
              kind: image ? "image" : "video",
              status: "success",
              title: image ? "Image ready" : "Video ready",
              body: next.final_prompt,
              generationId: next.generation_id,
              thumbnailUrl: image
                ? ((json.generation as GenerationRecord | null)?.output_url ??
                  undefined)
                : undefined,
            });
            if (json.generation) {
              const g = json.generation as GenerationRecord;
              setLastRun((prev) =>
                prev.some((r) => r.id === g.id) ? prev : [g, ...prev]
              );
            }
            setVideoJobs((prev) => prev.filter((j) => j.id !== next.id));
            void loadGallery();
          } else if (next.status === "cancelled") {
            setVideoJobs((prev) => prev.filter((j) => j.id !== next.id));
          } else {
            setVideoJobs((prev) =>
              prev.map((j) => (j.id === next.id ? next : j))
            );
            if (next.status === "failed") {
              const image = isImageJob(next);
              toast.error(
                `${image ? "Image" : "Video"} render failed: ${next.error ?? "unknown error"}`
              );
              pushNotification({
                kind: image ? "image" : "video",
                status: "error",
                title: image ? "Image render failed" : "Video render failed",
                body: next.error ?? next.final_prompt,
              });
            }
          }
        } catch {
          // transient poll error — try again next tick
        }
      }
    };
    const interval = setInterval(tick, 5000);
    return () => clearInterval(interval);
  }, [activeJobsKey, loadGallery, pushNotification]);

  const retryJob = async (job: GenerationJobRecord) => {
    try {
      const res = await fetch(`/api/jobs/${job.id}/retry`, { method: "POST" });
      const json = await res.json();
      if (!res.ok) throw new Error(json.error ?? "Retry failed");
      setVideoJobs((prev) =>
        prev.map((j) => (j.id === job.id ? (json.job as GenerationJobRecord) : j))
      );
      toast.message("Retrying");
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Retry failed");
    }
  };

  const dismissJob = (job: GenerationJobRecord) => {
    setVideoJobs((prev) => prev.filter((j) => j.id !== job.id));
    // Persist the dismissal so the card doesn't reappear after a refresh
    if (job.status === "failed" || job.status === "completed") {
      void fetch(`/api/jobs/${job.id}`, { method: "DELETE" }).catch(() => {});
    }
  };

  /** Put a cancelled job's prompt and attachments back in the dock. */
  const restoreJobToDock = (job: GenerationJobRecord) => {
    const input = (job.input ?? {}) as {
      prompt?: PromptInputs;
      sourceImageUrls?: string[] | null;
      sourceImageUrl?: string | null;
      sourceGenerationId?: string | null;
      sourceVideoUrl?: string | null;
      sourceVideoGenerationId?: string | null;
      sourceDurationS?: number | null;
      referenceVideoUrls?: string[] | null;
      sourceAudioUrls?: string[] | null;
      referenceUrls?: string[] | null;
      videoResolution?: string | null;
      resolution?: string | null;
      imageModel?: string | null;
    };
    const prompt = input.prompt ?? { subject: job.final_prompt };
    const video = !isImageJob(job);

    openTool(video ? "t2v" : "t2i", {
      subject: prompt.subject || job.final_prompt,
      action: prompt.action,
      lighting: prompt.lighting,
      brandTokens: prompt.brandTokens,
      negativeAdditions: prompt.negativeAdditions,
      styleId: prompt.styleId,
      cameraId: prompt.cameraId,
      cameraBodyId: prompt.cameraBodyId,
      lensId: prompt.lensId,
      apertureId: prompt.apertureId,
    });

    if (isAspectRatio(job.aspect)) setAspect(job.aspect);
    if (job.project_id) setActiveProjectId(job.project_id);
    if (job.brand_kit_id) setActiveBrandKitId(job.brand_kit_id);

    if (video) {
      setTier(job.tier);
      if (job.duration_s != null) setDurationS(Number(job.duration_s));
      const vr = input.videoResolution;
      if (vr === "480p" || vr === "720p" || vr === "1080p") {
        setVideoResolution(vr);
      }
      const imageUrls = input.sourceImageUrls?.length
        ? input.sourceImageUrls
        : input.sourceImageUrl
          ? [input.sourceImageUrl]
          : [];
      setVideoSources(
        imageUrls.map((url, i) => ({
          url,
          generationId: i === 0 ? (input.sourceGenerationId ?? null) : null,
        }))
      );
      if (
        imageUrls.some((url) => url.startsWith("asset://")) &&
        libraryAssets === null
      ) {
        void loadAssets();
      }
      setVideoEditSource(
        input.sourceVideoUrl
          ? {
              url: input.sourceVideoUrl,
              generationId: input.sourceVideoGenerationId ?? null,
              intent: "edit",
              durationS: input.sourceDurationS ?? job.duration_s ?? null,
            }
          : null
      );
      setVideoRefSources(
        (input.referenceVideoUrls ?? []).map((url) => ({
          url,
          generationId: null,
        }))
      );
      const audioUrls = input.sourceAudioUrls ?? [];
      const transcripts = prompt.audioTranscripts ?? [];
      setAudioSources(
        audioUrls.map((url, i) => ({
          url,
          name: `audio ${i + 1}`,
          transcript: transcripts[i] ?? null,
        }))
      );
      const nextCinema: CinemaControls = {
        cameraBodyId: prompt.cameraBodyId ?? DEFAULT_DIRECTOR_ID,
        lensId: prompt.lensId ?? DEFAULT_DIRECTOR_ID,
        apertureId: prompt.apertureId ?? DEFAULT_DIRECTOR_ID,
        genreId: prompt.genreId ?? DEFAULT_DIRECTOR_ID,
        eraId: prompt.eraId ?? DEFAULT_DIRECTOR_ID,
        shotId: prompt.shotId ?? DEFAULT_DIRECTOR_ID,
        gradeId: prompt.gradeId ?? DEFAULT_DIRECTOR_ID,
        lightLookId: prompt.lightLookId ?? DEFAULT_DIRECTOR_ID,
        emotionId: prompt.emotionId ?? DEFAULT_DIRECTOR_ID,
        tempoId: prompt.tempoId ?? DEFAULT_DIRECTOR_ID,
        pacingId: prompt.pacingId ?? DEFAULT_DIRECTOR_ID,
      };
      setCinema(nextCinema);
      setCinemaOn(
        Object.values(nextCinema).some((id) => id !== DEFAULT_DIRECTOR_ID)
      );
      return;
    }

    setVideoSources([]);
    setVideoEditSource(null);
    setVideoRefSources([]);
    setAudioSources([]);
    const modelId =
      input.imageModel ??
      imageModelIdFromEndpoint(job.model_endpoint, job.tier);
    const choice = imageModelChoice(modelId);
    if (choice) applyImageModel(modelId, choice);
    const res = input.resolution;
    if (res === "1K" || res === "2K" || res === "4K") setResolution(res);
    setReferenceUrls(input.referenceUrls?.filter(Boolean) ?? []);
  };

  const cancelJob = async (job: GenerationJobRecord) => {
    setCancellingJobIds((prev) => new Set(prev).add(job.id));
    try {
      const res = await fetch(`/api/jobs/${job.id}`, { method: "DELETE" });
      const json = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(json.error ?? "Cancel failed");
      setVideoJobs((prev) => prev.filter((j) => j.id !== job.id));
      restoreJobToDock(job);
      toast.message("Cancelled — prompt restored. Edit and generate again.");
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Cancel failed");
    } finally {
      setCancellingJobIds((prev) => {
        const next = new Set(prev);
        next.delete(job.id);
        return next;
      });
    }
  };

  useEffect(() => {
    if (!projectsReady) return;
    // loadGallery's identity changes whenever the project/client/owner scope
    // changes, so this is exactly the "show the loader" case.
    const frame = window.requestAnimationFrame(() => void loadGallery({ showLoader: true }));
    return () => window.cancelAnimationFrame(frame);
  }, [loadGallery, projectsReady]);

  const filtered =
    generations == null
      ? null
      : typeFilter === "voice" || typeFilter === "transcript"
        ? []
        : generations;
  const libraryFiltersOn =
    Boolean(query.trim()) || typeFilter !== "all" || favoritesOnly;

  const createGallery = useMemo(() => {
    const match = (g: GenerationRecord) =>
      mode === "t2v" ? isVideo(g) : !isVideo(g);
    const fromLib = (generations ?? []).filter(match);
    const seen = new Set(fromLib.map((g) => g.id));
    const extras = lastRun.filter((g) => match(g) && !seen.has(g.id));
    return [...extras, ...fromLib];
  }, [generations, lastRun, mode]);

  /**
   * Library's own view of the world — renders plus voice-overs and
   * transcripts, each tagged with `kind` so one grid can render all of them
   * and one filter can pick among them. Interleaved by date when "All
   * types" is selected, so it reads as one timeline, not three separate
   * lists stacked on top of each other.
   */
  type LibraryEntry =
    | { kind: "render"; created_at: string; data: GenerationRecord }
    | { kind: "voice"; created_at: string; data: TtsGenerationRecord; versions: TtsGenerationRecord[] }
    | { kind: "transcript"; created_at: string; data: TranscriptRecord };

  const libraryEntries = useMemo((): LibraryEntry[] => {
    const q = query.trim().toLowerCase();
    const entries: LibraryEntry[] = [];

    if (typeFilter === "all" || typeFilter === "image" || typeFilter === "video") {
      for (const g of filtered ?? []) {
        entries.push({ kind: "render", created_at: g.created_at, data: g });
      }
    }
    if (typeFilter === "all" || typeFilter === "voice") {
      // One card per script, not per regenerate — otherwise every version of
      // the same work clutters the grid as its own tile. Grouped by
      // group_id (see the tts_generations column), newest version first.
      const byGroup = new Map<string, TtsGenerationRecord[]>();
      for (const v of libraryVoices ?? []) {
        if (v.status !== "ready") continue;
        if (!byGroup.has(v.group_id)) byGroup.set(v.group_id, []);
        byGroup.get(v.group_id)!.push(v);
      }
      for (const versions of byGroup.values()) {
        versions.sort(
          (a, b) => new Date(b.created_at).getTime() - new Date(a.created_at).getTime()
        );
        const latest = versions[0];
        // Search matches if ANY version's title/text matches, but the card
        // itself always shows the latest.
        if (
          q &&
          !versions.some(
            (v) => v.title.toLowerCase().includes(q) || v.text.toLowerCase().includes(q)
          )
        ) {
          continue;
        }
        entries.push({ kind: "voice", created_at: latest.created_at, data: latest, versions });
      }
    }
    if (typeFilter === "all" || typeFilter === "transcript") {
      for (const t of libraryTranscripts ?? []) {
        if (t.status !== "ready") continue;
        if (q && !t.title.toLowerCase().includes(q)) continue;
        entries.push({ kind: "transcript", created_at: t.created_at, data: t });
      }
    }

    return entries.sort((a, b) => {
      const diff =
        new Date(a.created_at).getTime() - new Date(b.created_at).getTime();
      return sortOrder === "oldest" ? diff : -diff;
    });
  }, [filtered, libraryVoices, libraryTranscripts, typeFilter, query, sortOrder]);

  /** Image/video renders in the same order as the visible grid, for overlay prev/next. */
  const browseQueue = useMemo((): GenerationRecord[] => {
    const ready = (g: GenerationRecord) => Boolean(g.output_url);
    if (view === "create") return createGallery.filter(ready);
    return libraryEntries.flatMap((entry) =>
      entry.kind === "render" && ready(entry.data) ? [entry.data] : []
    );
  }, [view, createGallery, libraryEntries]);


  const submit = useCallback(
    async (
      prompt: PromptInputs,
      opts: SubmitOptions = {}
    ) => {
      const startedInView = currentViewRef.current;
      setGenerating(true);
      setComposerCollapsed(true);
      setLastRun([]);
      const activeMode = opts.mode ?? mode;
      const activeVideoSources = opts.sourceImages ?? videoSources;
      const activeVideoEditSource =
        opts.sourceVideo !== undefined ? opts.sourceVideo : videoEditSource;
      const sendAspect = aspect;
      const sendDuration = opts.durationS ?? durationS;
      try {
        const res = await postFetch("/api/generate", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            mode: activeMode,
            videoWorkflow: activeMode === "t2v" ? activeVideoEditSource ? "edit" : "create" : undefined,
            videoIntent: activeMode === "t2v" ? activeVideoEditSource?.intent : undefined,
            generateAudio: activeMode === "t2v" ? generateAudio : undefined,
            tier: opts.tier ?? tier,
            imageModel:
              activeMode !== "t2i"
                ? undefined
                : opts.imageModel === "seedream"
                  ? undefined
                  : (opts.imageModel ??
                    googleModel ??
                    imageModelChoice(imageModelId)?.imageModel ??
                    undefined),
            prompt:
              activeMode === "t2v" && audioSources.length > 0
                ? {
                    ...prompt,
                    audioTranscripts: audioSources.map((a) => a.transcript),
                  }
                : prompt,
            aspect: sendAspect,
            numOutputs: activeMode === "t2v" ? 1 : numOutputs,
            resolution:
              activeMode === "t2i" ? (opts.resolution ?? resolution) : undefined,
            durationS:
              activeMode === "t2v" ? sendDuration : undefined,
            sourceDurationS: activeVideoEditSource?.durationS ?? undefined,
            videoResolution:
              activeMode === "t2v" ? videoResolution : undefined,
            seed: opts.seed,
            referenceUrls:
              activeMode === "t2i" && referenceUrls.length > 0
                ? referenceUrls
                : undefined,
            projectId: activeProjectId,
            clientId: activeClientId,
            brandKitId: activeBrandKitId,
            sourceImageUrls:
              activeMode === "t2v" ? activeVideoSources.map((s) => s.url) : [],
            sourceGenerationId:
              activeMode === "t2v"
                ? (activeVideoSources.find((s) => s.generationId)
                    ?.generationId ?? null)
                : null,
            sourceVideoUrl:
              activeMode === "t2v"
                ? (activeVideoEditSource?.url ?? null)
                : null,
            sourceVideoGenerationId:
              activeMode === "t2v"
                ? (activeVideoEditSource?.generationId ?? null)
                : null,
            referenceVideoUrls:
              activeMode === "t2v" && videoRefSources.length > 0
                ? videoRefSources.map((s) => s.url)
                : undefined,
            sourceAudioUrls:
              activeMode === "t2v" && audioSources.length > 0
                ? audioSources.map((a) => a.url)
                : undefined,
            longRenderApproved: opts.longRenderApproved,
            duplicatePromptApproved: opts.duplicatePromptApproved,
          }),
        });
        const json = await readJson(res);
        if (res.status === 409 && (json.code === "long_render_approval_required" || json.code === "duplicate_prompt_warning")) {
          setComposerCollapsed(false);
          setRenderApproval({
            kind: json.code === "long_render_approval_required" ? "long" : "duplicate",
            prompt,
            opts,
            estimatedCost: Number(json.estimatedCost) || undefined,
            similarCount: Number(json.similarCount) || undefined,
          });
          return;
        }
        if (!res.ok) throw new Error(json.error ?? "Generation failed");
        for (const alert of (json.spendAlerts as string[] | undefined) ?? []) toast.warning(alert);
        let batch: GenerationRecord[];
        if (json.job) {
          // Every image model now returns durable jobs. Keep this invocation's
          // Smart/brand/resolution settings captured while the batch settles.
          const queued = (
            (json.jobs as GenerationJobRecord[] | undefined) ?? [
              json.job as GenerationJobRecord,
            ]
          ).filter(Boolean);
          setVideoJobs((prev) => [
            ...queued,
            ...prev.filter((j) => !queued.some((q) => q.id === j.id)),
          ]);
          const image = queued.some(isImageJob);
          if (!image) {
            toast.success("Video render started — it keeps going even if you leave");
            return;
          }
          const runId = queued.map((job) => job.id).sort().join(",");
          if (claimedImageRunsRef.current.has(runId)) return;
          claimedImageRunsRef.current.add(runId);
          queued.forEach((job) => submittedImageJobsRef.current.add(job.id));
          // At most one continuation per submitted run, never per poll. Image
          // generation is durable; automatic finishing is session-only until
          // a server run record and idempotent paid finishing steps exist.
          // Reloading keeps source renders, but does not resume paid finishing.
          if (smartMode) setSmartStage("Generating your options…");
          toast.success(smartMode || queued.length > 1
            ? "Images started. Keep this tab open for automatic selection and finishing."
            : "Image render started — the original is saved even if you leave");
          batch = await waitForImageJobs(queued, true);
          if (batch.length < queued.length) {
            toast.warning(`${batch.length} of ${queued.length} images completed. Continuing with the available results.`);
          }
        } else {
          batch = (json.generations as GenerationRecord[] | undefined) ??
            (json.generation ? [json.generation as GenerationRecord] : []);
        }
        batch = batch.filter((generation) => Boolean(generation?.output_url));
        if (!batch.length) throw new Error("The run returned no usable images. Check the render status in Library.");
        const isBatch = activeMode === "t2i" && batch.length > 1;
        // Keep the run on screen. Until now the Create view emptied itself
        // back to "Describe an image" and the only way back to what you had
        // just made was to go hunting in the Library.
        setLastRun(batch.filter((g) => g.output_url));

        pushNotification({
          kind: "image",
          status: "success",
          title: isBatch ? `${batch.length} options generated` : "Image generated",
          body: batch[0].final_prompt,
          generationId: batch[0].id,
          thumbnailUrl: batch[0].output_url,
        });
        await loadGallery();

        // Best-of-N: score the batch and surface the winner.
        let winner = batch[0];
        let winnerRanked = !isBatch;
        if (isBatch) {
          if (smartMode) setSmartStage("Comparing your options…");
          let scored = false;
          try {
            const scoreRes = await fetch("/api/score", {
              method: "POST",
              headers: { "Content-Type": "application/json" },
              body: JSON.stringify({
                prompt: batch[0].final_prompt,
                images: batch
                  .filter((g) => g.output_url)
                  .map((g) => ({ id: g.id, url: g.output_url })),
              }),
            });
            const sj = await scoreRes.json();
            if (scoreRes.ok && sj.scored && sj.bestId) {
              scored = true;
              winnerRanked = true;
              winner = batch.find((g) => g.id === sj.bestId) ?? winner;
              const wScore = (
                sj.ranking as { id: string; score: number }[]
              )?.find((r) => r.id === winner.id)?.score;
              if (wScore != null) {
                winner = { ...winner, qc_score: wScore / 100 };
              }
              toast.success(
                `Best of ${batch.length} picked · ${sj.ranking?.[0]?.score ?? ""}/100`
              );
              await loadGallery();
            }
          } catch {
            // scoring is best-effort — leave the batch unscored
          }
          if (!scored) toast.warning(`Generated ${batch.length} options. Automatic ranking is unavailable — choose the strongest image in Library.`);
        } else {
          const seedLabel =
            winner.seed != null ? ` · seed ${winner.seed}` : "";
          toast.success(`Generated${seedLabel}`);
        }

        // Orchestration chain (Smart mode): finish the winner, then brand-check.
        if (smartMode && activeMode === "t2i" && winnerRanked && winner?.output_url) {
          // Keep native 2K/4K outputs intact; the finishing API produces 2K.
          // Only a 1K winner needs this additional paid rendering pass.
          if ((opts.resolution ?? resolution) === "1K") try {
            setSmartStage("Finishing the winner…");
            const upRes = await fetch("/api/upscale", {
              method: "POST",
              headers: { "Content-Type": "application/json" },
              body: JSON.stringify({
                generationId: winner.id,
                mode: "precision",
                scale: 2,
              }),
            });
            const upJson = await upRes.json();
            if (upRes.ok && upJson.generation?.output_url) {
              winner = upJson.generation as GenerationRecord;
              toast.success("Finished — upscaled to 2K");
            } else {
              toast.warning("Finishing was unavailable. Your original image is saved.");
            }
          } catch {
            toast.warning("Finishing could not complete. Your original image is saved.");
          }
          // Brand-guideline enforcement against the active kit.
          if (activeBrandKitId) {
            try {
              setSmartStage("Checking brand guidelines…");
              const bcRes = await fetch("/api/brand-check", {
                method: "POST",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify({
                  generationId: winner.id,
                  brandKitId: activeBrandKitId,
                }),
              });
              const bc = await bcRes.json();
              if (bcRes.ok && bc.checked) {
                winner = { ...winner, brand_flagged: !bc.compliant, brand_notes: (bc.violations ?? []).join("; ") };
                if (bc.compliant) {
                  toast.success("On-brand ✓");
                } else {
                  toast.warning(
                    `Off-brand: ${(bc.violations ?? []).join("; ")}`
                  );
                }
              } else {
                toast.warning("Brand review was unavailable. Check the image against the brand guidelines before delivery.");
              }
            } catch {
              toast.warning("Brand review could not complete. Please review the image before delivery.");
            }
          }
          setSmartStage(null);
          await loadGallery();
        }

        if (activeMode === "t2i" && winner?.output_url) {
          setLastRun((previous) => [winner, ...previous.filter((item) => item.id !== winner.id)]);
          if (currentViewRef.current === startedInView) setDetailTarget(winner);
        }
        if (!opts.stayOnView && currentViewRef.current === startedInView) {
          setView("create");
        }
      } catch (err) {
        toast.error(err instanceof Error ? err.message : "Generation failed");
      } finally {
        setGenerating(false);
        setSmartStage(null);
      }
    },
    [
      mode,
      tier,
      googleModel,
      imageModelId,
      aspect,
      resolution,
      numOutputs,
      durationS,
      videoResolution,
      generateAudio,
      referenceUrls,
      activeProjectId,
      activeClientId,
      activeBrandKitId,
      videoSources,
      videoEditSource,
      videoRefSources,
      audioSources,
      loadGallery,
      pushNotification,
      smartMode,
    ]
  );

  const moveToProject = async (
    g: GenerationRecord,
    projectId: string | null
  ) => {
    const res = await fetch(`/api/generations/${g.id}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ project_id: projectId }),
    });
    const json = await res.json();
    if (!res.ok) throw new Error(json.error ?? "Could not move");
    const next = json.generation as GenerationRecord;
    if (isVideo(next)) {
      setVideoDetailTarget(next);
    } else {
      setDetailTarget(next);
    }
    await loadGallery();
    const pQs = activeClientId
      ? `?clientId=${encodeURIComponent(activeClientId)}`
      : "";
    const resProjects = await fetch(`/api/projects${pQs}`);
    const jsonProjects = await resProjects.json();
    if (resProjects.ok) setProjects(jsonProjects.projects);
    const project = projects.find((p) => p.id === projectId);
    toast.success(
      projectId && project
        ? `Moved to “${project.name}”`
        : "Removed from project"
    );
  };

  /**
   * Keep the in-memory gallery in step with a rating, so the thumb state
   * survives closing a detail panel or switching views without a refetch.
   */
  const patchGenerationRating = useCallback(
    (
      id: string,
      rating: 1 | -1 | null,
      reasons: string[],
      note: string
    ) => {
      const patch = { my_rating: rating, my_reasons: reasons, my_note: note };
      setGenerations((prev) =>
        prev ? prev.map((g) => (g.id === id ? { ...g, ...patch } : g)) : prev
      );
      setDetailTarget((t) => (t && t.id === id ? { ...t, ...patch } : t));
      setVideoDetailTarget((t) => (t && t.id === id ? { ...t, ...patch } : t));
      setLastRun((prev) =>
        prev.map((g) => (g.id === id ? { ...g, ...patch } : g))
      );
    },
    []
  );

  /** Attachments the prompt can tag, in the order their badges show. */
  const mentionTargets = useMemo(
    () =>
      (mode === "t2v" ? videoSources.map((v) => v.url) : referenceUrls).map(
        (url, i) => ({
          url,
          index: i,
          label: referenceNames[url] ?? null,
          display: referenceNames[url] ?? `Image ${i + 1}`,
        })
      ),
    [mode, videoSources, referenceUrls, referenceNames]
  );

  const mentionRows = useMemo(() => {
    const attached = new Set(mentionTargets.map((t) => t.url));
    const fromDock = mentionTargets.map((t) => ({
      ...t,
      thumb: null as string | null,
      fromAssets: false as const,
    }));
    // Registered BytePlus assets (verified faces) — video only, where the
    // asset:// reference is valid. Picking one attaches it like the dialog.
    const fromRegistered =
      mode === "t2v"
        ? (libraryAssets ?? [])
            .filter(
              (a) =>
                a.status === "Active" && !attached.has(`asset://${a.id}`)
            )
            .map((a) => ({
              url: `asset://${a.id}`,
              index: null as number | null,
              label: a.name || a.id,
              display: a.name || a.id,
              thumb: a.url,
              fromAssets: true as const,
            }))
        : [];
    const fromAssets = assetCatalog
      .filter((r) => r.url && !attached.has(r.url))
      .map((r) => ({
        url: r.url,
        index: null as number | null,
        label: r.name,
        display: r.name,
        thumb: null as string | null,
        fromAssets: true as const,
      }));
    return [...fromDock, ...fromRegistered, ...fromAssets];
  }, [mentionTargets, assetCatalog, libraryAssets, mode]);

  const mentionMatches = useMemo(() => {
    if (!mention) return [];
    const q = mention.query.trim().toLowerCase();
    const rows = !q
      ? mentionRows
      : mentionRows.filter(
          (t) =>
            t.display.toLowerCase().includes(q) ||
            (t.index != null &&
              `image${t.index + 1}`.startsWith(q.replace(/\s+/g, "")))
        );
    return rows.slice(0, 20);
  }, [mention, mentionRows]);

  // The textarea's own text is transparent; this layer re-renders it behind
  // the caret with the @image/@video/@audio tokens tinted gold.
  const promptSegments = useMemo(
    () => subject.split(PROMPT_TOKEN_RE),
    [subject]
  );

  const attachMentionPhoto = useCallback((url: string, name: string | null): number | null => {
    const attached =
      mode === "t2v" ? videoSources.map((s) => s.url) : referenceUrls;
    const existing = attached.indexOf(url);
    if (existing >= 0) return existing;
    const cap = mode === "t2v" ? MAX_VIDEO_IMAGES : maxRefs;
    if (attached.length >= cap) {
      toast.error(
        mode === "t2v"
          ? `Up to ${MAX_VIDEO_IMAGES} images per video`
          : `Up to ${maxRefs} reference images`
      );
      return null;
    }
    if (mode === "t2v") {
      setVideoSources((prev) => [...prev, { url, generationId: null }]);
    } else {
      setReferenceUrls((prev) => [...prev, url]);
    }
    if (name) {
      setReferenceNames((prev) => ({ ...prev, [url]: name }));
    }
    return attached.length;
  }, [mode, videoSources, referenceUrls, maxRefs, MAX_VIDEO_IMAGES]);

  /** Replace the `@…` under the caret with a stable token. */
  const insertMention = useCallback(
    (row: {
      url: string;
      index: number | null;
      label: string | null;
    }) => {
      if (!mention) return;
      let index = row.index;
      if (index == null) {
        index = attachMentionPhoto(row.url, row.label);
        if (index == null) return;
      }
      const token = mentionToken(index);
      const next =
        subject.slice(0, mention.start) + token + " " + subject.slice(mention.end);
      setSubject(next);
      setMention(null);
      setMentionIndex(0);
      const caret = mention.start + token.length + 1;
      requestAnimationFrame(() => {
        const el = promptRef.current;
        if (!el) return;
        el.focus();
        el.setSelectionRange(caret, caret);
      });
    },
    [mention, subject, attachMentionPhoto]
  );

  const handleMentionMouseDown = useCallback((event: React.MouseEvent<HTMLButtonElement>) => {
    event.preventDefault();
    const index = Number(event.currentTarget.dataset.mentionIndex);
    const row = mentionMatches[index];
    if (row) insertMention(row);
  }, [mentionMatches, insertMention]);

  /** Recompute the open mention from wherever the caret now is. */
  const syncMention = useCallback(
    (text: string, caret: number | null) => {
      if (caret === null) {
        setMention(null);
        return;
      }
      const found = activeMentionQuery(text, caret);
      setMention(found);
      setMentionIndex(0);
    },
    []
  );

  const hydrateGeneration = async (id: string, kind: "video" | "image") => {
    try {
      const res = await fetch(`/api/generations/${id}`);
      const json = await res.json();
      if (!res.ok || !json.generation) return;
      const full = json.generation as GenerationRecord;
      // List cards omit input_payload for speed. Merge it back without
      // wiping creator / rating fields that only the list query joins.
      const merge = (t: GenerationRecord) => ({
        ...t,
        ...full,
        creator_name: t.creator_name ?? full.creator_name,
        creator_email: t.creator_email ?? full.creator_email,
        my_rating: t.my_rating,
        my_reasons: t.my_reasons,
        my_note: t.my_note,
      });
      if (kind === "video") {
        setVideoDetailTarget((t) => (t?.id === id ? merge(t) : t));
      } else {
        setDetailTarget((t) => (t?.id === id ? merge(t) : t));
      }
      setGenerations((prev) =>
        prev
          ? prev.map((row) => (row.id === id ? merge(row) : row))
          : prev
      );
    } catch {
      /* keep the slim library copy */
    }
  };

  const openDetail = (g: GenerationRecord) => {
    if (!g.output_url) {
      toast.message("No output yet");
      return;
    }
    if (isVideo(g)) {
      setDetailTarget(null);
      setVideoDetailTarget(g);
      void hydrateGeneration(g.id, "video");
      return;
    }
    setVideoDetailTarget(null);
    setDetailTarget(g);
    void hydrateGeneration(g.id, "image");
  };

  const detailNavFor = (currentId: string) => {
    const i = browseQueue.findIndex((g) => g.id === currentId);
    if (i < 0 || browseQueue.length < 2) {
      return { showNav: false as const };
    }
    return {
      showNav: true as const,
      onPrevious: i > 0 ? () => openDetail(browseQueue[i - 1]) : undefined,
      onNext:
        i < browseQueue.length - 1
          ? () => openDetail(browseQueue[i + 1])
          : undefined,
    };
  };

  /**
   * Opens any of the three "things Athar made" by id — shared between the
   * notifications bell and the per-user usage drill-down so there's one
   * place that knows how to fetch and open each kind, not three.
   */
  const openLibraryItem = async (
    kind: "generation" | "transcript" | "tts",
    id: string
  ) => {
    if (kind === "transcript") {
      setLibraryOpenTranscriptId(id);
      setView("transcribe");
      return;
    }

    if (kind === "tts") {
      try {
        const res = await fetch(`/api/tts/${id}`);
        const json = await readJson<{
          generation?: TtsGenerationRecord;
          error?: string;
        }>(res);
        if (!res.ok || !json.generation) {
          toast.error("That voice-over could not be found.");
          return;
        }
        setVoiceDetailTarget(json.generation);
        setVoiceDetailVersions([json.generation]);
      } catch {
        toast.error("Could not open that voice-over");
      }
      return;
    }

    let g = (generations ?? []).find((r) => r.id === id);
    if (!g) {
      try {
        const res = await fetch(`/api/generations/${id}`);
        const json = await readJson<{
          generation?: GenerationRecord;
          error?: string;
        }>(res);
        if (!res.ok || !json.generation) {
          toast.error(
            "This render isn't in the local library. It was probably saved to the live database."
          );
          return;
        }
        g = json.generation;
      } catch {
        toast.error("Could not open that render");
        return;
      }
    }
    openDetail(g);
  };

  const openAssistant = (g?: GenerationRecord | null) => {
    setDetailTarget(null);
    setVaryTarget(null);
    if (g && (isVideo(g) || !g.output_url)) {
      toast.message("Pick a still");
      return;
    }
    setEditTarget(g ?? null);
    setView("edit");
  };

  const openVary = (g: GenerationRecord) => {
    if (!g.output_url) {
      toast.message("No output yet");
      return;
    }
    // Video vary: attach the clip as a Seedance reference video with a
    // variation instruction — same scene language, fresh take.
    if (isVideo(g)) {
      setDetailTarget(null);
      setVideoDetailTarget(null);
      setVideoSources([]);
      setVideoRefSources([]);
      openTool("t2v", {
        subject:
          "Create a variation of @video1 — keep the same subject, scene, camera moves, pacing and lighting, but render a naturally different take with fresh details.",
      });
      setVideoEditSource({
        url: g.output_url,
        generationId: g.id,
        intent: "vary",
        durationS: g.duration_s ?? null,
      });
      toast.message(
        "Video Generator ready"
      );
      return;
    }
    setDetailTarget(null);
    setEditTarget(null);
    setVaryTarget(g);
    setView("vary");
  };

  const openEdit = (g: GenerationRecord) => {
    openAssistant(g);
  };

  const submitCreate = async (args: {
    prompt: PromptInputs;
    imageModelId: string;
    aspect: AspectRatio;
    resolution: ImageResolution;
    referenceUrls?: string[];
  }): Promise<GenerationRecord | null> => {
    setGenerating(true);
    try {
      const res = await postFetch("/api/generate", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          mode: "t2i",
          ...imageModelRequest(args.imageModelId),
          prompt: args.prompt,
          aspect: args.aspect,
          numOutputs: 1,
          resolution: args.resolution,
          referenceUrls: args.referenceUrls,
        }),
      });
      const json = await readJson(res);
      if (!res.ok) throw new Error(json.error ?? "Create failed");
      const next = json.job
        ? (await waitForImageJobs(
            (json.jobs as GenerationJobRecord[] | undefined) ?? [
              json.job as GenerationJobRecord,
            ]
          ))[0]
        : (json.generation as GenerationRecord);
      if (!next) throw new Error("Create failed");
      toast.success("Generated");
      await loadGallery();
      setEditTarget(next);
      return next;
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Create failed");
      return null;
    } finally {
      setGenerating(false);
    }
  };

  const submitVary = async (args: {
    source: GenerationRecord;
    strength: VaryStrength;
    count: number;
    imageModelId: string;
    aspect: AspectRatio;
    resolution: ImageResolution;
    prompt: PromptInputs;
    seed?: number;
  }): Promise<GenerationRecord[]> => {
    if (!args.source.output_url) throw new Error("Source image missing");
    setGenerating(true);
    try {
      const res = await postFetch("/api/generate", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          mode: "t2i",
          ...imageModelRequest(args.imageModelId),
          prompt: args.prompt,
          aspect: args.aspect,
          numOutputs: args.count,
          resolution: args.resolution,
          referenceUrls: [args.source.output_url],
          seed: args.seed,
          projectId: activeProjectId,
        }),
      });
      const json = await readJson<{
        error?: string;
        generations?: GenerationRecord[];
        generation?: GenerationRecord;
        job?: GenerationJobRecord;
        jobs?: GenerationJobRecord[];
      }>(res);
      if (!res.ok) throw new Error(json.error ?? "Variations failed");
      const list = json.job
        ? await waitForImageJobs(json.jobs?.length ? json.jobs : [json.job])
        : ((json.generations ?? [json.generation]).filter(
            Boolean
          ) as GenerationRecord[]);
      await loadGallery();
      return list;
    } finally {
      setGenerating(false);
    }
  };

  const submitEdit = async (args: {
    instruction: string;
    referenceUrl: string;
    extraReferenceUrls?: string[];
    basePrompt: PromptInputs;
    imageModelId: string;
    aspect: AspectRatio;
    resolution: ImageResolution;
  }): Promise<GenerationRecord | null> => {
    setGenerating(true);
    try {
      const referenceUrls = [
        args.referenceUrl,
        ...(args.extraReferenceUrls ?? []),
      ].filter(Boolean);
      const res = await postFetch("/api/generate", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          mode: "t2i",
          ...imageModelRequest(args.imageModelId),
          prompt: {
            subject: [
              "Image editing task. Apply this change to the reference image:",
              args.instruction,
              "Make the requested change clearly visible and obvious.",
              "If the instruction changes gender, age, or who the person is, fully replace the face and body to match — do not keep the original person's face.",
              args.extraReferenceUrls?.length
                ? "Use any additional attached images as identity/look references for the requested change."
                : "",
              "Keep wardrobe, pose, mask/accessories, background, and lighting unless the instruction asks to change them.",
              "Avoid: unchanged original face, ignoring the edit, same identity as the reference person.",
            ]
              .filter(Boolean)
              .join(" "),
            action: args.basePrompt.action,
            lighting: args.basePrompt.lighting,
            brandTokens: args.basePrompt.brandTokens,
          },
          aspect: args.aspect,
          numOutputs: 1,
          resolution: args.resolution,
          referenceUrls,
          projectId: activeProjectId,
        }),
      });
      const json = await readJson(res);
      if (!res.ok) throw new Error(json.error ?? "Edit failed");
      const next = json.job
        ? (await waitForImageJobs(
            (json.jobs as GenerationJobRecord[] | undefined) ?? [
              json.job as GenerationJobRecord,
            ]
          ))[0]
        : (json.generation as GenerationRecord);
      if (!next) throw new Error("Edit failed");
      toast.success("Image updated");
      await loadGallery();
      setEditTarget(next);
      return next;
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Edit failed");
      return null;
    } finally {
      setGenerating(false);
    }
  };

  /** How many Cinema Studio picks are set — the badge on the option chip. */
  const activeCinemaCount = useMemo(
    () =>
      Object.values(cinema).filter((id) => id !== DEFAULT_DIRECTOR_ID).length +
      (camera !== DEFAULT_CAMERA_ID ? 1 : 0),
    [cinema, camera]
  );

  /** A montage needs room to cut — raise short durations when one is picked. */
  const setCinemaPacing = (pacingId: string) => {
    setCinema((c) => ({ ...c, pacingId }));
    if (MONTAGE_PACING_IDS.includes(pacingId) && durationS < 15) {
      setDurationS(15);
      toast.message("Duration raised to 15s for a multi-cut scene");
    }
  };

  const buildPromptInputs = (): PromptInputs => ({
    subject,
    action: mode === "t2i" || cinemaOn ? action : undefined,
    lighting: mode === "t2i" || cinemaOn ? lighting : undefined,
    brandTokens,
    negativeAdditions: negativeAdditions || undefined,
    styleId: activeClientStyle ? undefined : style,
    styleTokens: activeClientStyle?.positive,
    styleNegative: activeClientStyle?.negative || undefined,
    cameraId: mode === "t2v" && cinemaOn ? camera : undefined,
    ...(mode === "t2v" && cinemaOn ? cinema : {}),
    // Positional, matching the badges on the thumbnails, so the server can
    // turn "@image2" into "reference image 2 (Fatima)".
    referenceLabels: mentionTargets.map((t) => t.label),
  });

  // Generate with a specific image model id — a Seedream tier
  // (draft/standard/hero), a Google model ("nano" / "nano-2" / "nano-pro"),
  // or GPT Image 2.
  const runGenerate = (modelId: string) => {
    const choice = imageModelChoice(modelId);
    if (!choice) return;
    const nextResolution = choice.resolutions.includes(
      resolution as ImageResolutionOption
    )
      ? resolution
      : choice.resolutions[choice.resolutions.length - 1];
    if (!applyImageModel(modelId, choice)) return;
    submit(buildPromptInputs(), {
      tier: choice.tier ?? undefined,
      imageModel: choice.imageModel ?? "seedream",
      resolution: nextResolution,
    });
  };

  const onGenerate = async () => {
    if (generating || uploadingVideoRef || uploadingVideoSource || uploadingAudio) return;
    if (mode === "t2v" && videoWorkflow === "edit" && !videoEditSource) {
      toast.error("Upload a video to edit first");
      return;
    }
    if (mode === "t2v") {
      const error = validateVideoSettings({ tier, images: videoSources.map(s => s.url), videos: videoRefSources.map(s => s.url), audios: audioSources.map(s => s.url), source: videoEditSource?.url, workflow: videoWorkflow, intent: videoEditSource?.intent, duration: durationS, resolution: videoResolution, aspect });
      if (error) { toast.error(error); return; }
    }
    // Client is required — everything downstream (projects, brand kits,
    // reporting) hangs off it, so nothing is generated unattributed.
    if (!activeClientId) {
      toast.error("Pick a client first — it's the chip at the top of this dock");
      setClientNudge(true);
      window.setTimeout(() => setClientNudge(false), 1600);
      return;
    }
    if (mode === "t2v" && !activeProjectId) {
      toast.error("Choose a project for this client before starting a video render");
      return;
    }
    // Asking a diffusion model to draw a known logo or a specific person from
    // words alone is where output silently goes wrong — it approximates the
    // glyphs and misspells the name. Offer the reference route first, once.
    if (needsReferenceAsset() && !refAdviceDismissed) {
      setRefAdviceOpen(true);
      return;
    }
    if (!subject.trim()) {
      toast.error("Add a subject");
      return;
    }
    if (mode !== "t2i") {
      submit(buildPromptInputs());
      return;
    }
    // Generate with the model they picked. A "switch to X?" interrupt on
    // every still made returning users look like first-timers.
    runGenerate(imageModelId);
  };

  const uploadReference = async (file: File) => uploadImageFile(file);

  const onReferenceFiles = async (files: FileList | File[] | null) => {
    if (!files) return;
    const allowed = new Set(["image/jpeg", "image/jpg", "image/png", "image/webp"]);
    const list = Array.from(files).filter((f) => allowed.has(f.type));
    if (!list.length) {
      toast.error("Only JPEG, PNG, or WebP images");
      return;
    }
    const remaining = maxRefs - referenceUrls.length;
    if (remaining <= 0) {
      toast.error(`Up to ${maxRefs} reference images`);
      return;
    }
    const batch = list.slice(0, remaining);
    setUploadingRef(true);
    try {
      const urls = await Promise.all(batch.map((f) => uploadReference(f)));
      setReferenceUrls((prev) => [...prev, ...urls].slice(0, maxRefs));
      toast.success(
        urls.length === 1 ? "Reference added" : `${urls.length} references added`
      );
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Upload failed");
    } finally {
      setUploadingRef(false);
      if (refFileInput.current) refFileInput.current.value = "";
    }
  };

  const onVideoSourceFiles = async (files: FileList | File[] | null) => {
    if (!files) return;
    const allowed = new Set(["image/jpeg", "image/jpg", "image/png", "image/webp"]);
    const list = Array.from(files).filter((f) => allowed.has(f.type));
    if (!list.length) {
      toast.error("Only JPEG, PNG, or WebP images");
      return;
    }
    const remaining = MAX_VIDEO_IMAGES - videoSources.length;
    if (remaining <= 0) {
      toast.error(`Up to ${MAX_VIDEO_IMAGES} images per video`);
      return;
    }
    const batch = list.slice(0, remaining);
    setUploadingVideoSource(true);
    try {
      const urls = await Promise.all(batch.map((f) => uploadReference(f)));
      const added = urls.map((url) => ({ url, generationId: null }));
      setVideoSources((prev) =>
        [...prev, ...added].slice(0, MAX_VIDEO_IMAGES)
      );
      toast.success(
        added.length === 1
          ? "Image attached — now describe the motion"
          : `${added.length} images attached`
      );
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Upload failed");
    } finally {
      setUploadingVideoSource(false);
      if (videoFileInput.current) videoFileInput.current.value = "";
    }
  };

  const onAudioFiles = async (files: FileList | null) => {
    if (!files?.length) return;
    const list = Array.from(files).filter(file => /\.(mp3|wav)$/i.test(file.name));
    if (!list.length) {
      toast.error("Video references support MP3 or WAV audio");
      return;
    }
    const remaining = videoCaps.maxAudios - audioSources.length;
    if (remaining <= 0) {
      toast.error(`Up to ${videoCaps.maxAudios} audio clips for this model`);
      return;
    }
    const batch = list.slice(0, remaining);
    setUploadingAudio(true);
    try {
      for (const file of batch) {
        const url = await uploadAudioFile(file);
        // Transcribe so the prompt can quote the spoken words — advisory
        // only, attaching must still work when Whisper is unavailable.
        let transcript: string | null = null;
        try {
          const res = await fetch("/api/audio-transcript", {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ url }),
          });
          const json = await readJson<{ text?: string | null }>(res);
          if (res.ok) transcript = json.text ?? null;
        } catch {
          // no transcript — Seedance still syncs to the raw audio
        }
        setAudioSources((prev) =>
          [...prev, { url, name: file.name, transcript }].slice(
            0,
            videoCaps.maxAudios
          )
        );
      }
      toast.success(
        batch.length === 1
          ? "Audio reference attached"
          : `${batch.length} audio clips attached`
      );
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Audio upload failed");
    } finally {
      setUploadingAudio(false);
      if (audioFileInput.current) audioFileInput.current.value = "";
    }
  };

  const onEditVideoFile = async (file?: File) => {
    if (!file) return;
    setUploadingVideoRef(true);
    try {
      const url = await uploadVideoFile(file);
      setVideoRefSources([]);
      setVideoEditSource({ url, generationId: null, intent: "edit" });
      setVideoWorkflow("edit");
      setTier("standard");
      toast.success("Source video attached. Describe what to change in @video1.");
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Upload failed");
    } finally {
      setUploadingVideoRef(false);
      if (editVideoFileInput.current) editVideoFileInput.current.value = "";
    }
  };

  const onReferenceVideoFiles = async (files: FileList | File[] | null) => {
    if (!files) return;
    if (videoWorkflow === "edit") {
      toast.error("Switch to Create video first. Remove the attached edit source first — reference clips are for a fresh generation");
      return;
    }
    const list = Array.from(files).filter(isVideoFile);
    if (!list.length) {
      toast.error("Only MP4 or MOV video");
      return;
    }
    const remaining = MAX_REFERENCE_VIDEOS - videoRefSources.length;
    if (remaining <= 0) {
      toast.error(`Up to ${MAX_REFERENCE_VIDEOS} reference videos`);
      return;
    }
    const batch = list.slice(0, remaining);
    setUploadingVideoRef(true);
    try {
      const urls = await Promise.all(batch.map((f) => uploadVideoFile(f)));
      const added = urls.map((url) => ({ url, generationId: null }));
      setVideoRefSources((prev) =>
        [...prev, ...added].slice(0, MAX_REFERENCE_VIDEOS)
      );
      toast.success(
        added.length === 1
          ? "Reference video attached — describe how to use it, e.g. “follow the camera movement in @video1”"
          : `${added.length} reference videos attached`
      );
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Upload failed");
    } finally {
      setUploadingVideoRef(false);
      if (videoRefFileInput.current) videoRefFileInput.current.value = "";
    }
  };

  // Attach a verified asset from the BytePlus portrait library
  // (asset://… refs pass moderation where raw people photos are blocked)
  const attachAsset = (rawId: string) => {
    const id = rawId.replace(/^asset:\/\//, "").trim();
    if (!id) return;
    if (!id.startsWith("asset-")) {
      toast.message("BytePlus is still verifying this photo");
      return;
    }
    if (videoSources.length >= MAX_VIDEO_IMAGES) {
      toast.error(`Up to ${MAX_VIDEO_IMAGES} images per video`);
      return;
    }
    if (videoSources.some((s) => s.url === `asset://${id}`)) {
      toast.error("Asset already attached");
      return;
    }
    setVideoSources((prev) =>
      [...prev, { url: `asset://${id}`, generationId: null }].slice(
        0,
        MAX_VIDEO_IMAGES
      )
    );
    setAssetIdOpen(false);
    toast.success("Verified asset attached");
  };

  const loadAssets = useCallback(() => {
    if (assetsRequest.current) return assetsRequest.current;
    setAssetsLoading(true);
    const request = (async () => {
      try {
        const res = await fetch("/api/assets");
        const json = await readJson<{
          assets?: LibraryAsset[];
          error?: string;
          warning?: string | null;
        }>(res);
        if (!res.ok) throw new Error(json.error ?? "Could not load characters");
        setLibraryAssets(json.assets ?? []);
        if (json.warning && lastAssetWarning.current !== json.warning) {
          lastAssetWarning.current = json.warning;
          toast.message("Showing saved characters while BytePlus reconnects");
        }
        if (!json.warning) lastAssetWarning.current = null;
      } catch (err) {
        setLibraryAssets((prev) => prev ?? []);
        const message = err instanceof Error ? err.message : "Could not load characters";
        if (lastAssetWarning.current !== message) {
          lastAssetWarning.current = message;
          toast.error(message);
        }
      }
    })().finally(() => {
      assetsRequest.current = null;
      setAssetsLoading(false);
    });
    assetsRequest.current = request;
    return request;
  }, []);

  const attachedPreview = (url: string) => {
    if (!url.startsWith("asset://")) return url;
    return (
      libraryAssets?.find((a) => a.id === url.slice("asset://".length))?.url ??
      null
    );
  };

  // The registered-asset list loads lazily — typing @ in the video prompt
  // is the moment it becomes visible, so fetch it then.
  useEffect(() => {
    if (mention && mode === "t2v" && libraryAssets === null && !assetsLoading) {
      const frame = window.requestAnimationFrame(() => void loadAssets());
      return () => window.cancelAnimationFrame(frame);
    }
  }, [mention, mode, libraryAssets, assetsLoading, loadAssets]);

  useEffect(() => {
    if (!assetIdOpen) return;
    const verifying = (libraryAssets ?? []).some(
      (a) => a.status === "Processing"
    );
    if (!verifying) return;
    const t = window.setInterval(() => void loadAssets(), 8_000);
    return () => window.clearInterval(t);
  }, [assetIdOpen, libraryAssets, loadAssets]);

  const deleteLibraryAsset = async (id: string) => {
    setDeletingAssetId(id);
    try {
      const res = await postFetch("/api/assets", {
        method: "DELETE",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ id }),
      });
      const json = await readJson<{ error?: string }>(res);
      if (!res.ok) throw new Error(json.error ?? "Could not delete asset");
      toast.success("Asset deleted — quota freed");
      setAssetToDelete(null);
      await loadAssets();
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Could not delete asset");
      throw err;
    } finally {
      setDeletingAssetId(null);
    }
  };

  /** Upload + register a character asset. Throws so the form stays open. */
  const registerCharacter = async (
    file: File,
    name: string,
    category: AssetCategory | "auto" = "auto"
  ) => {
    setRegisteringAsset(true);
    try {
      const url = await uploadImageFile(await prepareVerifiedFaceImage(file));
      const assetName =
        name.trim().slice(0, 60) ||
        file.name.replace(/\.[^.]+$/, "").slice(0, 60);
      const { res, json } = await postJson<{
        error?: string;
        asset?: LibraryAsset;
      }>("/api/assets", {
        imageUrl: url,
        name: assetName,
        category: category === "auto" ? "character" : category,
      });
      if (!res.ok) throw new Error(json.error ?? "Could not register character");
      if (json.asset) {
        setLibraryAssets((prev) => [
          json.asset as LibraryAsset,
          ...(prev ?? []).filter((a) => a.id !== json.asset?.id),
        ]);
      }
      toast.success(
        "Photo submitted — BytePlus is verifying it. It stays in this list while that runs."
      );
      window.setTimeout(() => void loadAssets(), 8_000);
      window.setTimeout(() => void loadAssets(), 20_000);
      window.setTimeout(() => void loadAssets(), 75_000);
    } catch (err) {
      toast.error(
        err instanceof Error ? err.message : "Could not register character"
      );
      throw err;
    } finally {
      setRegisteringAsset(false);
    }
  };

  const onDockDragEnter = (e: React.DragEvent) => {
    e.preventDefault();
    e.stopPropagation();
    dragDepth.current += 1;
    setDragOver(true);
  };

  const onDockDragLeave = (e: React.DragEvent) => {
    e.preventDefault();
    e.stopPropagation();
    dragDepth.current -= 1;
    if (dragDepth.current <= 0) {
      dragDepth.current = 0;
      setDragOver(false);
    }
  };

  const onDockDragOver = (e: React.DragEvent) => {
    e.preventDefault();
    e.stopPropagation();
  };

  const onDockDrop = (e: React.DragEvent) => {
    e.preventDefault();
    e.stopPropagation();
    dragDepth.current = 0;
    setDragOver(false);
    if (mode === "t2v") {
      const files = Array.from(e.dataTransfer.files);
      const videoFiles = files.filter(isVideoFile);
      const otherFiles = files.filter((f) => !isVideoFile(f));
      if (videoFiles.length) void onReferenceVideoFiles(videoFiles);
      if (otherFiles.length) void onVideoSourceFiles(otherFiles);
    } else {
      void onReferenceFiles(e.dataTransfer.files);
    }
  };

  const promptInputsOf = (g: GenerationRecord): PromptInputs => {
    const stored = (g.input_payload as { prompt_inputs?: PromptInputs })
      .prompt_inputs;
    return stored ?? { subject: g.final_prompt };
  };

  // Higgsfield-style Reuse: load this clip's prompt, settings, and attached
  // media into Create so the user can edit, then Generate themselves.
  const reuseGeneration = (g: GenerationRecord) => {
    void (async () => {
      let full = g;
      const slim =
        !g.input_payload ||
        Object.keys(g.input_payload as object).length === 0;
      if (slim) {
        try {
          const res = await fetch(`/api/generations/${g.id}`);
          const json = await res.json();
          if (res.ok && json.generation) full = json.generation;
        } catch {
          /* use the library card copy */
        }
      }
      applyReuse(full);
    })();
  };

  const applyReuse = (g: GenerationRecord) => {
    const inputs = promptInputsOf(g);
    const payload = g.input_payload as {
      source_generation_id?: string;
      source_image_url?: string;
      source_image_urls?: string[];
      source_video_url?: string;
      source_video_generation_id?: string;
      reference_video_urls?: string[];
      source_audio_urls?: string[];
      video_resolution?: string;
      video_intent?: "edit" | "extend" | "vary";
      generate_audio?: boolean;
    };
    const video = isVideo(g);

    setDetailTarget(null);
    setVideoDetailTarget(null);
    setVaryTarget(null);
    setEditTarget(null);

    openTool(video ? "t2v" : "t2i", {
      subject: inputs.subject || g.final_prompt,
      action: inputs.action,
      lighting: inputs.lighting,
      brandTokens: inputs.brandTokens,
      negativeAdditions: inputs.negativeAdditions,
      styleId: inputs.styleId,
      cameraId: inputs.cameraId,
      cameraBodyId: inputs.cameraBodyId,
      lensId: inputs.lensId,
      apertureId: inputs.apertureId,
    });

    const aspect = isAspectRatio(g.aspect) ? g.aspect : null;
    if (aspect) setAspect(aspect);

    if (video) {
      setTier(g.tier);
      setGenerateAudio(payload.generate_audio ?? true);
      if (g.duration_s != null) setDurationS(Number(g.duration_s));
      const vr = payload.video_resolution ?? g.resolution;
      if (vr === "480p" || vr === "720p" || vr === "1080p") {
        setVideoResolution(vr);
      }
      const imageUrls = payload.source_image_urls?.length
        ? payload.source_image_urls
        : payload.source_image_url
          ? [payload.source_image_url]
          : (g.reference_urls ?? []);
      setVideoSources(
        imageUrls.map((url, i) => ({
          url,
          generationId: i === 0 ? (payload.source_generation_id ?? null) : null,
        }))
      );
      if (
        imageUrls.some((url) => url.startsWith("asset://")) &&
        libraryAssets === null
      ) {
        void loadAssets();
      }
      setVideoEditSource(
        payload.source_video_url
          ? {
              url: payload.source_video_url,
              generationId: payload.source_video_generation_id ?? null,
              intent: payload.video_intent ?? "edit",
              durationS: g.duration_s ?? null,
            }
          : null
      );
      setVideoRefSources(
        (payload.reference_video_urls ?? []).map((url) => ({
          url,
          generationId: null,
        }))
      );
      const audioUrls = payload.source_audio_urls ?? [];
      const transcripts = inputs.audioTranscripts ?? [];
      setAudioSources(
        audioUrls.map((url, i) => ({
          url,
          name: `audio ${i + 1}`,
          transcript: transcripts[i] ?? null,
        }))
      );
      const nextCinema: CinemaControls = {
        cameraBodyId: inputs.cameraBodyId ?? DEFAULT_DIRECTOR_ID,
        lensId: inputs.lensId ?? DEFAULT_DIRECTOR_ID,
        apertureId: inputs.apertureId ?? DEFAULT_DIRECTOR_ID,
        genreId: inputs.genreId ?? DEFAULT_DIRECTOR_ID,
        eraId: inputs.eraId ?? DEFAULT_DIRECTOR_ID,
        shotId: inputs.shotId ?? DEFAULT_DIRECTOR_ID,
        gradeId: inputs.gradeId ?? DEFAULT_DIRECTOR_ID,
        lightLookId: inputs.lightLookId ?? DEFAULT_DIRECTOR_ID,
        emotionId: inputs.emotionId ?? DEFAULT_DIRECTOR_ID,
        tempoId: inputs.tempoId ?? DEFAULT_DIRECTOR_ID,
        pacingId: inputs.pacingId ?? DEFAULT_DIRECTOR_ID,
      };
      setCinema(nextCinema);
      setCinemaOn(
        !payload.source_video_url && (Object.values(nextCinema).some((id) => id !== DEFAULT_DIRECTOR_ID) || Boolean(inputs.cameraId && inputs.cameraId !== DEFAULT_CAMERA_ID) || Boolean(inputs.action || inputs.lighting))
      );
    } else {
      setVideoSources([]);
      setVideoEditSource(null);
      setVideoRefSources([]);
      setAudioSources([]);
      const modelId = imageModelIdFromEndpoint(g.model_endpoint, g.tier);
      const choice = imageModelChoice(modelId);
      if (choice) applyImageModel(modelId, choice);
      if (g.resolution === "1K" || g.resolution === "2K" || g.resolution === "4K") {
        setResolution(g.resolution);
      }
      const refs =
        g.reference_urls?.length > 0
          ? g.reference_urls
          : payload.source_image_urls?.length
            ? payload.source_image_urls
            : payload.source_image_url
              ? [payload.source_image_url]
              : [];
      setReferenceUrls(refs);
    }

    if (g.brand_kit_id) setActiveBrandKitId(g.brand_kit_id);

    toast.message("Loaded into Create — edit anything, then Generate");
  };

  const onKeyDown = (e: React.KeyboardEvent) => {
    if ((e.metaKey || e.ctrlKey) && e.key === "Enter") {
      e.preventDefault();
      onGenerate();
    }
  };

  // Paste an image straight from the clipboard (⌘V after a screenshot) —
  // routes to the video sources in t2v, or the reference images in t2i.
  const onPromptPaste = (e: React.ClipboardEvent) => {
    const items = e.clipboardData?.items;
    if (!items) return;
    const images = Array.from(items)
      .filter((it) => it.kind === "file" && it.type.startsWith("image/"))
      .map((it) => it.getAsFile())
      .filter((f): f is File => f != null);
    if (images.length === 0) return; // plain text — let the default paste run
    e.preventDefault();
    if (mode === "t2v") {
      void onVideoSourceFiles(images);
    } else {
      void onReferenceFiles(images);
    }
  };

  // Bank an image (a good output, or an attached reference) into the client's
  // reusable reference library — the one-click "save Layla" flow.
  const openSaveReference = (url: string, defaultName = "") => {
    setSaveRefUrl(url);
    setSaveRefName(defaultName);
    setSaveRefKind("character");
    setSaveRefClientId(activeClientId);
    setSaveRefProjectId(activeProjectId);
  };

  const saveReference = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!saveRefUrl || !saveRefName.trim()) return;
    setSavingRef(true);
    try {
      const res = await fetch("/api/reference-assets", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          name: saveRefName.trim(),
          url: saveRefUrl,
          kind: saveRefKind,
          clientId: saveRefClientId,
          projectId: saveRefProjectId,
        }),
      });
      const json = await res.json();
      if (!res.ok) throw new Error(json.error);
      const savedClient = clients.find((c) => c.id === saveRefClientId);
      toast.success(
        savedClient
          ? `Saved “${json.reference.name}” to ${savedClient.name}`
          : `Saved “${json.reference.name}” to the shared library`
      );
      setSaveRefUrl(null);
      setSaveRefName("");
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Save failed");
    } finally {
      setSavingRef(false);
    }
  };

  useEffect(() => {
    if (!connectionsOpen) return;
    let cancelled = false;
    void (async () => {
      try {
        const res = await fetch("/api/status");
        const json = await res.json();
        if (!cancelled && res.ok) {
          setConnectionStatus({
            modelArk: Boolean(json.modelArk),
            spaces: Boolean(json.spaces),
            database: json.database as "ok" | "error" | "missing",
          });
        }
      } catch {
        if (!cancelled) setConnectionStatus(null);
      } finally {
        if (!cancelled) setStatusLoading(false);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [connectionsOpen]);

  const navBtn = (
    active: boolean,
    onClick: () => void,
    icon: React.ReactNode,
    label: string,
    /** Anchor id for the onboarding walkthrough. */
    tourId?: string
  ) => (
    <button
      type="button"
      data-tour={tourId}
      aria-current={active ? "page" : undefined}
      onClick={() => {
        onClick();
        setSidebarOpen(false);
      }}
      className={cn(
        "athar-nav relative flex min-h-7 w-full items-center gap-2.5 rounded-lg px-3 py-1 text-left text-xs transition",
        active
          ? "bg-sidebar-accent text-sidebar-accent-foreground shadow-[inset_0_0_0_1px_var(--sidebar-border)]"
          : "text-muted-foreground hover:bg-sidebar-accent/60 hover:text-foreground"
      )}
    >
      {icon}
      <span>{label}</span>
      {active && <span className="ml-auto size-1.5 shrink-0 rounded-full bg-gold" aria-hidden />}
    </button>
  );

  /**
   * Select mode drives two batch actions with different eligibility:
   * Upscale takes stills only, bulk delete (admins) takes anything. So the
   * card selection itself is unrestricted and each action filters its own
   * targets.
   */
  /**
   * Selection is one flat list of ids shared across all three Library card
   * kinds. A render/transcript key is its own row id; a voice-over key is
   * the card's `group_id` (one card = every version of that script) — the
   * three id spaces never collide, so a plain string list is enough for
   * "is this selected" without tagging each entry with its kind.
   */
  const toggleSelected = (item: { id: string }) => {
    setSelectedIds((prev) =>
      prev.includes(item.id)
        ? prev.filter((x) => x !== item.id)
        : [...prev, item.id]
    );
  };

  const selectedGenerations = (generations ?? []).filter((g) =>
    selectedIds.includes(g.id)
  );
  const upscalableSelected = selectedGenerations.filter(
    (g) => !isVideo(g) && g.output_url
  );

  const bulkDelete = async () => {
    if (bulkDeleting) return;
    const ids = selectedIds;
    if (ids.length === 0) return;
    setBulkDeleting(true);
    try {
      const genIds = ids.filter((id) =>
        (generations ?? []).some((g) => g.id === id)
      );
      const transcriptIds = ids.filter((id) =>
        (libraryTranscripts ?? []).some((t) => t.id === id)
      );
      // A voice card's id is its group_id; deleting the card deletes every
      // version in that group, not just the latest one shown on the card.
      const voiceGroupIds = ids.filter((id) =>
        (libraryVoices ?? []).some((v) => v.group_id === id)
      );
      const voiceVersionIds = (libraryVoices ?? [])
        .filter((v) => voiceGroupIds.includes(v.group_id))
        .map((v) => v.id);

      const results = await Promise.allSettled([
        genIds.length
          ? fetch("/api/generations/bulk-delete", {
              method: "POST",
              headers: { "Content-Type": "application/json" },
              body: JSON.stringify({ ids: genIds }),
            }).then(async (res) => {
              const json = await res.json();
              if (!res.ok) throw new Error(json.error ?? "Delete failed");
              return { kind: "render" as const, ids: json.ids as string[] };
            })
          : Promise.resolve({ kind: "render" as const, ids: [] }),
        ...transcriptIds.map((id) =>
          fetch(`/api/transcripts/${id}`, { method: "DELETE" }).then(
            (res) => {
              if (!res.ok) throw new Error("Delete failed");
              return { kind: "transcript" as const, ids: [id] };
            }
          )
        ),
        ...voiceVersionIds.map((id) =>
          fetch(`/api/tts/${id}`, { method: "DELETE" }).then((res) => {
            if (!res.ok) throw new Error("Delete failed");
            return { kind: "voice" as const, ids: [id] };
          })
        ),
      ]);

      const deletedGenIds = new Set<string>();
      const deletedTranscriptIds = new Set<string>();
      const deletedVoiceVersionIds = new Set<string>();
      let failures = 0;
      for (const r of results) {
        if (r.status === "rejected") {
          failures++;
          continue;
        }
        const target =
          r.value.kind === "render"
            ? deletedGenIds
            : r.value.kind === "transcript"
              ? deletedTranscriptIds
              : deletedVoiceVersionIds;
        for (const id of r.value.ids) target.add(id);
      }

      if (deletedGenIds.size > 0) {
        setGenerations((prev) =>
          prev ? prev.filter((row) => !deletedGenIds.has(row.id)) : prev
        );
      }
      if (deletedTranscriptIds.size > 0) {
        setLibraryTranscripts((prev) =>
          prev ? prev.filter((row) => !deletedTranscriptIds.has(row.id)) : prev
        );
      }
      if (deletedVoiceVersionIds.size > 0) {
        setLibraryVoices((prev) =>
          prev ? prev.filter((row) => !deletedVoiceVersionIds.has(row.id)) : prev
        );
      }
      setSelectedIds([]);
      setBulkDeleteOpen(false);
      // Close the detail overlay if it was showing something just removed.
      setDetailTarget((cur) => (cur && deletedGenIds.has(cur.id) ? null : cur));

      const deletedCount =
        deletedGenIds.size + deletedTranscriptIds.size + voiceGroupIds.length;
      if (failures > 0) {
        toast.error(
          `Deleted ${deletedCount}, ${failures} failed — try the rest again`
        );
      } else {
        toast.success(`Deleted ${deletedCount} item${deletedCount === 1 ? "" : "s"}`);
      }
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Bulk delete failed");
    } finally {
      setBulkDeleting(false);
    }
  };

  const renderCard = (g: GenerationRecord, i: number, allowSelection = true) => {
    const selected = allowSelection && selectMode && selectedIds.includes(g.id);
    return (
    <article
      key={g.id}
      className={cn(
        "animate-card-in group relative rounded-2xl",
        SELECTED_GLOW_CLASS(selected)
      )}
      style={{ animationDelay: `${Math.min(i, 8) * 40}ms` }}
    >
      <div
        className={cn(
          "relative overflow-hidden rounded-2xl bg-card ring-1 ring-border transition",
          selected && "ring-2 ring-gold"
        )}
      >
      <button
        type="button"
        className="block w-full text-left"
        onClick={() => (allowSelection && selectMode ? toggleSelected(g) : openDetail(g))}
        title={allowSelection && selectMode ? "Select" : "Open details"}
      >
        {g.output_url ? (
          isVideo(g) ? (
            <VideoThumb src={g.output_url} />
          ) : (
            // eslint-disable-next-line @next/next/no-img-element
            <img
              src={g.output_url}
              alt={g.final_prompt}
              loading="lazy"
              className="aspect-video w-full object-cover transition duration-500 group-hover:scale-[1.02]"
            />
          )
        ) : (
          <div className="flex aspect-video items-center justify-center bg-muted/40 text-xs text-muted-foreground">
            No preview
          </div>
        )}
      </button>

      <div className="pointer-events-none absolute top-2 left-2 z-10 flex gap-1">
        {g.qc_score != null && (
          <span
            title={`AI quality score ${Math.round(g.qc_score * 100)}/100`}
            className={cn(
              "rounded-md px-1.5 py-0.5 text-[10px] font-semibold backdrop-blur-sm",
              g.qc_score >= 0.8
                ? "bg-gold text-primary-foreground"
                : "bg-black/70 text-white"
            )}
          >
            AI {Math.round(g.qc_score * 100)}
          </span>
        )}
        {g.brand_flagged === true && (
          <span
            title={g.brand_notes || "Off-brand"}
            className="rounded-md bg-red-500/85 px-1.5 py-0.5 text-[10px] font-semibold text-white backdrop-blur-sm"
          >
            Off-brand
          </span>
        )}
        {g.brand_flagged === false && (
          <span
            title="Passed brand check"
            className="rounded-md bg-black/70 px-1.5 py-0.5 text-[10px] font-semibold text-white backdrop-blur-sm"
          >
            On-brand ✓
          </span>
        )}
      </div>

      {allowSelection && selectMode && g.output_url && (
        <span
          className={cn(
            "pointer-events-none absolute top-2.5 left-2.5 flex size-6 items-center justify-center rounded-full ring-1 transition",
            selected
              ? "bg-gold text-primary-foreground ring-gold"
              : "bg-black/50 text-transparent ring-white/40"
          )}
        >
          <Check className="size-3.5" />
        </span>
      )}

      <div className="pointer-events-none absolute inset-0 bg-black/80 opacity-0 transition duration-300 group-hover:opacity-100" />

      {/* Rating sits over the card so it costs nothing to give: one click for
          good, one click plus a reason for not good. Shown only to the person
          who made it — GenerationRating decides that itself. */}
      {!selectMode && g.output_url && (
        <div className="dark absolute top-2 right-2 opacity-0 transition duration-300 group-hover:opacity-100">
          <GenerationRating
            generation={g}
            onRated={(rating, reasons, note) => patchGenerationRating(g.id, rating, reasons, note)}
            className="rounded-lg bg-black/60 p-0.5 backdrop-blur-sm"
          />
        </div>
      )}

      <div className="absolute inset-x-0 bottom-0 translate-y-2 p-3 opacity-0 transition duration-300 group-hover:translate-y-0 group-hover:opacity-100">
        <p className="mb-2 line-clamp-2 text-[11px] leading-snug text-white/85">
          {g.final_prompt}
        </p>
        <div className="mb-2 flex flex-wrap gap-1.5 font-mono text-[10px] text-white/55">
          <span className="rounded bg-white/10 px-1.5 py-0.5">{g.mode}</span>
          <span className="rounded bg-white/10 px-1.5 py-0.5">{g.tier}</span>
          {g.duration_s != null && <span>{g.duration_s}s</span>}
          <span>· {g.cost == null ? "Usage-based" : `$${Number(g.cost).toFixed(3)}`}</span>
        </div>
        <div className="pointer-events-auto flex gap-2">
          <Button
            size="sm"
            variant="secondary"
            className="h-8 flex-1 gap-1.5 bg-gold/90 text-xs text-primary-foreground hover:bg-gold"
            disabled={generating}
            onClick={() => openDetail(g)}
          >
            <Wand2 className="size-3" />
            Open
          </Button>
          <Button
            size="sm"
            variant="secondary"
            className="h-8 flex-1 gap-1.5 bg-white/15 text-xs text-white hover:bg-white/25"
            disabled={generating}
            onClick={() => openVary(g)}
          >
            <Shuffle className="size-3" />
            Vary
          </Button>
          <Button
            size="sm"
            variant="secondary"
            className="h-8 flex-1 gap-1.5 bg-white/15 text-xs text-white hover:bg-white/25"
            disabled={generating}
            onClick={() => reuseGeneration(g)}
          >
            <RefreshCw className="size-3" />
            Reuse
          </Button>
        </div>
      </div>
      </div>
    </article>
    );
  };

  /** Audio has no visual, so voice-overs and transcripts get an icon tile
      instead of the image/video preview `renderCard` uses. */
  const renderVoiceCard = (v: TtsGenerationRecord, versions: TtsGenerationRecord[], i: number) => {
    // The card represents the whole group, so its selection key is the
    // group_id, not any one version's id — matches bulkDelete's expansion
    // of a selected group into every version it contains.
    const selected = selectMode && selectedIds.includes(v.group_id);
    return (
    <article
      key={v.group_id}
      className={cn(
        "animate-card-in group relative rounded-2xl",
        SELECTED_GLOW_CLASS(selected)
      )}
      style={{ animationDelay: `${Math.min(i, 8) * 40}ms` }}
    >
      <div
        className={cn(
          "relative overflow-hidden rounded-2xl bg-card ring-1 ring-border transition",
          selected && "ring-2 ring-gold"
        )}
      >
      <button
        type="button"
        className="flex aspect-video w-full flex-col items-center justify-center gap-2 bg-gradient-to-br from-gold-soft/25 to-transparent text-left transition group-hover:from-gold-soft/40"
        onClick={() =>
          selectMode
            ? toggleSelected({ id: v.group_id })
            : (setVoiceDetailTarget(v), setVoiceDetailVersions(versions))
        }
        title={selectMode ? "Select" : "Open voice-over"}
      >
        <span className="flex size-11 items-center justify-center rounded-full bg-white/8">
          <Mic className="size-5 text-gold" />
        </span>
        <span className="px-4 text-center text-xs text-muted-foreground">
          {v.duration_s ? `${v.duration_s.toFixed(1)}s` : "Voice-over"}
        </span>
      </button>
      <div className="pointer-events-none absolute top-2 left-2 z-10 flex gap-1">
        <span className="rounded-md bg-black/70 px-1.5 py-0.5 text-[10px] font-semibold text-white backdrop-blur-sm">
          Voice-over
        </span>
        {versions.length > 1 && (
          <span className="rounded-md bg-gold/90 px-1.5 py-0.5 text-[10px] font-semibold text-primary-foreground backdrop-blur-sm">
            {versions.length} versions
          </span>
        )}
      </div>
      {selectMode && (
        <span
          className={cn(
            "pointer-events-none absolute top-2.5 left-2.5 flex size-6 items-center justify-center rounded-full ring-1 transition",
            selected
              ? "bg-gold text-primary-foreground ring-gold"
              : "bg-black/50 text-transparent ring-white/40"
          )}
        >
          <Check className="size-3.5" />
        </span>
      )}
      <div className="p-3">
        <p className="truncate text-sm text-foreground">{v.title}</p>
        <p className="mt-0.5 truncate text-[11px] text-muted-foreground">
          {[v.client_name, v.cost > 0 ? `$${v.cost.toFixed(3)}` : null, new Date(v.created_at).toLocaleDateString()]
            .filter(Boolean)
            .join(" · ")}
        </p>
      </div>
      </div>
    </article>
    );
  };

  const renderTranscriptCard = (t: TranscriptRecord, i: number) => {
    const selected = selectMode && selectedIds.includes(t.id);
    return (
    <article
      key={t.id}
      className={cn(
        "animate-card-in group relative rounded-2xl",
        SELECTED_GLOW_CLASS(selected)
      )}
      style={{ animationDelay: `${Math.min(i, 8) * 40}ms` }}
    >
      <div
        className={cn(
          "relative overflow-hidden rounded-2xl bg-card ring-1 ring-border transition",
          selected && "ring-2 ring-gold"
        )}
      >
      <button
        type="button"
        className="flex aspect-video w-full flex-col items-center justify-center gap-2 bg-gradient-to-br from-white/8 to-transparent text-left transition group-hover:from-white/12"
        onClick={() =>
          selectMode
            ? toggleSelected(t)
            : (setLibraryOpenTranscriptId(t.id), setView("transcribe"))
        }
        title={selectMode ? "Select" : "Open transcript"}
      >
        <span className="flex size-11 items-center justify-center rounded-full bg-white/8">
          {t.media_kind === "video" ? (
            <Film className="size-5 text-muted-foreground" />
          ) : (
            <AudioLines className="size-5 text-muted-foreground" />
          )}
        </span>
        <span className="px-4 text-center text-xs text-muted-foreground">
          {t.duration_s ? `${Math.round(t.duration_s)}s` : "Transcript"}
        </span>
      </button>
      <div className="pointer-events-none absolute top-2 left-2 z-10">
        <span className="rounded-md bg-black/70 px-1.5 py-0.5 text-[10px] font-semibold text-white backdrop-blur-sm">
          Transcript
        </span>
      </div>
      {selectMode && (
        <span
          className={cn(
            "pointer-events-none absolute top-2.5 left-2.5 flex size-6 items-center justify-center rounded-full ring-1 transition",
            selected
              ? "bg-gold text-primary-foreground ring-gold"
              : "bg-black/50 text-transparent ring-white/40"
          )}
        >
          <Check className="size-3.5" />
        </span>
      )}
      <div className="p-3">
        <p className="truncate text-sm text-foreground">{t.title}</p>
        <p className="mt-0.5 truncate text-[11px] text-muted-foreground">
          {[t.client_name, t.language?.toUpperCase(), new Date(t.created_at).toLocaleDateString()]
            .filter(Boolean)
            .join(" · ")}
        </p>
      </div>
      </div>
    </article>
    );
  };

  const galleryLoader = (
    <div className="flex flex-col items-center justify-center gap-3 py-16 text-muted-foreground">
      <Loader2 className="size-5 animate-spin" />
      <p className="text-sm">Loading library</p>
    </div>
  );

  const showDock = view === "create";

  /**
   * The dock grows a long way past its resting height — an open asset
   * library, an attached first frame, a long prompt — and a fixed pb-52 left
   * the render area hidden behind it. Measure it instead and pad the scroll
   * area by what it actually occupies.
   */
  const dockRef = useRef<HTMLDivElement>(null);
  const [dockHeight, setDockHeight] = useState(0);
  useEffect(() => {
    const el = dockRef.current;
    if (!el || !showDock) {
      setDockHeight(0);
      return;
    }
    const observer = new ResizeObserver(([entry]) => {
      setDockHeight(entry.contentRect.height);
    });
    observer.observe(el);
    return () => observer.disconnect();
  }, [showDock]);

  return (
    <div className="relative flex h-dvh overflow-hidden bg-background text-foreground">
      <a href="#studio-main" className="sr-only z-[100] rounded-lg bg-gold px-4 py-3 text-sm font-medium text-primary-foreground focus:not-sr-only focus:fixed focus:top-3 focus:left-3">Skip to workspace</a>
      {/* Dims the app while the mobile drawer is open. */}
      {sidebarOpen && (
        <button
          type="button"
          aria-label="Close menu"
          onClick={() => setSidebarOpen(false)}
          className="fixed inset-0 z-40 bg-black/60 md:hidden"
        />
      )}

      {/* Sidebar: off-canvas drawer under md, static column from md up. */}
      <aside
        ref={sidebarRef}
        id="studio-sidebar"
        aria-label="Workspace navigation"
        role={sidebarOpen && !isDesktopSidebar ? "dialog" : undefined}
        aria-modal={sidebarOpen && !isDesktopSidebar ? true : undefined}
        inert={!sidebarOpen && !isDesktopSidebar}
        className={cn(
          "fixed inset-y-0 left-0 z-50 flex h-full w-60 shrink-0 flex-col overflow-hidden border-r border-sidebar-border bg-sidebar px-3 pt-4 pb-3 transition-transform duration-200 ease-out",
          "md:relative md:z-10 md:translate-x-0",
          sidebarOpen ? "translate-x-0" : "-translate-x-full"
        )}
      >
        {/* Same lockup treatment as the login page: Athar, a hairline
            divider, then the "by YAZ Media" mark. */}
        <div className="flex items-center gap-2 px-2">
          <AtharLogo height={ATHAR_LOCKUP_MIN_HEIGHT} priority />
          <span className="h-7 w-px shrink-0 bg-sidebar-border" aria-hidden />
          <a
            href="https://yazmedia.com"
            target="_blank"
            rel="noreferrer"
            aria-label="by YAZ Media"
            className="flex shrink-0 items-center gap-1 opacity-50 transition hover:opacity-90"
          >
            <span className="text-[0.5rem] tracking-[0.14em] text-muted-foreground uppercase">
              by
            </span>
            <YazMediaLogo height={14} />
          </a>
        </div>
        <button type="button" onClick={() => setSidebarOpen(false)} aria-label="Close navigation" className="absolute right-2 top-2 rounded-lg p-1.5 text-muted-foreground hover:bg-sidebar-accent md:hidden"><X className="size-4" /></button>
        <div data-tour="new-generation" className="relative mt-3 mb-2.5">
          <Button
            ref={generateButtonRef}
            className="h-10 w-full justify-center gap-2 rounded-xl bg-primary text-sm font-semibold text-primary-foreground shadow-sm hover:bg-primary/90"
            onClick={() => setGenerateMenuOpen((o) => !o)}
            onKeyDown={(event) => {
              if (event.key === "ArrowDown") {
                event.preventDefault();
                setGenerateMenuOpen(true);
              }
            }}
            aria-haspopup="menu"
            aria-expanded={generateMenuOpen}
            aria-controls={generateMenuOpen ? "studio-create-menu" : undefined}
          >
            <Plus className="size-4" />
            Create new
            <ChevronDown
              className={cn(
                "size-3.5 transition",
                generateMenuOpen && "rotate-180"
              )}
            />
          </Button>

          {generateMenuOpen && (
            <>
              {/* A div, not a button: clicking a button focuses it, and a
                  focused element behind an aria-hidden boundary trips the
                  assistive-tech warning. Mouse-only click-away — keyboard
                  users close the menu by choosing an item. */}
              <div
                aria-hidden
                className="fixed inset-0 z-30 cursor-default"
                onClick={() => setGenerateMenuOpen(false)}
              />
              <div
                id="studio-create-menu"
                ref={generateMenuRef}
                role="menu"
                aria-label="Create new"
                onKeyDown={(event) => {
                  if (event.key === "Escape") {
                    event.preventDefault();
                    event.stopPropagation();
                    setGenerateMenuOpen(false);
                    generateButtonRef.current?.focus();
                    return;
                  }
                  if (!["ArrowDown", "ArrowUp", "Home", "End"].includes(event.key)) return;
                  event.preventDefault();
                  const items = Array.from(event.currentTarget.querySelectorAll<HTMLButtonElement>('[role="menuitem"]'));
                  const current = items.indexOf(document.activeElement as HTMLButtonElement);
                  const next = event.key === "Home" ? 0 : event.key === "End" ? items.length - 1 : (current + (event.key === "ArrowDown" ? 1 : -1) + items.length) % items.length;
                  items[next]?.focus();
                }}
                className="absolute inset-x-0 top-full z-40 mt-1.5 overflow-hidden rounded-xl border border-sidebar-border bg-popover p-1 shadow-lg"
              >
                {[
                  {
                    icon: <ImageIcon className="size-4" />,
                    label: "Image",
                    hint: "Text → image",
                    run: () => openTool("t2i"),
                  },
                  {
                    icon: <Clapperboard className="size-4" />,
                    label: "Video",
                    hint: "Text or image → video",
                    run: () => openTool("t2v"),
                  },
                  {
                    icon: <AudioLines className="size-4" />,
                    label: "Transcribe",
                    hint: "Audio or video → transcript",
                    run: () => setView("transcribe"),
                  },
                  {
                    icon: <Mic className="size-4" />,
                    label: "Voice",
                    hint: "Text → voice-over",
                    run: () => setView("tts"),
                  },
                  {
                    icon: <Film className="size-4" />,
                    label: "Storyboard",
                    hint: "Plan and generate a shot list",
                    run: () => setView("storyboard"),
                  },
                ].map((opt) => (
                  <button
                    key={opt.label}
                    type="button"
                    role="menuitem"
                    onClick={() => {
                      setGenerateMenuOpen(false);
                      setSidebarOpen(false);
                      opt.run();
                    }}
                    className="flex w-full items-center gap-2.5 rounded-lg px-2.5 py-2 text-left transition hover:bg-sidebar-accent"
                  >
                    <span className="text-muted-foreground">{opt.icon}</span>
                    <span className="min-w-0 flex-1">
                      <span className="block text-sm leading-tight text-foreground">
                        {opt.label}
                      </span>
                      <span className="block text-[11px] text-muted-foreground">
                        {opt.hint}
                      </span>
                    </span>
                  </button>
                ))}
              </div>
            </>
          )}
        </div>

        <div className="min-h-0 flex-1">
        <nav aria-label="Studio" className="space-y-0.5">
          {navBtn(view === "home", () => setView("home"), <Home className="size-4" />, "Explore")}
          <p className="px-3 pt-1.5 pb-0 text-[8px] font-semibold tracking-[0.14em] text-muted-foreground uppercase">Video</p>
          {navBtn(view === "create" && mode === "t2v" && !cinemaOn, () => openTool("t2v"), <Clapperboard className="size-4" />, "Video")}
          {navBtn(view === "create" && cinemaOn, () => { openTool("t2v"); setCinemaOn(true); }, <Aperture className="size-4" />, "Cinema Studio")}
          {navBtn(view === "motion", () => setView("motion"), <Film className="size-4" />, "Motion design")}
          {navBtn(view === "effects", () => setView("effects"), <Sparkles className="size-4" />, "Looks & motion")}
          {navBtn(view === "storyboard", () => setView("storyboard"), <Film className="size-4" />, "Storyboard", "storyboard")}

          <p className="px-3 pt-1.5 pb-0 text-[8px] font-semibold tracking-[0.14em] text-muted-foreground uppercase">Image</p>
          {navBtn(view === "create" && mode === "t2i", () => openTool("t2i"), <ImageIcon className="size-4" />, "Image")}

          <p className="px-3 pt-1.5 pb-0 text-[8px] font-semibold tracking-[0.14em] text-muted-foreground uppercase">Audio</p>
          {navBtn(view === "tts", () => setView("tts"), <Mic className="size-4" />, "Voice", "tts")}
          {navBtn(view === "transcribe", () => setView("transcribe"), <AudioLines className="size-4" />, "Transcribe", "transcribe")}

          <p className="px-3 pt-1.5 pb-0 text-[8px] font-semibold tracking-[0.14em] text-muted-foreground uppercase">Workspace</p>
          {navBtn(view === "clients", () => setView("clients"), <FolderKanban className="size-4" />, "Clients & projects")}
          {navBtn(view === "library", () => setView("library"), <Library className="size-4" />, "Library", "library")}
          {navBtn(view === "assets", () => setView("assets"), <Boxes className="size-4" />, "Brand assets", "assets")}
          {isManagement && navBtn(view === "usage", () => setView("usage"), <BarChart3 className="size-4" />, "Usage & cost", "usage")}
        </nav>

        {/* Client / project / brand kit now live in the generate dock, next
            to the other things you set before pressing Generate. */}
        </div>

        <div className="relative mt-2 flex shrink-0 items-center gap-1 border-t border-sidebar-border pt-2">
          {connectionsOpen && (
            <div className="absolute bottom-full left-0 right-0 mb-2 rounded-xl border border-sidebar-border bg-popover p-3 shadow-lg">
              <p className="mb-2 text-xs font-medium text-foreground">
                Connections
              </p>
              {statusLoading && !connectionStatus ? (
                <div className="flex items-center gap-2 text-xs text-muted-foreground">
                  <Loader2 className="size-3.5 animate-spin" />
                  Checking…
                </div>
              ) : connectionStatus ? (
                <ul className="space-y-2 text-xs">
                  <li className="flex items-center justify-between gap-2">
                    <span className="text-muted-foreground">BytePlus ModelArk</span>
                    <span
                      className={cn(
                        "font-medium",
                        connectionStatus.modelArk
                          ? "text-foreground"
                          : "text-muted-foreground"
                      )}
                    >
                      {connectionStatus.modelArk ? "Connected" : "Missing"}
                    </span>
                  </li>
                  <li className="flex items-center justify-between gap-2">
                    <span className="text-muted-foreground">Postgres</span>
                    <span
                      className={cn(
                        "font-medium",
                        connectionStatus.database === "ok"
                          ? "text-foreground"
                          : "text-muted-foreground"
                      )}
                    >
                      {connectionStatus.database === "ok"
                        ? "Connected"
                        : connectionStatus.database === "missing"
                          ? "Missing"
                          : "Error"}
                    </span>
                  </li>
                  <li className="flex items-center justify-between gap-2">
                    <span className="text-muted-foreground">Spaces</span>
                    <span
                      className={cn(
                        "font-medium",
                        connectionStatus.spaces
                          ? "text-foreground"
                          : "text-muted-foreground"
                      )}
                    >
                      {connectionStatus.spaces ? "Connected" : "Missing"}
                    </span>
                  </li>
                </ul>
              ) : (
                <p className="text-xs text-muted-foreground">
                  Status failed
                </p>
              )}
            </div>
          )}

          <div className="flex shrink-0 items-center gap-0.5">
            <button
              type="button"
              aria-label="Take the tour"
              data-tour="help"
              onClick={startTour}
              className="group relative flex size-9 items-center justify-center rounded-lg text-muted-foreground transition hover:bg-sidebar-accent hover:text-foreground"
            >
              <HelpCircle className="size-4" />
              <span className="pointer-events-none absolute -top-8 left-1/2 z-50 -translate-x-1/2 rounded-md bg-foreground px-2 py-1 text-[10px] whitespace-nowrap text-background opacity-0 shadow-md transition-opacity duration-100 group-hover:opacity-100">
                Take the tour
              </span>
            </button>
            {isManagement && (
            <button
              type="button"
              aria-label="Connections"
              aria-expanded={connectionsOpen}
              onClick={() => {
                if (!connectionsOpen) setStatusLoading(true);
                setConnectionsOpen((open) => !open);
              }}
              className={cn(
                "group relative flex size-9 items-center justify-center rounded-lg text-muted-foreground transition hover:bg-sidebar-accent hover:text-foreground",
                connectionsOpen && "bg-sidebar-accent text-foreground"
              )}
            >
              <Plug className="size-4" />
              <span className="pointer-events-none absolute -top-8 left-1/2 z-50 -translate-x-1/2 rounded-md bg-foreground px-2 py-1 text-[10px] whitespace-nowrap text-background opacity-0 shadow-md transition-opacity duration-100 group-hover:opacity-100">
                Connections
              </span>
            </button>
            )}
            <button
              type="button"
              aria-label="Toggle theme"
              onClick={() =>
                setTheme(resolvedTheme === "dark" ? "light" : "dark")
              }
              className="group relative flex size-9 items-center justify-center rounded-lg text-muted-foreground transition hover:bg-sidebar-accent hover:text-foreground"
            >
              {!themeReady ? (
                <Moon className="size-4" />
              ) : resolvedTheme === "dark" ? (
                <Moon className="size-4" />
              ) : (
                <Sun className="size-4" />
              )}
              <span className="pointer-events-none absolute -top-8 left-1/2 z-50 -translate-x-1/2 rounded-md bg-foreground px-2 py-1 text-[10px] whitespace-nowrap text-background opacity-0 shadow-md transition-opacity duration-100 group-hover:opacity-100">
                Toggle theme
              </span>
            </button>
          </div>
          <SidebarUser className="flex-1" onManageTeam={() => setView("team")} />
        </div>
      </aside>

      {/* Main */}
      <main id="studio-main" tabIndex={-1} inert={sidebarOpen && !isDesktopSidebar} className="studio-main relative z-10 flex min-w-0 flex-1 flex-col outline-none">
        <button
          type="button"
          ref={menuButtonRef}
          aria-label="Open menu"
          aria-controls="studio-sidebar"
          aria-expanded={sidebarOpen}
          onClick={() => setSidebarOpen(true)}
          className="absolute top-4 left-4 z-40 inline-flex size-9 items-center justify-center rounded-lg bg-card text-muted-foreground ring-1 ring-border transition hover:text-foreground md:hidden"
        >
          <Menu className="size-4" />
        </button>
        <div className="absolute top-5 right-6 z-40 sm:right-8">
          <span data-tour="notifications" className="inline-flex">
          <NotificationsBell
            notifications={notifications}
            onMarkAllRead={() =>
              setNotifications((prev) =>
                prev.map((n) => (n.read ? n : { ...n, read: true }))
              )
            }
            onClearAll={() => setNotifications([])}
            onItemClick={(n) => {
              if (!n.generationId) {
                toast.error(
                  "This notification has no library item — it may be from the other database."
                );
                return;
              }
              void openLibraryItem(
                n.kind === "transcript" ? "transcript" : n.kind === "voice" ? "tts" : "generation",
                n.generationId
              );
            }}
          />
          </span>
        </div>

        {detailTarget && (
          <ImageDetail
            onRated={(r, reasons, note) =>
              patchGenerationRating(detailTarget.id, r, reasons, note)
            }
            generation={detailTarget}
            onClose={() => setDetailTarget(null)}
            {...detailNavFor(detailTarget.id)}
            onEdit={openEdit}
            onVary={openVary}
            onReuse={reuseGeneration}
            onUpscale={(g) => setUpscaleTargets([fromGeneration(g)])}
            onSaveReference={(g) => {
              if (g.output_url) openSaveReference(g.output_url);
            }}
            onRemoveBackground={async (g) => {
              try {
                const { res, json } = await postJson(
                  "/api/background/remove",
                  { generationId: g.id }
                );
                if (!res.ok)
                  throw new Error(json.error ?? "Background removal failed");
                toast.success("Background removed");
                await loadGallery();
                setDetailTarget(json.generation as GenerationRecord);
              } catch (err) {
                toast.error(
                  err instanceof Error ? err.message : "Background removal failed"
                );
              }
            }}
            onUsePrompt={(g) => {
              const inputs = promptInputsOf(g);
              setDetailTarget(null);
              openTool("t2i", {
                subject: inputs.subject || g.final_prompt,
                action: inputs.action,
                lighting: inputs.lighting,
                brandTokens: inputs.brandTokens,
              });
              void navigator.clipboard.writeText(g.final_prompt).catch(() => {});
              toast.success("Prompt ready");
            }}
            onCreateVideo={(g) => {
              const inputs = promptInputsOf(g);
              setDetailTarget(null);
              if (g.output_url) {
                setVideoSources([{ url: g.output_url, generationId: g.id }]);
              }
              openTool("t2v", {
                subject: inputs.subject || g.final_prompt,
                action: inputs.action,
                lighting: inputs.lighting,
                brandTokens: inputs.brandTokens,
              });
              toast.message(
                "Video Generator ready — this image is the first frame. Describe the motion."
              );
            }}
            onFavorite={async (g, isFavorite) => {
              const res = await fetch(`/api/generations/${g.id}`, {
                method: "PATCH",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify({ is_favorite: isFavorite }),
              });
              const json = await res.json();
              if (!res.ok) throw new Error(json.error ?? "Could not update favorite");
              const next = json.generation as GenerationRecord;
              setDetailTarget(next);
              setGenerations((prev) =>
                prev
                  ? prev.map((row) => (row.id === next.id ? next : row))
                  : prev
              );
            }}
            projects={projects}
            clients={clients}
            onMoveToProject={moveToProject}
          />
        )}

        {upscaleTargets && upscaleTargets.length > 0 && (
          <UpscaleDialog
            sources={upscaleTargets}
            open
            onOpenChange={(o) => {
              if (!o) setUpscaleTargets(null);
            }}
            onDone={async (results) => {
              const fromAsset = upscaleTargets.some((s) => s.referenceAssetId);
              setUpscaleTargets(null);
              setSelectedIds([]);
              setSelectMode(false);
              await loadGallery();
              if (fromAsset) setAssetsReload((n) => n + 1);
              if (results.length === 1) setDetailTarget(results[0]);
            }}
          />
        )}

        {videoDetailTarget && (
          <VideoDetail
            onRated={(r, reasons, note) =>
              patchGenerationRating(videoDetailTarget.id, r, reasons, note)
            }
            generation={videoDetailTarget}
            hasEditSource={!!videoEditSource}
            onClose={() => setVideoDetailTarget(null)}
            {...detailNavFor(videoDetailTarget.id)}
            onReuse={reuseGeneration}
            onUsePrompt={(g) => {
              const inputs = promptInputsOf(g);
              setVideoDetailTarget(null);
              openTool("t2v", {
                subject: inputs.subject || g.final_prompt,
                action: inputs.action,
                lighting: inputs.lighting,
                brandTokens: inputs.brandTokens,
              });
              toast.success("Prompt ready");
            }}
            onEditVideo={(g, intent) => {
              if (!g.output_url) {
                toast.message("No video");
                return;
              }
              setVideoDetailTarget(null);
              setVideoSources([]);
              setVideoRefSources([]);
              // Start with an empty prompt — the placeholder guides the
              // @video1 edit/extend phrasing. Prefilling the original prompt
              // caused accidental full-scene re-renders.
              openTool("t2v", null);
              setVideoEditSource({
                url: g.output_url,
                generationId: g.id,
                intent,
                durationS: g.duration_s ?? null,
              });
              toast.message(
                intent === "extend"
                  ? "Video Generator ready — describe how the scene continues from @video1."
                  : "Video Generator ready — describe the change to @video1."
              );
            }}
            onAddReferenceVideo={(g) => {
              if (!g.output_url) {
                toast.message("No video");
                return;
              }
              if (videoEditSource) {
                toast.error("Remove the attached edit source first");
                return;
              }
              if (videoRefSources.some((s) => s.url === g.output_url)) {
                toast.error("Already attached");
                return;
              }
              if (videoRefSources.length >= MAX_REFERENCE_VIDEOS) {
                toast.error(`Up to ${MAX_REFERENCE_VIDEOS} reference videos`);
                return;
              }
              setVideoDetailTarget(null);
              // Additive: keep the prompt the person is already writing —
              // only jump into a fresh Create session when not already there.
              if (mode !== "t2v" || view !== "create") {
                openTool("t2v", null);
              }
              const url = g.output_url;
              setVideoRefSources((prev) => {
                const next = [...prev, { url, generationId: g.id }];
                toast.message(
                  `Video Generator ready — reference it as @video${next.length}`
                );
                return next;
              });
            }}
            onOpenSourceVideo={(generationId) => {
              const source = (generations ?? []).find(
                (row) => row.id === generationId
              );
              if (!source) {
                toast.message("Source missing");
                return;
              }
              setVideoDetailTarget(source);
            }}
            onOpenSource={(generationId) => {
              const source = (generations ?? []).find(
                (row) => row.id === generationId
              );
              if (!source) {
                toast.message("Source missing");
                return;
              }
              setVideoDetailTarget(null);
              setDetailTarget(source);
            }}
            projects={projects}
            clients={clients}
            onMoveToProject={moveToProject}
          />
        )}

        {view === "edit" && (
          <ImageChat
            generation={editTarget}
            libraryImages={(generations ?? []).filter(
              (g) => !isVideo(g) && Boolean(g.output_url)
            )}
            generating={generating}
            onBack={() => {
              setView("library");
              setEditTarget(null);
            }}
            onEdit={submitEdit}
            onCreate={submitCreate}
            onVary={openVary}
            onOpenDetail={openDetail}
            onSelectImage={(g) => setEditTarget(g)}
          />
        )}

        {view === "vary" && varyTarget && (
          <VariationsPanel
            key={varyTarget.id}
            source={varyTarget}
            libraryImages={(generations ?? []).filter(
              (g) => !isVideo(g) && Boolean(g.output_url)
            )}
            onSelectSource={(g) => setVaryTarget(g)}
            generating={generating}
            onBack={() => {
              setView("library");
              setVaryTarget(null);
            }}
            onOpenDetail={openDetail}
            onUseInAssistant={(g) => openAssistant(g)}
            onGenerate={submitVary}
          />
        )}

        {view === "home" && (
          <StudioHome
            firstName={firstName}
            onRecipe={openRecipe}
            onOpen={(destination) => {
              if (destination === "t2i" || destination === "t2v") openTool(destination);
              else setView(destination);
            }}
            progressContent={
              activeVideoJobs.length > 0 && (
              <div className="mx-auto mt-10 max-w-6xl">
                <p className="mb-2 px-1 text-[11px] font-medium tracking-[0.16em] text-muted-foreground uppercase">
                  In progress
                </p>
                <div className="space-y-2">
                  {activeVideoJobs.slice(0, 3).map((job) => {
                    const kind = isImageJob(job)
                      ? "image"
                      : job.kind === "v2v"
                        ? "edit"
                        : "video";
                    return (
                      <div
                        key={job.id}
                        className="cursor-pointer"
                        onClick={() =>
                          openTool(isImageJob(job) ? "t2i" : "t2v")
                        }
                      >
                        <JobPlaceholderCard
                          kind={kind}
                          aspect={job.aspect || aspect}
                          startedAtMs={new Date(job.created_at).getTime()}
                          status={job.status === "queued" ? "queued" : "running"}
                          prompt={job.final_prompt}
                          cancelling={cancellingJobIds.has(job.id)}
                          onCancel={() => void cancelJob(job)}
                        />
                      </div>
                    );
                  })}
                </div>
                {activeVideoJobs.length > 3 && (
                  <button
                    type="button"
                    onClick={() => openTool("t2v")}
                    className="mt-2 text-xs text-muted-foreground hover:text-foreground"
                  >
                    +{activeVideoJobs.length - 3} more in progress →
                  </button>
                )}
              </div>
              )
            }
          />
        )}

        {view === "effects" && (
          <div className="min-h-0 flex-1 overflow-y-auto px-5 pt-10 pb-12 md:px-10">
            <VideoExplore onSelect={openRecipe} />
          </div>
        )}

        {view === "assets" && (
          <>
            <header className="flex items-center justify-between px-6 py-5 pl-16 sm:px-8 md:pl-6 lg:pl-8">
              <div>
                <h1 className="athar-headline">Assets</h1>
                <p className="mt-0.5 text-xs text-muted-foreground">
                  {activeProject
                    ? `Reusable references · ${activeProject.name}`
                    : activeClient
                      ? `Reusable references · ${activeClient.name}`
                      : "Reusable references — pick a client to scope them"}
                </p>
              </div>
            </header>
            <div className="min-h-0 flex-1 overflow-y-auto px-6 pb-10 sm:px-8">
              <ReferenceLibrary
                mode="manage"
                clientId={activeClientId}
                projects={projects.map((p) => ({ id: p.id, name: p.name }))}
                reloadToken={assetsReload}
                onUpscale={(r) =>
                  setUpscaleTargets([
                    {
                      id: r.id,
                      url: r.url,
                      name: r.name,
                      projectId: r.project_id,
                      referenceAssetId: r.id,
                    },
                  ])
                }
              />
            </div>
          </>
        )}

        {view === "clients" && (
          <ClientProjectsWorkspace
            clients={clients}
            projects={projects}
            activeClientId={activeClientId}
            activeProjectId={activeProjectId}
            onClientsChange={setClients}
            onProjectsChange={setProjects}
            onActiveClientChange={onActiveClientChange}
            onActiveProjectChange={setActiveProjectId}
            onOpenLibrary={() => setView("library")}
            onOpenCreate={() => setView("create")}
          />
        )}

        {view === "orchestrate" && (
          <>
            <header className="flex items-center justify-between px-6 py-5 pl-16 sm:px-8 md:pl-6 lg:pl-8">
              <div>
                <h1 className="athar-headline">Campaign</h1>
                <p className="mt-0.5 text-xs text-muted-foreground">
                  Brief in → shot list → generate the whole set
                  {activeClient ? ` · ${activeClient.name}` : ""}
                </p>
              </div>
            </header>
            <div className="min-h-0 flex-1 overflow-y-auto px-6 pb-10 sm:px-8">
              <Orchestrator
                clientId={activeClientId}
                projectId={activeProjectId}
                brandKitId={activeBrandKitId}
                clientName={activeClient?.name ?? null}
                projectName={activeProject?.name ?? null}
                onGenerated={() => void loadGallery()}
              />
            </div>
          </>
        )}

        {view === "storyboard" && (
          <>
            <header className="flex items-center justify-between px-6 py-5 sm:px-8">
              <div>
                <h1 className="athar-headline">Storyboard</h1>
                <p className="mt-0.5 text-xs text-muted-foreground">
                  Plan the piece frame by frame, then render the whole board
                </p>
              </div>
            </header>
            <div className="min-h-0 flex-1 overflow-y-auto px-6 pb-10 sm:px-8">
              <Storyboards
                clients={clients}
                defaultClientId={activeClientId}
                defaultProjectId={activeProjectId}
                defaultBrandKitId={activeBrandKitId}
                onGenerated={() => void loadGallery()}
              />
            </div>
          </>
        )}

        {view === "motion" && <MotionStudio />}

        {view === "transcribe" && (
          <>
            <header className="flex items-center justify-between px-6 py-5 sm:px-8">
              <div>
                <h1 className="athar-headline">Transcribe</h1>
                <p className="mt-0.5 text-xs text-muted-foreground">
                  Voice-over from your videos — timecoded to the word,
                  searchable, and ready to cut
                </p>
              </div>
            </header>
            <div className="flex min-h-0 flex-1 flex-col overflow-y-auto px-6 pb-10 sm:px-8">
              <Transcribe
                clients={clients}
                defaultClientId={activeClientId}
                defaultProjectId={activeProjectId}
                isAdmin={isManagement}
                onOpenStoryboard={() => setView("storyboard")}
                initialOpenId={libraryOpenTranscriptId}
                onNotify={(n) =>
                  pushNotification({
                    kind: "transcript",
                    status: n.status,
                    title: n.title,
                    body: n.body,
                    generationId: n.id,
                  })
                }
              />
            </div>
          </>
        )}

        {view === "tts" && (
          <>
            <header className="flex items-center justify-between px-6 py-5 sm:px-8">
              <div>
                <h1 className="athar-headline">Voice</h1>
                <p className="mt-0.5 text-xs text-muted-foreground">
                  Arabic voice-overs from text — pick a voice, write the
                  lines, generate
                </p>
              </div>
            </header>
            <div className="flex min-h-0 flex-1 flex-col px-6 pb-10 sm:px-8">
              <TextToSpeech
                clients={clients}
                defaultClientId={activeClientId}
                defaultProjectId={activeProjectId}
                isAdmin={isManagement}
                initialGeneration={continueVoiceGeneration}
                onNotify={(n) =>
                  pushNotification({
                    kind: "voice",
                    status: n.status,
                    title: n.title,
                    body: n.body,
                    generationId: n.id,
                  })
                }
              />
            </div>
          </>
        )}

        {view === "team" && isManagement && (
          <>
            <header className="flex items-center justify-between px-6 py-5 pl-16 sm:px-8 md:pl-6 lg:pl-8">
              <div>
                <h1 className="athar-headline">Team</h1>
                <p className="mt-0.5 text-xs text-muted-foreground">
                  Members, their team, role and access
                </p>
              </div>
            </header>
            <div className="min-h-0 flex-1 overflow-y-auto px-6 pb-10 sm:px-8">
              <TeamManagement onOpenGeneration={openDetail} />
            </div>
          </>
        )}

        {view === "usage" && (
          <>
            <header className="flex items-center justify-between px-6 py-5 pl-16 sm:px-8 md:pl-6 lg:pl-8">
              <div>
                <h1 className="athar-headline">
                  Usage &amp; cost
                </h1>
                <p className="mt-0.5 text-sm text-muted-foreground">
                  Spend by model, user, project, type and day
                </p>
              </div>
      </header>
            <div className="min-h-0 flex-1 overflow-y-auto px-6 sm:px-8">
              <UsagePanel
                onOpenItem={(item) => void openLibraryItem(item.kind, item.id)}
              />
            </div>
          </>
        )}

        {(view === "create" || view === "library") && (
          <>
            <header className="flex flex-wrap items-center justify-between gap-3 px-6 py-5 pl-16 sm:px-8 md:pl-6 lg:pl-8">
              <div>
                <h1 className="athar-headline">
                  {view === "library"
                    ? "Library"
                    : mode === "t2i"
                      ? "Image Generator"
                      : cinemaOn ? "Cinema Studio" : "Video Studio"}
                </h1>
                <p className="mt-0.5 text-xs text-muted-foreground">
                  {view === "library"
                    ? activeProject
                      ? `${activeProject.name}${activeProject.client ? ` · ${activeProject.client}` : ""}`
                      : "All saved generations"
                    : activeProject
                      ? `New outputs → ${activeProject.name}`
                      : mode === "t2i"
                        ? "Text → Image"
                        : cinemaOn ? "Direct the film look, camera, light and pacing of a new shot" : videoWorkflow === "edit" ? "Change existing footage with source-aware controls" : "Create with text, image references, or reference footage"}
                </p>
              </div>
            </header>

            <div
              className={cn(
                "flex-1 overflow-y-auto px-6 sm:px-8",
                // pb-52 is the floor for the first paint, before the dock has
                // been measured; the inline value takes over from there.
                showDock ? "pb-52" : "pb-8"
              )}
              style={
                showDock && dockHeight
                  ? { paddingBottom: dockHeight + 48 }
                  : undefined
              }
            >
              {view === "create" ? (
                <>
                  {mode === "t2v" && !cinemaOn && (
                    <VideoWorkspaceControls
                      workflow={videoWorkflow}
                      busy={
                        uploadingVideoRef ||
                        uploadingVideoSource ||
                        generating
                      }
                      hasSource={!!videoEditSource}
                      imageCount={videoSources.length}
                      onChange={(next) => {
                        if (next === videoWorkflow) return;
                        setVideoWorkflow(next);
                        setCinemaOn(false);
                        setCamera(DEFAULT_CAMERA_ID);
                        setAction("");
                        setLighting("");
                        setNegativeAdditions("");
                        setVideoEditSource(null);
                        if (next === "edit") setVideoRefSources([]);
                        if (next !== "create") setTier("standard");
                      }}
                      onSource={() => editVideoFileInput.current?.click()}
                      onImages={() => videoFileInput.current?.click()}
                    />
                  )}
                  {(() => {
                    const jobTiles = videoJobs.filter(
                      (j) =>
                        j.status === "queued" ||
                        j.status === "running" ||
                        j.status === "failed"
                    );
                    const pendingPlaceholders =
                      generating &&
                      !jobTiles.some(
                        (j) => j.status === "queued" || j.status === "running"
                      )
                        ? mode === "t2i"
                          ? numOutputs
                          : 1
                        : 0;
                    const hasGrid =
                      jobTiles.length > 0 ||
                      createGallery.length > 0 ||
                      pendingPlaceholders > 0;
                    if (!hasGrid) {
                      return (
                        <div className="flex h-[min(52vh,420px)] flex-col items-center justify-center text-center">
                          <div className="mb-4 flex size-14 items-center justify-center rounded-2xl bg-gold-soft ring-1 ring-gold/25">
                            {mode === "t2v" ? (
                              <Clapperboard className="size-6 text-gold" />
                            ) : (
                              <ImageIcon className="size-6 text-gold" />
                            )}
                          </div>
                          <p className="athar-headline">
                            {mode === "t2v"
                              ? "Describe a shot"
                              : "Describe an image"}
                          </p>
                          <p className="mt-2 max-w-md text-sm text-muted-foreground">
                            Paste a prompt in the dock. Your results stay here
                            and in the Library.
                          </p>
                        </div>
                      );
                    }
                    return (
                      <>
                      <div className="grid grid-cols-2 gap-1.5 sm:grid-cols-3 xl:grid-cols-4">
                        {jobTiles.map((job) => {
                          const kind = isImageJob(job)
                            ? "image"
                            : job.kind === "v2v"
                              ? "edit"
                              : "video";
                          const status =
                            job.status === "failed"
                              ? "failed"
                              : job.status === "queued"
                                ? "queued"
                                : "running";
                          return (
                            <JobPlaceholderCard
                              key={job.id}
                              kind={kind}
                              aspect={job.aspect || aspect}
                              startedAtMs={new Date(job.created_at).getTime()}
                              status={status}
                              prompt={job.final_prompt}
                              error={job.error}
                              cancelling={cancellingJobIds.has(job.id)}
                              onCancel={
                                status !== "failed"
                                  ? () => void cancelJob(job)
                                  : undefined
                              }
                              onRetry={
                                status === "failed"
                                  ? () => void retryJob(job)
                                  : undefined
                              }
                              onDismiss={
                                status === "failed"
                                  ? () => dismissJob(job)
                                  : undefined
                              }
                            />
                          );
                        })}
                        {Array.from({ length: pendingPlaceholders }).map(
                          (_, i) => (
                            <GenerationPlaceholderCard
                              key={`pending-${i}`}
                              kind={
                                mode === "t2i"
                                  ? "image"
                                  : videoEditSource
                                    ? "edit"
                                    : "video"
                              }
                              aspect={aspect}
                            />
                          )
                        )}
                        {createGallery.map((g, i) => renderCard(g, i))}
                      </div>
                      {galleryHasMore && (
                        <div className="mt-6 flex justify-center">
                          <button
                            type="button"
                            disabled={galleryLoadingMore}
                            onClick={() => void loadMoreGallery()}
                            className="inline-flex h-10 items-center gap-1.5 rounded-full bg-card px-5 text-xs text-muted-foreground ring-1 ring-border transition hover:text-foreground disabled:opacity-60"
                          >
                            {galleryLoadingMore && (
                              <Loader2 className="size-3.5 animate-spin" />
                            )}
                            Load more
                          </button>
                        </div>
                      )}
                      </>
                    );
                  })()}
                </>
              ) : (
                <>
                  <div className="mb-5 flex flex-wrap items-center gap-2">
                    <div className="flex w-full max-w-md items-center gap-2 rounded-full bg-card px-4 py-2.5 ring-1 ring-border shadow-sm">
                      <Search className="size-4 text-muted-foreground" />
                      <input
                        value={query}
                        onChange={(e) => setQuery(e.target.value)}
                        data-tour="search"
                        placeholder="Search prompts, modes, models…"
                        className="w-full bg-transparent text-sm text-foreground outline-none placeholder:text-muted-foreground"
                      />
                    </div>
                    <ChipPopover
                      label="Owner"
                      value={
                        ownerFilter === "all"
                          ? "Everyone"
                          : ownerFilter === "mine"
                            ? "Mine only"
                            : (ownerFilterName ?? "Someone")
                      }
                      active={ownerFilter !== "all"}
                      icon={<Users className="size-3.5" />}
                      width="w-72"
                    >
                      <div className="space-y-0.5">
                        <button
                          type="button"
                          onClick={() => {
                            setOwnerFilter("all");
                            setOwnerFilterName(null);
                          }}
                          className={cn(
                            "flex w-full items-center justify-between rounded-lg px-2 py-1.5 text-left text-sm transition",
                            ownerFilter === "all"
                              ? "bg-sidebar-accent text-gold"
                              : "hover:bg-sidebar-accent/60"
                          )}
                        >
                          Everyone
                          {ownerFilter === "all" && <Check className="size-3.5" />}
                        </button>
                        <button
                          type="button"
                          onClick={() => {
                            setOwnerFilter("mine");
                            setOwnerFilterName(null);
                          }}
                          className={cn(
                            "flex w-full items-center justify-between rounded-lg px-2 py-1.5 text-left text-sm transition",
                            ownerFilter === "mine"
                              ? "bg-sidebar-accent text-gold"
                              : "hover:bg-sidebar-accent/60"
                          )}
                        >
                          Mine only
                          {ownerFilter === "mine" && <Check className="size-3.5" />}
                        </button>
                      </div>

                      {/* Picking one person by name is an admin tool — it
                          reads from the same team-management list, which
                          only admins can fetch. Everyone else keeps the two
                          choices above. */}
                      {isManagement && (
                        <>
                          <div className="my-1.5 h-px bg-border" />
                          <div className="px-2 pb-1">
                            <div className="flex items-center gap-1.5 rounded-lg bg-white/5 px-2 py-1 ring-1 ring-white/10">
                              <Search className="size-3 shrink-0 text-muted-foreground" />
                              <input
                                value={ownerSearchQuery}
                                onChange={(e) => setOwnerSearchQuery(e.target.value)}
                                onFocus={loadTeamMembers}
                                placeholder="Find a teammate…"
                                className="w-full bg-transparent text-xs text-foreground outline-none placeholder:text-muted-foreground"
                              />
                            </div>
                          </div>
                          <div className="max-h-48 space-y-0.5 overflow-y-auto">
                            {teamMembersLoading ? (
                              <p className="px-2 py-2 text-xs text-muted-foreground">
                                Loading…
                              </p>
                            ) : (
                              (teamMembers ?? [])
                                .filter((m) => {
                                  const q = ownerSearchQuery.trim().toLowerCase();
                                  if (!q) return true;
                                  return (
                                    (m.name ?? "").toLowerCase().includes(q) ||
                                    m.email.toLowerCase().includes(q)
                                  );
                                })
                                .map((m) => (
                                  <button
                                    key={m.id}
                                    type="button"
                                    onClick={() => {
                                      setOwnerFilter(m.id);
                                      setOwnerFilterName(m.name || m.email);
                                    }}
                                    className={cn(
                                      "flex w-full items-center justify-between rounded-lg px-2 py-1.5 text-left text-sm transition",
                                      ownerFilter === m.id
                                        ? "bg-sidebar-accent text-gold"
                                        : "hover:bg-sidebar-accent/60"
                                    )}
                                  >
                                    <span className="min-w-0 truncate">
                                      {m.name || m.email}
                                    </span>
                                    {ownerFilter === m.id && (
                                      <Check className="size-3.5 shrink-0" />
                                    )}
                                  </button>
                                ))
                            )}
                            {!teamMembersLoading &&
                              teamMembers !== null &&
                              teamMembers.filter((m) => {
                                const q = ownerSearchQuery.trim().toLowerCase();
                                if (!q) return true;
                                return (
                                  (m.name ?? "").toLowerCase().includes(q) ||
                                  m.email.toLowerCase().includes(q)
                                );
                              }).length === 0 && (
                                <p className="px-2 py-2 text-xs text-muted-foreground">
                                  No match
                                </p>
                              )}
                          </div>
                        </>
                      )}
                    </ChipPopover>
                    <Select
                      value={typeFilter}
                      onValueChange={(v) =>
                        setTypeFilter(v as typeof typeFilter)
                      }
                    >
                      <SelectTrigger className="h-10 w-auto min-w-[7rem] shrink-0 rounded-full border-border bg-card px-4 text-xs">
                        <SelectValue />
                      </SelectTrigger>
                      <SelectContent>
                        <SelectItem value="all">All types</SelectItem>
                        <SelectItem value="image">Images</SelectItem>
                        <SelectItem value="video">Videos</SelectItem>
                        <SelectItem value="voice">Voice-overs</SelectItem>
                        <SelectItem value="transcript">Transcripts</SelectItem>
                      </SelectContent>
                    </Select>
                    {/* The dock's client/project chips only exist in Create,
                        so Library carries its own scope control. */}
                    <SearchPicker
                      value={activeClientId ?? "all"}
                      onValueChange={(value) => onActiveClientChange(value === "all" ? null : value)}
                      options={[
                        { value: "all", label: "All clients" },
                        ...clients.map((client) => ({ value: client.id, label: client.name })),
                      ]}
                      label="Filter by client"
                      placeholder="All clients"
                      className="h-10 min-w-[7rem] shrink-0 border-border bg-card px-4"
                    />
                    <SearchPicker
                      value={activeProjectId ?? "all"}
                      onValueChange={(value) => setActiveProjectId(value === "all" ? null : value)}
                      options={[
                        { value: "all", label: "All projects" },
                        ...projects.map((project) => ({ value: project.id, label: project.name })),
                      ]}
                      label="Filter by project"
                      placeholder="All projects"
                      className="h-10 min-w-[7rem] shrink-0 border-border bg-card px-4"
                    />
                    <Select
                      value={sortOrder}
                      onValueChange={(v) =>
                        setSortOrder(v as typeof sortOrder)
                      }
                    >
                      <SelectTrigger
                        aria-label="Sort by date"
                        className="h-10 w-auto min-w-[7rem] shrink-0 rounded-full border-border bg-card px-4 text-xs"
                      >
                        <SelectValue />
                      </SelectTrigger>
                      <SelectContent>
                        <SelectItem value="newest">Newest</SelectItem>
                        <SelectItem value="oldest">Oldest</SelectItem>
                      </SelectContent>
                    </Select>
                    <button
                      type="button"
                      onClick={() => setFavoritesOnly((f) => !f)}
                      aria-pressed={favoritesOnly}
                      title="Show only favourites"
                      className={cn(
                        "inline-flex h-10 shrink-0 items-center gap-1.5 rounded-full px-4 text-xs ring-1 transition",
                        favoritesOnly
                          ? "bg-gold text-primary-foreground ring-gold"
                          : "bg-card text-muted-foreground ring-border hover:text-foreground"
                      )}
                    >
                      <Heart
                        className={cn(
                          "size-3.5",
                          favoritesOnly && "fill-current"
                        )}
                      />
                      Favourites
                    </button>
                    <button
                      type="button"
                      onClick={() => {
                        setSelectMode((m) => !m);
                        setSelectedIds([]);
                      }}
                      className={cn(
                        "inline-flex h-10 shrink-0 items-center gap-1.5 rounded-full px-4 text-xs ring-1 transition",
                        selectMode
                          ? "bg-gold text-primary-foreground ring-gold"
                          : "bg-card text-muted-foreground ring-border hover:text-foreground"
                      )}
                    >
                      <CheckSquare className="size-3.5" />
                      {selectMode ? "Done" : "Select"}
                    </button>
                  </div>

                  {filtered === null ||
                  galleryLoading ||
                  libraryVoices === null ||
                  libraryTranscripts === null ? (
                    galleryLoader
                  ) : libraryEntries.length === 0 ? (
                    <div className="flex h-[min(48vh,380px)] flex-col items-center justify-center text-center">
                      <Sparkles className="mb-3 size-6 text-gold" />
                      {/* An empty *source* list is a different story from a
                          search/type filter that matched nothing. */}
                      {!libraryFiltersOn ? (
                        <>
                          <p className="athar-headline">
                            {activeProject
                              ? `Nothing in ${activeProject.name} yet`
                              : activeClientId
                                ? "Nothing tagged to this client yet"
                                : "Nothing here yet"}
                          </p>
                          <p className="mt-1 max-w-sm text-sm text-muted-foreground">
                            {activeProject
                              ? "New work you generate is tagged to this project."
                              : "Generate an image or video and it lands here."}
                          </p>
                          {(activeClientId || ownerFilter !== "all") && (
                            <button
                              type="button"
                              onClick={() => {
                                onActiveClientChange(null);
                                setActiveProjectId(null);
                                setOwnerFilter("all");
                                setOwnerFilterName(null);
                              }}
                              className="mt-3 text-xs text-muted-foreground underline-offset-2 hover:text-foreground hover:underline"
                            >
                              Show everything
                            </button>
                          )}
                        </>
                      ) : (
                        <>
                          <p className="athar-headline">No matches</p>
                          <p className="mt-1 max-w-sm text-sm text-muted-foreground">
                            {query.trim()
                              ? `Nothing matches “${query.trim()}”.`
                              : "Nothing matches this filter."}
                          </p>
                          <button
                            type="button"
                            onClick={() => {
                              setQuery("");
                              setTypeFilter("all");
                              setFavoritesOnly(false);
                            }}
                            className="mt-3 text-xs text-muted-foreground underline-offset-2 hover:text-foreground hover:underline"
                          >
                            Clear filters
                          </button>
                        </>
                      )}
                    </div>
                  ) : (
                    <>
                      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 xl:grid-cols-3">
                        {libraryEntries.map((entry, i) =>
                          entry.kind === "render"
                            ? renderCard(entry.data, i)
                            : entry.kind === "voice"
                              ? renderVoiceCard(entry.data, entry.versions, i)
                              : renderTranscriptCard(entry.data, i)
                        )}
                      </div>
                      {galleryHasMore &&
                        (typeFilter === "all" ||
                          typeFilter === "image" ||
                          typeFilter === "video") && (
                          <div className="mt-6 flex justify-center">
                            <button
                              type="button"
                              disabled={galleryLoadingMore}
                              onClick={() => void loadMoreGallery()}
                              className="inline-flex h-10 items-center gap-1.5 rounded-full bg-card px-5 text-xs text-muted-foreground ring-1 ring-border transition hover:text-foreground disabled:opacity-60"
                            >
                              {galleryLoadingMore && (
                                <Loader2 className="size-3.5 animate-spin" />
                              )}
                              Load more
                            </button>
                          </div>
                        )}
                    </>
                  )}
                </>
              )}
            </div>
          </>
        )}

        {/* Batch action bar — library select mode */}
        {view === "library" && selectMode && selectedIds.length > 0 && (
          <div className="absolute inset-x-0 bottom-6 z-30 flex justify-center px-4">
            <div className="flex items-center gap-3 rounded-full bg-card px-5 py-2.5 ring-1 ring-border shadow-xl">
              <span className="text-sm text-foreground">
                {selectedIds.length} selected
              </span>
              <Button
                size="sm"
                className="h-8 gap-1.5 rounded-full bg-gold text-primary-foreground hover:bg-gold/90"
                disabled={upscalableSelected.length === 0}
                title={
                  upscalableSelected.length === 0
                    ? "Upscale works on stills only"
                    : undefined
                }
                onClick={() => {
                  if (upscalableSelected.length > 0) {
                    setUpscaleTargets(upscalableSelected.map(fromGeneration));
                  }
                }}
              >
                <ArrowUpToLine className="size-3.5" />
                Upscale {upscalableSelected.length}
              </Button>
              {isManagement && (
                <Button
                  size="sm"
                  variant="destructive"
                  className="h-8 gap-1.5 rounded-full"
                  onClick={() => setBulkDeleteOpen(true)}
                >
                  <Trash2 className="size-3.5" />
                  Delete {selectedIds.length}
                </Button>
              )}
              <button
                type="button"
                onClick={() => setSelectedIds([])}
                className="text-xs text-muted-foreground transition hover:text-foreground"
              >
                Clear
              </button>
            </div>
          </div>
        )}

        <OnboardingTour
          steps={tourSteps}
          open={tourOpen}
          onClose={(completed) => {
            setTourOpen(false);
            // The tour moves through Create and Library; put people back on
            // Home, which is where landing should always leave them.
            setView("home");
            if (completed) {
              // Server-side too, so it doesn't come back on another device.
              void persistTourCompleted();
              setWelcomeOpen(true);
            }
          }}
        />

        {/* Finishing onboarding deserves more than a toast in the corner. */}
        <WelcomeCelebration
          open={welcomeOpen}
          onClose={() => setWelcomeOpen(false)}
          onStart={() => {
            setWelcomeOpen(false);
            setView("home");
          }}
        />

        <Dialog
          open={voiceDetailTarget != null}
          onOpenChange={(open) => {
            if (!open) {
              setVoiceDetailTarget(null);
              setVoiceDetailVersions([]);
            }
          }}
        >
          <DialogContent
            className={cn(voiceDetailVersions.length > 1 ? "sm:max-w-2xl" : "sm:max-w-lg")}
          >
            <DialogHeader>
              <DialogTitle>{voiceDetailTarget?.title}</DialogTitle>
            </DialogHeader>
            {voiceDetailTarget?.output_url && (
              <div
                className={cn(
                  "grid gap-5",
                  voiceDetailVersions.length > 1 && "sm:grid-cols-[1fr_180px]"
                )}
              >
                <div className="min-w-0 space-y-3">
                  <Waveform src={voiceDetailTarget.output_url} />
                  <audio
                    key={voiceDetailTarget.id}
                    src={voiceDetailTarget.output_url}
                    controls
                    className="w-full"
                  />
                  <p className="text-xs text-muted-foreground">
                    {[
                      voiceDetailTarget.client_name,
                      voiceDetailTarget.duration_s
                        ? `${voiceDetailTarget.duration_s.toFixed(1)}s`
                        : null,
                      voiceDetailTarget.cost > 0
                        ? `$${voiceDetailTarget.cost.toFixed(3)}`
                        : null,
                    ]
                      .filter(Boolean)
                      .join(" · ")}
                  </p>
                  {voiceDetailTarget.text && (
                    <p
                      dir="rtl"
                      className="rounded-lg border border-white/8 p-3 text-sm leading-relaxed"
                    >
                      {voiceDetailTarget.text}
                    </p>
                  )}
                  <Button
                    size="sm"
                    className="h-8 gap-1.5 rounded-full bg-gold px-4 text-xs text-primary-foreground"
                    onClick={() => {
                      setContinueVoiceGeneration(voiceDetailTarget);
                      setVoiceDetailTarget(null);
                      setVoiceDetailVersions([]);
                      setView("tts");
                    }}
                  >
                    <RefreshCw className="size-3" />
                    Continue editing
                  </Button>
                </div>

                {voiceDetailVersions.length > 1 && (
                  <div className="space-y-1 border-t border-white/8 pt-3 sm:border-t-0 sm:border-l sm:pt-0 sm:pl-4">
                    <p className="mb-1 text-[11px] tracking-wide text-muted-foreground uppercase">
                      Versions
                    </p>
                    <div className="max-h-64 space-y-1 overflow-y-auto">
                      {[...voiceDetailVersions].reverse().map((v, idx) => (
                        <button
                          key={v.id}
                          type="button"
                          onClick={() => setVoiceDetailTarget(v)}
                          className={cn(
                            "block w-full rounded-lg px-2.5 py-1.5 text-left text-xs transition",
                            v.id === voiceDetailTarget.id
                              ? "bg-gold-soft/20 text-foreground ring-1 ring-gold/40"
                              : "text-muted-foreground hover:bg-white/8 hover:text-foreground"
                          )}
                        >
                          Version {idx + 1}
                          <span className="mt-0.5 block text-[10px] text-muted-foreground">
                            {new Date(v.created_at).toLocaleDateString()}
                          </span>
                        </button>
                      ))}
                    </div>
                  </div>
                )}
              </div>
            )}
          </DialogContent>
        </Dialog>

        <AssetLibraryDialog
          open={assetIdOpen}
          onOpenChange={setAssetIdOpen}
          assets={libraryAssets}
          loading={assetsLoading}
          onRefresh={() => void loadAssets()}
          onAttach={attachAsset}
          onDelete={setAssetToDelete}
          deletingAssetId={deletingAssetId}
          registering={registeringAsset}
          onRegister={registerCharacter}
        />

        <ConfirmDialog
          open={renderApproval != null}
          onOpenChange={(open) => {
            if (!open) setRenderApproval(null);
          }}
          title={renderApproval?.kind === "long" ? "Approve a longer Seedance render?" : "Render a similar prompt again?"}
          description={
            renderApproval?.kind === "long"
              ? "This render is 13–30 seconds, so it takes longer and costs more than the short iteration default."
              : `This prompt is similar to ${renderApproval?.similarCount ?? 3} recent video renders in this project. Continue only if another take is intentional.`
          }
          cost={renderApproval?.estimatedCost}
          confirmLabel={renderApproval?.kind === "long" ? "Approve render" : "Render another take"}
          onConfirm={async () => {
            const pending = renderApproval;
            if (!pending) return;
            setRenderApproval(null);
            await submit(pending.prompt, {
              ...pending.opts,
              longRenderApproved: pending.kind === "long" ? true : pending.opts.longRenderApproved,
              duplicatePromptApproved: pending.kind === "duplicate" ? true : pending.opts.duplicatePromptApproved,
            });
          }}
        />

        <ConfirmDialog
          open={assetToDelete != null}
          onOpenChange={(open) => {
            if (!open) setAssetToDelete(null);
          }}
          title="Delete this character?"
          description={
            assetToDelete && !assetToDelete.id.startsWith("asset-")
              ? "This photo is still being verified. Removing it drops it from this list."
              : assetToDelete &&
                  /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(
                    assetToDelete.name
                  )
                ? "This removes it from the BytePlus asset library and frees quota. This cannot be undone."
                : `“${assetToDelete?.name || "This character"}” will be removed from the BytePlus asset library and quota will be freed. This cannot be undone.`
          }
          confirmLabel="Delete"
          destructive
          onConfirm={async () => {
            if (!assetToDelete) return;
            await deleteLibraryAsset(assetToDelete.id);
          }}
        />

        {/* Offered before spending: attach the real artwork instead of
            asking the model to redraw a logo from its name. */}
        <Dialog open={refAdviceOpen} onOpenChange={setRefAdviceOpen}>
          <DialogContent className="sm:max-w-md">
            <DialogHeader>
              <DialogTitle>Attach the real artwork?</DialogTitle>
            </DialogHeader>
            <p className="text-sm text-muted-foreground">
              Your prompt asks for a{" "}
              <span className="text-foreground">logo or brand mark</span>.
              Image models don&apos;t typeset — they redraw letterforms from
              memory, which is how a name comes back subtly misspelled.
              Attaching the actual file and describing where it sits gives you
              the real mark instead of a lookalike.
            </p>
            <div className="mt-4 flex flex-col-reverse gap-2 sm:flex-row sm:justify-end">
              <Button
                variant="outline"
                onClick={() => {
                  // Don't ask again this session — they've made the call.
                  setRefAdviceDismissed(true);
                  setRefAdviceOpen(false);
                  void onGenerate();
                }}
              >
                Generate anyway
              </Button>
              <Button
                className="bg-gold text-primary-foreground hover:bg-gold/90"
                onClick={() => {
                  setRefAdviceOpen(false);
                  refFileInput.current?.click();
                }}
              >
                <Paperclip className="size-4" />
                Attach artwork
              </Button>
            </div>
          </DialogContent>
        </Dialog>

        {/* Bulk delete confirmation — admins only, Library select mode */}
        <Dialog
          open={bulkDeleteOpen}
          onOpenChange={(o) => {
            if (!o && !bulkDeleting) setBulkDeleteOpen(false);
          }}
        >
          <DialogContent className="sm:max-w-md">
            <DialogHeader>
              <DialogTitle>
                Delete {selectedIds.length} generation
                {selectedIds.length === 1 ? "" : "s"}?
              </DialogTitle>
            </DialogHeader>
            <p className="text-sm text-muted-foreground">
              They&apos;ll be removed from the Library for everyone. Usage and
              cost reporting is{" "}
              <span className="text-foreground">not</span> affected — the
              records are retained for billing history.
            </p>
            <div className="mt-4 flex justify-end gap-2">
              <Button
                variant="outline"
                disabled={bulkDeleting}
                onClick={() => setBulkDeleteOpen(false)}
              >
                Cancel
              </Button>
              <Button
                variant="destructive"
                disabled={bulkDeleting}
                onClick={() => void bulkDelete()}
              >
                {bulkDeleting ? (
                  <Loader2 className="size-4 animate-spin" />
                ) : (
                  <Trash2 className="size-4" />
                )}
                Delete {selectedIds.length}
              </Button>
            </div>
          </DialogContent>
        </Dialog>

        {/* Floating prompt dock — create views only */}
        {showDock && (
          <>
          <div className="pointer-events-none absolute inset-x-0 bottom-0 z-20 flex items-center justify-center gap-2 px-4 pb-4 sm:pb-6">
            {/* Higgsfield-style Image/Video switch — its own floating panel
                beside the dock, not nested inside it. Same destination as
                the sidebar's Image Generator / Video Generator entries,
                just reachable without leaving the composer. */}
            <div className="dock-glass pointer-events-auto flex shrink-0 flex-col gap-1.5 rounded-2xl p-1.5">
              <button
                type="button"
                onClick={() => mode !== "t2i" && openTool("t2i")}
                aria-pressed={mode === "t2i"}
                title="Image Generator"
                className={cn(
                  "flex w-14 flex-col items-center gap-1 rounded-xl py-2.5 text-[11px] font-medium transition sm:w-16",
                  mode === "t2i"
                    ? "bg-white text-black"
                    : "text-muted-foreground hover:bg-white/5 hover:text-foreground"
                )}
              >
                <ImageIcon className="size-4" />
                Image
              </button>
              <button
                type="button"
                onClick={() => (mode !== "t2v" || cinemaOn) && openTool("t2v")}
                aria-pressed={mode === "t2v"}
                title="Video Generator"
                className={cn(
                  "flex w-14 flex-col items-center gap-1 rounded-xl py-2.5 text-[11px] font-medium transition sm:w-16",
                  mode === "t2v"
                    ? "bg-white text-black"
                    : "text-muted-foreground hover:bg-white/5 hover:text-foreground"
                )}
              >
                <Clapperboard className="size-4" />
                Video
              </button>
            </div>

            <div
              ref={dockRef}
              data-tour="dock"
              className={cn(
                "animate-dock-in dock-glass pointer-events-auto relative w-full max-w-[56rem] rounded-2xl p-3 sm:p-4",
                // However much it holds, the dock never takes the whole
                // screen — past this it scrolls inside itself and the render
                // above stays visible.
                "max-h-[72dvh] overflow-y-auto overscroll-contain",
                dragOver && "ring-2 ring-gold/50"
              )}
              onDragEnter={onDockDragEnter}
              onDragLeave={onDockDragLeave}
              onDragOver={onDockDragOver}
              onDrop={onDockDrop}
            >
              {dragOver && (
                <div className="pointer-events-none absolute inset-0 z-10 flex items-center justify-center rounded-2xl bg-black/70 backdrop-blur-sm">
                  <div className="flex flex-col items-center gap-2 text-center">
                    <Paperclip className="size-6 text-gold" />
                    <p className="text-sm font-medium text-foreground">
                      {mode === "t2v"
                        ? "Drop image(s) or reference video(s)"
                        : "Drop reference image"}
                    </p>
                    <p className="text-[11px] text-muted-foreground">
                      {mode === "t2v"
                        ? `JPEG/PNG/WebP · up to ${MAX_VIDEO_IMAGES}, 1 = first frame · or MP4/MOV · up to ${MAX_REFERENCE_VIDEOS} reference clips`
                        : `JPEG, PNG, or WebP · up to ${maxRefs}`}
                    </p>
                  </div>
                </div>
              )}

              {mode === "t2i" && (
                <input
                  ref={refFileInput}
                  type="file"
                  accept="image/jpeg,image/png,image/webp"
                  multiple
                  className="hidden"
                  onChange={(e) => onReferenceFiles(e.target.files)}
                />
              )}

              {mode === "t2v" && (
                <input
                  ref={videoFileInput}
                  type="file"
                  accept="image/jpeg,image/png,image/webp"
                  multiple
                  className="hidden"
                  onChange={(e) => onVideoSourceFiles(e.target.files)}
                />
              )}

              {mode === "t2v" && (
                <input
                  ref={audioFileInput}
                  type="file"
                  accept="audio/mpeg,audio/wav,.mp3,.wav"
                  multiple
                  className="hidden"
                  onChange={(e) => void onAudioFiles(e.target.files)}
                />
              )}

              {mode === "t2v" && (
                <input
                  ref={videoRefFileInput}
                  type="file"
                  accept="video/mp4,video/quicktime,.mp4,.mov"
                  multiple
                  className="hidden"
                  onChange={(e) => void onReferenceVideoFiles(e.target.files)}
                />
              )}

              {mode === "t2v" && <input ref={editVideoFileInput} type="file" accept="video/mp4,video/quicktime,.mp4,.mov" className="hidden" onChange={(e) => void onEditVideoFile(e.target.files?.[0])} />}

              {!composerCollapsed && mode === "t2v" && videoEditSource && (
                <div className="mb-2 flex items-center gap-2.5 rounded-xl border border-gold/25 bg-gold-soft/60 px-2.5 py-2">
                  <video
                    src={`${videoEditSource.url}#t=0.1`}
                    muted
                    playsInline
                    preload="metadata"
                    className="size-11 rounded-lg object-cover ring-1 ring-white/10"
                  />
                  <div className="min-w-0 flex-1">
                    <p className="text-xs font-medium text-foreground">
                      {videoEditSource.intent === "extend"
                        ? "Extend @video1"
                        : videoEditSource.intent === "vary"
                          ? "Vary @video1"
                          : "Edit @video1"}
                    </p>
                    <p className="text-[11px] text-muted-foreground">
                      {videoEditSource.intent === "extend"
                        ? "Continue @video1 — output stays the source length"
                        : videoEditSource.intent === "vary"
                          ? "Same scene, new take — same length"
                          : "Change @video1 — same length as the source"}
                    </p>
                  </div>
                  <button
                    type="button"
                    aria-label="Remove attached video"
                    onClick={() => setVideoEditSource(null)}
                    className="rounded-md p-1.5 text-muted-foreground transition hover:bg-white/10 hover:text-foreground"
                  >
                    <X className="size-4" />
                  </button>
                </div>
              )}

              {!composerCollapsed && mode === "t2v" && videoSources.length > 0 && (
                <div className="mb-2 flex items-center gap-2.5 rounded-xl border border-gold/25 bg-gold-soft/60 px-2.5 py-2">
                  <div className="flex max-w-[60%] flex-wrap items-center gap-1.5">
                    <SortableThumbs
                      items={videoSources.map((s, i) => ({
                        id: s.url,
                        previewUrl: attachedPreview(s.url),
                        alt: s.url.startsWith("asset://")
                          ? `Verified face ${i + 1}`
                          : `Reference ${i + 1}`,
                      }))}
                      onReorder={(from, to) =>
                        setVideoSources((prev) => moveItem(prev, from, to))
                      }
                      onRemove={(i) =>
                        setVideoSources((prev) =>
                          prev.filter((_, idx) => idx !== i)
                        )
                      }
                    />
                  </div>
                  <div className="min-w-0 flex-1">
                    <p className="text-xs font-medium text-foreground">
                      {videoSources.length === 1
                        ? videoSources[0].url.startsWith("asset://")
                          ? "Verified asset attached"
                          : "First frame attached"
                        : `${videoSources.length} references`}
                    </p>
                    <p className="text-[11px] text-muted-foreground">
                      {videoSources.length === 1
                        ? videoSources[0].url.startsWith("asset://")
                          ? "Real-person asset — refer to it as “Image 1” in the prompt"
                          : "Image → video (Seedance animates this still)"
                        : "Drag to reorder · Seedance blends these subjects into the clip"}
                    </p>
                  </div>
                  <button
                    type="button"
                    aria-label="Remove all attached images"
                    onClick={() => setVideoSources([])}
                    className="rounded-md p-1.5 text-muted-foreground transition hover:bg-white/10 hover:text-foreground"
                  >
                    <X className="size-4" />
                  </button>
                </div>
              )}

              {!composerCollapsed && mode === "t2v" && audioSources.length > 0 && (
                <div className="mb-2 flex items-center gap-2.5 rounded-xl border border-gold/25 bg-gold-soft/60 px-2.5 py-2">
                  <div className="flex min-w-0 flex-1 flex-wrap items-center gap-1.5">
                    {audioSources.map((a, i) => (
                      <span
                        key={`${a.url}-${i}`}
                        title={a.transcript ?? a.name}
                        className="inline-flex max-w-full items-center gap-1.5 rounded-full bg-white/5 py-1 pr-1.5 pl-2.5 text-xs text-foreground ring-1 ring-gold/30"
                      >
                        <AudioLines className="size-3 shrink-0 text-gold" />
                        <span className="truncate">
                          @audio{i + 1} · {a.name}
                        </span>
                        {a.transcript === null && (
                          <span className="shrink-0 text-[10px] text-muted-foreground">
                            no transcript
                          </span>
                        )}
                        <button
                          type="button"
                          aria-label={`Remove audio ${i + 1}`}
                          onClick={() =>
                            setAudioSources((prev) =>
                              prev.filter((_, idx) => idx !== i)
                            )
                          }
                          className="flex size-4 shrink-0 items-center justify-center rounded-full bg-foreground text-background transition hover:scale-110"
                        >
                          <X className="size-2.5" />
                        </button>
                      </span>
                    ))}
                  </div>
                  <p className="hidden shrink-0 text-[11px] text-muted-foreground sm:block">
                    Lip-sync — the character speaks these lines
                  </p>
                </div>
              )}

              {!composerCollapsed && mode === "t2v" && videoRefSources.length > 0 && (
                <div className="mb-2 flex items-center gap-2.5 rounded-xl border border-gold/25 bg-gold-soft/60 px-2.5 py-2">
                  <div className="flex min-w-0 flex-1 flex-wrap items-center gap-1.5">
                    {videoRefSources.map((s, i) => (
                      <span
                        key={`${s.url}-${i}`}
                        title={s.url}
                        className="inline-flex max-w-full items-center gap-1.5 rounded-full bg-white/5 py-1 pr-1.5 pl-2.5 text-xs text-foreground ring-1 ring-gold/30"
                      >
                        <Film className="size-3 shrink-0 text-gold" />
                        <span className="truncate">@video{i + 1}</span>
                        <button
                          type="button"
                          aria-label={`Remove reference video ${i + 1}`}
                          onClick={() =>
                            setVideoRefSources((prev) =>
                              prev.filter((_, idx) => idx !== i)
                            )
                          }
                          className="flex size-4 shrink-0 items-center justify-center rounded-full bg-foreground text-background transition hover:scale-110"
                        >
                          <X className="size-2.5" />
                        </button>
                      </span>
                    ))}
                  </div>
                  <p className="hidden shrink-0 text-[11px] text-muted-foreground sm:block">
                    Reference clips — describe each clip&apos;s role in the prompt
                  </p>
                </div>
              )}

              {mode === "t2i" && referenceUrls.length > 0 && (
                <div className="mb-2 flex flex-wrap items-center gap-2 px-1">
                  <SortableThumbs
                    sizeClassName="size-12"
                    items={referenceUrls.map((url, i) => ({
                      id: url,
                      previewUrl: url,
                      alt: referenceNames[url] ?? `Image ${i + 1}`,
                    }))}
                    onReorder={(from, to) =>
                      setReferenceUrls((prev) => moveItem(prev, from, to))
                    }
                    onRemove={(i) =>
                      setReferenceUrls((prev) =>
                        prev.filter((_, idx) => idx !== i)
                      )
                    }
                    onSave={(i) => openSaveReference(referenceUrls[i])}
                  />
                </div>
              )}

            {/* Cinema Studio — the director chips row (Higgsfield-style).
                Wraps instead of scrolling so the upward popovers aren't
                clipped by an overflow container. */}
            {!generating && !composerCollapsed && mode === "t2v" && cinemaOn && (
              <div className="mb-1.5 grid grid-cols-2 items-center gap-1.5 px-1 sm:flex sm:flex-wrap">
                <ChipPopover
                  label="Film setup"
                  value={
                    cinema.genreId !== "raw" || cinema.eraId !== "raw"
                      ? [
                          presetLabel(GENRE_PRESETS, cinema.genreId),
                          presetLabel(ERA_PRESETS, cinema.eraId),
                        ]
                          .filter((v) => v !== "Auto")
                          .join(" · ")
                      : "Auto"
                  }
                  active={cinema.genreId !== "raw" || cinema.eraId !== "raw"}
                >
                  <PresetList
                    title="Genre"
                    presets={GENRE_PRESETS}
                    value={cinema.genreId}
                    onChange={(genreId) =>
                      setCinema((c) => ({ ...c, genreId }))
                    }
                  />
                  <PresetList
                    title="Era"
                    presets={ERA_PRESETS}
                    value={cinema.eraId}
                    onChange={(eraId) => setCinema((c) => ({ ...c, eraId }))}
                  />
                </ChipPopover>

                <ChipPopover
                  label="Camera"
                  value={
                    camera !== "raw" || cinema.shotId !== "raw" || cinema.cameraBodyId !== "raw" || cinema.lensId !== "raw" || cinema.apertureId !== "raw"
                      ? [
                          presetLabel(CAMERA_BODY_PRESETS, cinema.cameraBodyId),
                          presetLabel(LENS_PRESETS, cinema.lensId),
                          presetLabel(APERTURE_PRESETS, cinema.apertureId),
                          presetLabel(CAMERA_PRESETS, camera),
                          presetLabel(SHOT_PRESETS, cinema.shotId),
                        ]
                          .filter((v) => v !== "Auto")
                          .join(" · ")
                      : "Auto"
                  }
                  active={camera !== "raw" || cinema.shotId !== "raw" || cinema.cameraBodyId !== "raw" || cinema.lensId !== "raw" || cinema.apertureId !== "raw"}
                  width="w-camera-panel"
                >
                  <CameraControlPanel
                    movementPresets={CAMERA_PRESETS}
                    framingPresets={SHOT_PRESETS}
                    bodyPresets={CAMERA_BODY_PRESETS}
                    lensPresets={LENS_PRESETS}
                    aperturePresets={APERTURE_PRESETS}
                    movement={camera}
                    framing={cinema.shotId}
                    body={cinema.cameraBodyId}
                    lens={cinema.lensId}
                    aperture={cinema.apertureId}
                    onMovementChange={setCamera}
                    onFramingChange={(shotId) => setCinema((c) => ({ ...c, shotId }))}
                    onBodyChange={(cameraBodyId) => setCinema((c) => ({ ...c, cameraBodyId }))}
                    onLensChange={(lensId) => setCinema((c) => ({ ...c, lensId }))}
                    onApertureChange={(apertureId) => setCinema((c) => ({ ...c, apertureId }))}
                  />
                </ChipPopover>

                <ChipPopover
                  label="Color palette"
                  value={presetLabel(GRADE_PRESETS, cinema.gradeId)}
                  active={cinema.gradeId !== "raw"}
                  width="w-cinema-grid"
                >
                  <VisualPresetGrid
                    presets={GRADE_PRESETS}
                    value={cinema.gradeId}
                    onChange={(gradeId) => setCinema((c) => ({ ...c, gradeId }))}
                  />
                </ChipPopover>

                <ChipPopover
                  label="Lighting"
                  value={presetLabel(LIGHT_LOOK_PRESETS, cinema.lightLookId)}
                  active={cinema.lightLookId !== "raw"}
                  width="w-cinema-grid"
                >
                  <VisualPresetGrid
                    presets={LIGHT_LOOK_PRESETS}
                    value={cinema.lightLookId}
                    onChange={(lightLookId) =>
                      setCinema((c) => ({ ...c, lightLookId }))
                    }
                  />
                </ChipPopover>

                <ChipPopover
                  label="Emotion"
                  value={presetLabel(EMOTION_PRESETS, cinema.emotionId)}
                  active={cinema.emotionId !== "raw"}
                  width="w-80"
                >
                  <p className="px-2 pt-1 text-[10px] tracking-[0.14em] text-muted-foreground uppercase">
                    Emotion wheel
                  </p>
                  <EmotionWheel
                    presets={EMOTION_PRESETS}
                    value={cinema.emotionId}
                    onChange={(emotionId) =>
                      setCinema((c) => ({ ...c, emotionId }))
                    }
                  />
                </ChipPopover>

                <ChipPopover
                  label="Pacing"
                  value={presetLabel(PACING_PRESETS, cinema.pacingId)}
                  active={cinema.pacingId !== "raw"}
                  width="w-80"
                >
                  <p className="px-2 pt-1 pb-1.5 text-[10px] tracking-[0.14em] text-muted-foreground uppercase">
                    Montage pacing
                  </p>
                  <PacingCards
                    presets={PACING_PRESETS}
                    value={cinema.pacingId}
                    onChange={setCinemaPacing}
                  />
                </ChipPopover>

                <ChipPopover
                  label="Tempo"
                  value={presetLabel(TEMPO_PRESETS, cinema.tempoId)}
                  active={cinema.tempoId !== "raw"}
                  width="w-72"
                >
                  <PresetList
                    presets={TEMPO_PRESETS}
                    value={cinema.tempoId}
                    onChange={(tempoId) => setCinema((c) => ({ ...c, tempoId }))}
                  />
                </ChipPopover>

                {(activeCinemaCount > 0) && (
                  <button
                    type="button"
                    onClick={() => {
                      setCinema(CINEMA_DEFAULTS);
                      setCamera(DEFAULT_CAMERA_ID);
                    }}
                    className="flex items-center gap-1 rounded-lg px-2 py-1.5 text-[11px] text-muted-foreground transition hover:text-foreground"
                  >
                    <X className="size-3" /> Reset
                  </button>
                )}
              </div>
            )}

            {generating || composerCollapsed ? (
              <div className="flex items-center gap-3 px-1 py-3">
                {generating ? (
                  <Loader2 className="size-4 shrink-0 animate-spin text-gold" />
                ) : (
                  <span className="flex size-8 shrink-0 items-center justify-center rounded-lg bg-gold-soft ring-1 ring-gold/25">
                    {mode === "t2v" ? (
                      <Clapperboard className="size-4 text-gold" />
                    ) : (
                      <ImageIcon className="size-4 text-gold" />
                    )}
                  </span>
                )}
                <div className="min-w-0 flex-1">
                  <p className="truncate text-sm text-foreground">
                    {subject ||
                      (mode === "t2v" ? "Starting render…" : "Generating…")}
                  </p>
                  <p className="text-[11px] text-muted-foreground">
                    {generating
                      ? (smartStage
                          ? smartStage
                          : mode === "t2v"
                            ? "Starting render — it keeps going even if you leave"
                            : `Generating ${numOutputs} image${
                                numOutputs > 1 ? "s" : ""
                              }… preview appears above`)
                      : "Rendering above — edit to describe another"}
                  </p>
                </div>
                {!generating && (
                  <Button
                    type="button"
                    size="sm"
                    variant="outline"
                    className="h-7 shrink-0 gap-1.5 text-xs"
                    onClick={() => setComposerCollapsed(false)}
                  >
                    <SquarePen className="size-3" />
                    Edit
                  </Button>
                )}
              </div>
            ) : (
              <div className="relative rounded-2xl bg-input/30">
              {/* Sits behind the transparent-text textarea and re-renders the
                  prompt so @image/@video/@audio tags read as linked, not prose.
                  Typography must mirror the textarea exactly or the caret and
                  the visible glyphs drift apart. */}
              <div
                ref={promptHighlightRef}
                aria-hidden
                className={cn(
                  "pointer-events-none absolute inset-0 overflow-hidden text-foreground",
                  PROMPT_FIELD_TYPE
                )}
              >
                {promptSegments.map((seg, i) =>
                  i % 2 === 1 ? (
                    <span
                      key={i}
                      className="rounded-[4px] bg-gold/15 text-gold"
                    >
                      {seg}
                    </span>
                  ) : (
                    <span key={i}>{seg}</span>
                  )
                )}
                {"\u200B"}
              </div>
              <Textarea
                placeholder={
                  mode === "t2v"
                    ? videoEditSource
                      ? videoEditSource.intent === "extend"
                        ? "Continue @video1 — what happens next?"
                        : videoEditSource.intent === "vary"
                          ? "Vary @video1 — same scene, new take"
                          : "Change @video1 — what should be different?"
                      : videoWorkflow === "edit" ? "Describe what to change in the source video…" : "Describe the shot — subject, action, camera, mood…"
                    : referenceUrls.length > 0
                      ? "Describe the change you want from the reference…"
                      : "Describe what you want to create — subject, setting, lighting, mood…"
                }
              ref={promptRef}
              data-tour="prompt"
              value={subject}
              onChange={(e) => {
                setSubject(e.target.value);
                syncMention(e.target.value, e.target.selectionStart);
              }}
                onKeyDown={(e) => {
                  // The menu owns the arrow keys and Enter while it is open,
                  // otherwise Enter would submit mid-tag.
                  if (mention && mentionMatches.length > 0) {
                    if (e.key === "ArrowDown") {
                      e.preventDefault();
                      setMentionIndex((i) => (i + 1) % mentionMatches.length);
                      return;
                    }
                    if (e.key === "ArrowUp") {
                      e.preventDefault();
                      setMentionIndex(
                        (i) =>
                          (i - 1 + mentionMatches.length) % mentionMatches.length
                      );
                      return;
                    }
                    if (e.key === "Enter" || e.key === "Tab") {
                      e.preventDefault();
                      insertMention(mentionMatches[mentionIndex]);
                      return;
                    }
                    if (e.key === "Escape") {
                      e.preventDefault();
                      setMention(null);
                      return;
                    }
                  }
                  onKeyDown(e);
                }}
                onKeyUp={(e) =>
                  syncMention(
                    e.currentTarget.value,
                    e.currentTarget.selectionStart
                  )
                }
                onClick={(e) =>
                  syncMention(
                    e.currentTarget.value,
                    e.currentTarget.selectionStart
                  )
                }
                onBlur={() => window.setTimeout(() => setMention(null), 120)}
                onPaste={onPromptPaste}
                onScroll={(e) => {
                  const el = promptHighlightRef.current;
                  if (el) el.scrollTop = e.currentTarget.scrollTop;
                }}
                rows={6}
                className={cn(
                  "field-sizing-fixed relative block h-24 max-h-24 min-h-24 resize-none overflow-y-auto border-0 bg-transparent text-white shadow-none caret-white [-webkit-text-fill-color:transparent] placeholder:[-webkit-text-fill-color:var(--athar-text-muted)] focus-visible:ring-0 md:h-40 md:max-h-40 md:min-h-40 dark:bg-transparent",
                  PROMPT_FIELD_TYPE
                )}
              />

            {/* Inside this wrapper so overflow-y-auto on the dock cannot
                clip it. bottom-full of the dock sat above the panel. */}
            {mention && (
              <div
                role="listbox"
                aria-label="Attached images"
                className="absolute top-2 left-3 z-50 max-h-56 w-64 overflow-y-auto rounded-xl bg-popover p-1 shadow-2xl ring-1 ring-border"
              >
                <p className="px-2 py-1 text-[10px] tracking-[0.14em] text-muted-foreground uppercase">
                  {mentionTargets.length > 0
                    ? "Tag an image"
                    : "From Assets"}
                </p>
                {mentionMatches.length === 0 ? (
                  <p className="px-2 py-2 text-xs text-muted-foreground">
                    {assetCatalog.length === 0
                      ? "No photos yet — add some on Assets, or attach one"
                      : "No matching photos"}
                  </p>
                ) : (
                  mentionMatches.map((t, i) => (
                  <button
                    key={`${t.url}-${t.index ?? t.display}`}
                    type="button"
                    role="option"
                    aria-selected={i === mentionIndex}
                    onMouseEnter={() => setMentionIndex(i)}
                    data-mention-index={i}
                    onMouseDown={handleMentionMouseDown}
                    className={cn(
                      "flex w-full items-center gap-2.5 rounded-lg px-2 py-1.5 text-left transition",
                      i === mentionIndex ? "bg-sidebar-accent" : "hover:bg-sidebar-accent/60"
                    )}
                  >
                    {t.url.startsWith("asset://") ? (
                      t.thumb ? (
                        // eslint-disable-next-line @next/next/no-img-element
                        <img
                          src={t.thumb}
                          alt=""
                          className="size-8 shrink-0 rounded-md object-cover ring-1 ring-gold/30"
                        />
                      ) : (
                        <span className="flex size-8 shrink-0 items-center justify-center rounded-md bg-white/5 ring-1 ring-gold/30">
                          <ShieldCheck className="size-3.5 text-gold" />
                        </span>
                      )
                    ) : (
                      // eslint-disable-next-line @next/next/no-img-element
                      <img
                        src={t.url}
                        alt=""
                        className="size-8 shrink-0 rounded-md object-cover ring-1 ring-border"
                      />
                    )}
                    <span className="min-w-0 flex-1">
                      <span className="block truncate text-sm">{t.display}</span>
                      <span className="block font-mono text-[10px] text-muted-foreground">
                        {t.index != null
                          ? mentionToken(t.index)
                          : `Attach · ${mentionToken(mentionTargets.length)}`}
                      </span>
                    </span>
                  </button>
                  ))
                )}
              </div>
            )}
              </div>
            )}

              {!generating && !composerCollapsed && (mode === "t2i" || cinemaOn) && (
              <div className="mt-1 flex items-center justify-between gap-2 px-1">
                <button
                  type="button"
                  onClick={() => setDetailsOpen((o) => !o)}
                  data-tour="prompt-details"
                  className="flex items-center gap-1 text-[11px] text-muted-foreground transition hover:text-foreground"
                >
                  <ChevronDown
                    className={cn(
                      "size-3.5 transition",
                      detailsOpen && "rotate-180"
                    )}
                  />
                  Details
                  {(action || lighting || brandTokens || negativeAdditions) && (
                    <span className="ml-1 size-1.5 rounded-full bg-gold" />
                  )}
                </button>

          </div>
              )}

              {!generating && !composerCollapsed && detailsOpen && (mode === "t2i" || cinemaOn) && (
                <div className="mt-2 grid gap-2 sm:grid-cols-3">
            <Input
                    placeholder="Action"
              value={action}
              onChange={(e) => setAction(e.target.value)}
                    className="h-9 border-white/8 bg-black/25 text-sm"
            />
            <Input
                    placeholder="Lighting"
              value={lighting}
              onChange={(e) => setLighting(e.target.value)}
                    className="h-9 border-white/8 bg-black/25 text-sm"
            />
            <Input
                    placeholder="Brand look — e.g. premium tech aesthetic, deep blacks"
              value={brandTokens}
              onChange={(e) => setBrandTokens(e.target.value)}
                    className="h-9 border-white/8 bg-black/25 text-sm"
            />
          </div>
              )}

              {!generating && (
              <div className="mt-3 flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
                {/* On a phone this row holds ~11 chips; wrapping turns the
                    dock into a wall that covers the screen, so it scrolls
                    sideways instead and only wraps once there's room. */}
                <div className="-mx-1 flex items-center gap-2 overflow-x-auto px-1 pb-1 [scrollbar-width:none] [&::-webkit-scrollbar]:hidden [&>*]:shrink-0 sm:mx-0 sm:flex-wrap sm:overflow-visible sm:px-0 sm:pb-0 sm:[&>*]:shrink">
                  {/* Who the work is for, set right where it's used. Client is
                      required; project and brand kit are optional. */}
                  <span
                    data-tour="client"
                    className={cn(
                      "inline-flex rounded-full transition-shadow duration-300",
                      clientNudge && "ring-2 ring-gold"
                    )}
                  >
                    <ClientPicker
                      activeClientId={activeClientId}
                      onActiveClientChange={onActiveClientChange}
                      clients={clients}
                      onClientsChange={setClients}
                      compact
                    />
                  </span>
                  <span data-tour="project" className="inline-flex">
                    <ProjectPicker
                      activeProjectId={activeProjectId}
                      onActiveProjectChange={setActiveProjectId}
                      projects={projects}
                      onProjectsChange={setProjects}
                      clientId={activeClientId}
                      required={mode === "t2v"}
                      canManageSpend={session?.user?.role === "admin"}
                      compact
                    />
                  </span>
                  <span data-tour="brand-kit" className="inline-flex">
                    <BrandKitPicker
                      activeBrandKitId={activeBrandKitId}
                      onActiveBrandKitChange={setActiveBrandKitId}
                      brandKits={brandKits}
                      onBrandKitsChange={setBrandKits}
                      clientId={activeClientId}
                      compact
                    />
                  </span>

                  <span className="mx-0.5 h-5 w-px bg-white/10" aria-hidden />

                  {mode === "t2i" && (
                    <button
                      type="button"
                      disabled={uploadingRef || referenceUrls.length >= maxRefs}
                      onClick={() => refFileInput.current?.click()}
                      aria-label="Attach reference"
                      className={cn(
                        "inline-flex h-8 items-center gap-1.5 rounded-full border border-white/10 bg-white/5 px-3 text-xs text-muted-foreground transition hover:text-foreground disabled:opacity-50",
                        referenceUrls.length > 0 &&
                          "border-gold/30 text-foreground"
                      )}
                    >
                      {uploadingRef ? (
                        <Loader2 className="size-3.5 animate-spin" />
                      ) : (
                        <Paperclip className="size-3.5" />
                      )}
                      {referenceUrls.length > 0
                        ? `${referenceUrls.length} ref`
                        : "Attach"}
                    </button>
                  )}

                  {mode === "t2v" && videoWorkflow === "create" && (
                    <button
                      type="button"
                      onClick={() => setReferenceChooserOpen(true)}
                      aria-label="Add references"
                      className={cn(
                        "inline-flex h-8 items-center gap-1.5 rounded-full border border-white/10 bg-white/5 px-3 text-xs text-muted-foreground transition hover:text-foreground",
                        (videoSources.length > 0 || videoRefSources.length > 0) &&
                          "border-gold/30 text-foreground"
                      )}
                    >
                      {uploadingVideoSource || uploadingVideoRef ? (
                        <Loader2 className="size-3.5 animate-spin" />
                      ) : (
                        <Paperclip className="size-3.5" />
                      )}
                      {videoSources.length + videoRefSources.length > 0
                        ? `${videoSources.length + videoRefSources.length} references`
                        : "References"}
                    </button>
                  )}

                  {mode === "t2v" && (videoCaps.audioOnly || videoSources.length > 0 || videoRefSources.length > 0 || !!videoEditSource) && (
                    <button
                      type="button"
                      disabled={
                        uploadingAudio ||
                        audioSources.length >= videoCaps.maxAudios
                      }
                      onClick={() => audioFileInput.current?.click()}
                      aria-label="Attach reference audio"
                      className={cn(
                        "inline-flex h-8 items-center gap-1.5 rounded-full border border-white/10 bg-white/5 px-3 text-xs text-muted-foreground transition hover:text-foreground disabled:opacity-50",
                        audioSources.length > 0 &&
                          "border-gold/30 text-foreground"
                      )}
                    >
                      {uploadingAudio ? (
                        <Loader2 className="size-3.5 animate-spin" />
                      ) : (
                        <AudioLines className="size-3.5" />
                      )}
                      {audioSources.length === 0
                        ? "Audio"
                        : `${audioSources.length} audio`}
                    </button>
                  )}

                  {mode === "t2i" && <button
                    type="button"
                    onClick={() => setRefLibOpen(true)}
                    aria-label="Pick from reference library"
                    className="inline-flex h-8 items-center gap-1.5 rounded-full border border-white/10 bg-white/5 px-3 text-xs text-muted-foreground transition hover:text-foreground"
                  >
                    <Boxes className="size-3.5" />
                    References
                  </button>}

                  {mode === "t2v" && (
                    <button
                      type="button"
                      onClick={() => setCinemaOn((o) => !o)}
                      aria-pressed={cinemaOn}
                      aria-label="Cinema Studio"
                      title="Cinema Studio — genre, camera, colour, light, emotion and pacing"
                      className={cn(
                        "inline-flex h-8 items-center gap-1.5 rounded-full border px-3 text-xs transition",
                        cinemaOn
                          ? "border-gold/30 bg-gold/15 text-foreground"
                          : "border-white/10 bg-white/5 text-muted-foreground hover:text-foreground"
                      )}
                    >
                      <Aperture
                        className={cn("size-3.5", cinemaOn && "text-gold")}
                      />
                      Cinema Studio
                      {cinemaOn && activeCinemaCount > 0 && (
                        <span className="rounded-full bg-gold/20 px-1.5 text-[10px] text-gold">
                          {activeCinemaCount}
                        </span>
                      )}
                    </button>
                  )}

                  <span data-tour="model" className="inline-flex">
                    {mode === "t2i" ? (
                      <ImageModelSelect
                        value={imageModelId}
                        onChange={applyImageModel}
                        className="h-8 w-auto min-w-[9.5rem] rounded-full border-white/10 bg-white/5 px-3"
                      />
                    ) : (
                      // Video renders on Seedance, whose tiers aren't part of
                      // the still-model list.
                      <Select
                        value={tier}
                        onValueChange={(v) => selectVideoTier(v as Tier)}
                      >
                        <SelectTrigger className="h-8 w-auto min-w-[9.5rem] rounded-full border-white/10 bg-white/5 px-3 text-xs">
                          <Cpu className="size-3.5 shrink-0 text-muted-foreground" />
                          <SelectValue>{selectedModelLabel}</SelectValue>
                        </SelectTrigger>
                        <SelectContent>
                          {modelOptions.filter(m => videoWorkflow !== "edit" || videoCapabilities(m.tier).editing).map((m) => (
                            <SelectItem key={m.tier} value={m.tier}>
                              <span className="flex flex-col items-start gap-0.5 py-0.5">
                                <span>{m.label}</span>
                                <span className="font-mono text-[10px] text-muted-foreground">
                                  {m.slug}
                                </span>
                              </span>
                            </SelectItem>
                          ))}
                        </SelectContent>
                      </Select>
                    )}
                  </span>

              {mode === "t2i" && (
                <span data-tour="style" className="inline-flex">
                <Select value={style} onValueChange={setStyle}>
                  <SelectTrigger
                    title="Look / style applied to the image"
                    className="h-8 w-auto min-w-[8rem] rounded-full border-white/10 bg-white/5 px-3 text-xs"
                  >
                    <Wand2 className="size-3.5 shrink-0 text-muted-foreground" />
                    <SelectValue>{selectedStyleLabel}</SelectValue>
                  </SelectTrigger>
                  <SelectContent>
                    {clientStyles.length > 0 && (
                      <div className="px-2 py-1 text-[10px] font-medium tracking-[0.14em] text-muted-foreground uppercase">
                        {activeClient?.name ?? "Client"} presets
                      </div>
                    )}
                    {clientStyles.map((s) => (
                      <SelectItem key={s.id} value={s.id}>
                        <span className="flex flex-col items-start gap-0.5 py-0.5">
                          <span>{s.name}</span>
                          <span className="text-[10px] text-muted-foreground">
                            Saved look
                          </span>
                        </span>
                      </SelectItem>
                    ))}
                    {clientStyles.length > 0 && (
                      <div className="my-1 h-px bg-border" />
                    )}
                    {STYLE_PRESETS.map((s) => (
                      <SelectItem key={s.id} value={s.id}>
                        <span className="flex flex-col items-start gap-0.5 py-0.5">
                          <span>{s.label}</span>
                          <span className="text-[10px] text-muted-foreground">
                            {s.description}
                          </span>
                        </span>
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
                </span>
              )}

              {mode === "t2i" && (
                <button
                  type="button"
                  onClick={() => {
                    const base =
                      activeClientStyle?.positive ??
                      STYLE_PRESETS.find((s) => s.id === style)?.positive ??
                      "";
                    setSaveStyleName("");
                    setSaveStyleTokens(base);
                    setSaveStyleOpen(true);
                  }}
                  title="Save the current look as a preset for this client"
                  data-tour="save-look"
                  className="inline-flex h-8 items-center gap-1.5 rounded-full border border-white/10 bg-white/5 px-3 text-xs text-muted-foreground transition hover:text-foreground"
                >
                  <Plus className="size-3.5" />
                  Save look
                </button>
              )}

              {mode === "t2i" && (
                <button
                  type="button"
                  onClick={() => setSmartMode((s) => !s)}
                  aria-pressed={smartMode}
                  data-tour="smart"
                  title="Smart: compare options, finish a 1K winner, and check brand fit. Keep this tab open for automatic finishing."
                  className={cn(
                    "inline-flex h-8 items-center gap-1.5 rounded-full border px-3 text-xs transition",
                    smartMode
                      ? "border-gold bg-gold/15 text-foreground"
                      : "border-white/10 bg-white/5 text-muted-foreground hover:text-foreground"
                  )}
                >
                  <Sparkles
                    className={cn("size-3.5", smartMode && "text-gold")}
                  />
                  Smart
                </button>
              )}

              {mode === "t2v" && !cinemaOn && (
                <Select value={camera} onValueChange={setCamera}>
                  <SelectTrigger
                    title="Camera move applied to the shot"
                    className="h-8 w-auto min-w-[8.5rem] rounded-full border-white/10 bg-white/5 px-3 text-xs"
                  >
                    <Clapperboard className="size-3.5 shrink-0 text-muted-foreground" />
                    <SelectValue>{selectedCameraLabel}</SelectValue>
                  </SelectTrigger>
                  <SelectContent>
                    {CAMERA_PRESETS.map((c) => (
                      <SelectItem key={c.id} value={c.id}>
                        <span className="flex flex-col items-start gap-0.5 py-0.5">
                          <span>{c.label}</span>
                          <span className="text-[10px] text-muted-foreground">
                            {c.description}
                          </span>
                        </span>
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              )}

              {mode === "t2v" && (
                <label
                  title={
                    audioSources.length
                      ? "Reference audio requires sound output"
                      : "Generate sound with the video"
                  }
                  className="inline-flex h-8 cursor-pointer items-center gap-2 rounded-full border border-white/10 bg-white/5 px-3 text-xs text-muted-foreground has-[:disabled]:cursor-not-allowed has-[:disabled]:opacity-60"
                >
                  <span>Sound</span>
                  <Switch
                    checked={generateAudio || audioSources.length > 0}
                    disabled={audioSources.length > 0}
                    onCheckedChange={setGenerateAudio}
                    aria-label="Generate sound"
                  />
                </label>
              )}
              <span data-tour="output" className="inline-flex items-center gap-2">
              {mode === "t2i" && googleModel === "nano-banana" ? (
                <span className="px-2 text-xs text-muted-foreground">
                  Auto frame &amp; size
                </span>
              ) : mode === "t2v" && videoRatioLocked ? (
                <span className="px-2 text-xs text-muted-foreground">
                  {videoWorkflow === "edit" ? "Source ratio" : "First-frame ratio"}
                </span>
              ) : (
              <ChipPopover
                value={aspect}
                active={false}
                icon={<AspectIcon ratio={aspect} />}
                width="w-80"
              >
                <p className="px-2 pt-1 pb-1.5 text-[10px] tracking-[0.14em] text-muted-foreground uppercase">
                  Aspect ratio
                </p>
                <div className="grid grid-cols-3 gap-1.5 p-1">
                  {(mode === "t2v" ? videoCaps.aspects : ASPECT_RATIOS).map((a) => {
                    const selected = a === aspect;
                    return (
                      <button
                        key={a}
                        type="button"
                        onClick={() => setAspect(a)}
                        className={cn(
                          "flex flex-col items-center gap-1.5 rounded-lg border py-2.5 transition",
                          selected
                            ? "border-gold/50 bg-gold/10"
                            : "border-white/10 bg-white/5 hover:border-white/25"
                        )}
                      >
                        <AspectIcon
                          ratio={a}
                          className={selected ? "text-gold" : "text-foreground"}
                        />
                        <span
                          className={cn(
                            "text-[11px]",
                            selected ? "text-gold" : "text-muted-foreground"
                          )}
                        >
                          {a}
                        </span>
                      </button>
                    );
                  })}
                </div>
              </ChipPopover>
              )}

                {mode === "t2i" && googleModel !== "nano-banana" && (
                  <Select
                    value={resolution}
                    onValueChange={(v) => setResolution(v as ImageResolution)}
                  >
                    <SelectTrigger className="h-8 w-auto min-w-[4rem] rounded-full border-white/10 bg-white/5 px-3 text-xs">
                      <Gem className="size-3.5 shrink-0 text-muted-foreground" />
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      {RESOLUTIONS.filter((r) =>
                        (
                          imageModelChoice(imageModelId)?.resolutions ?? [
                            "1K",
                            "2K",
                          ]
                        ).includes(r.value)
                      ).map((r) => (
                        <SelectItem key={r.value} value={r.value}>
                          {r.label}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                )}

                {mode === "t2v" && videoWorkflow === "edit" && videoEditSource?.intent !== "extend" ? (
                  <span
                    title="Seedance keeps the source clip's length when you edit a video"
                    className="inline-flex h-8 items-center gap-1.5 rounded-full border border-white/10 bg-white/5 px-3 text-xs text-muted-foreground"
                  >
                    <Clock className="size-3.5 shrink-0" />
                    {videoEditSource?.durationS
                      ? `${Math.round(Number(videoEditSource.durationS))}s source`
                      : "Same as source"}
                  </span>
                ) : mode === "t2v" ? (
                    <ChipPopover
                      value={`${durationS}s`}
                      icon={<Clock className="size-3.5" />}
                      active={false}
                      width="w-72"
                    >
                      <div className="px-2 pt-1 pb-2">
                        <p className="text-[10px] tracking-[0.14em] text-muted-foreground uppercase">
                          Choose duration
                        </p>
                        <p className="mt-2 mb-3 text-center text-2xl font-semibold text-foreground">
                          {durationS}s
                        </p>
                        <Slider
                          min={4}
                          max={videoCaps.maxDuration}
                          step={1}
                          value={[durationS]}
                          onValueChange={([v]) => setDurationS(v)}
                        />
                        <div className="mt-1.5 flex items-center justify-between text-[10px] text-muted-foreground">
                          <span>4s</span>
                          <span>{videoCaps.maxDuration}s</span>
                        </div>
                      </div>
                    </ChipPopover>
                  ) : null}

                {mode === "t2v" ? (
                    <Select
                      value={videoResolution}
                      onValueChange={(v) =>
                        setVideoResolution(v as typeof videoResolution)
                      }
                    >
                      <SelectTrigger className="h-8 w-auto min-w-[5.5rem] rounded-full border-white/10 bg-white/5 px-3 text-xs">
                        <Gem className="size-3.5 shrink-0 text-muted-foreground" />
                        <SelectValue />
                      </SelectTrigger>
                      <SelectContent>
                        {videoCaps.resolutions.map(value => <SelectItem key={value} value={value}>{value}</SelectItem>)}
                      </SelectContent>
                    </Select>
                  ) : (
            <Select
              value={String(numOutputs)}
              onValueChange={(v) => setNumOutputs(Number(v))}
            >
                      <SelectTrigger
                        title="How many images to generate. Pick more than one and Athar auto-scores them and picks the best (best-of-N)."
                        className="h-8 w-auto min-w-[6.5rem] gap-1.5 rounded-full border-white/10 bg-white/5 px-3 text-xs"
                      >
                        <Images className="size-3.5 shrink-0 text-muted-foreground" />
                <SelectValue>
                  {numOutputs === 1
                    ? "1 image"
                    : `${numOutputs} · best pick`}
                </SelectValue>
              </SelectTrigger>
              <SelectContent>
                {[1, 2, 3, 4].map((n) => (
                  <SelectItem key={n} value={String(n)}>
                    <span className="flex flex-col items-start gap-0.5 py-0.5">
                      <span>{n === 1 ? "1 image" : `${n} images`}</span>
                      <span className="text-[10px] text-muted-foreground">
                        {n === 1
                          ? "Single generation"
                          : `Auto-scored — best of ${n} picked`}
                      </span>
                    </span>
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
                  )}
            </span>
          </div>

          {/* Live estimate for the current settings, so cost is visible
              before committing rather than discovered in the Usage report. */}
          {estimatedCost != null && (
            <span
              data-tour="cost"
              title={
                mode === "t2i"
                  ? `Estimate for ${numOutputs} image${numOutputs === 1 ? "" : "s"} at these settings`
                  : videoEditSource
                    ? "Estimate for a clip the same length as the source"
                    : `Estimate for a ${durationS}s clip at these settings`
              }
              className="inline-flex h-10 shrink-0 items-center gap-1.5 rounded-full border border-white/10 bg-white/5 px-3 text-xs text-muted-foreground"
            >
              <span className="text-[10px] tracking-[0.14em] uppercase opacity-70">
                Est.
              </span>
              <span className="font-medium text-foreground">
                ${estimatedCost < 0.01 ? estimatedCost.toFixed(3) : estimatedCost.toFixed(2)}
              </span>
            </span>
          )}

          <Button
            size="lg"
            data-tour="generate"
            onClick={() => void onGenerate()}
            // Only real busy states make this un-clickable. A missing client
            // stays clickable on purpose — disabling it here would make the
            // button inert to both mouse hover (native title tooltips don't
            // fire through disabled:pointer-events-none) and click, leaving
            // no way to discover why. onGenerate() shows the toast instead.
            disabled={generating || uploadingVideoRef || uploadingVideoSource || uploadingAudio}
            title={
              !activeClientId
                ? "Pick a client first — generations are always attributed to one"
                : undefined
            }
            className={cn(
              "h-10 rounded-full px-6 font-medium text-primary-foreground",
              generating && "animate-gen-pulse",
              !activeClientId && "opacity-50"
            )}
          >
                  {generating ? (
                    <>
                      <Loader2 className="size-4 animate-spin" />
                      {mode === "t2v" ? "Rendering…" : "Generating…"}
                    </>
                  ) : (
                    <>
                      <Sparkles className="size-4" />
                      Generate
                    </>
                  )}
          </Button>
        </div>
              )}
            </div>
            </div>

          <Dialog
            open={saveRefUrl != null}
            onOpenChange={(o) => {
              if (!o) setSaveRefUrl(null);
            }}
          >
            <DialogContent className="sm:max-w-md">
              <DialogHeader>
                <DialogTitle>Save to reference library</DialogTitle>
              </DialogHeader>
              <form onSubmit={saveReference} className="space-y-3">
                {saveRefUrl && (
                  // eslint-disable-next-line @next/next/no-img-element
                  <img
                    src={saveRefUrl}
                    alt=""
                    className="h-32 w-full rounded-xl object-contain ring-1 ring-border"
                  />
                )}
                <Input
                  autoFocus
                  placeholder="Name — e.g. Layla, Gold Tin"
                  value={saveRefName}
                  onChange={(e) => setSaveRefName(e.target.value)}
                  required
                />
                <Select value={saveRefKind} onValueChange={setSaveRefKind}>
                  <SelectTrigger>
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="character">Character</SelectItem>
                    <SelectItem value="product">Product</SelectItem>
                    <SelectItem value="brand">Brand</SelectItem>
                    <SelectItem value="style">Style</SelectItem>
                    <SelectItem value="reference">Reference</SelectItem>
                  </SelectContent>
                </Select>

                <div className="grid grid-cols-2 gap-2">
                  <div className="space-y-1">
                    <span className="text-[10px] tracking-[0.14em] text-muted-foreground uppercase">
                      Client
                    </span>
                    <SearchPicker
                      value={saveRefClientId ?? "none"}
                      onValueChange={(value) => {
                        setSaveRefClientId(value === "none" ? null : value);
                        setSaveRefProjectId(null);
                      }}
                      options={[
                        { value: "none", label: "Shared (no client)" },
                        ...clients.map((client) => ({ value: client.id, label: client.name })),
                      ]}
                      label="Choose client"
                      placeholder="Shared"
                      className="h-9 w-full justify-start rounded-lg"
                    />
                  </div>
                  <div className="space-y-1">
                    <span className="text-[10px] tracking-[0.14em] text-muted-foreground uppercase">
                      Project
                    </span>
                    <SearchPicker
                      value={saveRefProjectId ?? "none"}
                      onValueChange={(value) =>
                        setSaveRefProjectId(value === "none" ? null : value)
                      }
                      options={[
                        { value: "none", label: "Client-wide" },
                        ...projects
                          .filter(
                            (p) =>
                              !saveRefClientId ||
                              p.client_id === saveRefClientId
                          )
                          .map((project) => ({ value: project.id, label: project.name })),
                      ]}
                      label="Choose project"
                      placeholder="Client-wide"
                      className="h-9 w-full justify-start rounded-lg"
                    />
                  </div>
                </div>

                {!saveRefClientId && (
                  <p className="text-[11px] text-muted-foreground">
                    Tip: pick a client so this stays with the rest of their
                    brand assets.
                  </p>
                )}
                <Button
                  type="submit"
                  disabled={savingRef || !saveRefName.trim()}
                  className="w-full bg-gold text-primary-foreground hover:bg-gold/90"
                >
                  {savingRef ? (
                    <>
                      <Loader2 className="size-4 animate-spin" />
                      Saving…
                    </>
                  ) : (
                    "Save reference"
                  )}
                </Button>
              </form>
            </DialogContent>
          </Dialog>

          <Dialog open={saveStyleOpen} onOpenChange={setSaveStyleOpen}>
            <DialogContent className="sm:max-w-md">
              <DialogHeader>
                <DialogTitle>
                  Save a look{activeClient ? ` for ${activeClient.name}` : ""}
                </DialogTitle>
              </DialogHeader>
              <form
                onSubmit={async (e) => {
                  e.preventDefault();
                  if (!saveStyleName.trim() || !saveStyleTokens.trim()) return;
                  setSavingStyle(true);
                  try {
                    const res = await fetch("/api/style-presets", {
                      method: "POST",
                      headers: { "Content-Type": "application/json" },
                      body: JSON.stringify({
                        name: saveStyleName.trim(),
                        positive: saveStyleTokens.trim(),
                        negative: negativeAdditions.trim() || undefined,
                        clientId: activeClientId,
                      }),
                    });
                    const json = await res.json();
                    if (!res.ok) throw new Error(json.error);
                    setClientStyles((prev) => [
                      json.preset as StylePresetRecord,
                      ...prev,
                    ]);
                    setStyle(json.preset.id);
                    setSaveStyleOpen(false);
                    toast.success(`Saved look “${json.preset.name}”`);
                  } catch (err) {
                    toast.error(
                      err instanceof Error ? err.message : "Save failed"
                    );
                  } finally {
                    setSavingStyle(false);
                  }
                }}
                className="space-y-3"
              >
                <Input
                  autoFocus
                  placeholder="Look name — e.g. Aurum Signature"
                  value={saveStyleName}
                  onChange={(e) => setSaveStyleName(e.target.value)}
                  required
                />
                <Textarea
                  placeholder="Style tokens — e.g. warm editorial light, shallow depth, gold-black grade"
                  value={saveStyleTokens}
                  onChange={(e) => setSaveStyleTokens(e.target.value)}
                  required
                  className="min-h-20"
                />
                <p className="text-[11px] text-muted-foreground">
                  {activeClient
                    ? `Appears in the Style menu only for ${activeClient.name}.`
                    : "No client selected — this becomes a shared look."}
                </p>
                <Button
                  type="submit"
                  disabled={
                    savingStyle ||
                    !saveStyleName.trim() ||
                    !saveStyleTokens.trim()
                  }
                  className="w-full bg-gold text-primary-foreground hover:bg-gold/90"
                >
                  {savingStyle ? (
                    <>
                      <Loader2 className="size-4 animate-spin" />
                      Saving…
                    </>
                  ) : (
                    "Save look"
                  )}
                </Button>
              </form>
            </DialogContent>
          </Dialog>

          <Dialog open={refLibOpen} onOpenChange={setRefLibOpen}>
            <DialogContent className="max-h-[85vh] overflow-y-auto sm:max-w-2xl">
              <DialogHeader>
                <DialogTitle>
                  {activeClient
                    ? `${activeClient.name} · reference library`
                    : "Reference library"}
                </DialogTitle>
              </DialogHeader>
              <ReferenceLibrary
                mode="picker"
                clientId={activeClientId}
                selectedUrls={mode === "t2v"
                  ? videoSources.map((s) => s.url)
                  : referenceUrls}
                onPick={(url, ref) => {
                  // Keep the name so the @ menu can show "Fatima" rather than
                  // "Image 2" — the label is the only way to tell two
                  // thumbnails apart at 32px.
                  if (ref?.name) {
                    setReferenceNames((prev) => ({ ...prev, [url]: ref.name }));
                  }
                  if (mode === "t2v") {
                    if (videoSources.some((s) => s.url === url)) {
                      setVideoSources((prev) =>
                        prev.filter((s) => s.url !== url)
                      );
                      return;
                    }
                    if (videoSources.length >= MAX_VIDEO_IMAGES) {
                      toast.error(`Up to ${MAX_VIDEO_IMAGES} images`);
                      return;
                    }
                    setVideoSources((prev) => [
                      ...prev,
                      { url, generationId: null },
                    ]);
                  } else {
                    if (referenceUrls.includes(url)) {
                      setReferenceUrls((prev) => prev.filter((u) => u !== url));
                      return;
                    }
                    if (referenceUrls.length >= maxRefs) {
                      toast.error(`Up to ${maxRefs} reference images`);
                      return;
                    }
                    setReferenceUrls((prev) => [...prev, url]);
                  }
                }}
              />
            </DialogContent>
          </Dialog>

          <Dialog open={referenceChooserOpen} onOpenChange={setReferenceChooserOpen}>
            <DialogContent className="sm:max-w-lg">
              <DialogHeader>
                <DialogTitle>Add references</DialogTitle>
              </DialogHeader>
              <p className="text-xs text-muted-foreground">
                Add what the video should look like, who appears in it, or how it should move.
              </p>
              <div className="grid gap-2 sm:grid-cols-2">
                <button
                  type="button"
                  disabled={videoSources.length >= MAX_VIDEO_IMAGES}
                  onClick={() => {
                    setReferenceChooserOpen(false);
                    videoFileInput.current?.click();
                  }}
                  className="rounded-xl border border-border p-4 text-left transition hover:bg-white/5 disabled:opacity-40"
                >
                  <ImageIcon className="size-5 text-gold" />
                  <strong className="mt-3 block text-sm">Images</strong>
                  <span className="mt-1 block text-xs text-muted-foreground">
                    First frame, character, product, place, or visual style.
                  </span>
                </button>
                <button
                  type="button"
                  disabled={videoRefSources.length >= MAX_REFERENCE_VIDEOS}
                  onClick={() => {
                    setReferenceChooserOpen(false);
                    videoRefFileInput.current?.click();
                  }}
                  className="rounded-xl border border-border p-4 text-left transition hover:bg-white/5 disabled:opacity-40"
                >
                  <Film className="size-5 text-gold" />
                  <strong className="mt-3 block text-sm">Video clip</strong>
                  <span className="mt-1 block text-xs text-muted-foreground">
                    Copy movement, camera language, timing, or style from a clip.
                  </span>
                </button>
                <button
                  type="button"
                  onClick={() => {
                    setReferenceChooserOpen(false);
                    setRefLibOpen(true);
                  }}
                  className="rounded-xl border border-border p-4 text-left transition hover:bg-white/5"
                >
                  <Boxes className="size-5 text-gold" />
                  <strong className="mt-3 block text-sm">Saved references</strong>
                  <span className="mt-1 block text-xs text-muted-foreground">
                    Reuse images already saved for this client.
                  </span>
                </button>
                <button
                  type="button"
                  onClick={() => {
                    setReferenceChooserOpen(false);
                    void loadAssets();
                    setAssetIdOpen(true);
                  }}
                  className="rounded-xl border border-border p-4 text-left transition hover:bg-white/5"
                >
                  <ShieldCheck className="size-5 text-gold" />
                  <strong className="mt-3 block text-sm">People</strong>
                  <span className="mt-1 block text-xs text-muted-foreground">
                    Verify a person once, then reuse them in future videos.
                  </span>
                </button>
              </div>
            </DialogContent>
          </Dialog>


          </>
        )}
      </main>
    </div>
  );
}
