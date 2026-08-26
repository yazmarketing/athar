"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
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
  Film,
  FolderKanban,
  Heart,
  HelpCircle,
  Home,
  Menu,
  ImageIcon,
  Images,
  Library,
  Loader2,
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
  Upload,
  Wand2,
  Workflow,
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
import { uploadImageFile } from "@/lib/upload-image";
import { isAudioFile, uploadAudioFile } from "@/lib/upload-audio";
import {
  ChipPopover,
  EmotionWheel,
  PacingCards,
  PresetList,
} from "@/components/cinema-studio/controls";
import { ImageChat } from "@/components/image-chat";
import { ImageDetail } from "@/components/image-detail";
import { PromptEditor } from "@/components/prompt-editor";
import { Storyboards } from "@/components/storyboard";
import { Transcribe } from "@/components/transcribe";
import { WelcomeCelebration } from "@/components/welcome-celebration";
import {
  OnboardingTour,
  persistTourCompleted,
  shouldRunTour,
  type TourStep,
} from "@/components/onboarding-tour";
import { GenerationRating } from "@/components/generation-rating";
import { activeMentionQuery, mentionToken } from "@/lib/mentions";
import { SidebarUser } from "@/components/sidebar-user";
import {
  UpscaleDialog,
  fromGeneration,
  type UpscaleSource,
} from "@/components/upscale-dialog";
import { UsagePanel } from "@/components/usage-panel";
import { VideoDetail } from "@/components/video-detail";
import {
  GenerationPlaceholderCard,
  ProgressBar,
  easedProgress,
  stageLabel,
} from "@/components/generation-progress";
import {
  VariationsPanel,
  type VaryStrength,
} from "@/components/variations-panel";
import {
  estimateCost,
  listModelOptions,
  resolveModel,
  maxReferenceImages,
  imageModelChoice,
  imageModelCost,
  imageModelRequest,
  DEFAULT_IMAGE_MODEL_ID,
  type Capability,
  type GoogleImageModelId,
  type ImageModelChoice,
  type ImageResolutionOption,
  type Tier,
} from "@/config/models";
import { ImageModelSelect } from "@/components/image-model-select";
import { VideoThumb } from "@/components/video-thumb";
import { STYLE_PRESETS, DEFAULT_STYLE_ID } from "@/config/styles";
import { CAMERA_PRESETS, DEFAULT_CAMERA_ID } from "@/config/camera";
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
import { YazMediaLogo } from "@/components/yaz-media-logo";
import {
  NotificationsBell,
  type AppNotification,
} from "@/components/notifications-bell";

const ASPECTS: AspectRatio[] = ["16:9", "9:16", "1:1", "4:5", "21:9"];
const RESOLUTIONS: { value: ImageResolution; label: string }[] = [
  { value: "1K", label: "1K" },
  { value: "2K", label: "2K" },
  { value: "4K", label: "4K" },
];

const VIDEO_DURATIONS = [5, 8, 10, 15, 20, 30];
// Seedance 2.0 series accepts up to 9 reference images (2.5 allows more)
const MAX_VIDEO_IMAGES = 9;

/** Seedance 2.5 lip-sync: up to 10 reference audio clips, 30s combined. */
const MAX_AUDIO_CLIPS = 10;

/** Mention tokens the prompt box tints — split() keeps them via the capture. */
const PROMPT_TOKEN_RE = /(@(?:image|video|audio)\d+\b)/gi;

/**
 * Overlay and textarea must share this exactly. The Textarea primitive
 * ships `md:text-sm`, which is 14px — one pixel off the overlay's 15px
 * is enough for the caret to sit on the second-last letter.
 */
const PROMPT_FIELD_TYPE =
  "px-3 py-2.5 font-sans text-[15px] leading-6 break-words whitespace-pre-wrap md:text-[15px]";


/** Cinema Studio director picks (video dock). Camera movement stays in `camera`. */
type CinemaControls = {
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
type View =
  | "home"
  | "create"
  | "library"
  | "edit"
  | "vary"
  | "usage"
  | "assets"
  | "orchestrate"
  | "storyboard"
  | "transcribe"
  | "team";

function isVideo(g: GenerationRecord) {
  return (
    g.mode === "t2v" ||
    g.mode === "i2v" ||
    g.mode === "v2v" ||
    Boolean(g.output_url?.includes(".mp4"))
  );
}

/** Poll Nano Banana jobs until they land (used by Create / Vary / Edit). */
async function waitForImageJobs(
  jobs: GenerationJobRecord[]
): Promise<GenerationRecord[]> {
  const pending = new Set(jobs.map((j) => j.id));
  const results: GenerationRecord[] = [];
  const deadline = Date.now() + 8 * 60 * 1000;
  while (pending.size > 0) {
    if (Date.now() > deadline) {
      throw new Error(
        "Nano Banana is still working — check Library in a minute"
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
        throw new Error(json.job.error ?? "Image render failed");
      }
    }
  }
  return results;
}

export function Studio() {
  const [view, setView] = useState<View>("home");
  const [mode, setMode] = useState<StudioMode>("t2i");
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
    useState<GoogleImageModelId | null>(null);
  const [checkingModel, setCheckingModel] = useState(false);
  const [modelSuggestion, setModelSuggestion] = useState<{
    best: string;
    label: string;
    reason: string;
    current: string;
  } | null>(null);
  const [style, setStyle] = useState<string>(DEFAULT_STYLE_ID);
  const [camera, setCamera] = useState<string>(DEFAULT_CAMERA_ID);
  const [clientStyles, setClientStyles] = useState<StylePresetRecord[]>([]);
  const [smartMode, setSmartMode] = useState(false);
  const [smartStage, setSmartStage] = useState<string | null>(null);
  const [saveStyleOpen, setSaveStyleOpen] = useState(false);
  const [saveStyleName, setSaveStyleName] = useState("");
  const [saveStyleTokens, setSaveStyleTokens] = useState("");
  const [savingStyle, setSavingStyle] = useState(false);
  const [aspect, setAspect] = useState<AspectRatio>("16:9");
  // 1K by default — cheaper and quicker; 2K/4K are a deliberate choice.
  const [resolution, setResolution] = useState<ImageResolution>("1K");
  const [numOutputs, setNumOutputs] = useState(1);
  const [durationS, setDurationS] = useState(5);
  const [videoResolution, setVideoResolution] = useState<
    "480p" | "720p" | "1080p"
  >("720p");
  const [generating, setGenerating] = useState(false);
  const [reproducingId, setReproducingId] = useState<string | null>(null);
  /**
   * What the last generate produced, kept on the Create view until the next
   * run replaces it. Results used to vanish into the Library the moment the
   * detail modal was closed.
   */
  const [lastRun, setLastRun] = useState<GenerationRecord[]>([]);
  const [reproduceTarget, setReproduceTarget] =
    useState<GenerationRecord | null>(null);
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
  const [jobsClock, setJobsClock] = useState(0);
  const [selectMode, setSelectMode] = useState(false);
  const [selectedIds, setSelectedIds] = useState<string[]>([]);
  const [bulkDeleteOpen, setBulkDeleteOpen] = useState(false);
  const [bulkDeleting, setBulkDeleting] = useState(false);
  const [typeFilter, setTypeFilter] = useState<"all" | "image" | "video">(
    "all"
  );
  const [ownerFilter, setOwnerFilter] = useState<"all" | "mine">("all");
  /** Favourites are marked on cards; this is how you actually get to them. */
  const [favoritesOnly, setFavoritesOnly] = useState(false);
  const [detailsOpen, setDetailsOpen] = useState(false);
  /** Cinema Studio: the director chips row in the video dock. */
  const [cinemaOn, setCinemaOn] = useState(false);
  const [cinema, setCinema] = useState<CinemaControls>(CINEMA_DEFAULTS);
  const [editorOpen, setEditorOpen] = useState(false);
  const [query, setQuery] = useState("");
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
  const [refLibOpen, setRefLibOpen] = useState(false);
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
    setImageModelId(id);
    setGoogleModel(choice.imageModel);
    if (choice.tier) setTier(choice.tier);
    if (!choice.resolutions.includes(resolution as ImageResolutionOption)) {
      setResolution(choice.resolutions[choice.resolutions.length - 1]);
    }
    if (referenceUrls.length > choice.maxReferenceImages) {
      setReferenceUrls((prev) => prev.slice(0, choice.maxReferenceImages));
      toast.error(
        `${choice.label} takes ${choice.maxReferenceImages} references — extras removed`
      );
    }
  };

  /**
   * References the selected model will actually fuse. Seedream takes 8; Nano
   * Banana Pro holds consistency across 14. The dock matches the API cap so it
   * never accepts an image the request would quietly drop.
   */
  const maxRefs =
    imageModelChoice(imageModelId)?.maxReferenceImages ??
    maxReferenceImages(googleModel);

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
        target: "prompt-editor",
        title: "Prompt editor (⌘E)",
        body: "The full control surface: edit the structured prompt field by field — action, lighting, brand tokens, negatives — and have AI tighten it before you spend a render.",
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
  const [themeReady, setThemeReady] = useState(false);
  const refFileInput = useRef<HTMLInputElement>(null);
  const dragDepth = useRef(0);

  const model = useMemo(() => resolveModel(mode, tier), [mode, tier]);
  const modelOptions = useMemo(() => listModelOptions(mode), [mode]);
  const selectedModelLabel =
    modelOptions.find((m) => m.tier === tier)?.label ?? model.slug;
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
    if (next === "t2v" && tier === "draft") setTier("standard");
    if (next === "t2v") {
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
    setDetailsOpen(
      Boolean(
        seed?.action ||
          seed?.lighting ||
          seed?.brandTokens ||
          seed?.negativeAdditions
      )
    );
    setEditorOpen(false);
    setView("create");
  };

  /**
   * `showLoader` is for reloads that change which generations are in scope
   * (project / client / owner filters). Those must show the loader, otherwise
   * the previous result set stays on screen — and if it was empty the user
   * reads "No matches" until the new rows suddenly appear.
   *
   * Background refreshes after a generation finishes deliberately pass
   * nothing, so the grid updates in place without flashing a spinner.
   */
  const loadGallery = useCallback(async (opts: { showLoader?: boolean } = {}) => {
    if (opts.showLoader) setGalleryLoading(true);
    try {
      const params = new URLSearchParams();
      if (activeProjectId) params.set("projectId", activeProjectId);
      // A generation's client comes through its project, so the server has to
      // resolve it — filtering here would only ever see the rows it fetched.
      if (activeClientId) params.set("clientId", activeClientId);
      if (ownerFilter === "mine") params.set("createdBy", "me");
      const qs = params.size ? `?${params.toString()}` : "";
      const res = await fetch(`/api/generations${qs}`);
      const json = await res.json();
      if (!res.ok) throw new Error(json.error);
      setGenerations(json.generations);
      // Keep the sidebar's per-project item counts in sync with the gallery,
      // scoped to the active client so the project list stays consistent.
      try {
        const pQs = activeClientId
          ? `?clientId=${encodeURIComponent(activeClientId)}`
          : "";
        const resProjects = await fetch(`/api/projects${pQs}`);
        const jsonProjects = await resProjects.json();
        if (resProjects.ok) setProjects(jsonProjects.projects);
      } catch {
        // counts refresh is best-effort
      }
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Failed to load gallery");
      setGenerations([]);
    } finally {
      if (opts.showLoader) setGalleryLoading(false);
    }
  }, [activeProjectId, ownerFilter, activeClientId]);

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

    // Onboarding runs on every sign-in until it is explicitly completed.
    // Skipping it doesn't count, so it comes back next time. "Completed" is
    // answered by the server (users.onboarded_at) with localStorage as a fast
    // path, so a new browser or a cleared cache doesn't replay a tour this
    // person already finished.
    let cancelled = false;
    let waitForAnchors = 0;
    void shouldRunTour().then((run) => {
      if (cancelled || !run) return;
      setView("create");
      setMode("t2i");
      // Wait for the dock to exist rather than guessing a delay: a fixed
      // timeout raced the first paint on slower loads and the tour opened
      // with nothing to point at.
      let tries = 0;
      waitForAnchors = window.setInterval(() => {
        tries += 1;
        if (document.querySelector('[data-tour="prompt"]')) {
          window.clearInterval(waitForAnchors);
          if (!cancelled) setTourOpen(true);
        } else if (tries > 40) {
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
  const activeImageJobs = useMemo(
    () => activeVideoJobs.filter(isImageJob),
    [activeVideoJobs]
  );
  const activeClipJobs = useMemo(
    () => activeVideoJobs.filter((j) => !isImageJob(j)),
    [activeVideoJobs]
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
      setJobsClock(Date.now());
      for (const id of ids) {
        try {
          const res = await fetch(`/api/jobs/${id}`);
          const json = await res.json();
          if (!res.ok || !json.job) continue;
          const next = json.job as GenerationJobRecord;
          setVideoJobs((prev) =>
            prev.map((j) => (j.id === next.id ? next : j))
          );
          if (next.status === "completed") {
            const image = isImageJob(next);
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
            if (image && json.generation) {
              const g = json.generation as GenerationRecord;
              setLastRun((prev) =>
                prev.some((r) => r.id === g.id) ? prev : [...prev, g]
              );
              setDetailTarget(g);
            }
            void loadGallery();
          } else if (next.status === "failed") {
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

  useEffect(() => {
    if (!projectsReady) return;
    // loadGallery's identity changes whenever the project/client/owner scope
    // changes, so this is exactly the "show the loader" case.
    void loadGallery({ showLoader: true });
  }, [loadGallery, projectsReady]);

  const filtered = useMemo(() => {
    if (!generations) return null;
    const q = query.trim().toLowerCase();
    let list = generations;
    if (favoritesOnly) list = list.filter((g) => Boolean(g.is_favorite));
    if (typeFilter === "image") list = list.filter((g) => !isVideo(g));
    else if (typeFilter === "video") list = list.filter((g) => isVideo(g));
    if (!q) return list;
    return list.filter(
      (g) =>
        g.final_prompt.toLowerCase().includes(q) ||
        g.mode.toLowerCase().includes(q) ||
        g.model_endpoint.toLowerCase().includes(q)
    );
  }, [generations, query, typeFilter, favoritesOnly]);


  const submit = useCallback(
    async (
      prompt: PromptInputs,
      opts: {
        seed?: number;
        tier?: Tier;
        mode?: StudioMode;
        durationS?: number;
        /** Override the dock's attached images (e.g. Reproduce lineage) */
        sourceImages?: { url: string; generationId: string | null }[];
        /** Override the dock's attached source video; null = force none */
        sourceVideo?: { url: string; generationId: string | null } | null;
        /** Stay on Home/Library instead of jumping to Create */
        stayOnView?: boolean;
        /** Explicit image-model override — a Google model id or "seedream". */
        imageModel?: GoogleImageModelId | "seedream";
        /** Override the dock's resolution (model switch clamps 4K → 2K). */
        resolution?: ImageResolution;
      } = {}
    ) => {
      setGenerating(true);
      setLastRun([]);
      const activeMode = opts.mode ?? mode;
      const activeVideoSources = opts.sourceImages ?? videoSources;
      const activeVideoEditSource =
        opts.sourceVideo !== undefined ? opts.sourceVideo : videoEditSource;
      try {
        const res = await postFetch("/api/generate", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            mode: activeMode,
            tier: opts.tier ?? tier,
            imageModel:
              activeMode !== "t2i"
                ? undefined
                : opts.imageModel === "seedream"
                  ? undefined
                  : (opts.imageModel ?? googleModel ?? undefined),
            prompt:
              activeMode === "t2v" && audioSources.length > 0
                ? {
                    ...prompt,
                    audioTranscripts: audioSources.map((a) => a.transcript),
                  }
                : prompt,
            aspect,
            numOutputs: activeMode === "t2v" ? 1 : numOutputs,
            resolution:
              activeMode === "t2i" ? (opts.resolution ?? resolution) : undefined,
            durationS:
              activeMode === "t2v" ? (opts.durationS ?? durationS) : undefined,
            sourceDurationS: activeVideoEditSource?.durationS ?? undefined,
            videoResolution:
              activeMode === "t2v" ? videoResolution : undefined,
            seed: opts.seed,
            referenceUrls:
              activeMode === "t2i" && referenceUrls.length > 0
                ? referenceUrls
                : undefined,
            projectId: activeProjectId,
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
            sourceAudioUrls:
              activeMode === "t2v" && audioSources.length > 0
                ? audioSources.map((a) => a.url)
                : undefined,
          }),
        });
        const json = await readJson(res);
        if (!res.ok) throw new Error(json.error ?? "Generation failed");
        if (json.job) {
          // Video and Nano Banana run as durable jobs — track and poll
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
          toast.success(
            image
              ? "Image started — Nano Banana keeps going even if you leave"
              : "Video render started — it keeps going even if you leave"
          );
          return;
        }
        const batch =
          (json.generations as GenerationRecord[] | undefined) ??
          [json.generation as GenerationRecord];
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
        if (isBatch) {
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
          if (!scored) toast.success(`Generated ${batch.length} options`);
        } else {
          const seedLabel =
            winner.seed != null ? ` · seed ${winner.seed}` : "";
          toast.success(`Generated${seedLabel}`);
        }

        // Orchestration chain (Smart mode): finish the winner, then brand-check.
        if (smartMode && activeMode === "t2i" && winner?.output_url) {
          // Finishing pass — upscale the winner only (not the rejects).
          try {
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
            }
          } catch {
            // finishing is best-effort
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
                if (bc.compliant) {
                  toast.success("On-brand ✓");
                } else {
                  toast.warning(
                    `Off-brand: ${(bc.violations ?? []).join("; ")}`
                  );
                }
              }
            } catch {
              // brand-check is best-effort
            }
          }
          setSmartStage(null);
          await loadGallery();
        }

        if (activeMode === "t2i" && winner?.output_url) {
          setDetailTarget(winner);
        }
        if (!opts.stayOnView) {
          setView("create");
        }
      } catch (err) {
        toast.error(err instanceof Error ? err.message : "Generation failed");
      } finally {
        setGenerating(false);
      }
    },
    [
      mode,
      tier,
      googleModel,
      aspect,
      resolution,
      numOutputs,
      durationS,
      videoResolution,
      referenceUrls,
      activeProjectId,
      activeBrandKitId,
      videoSources,
      videoEditSource,
      audioSources,
      loadGallery,
      pushNotification,
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

  const attachMentionPhoto = (url: string, name: string | null): number | null => {
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
  };

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
    [mention, subject, mode, videoSources, referenceUrls, maxRefs]
  );

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

  const openDetail = (g: GenerationRecord) => {
    if (!g.output_url) {
      toast.message("No output yet");
      return;
    }
    if (isVideo(g)) {
      setDetailTarget(null);
      setVideoDetailTarget(g);
      return;
    }
    setVideoDetailTarget(null);
    setDetailTarget(g);
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

  /** How many Cinema Studio picks are set — the badge on the toggle chip. */
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
    action,
    lighting,
    brandTokens,
    negativeAdditions: negativeAdditions || undefined,
    styleId: activeClientStyle ? undefined : style,
    styleTokens: activeClientStyle?.positive,
    styleNegative: activeClientStyle?.negative || undefined,
    cameraId: mode === "t2v" ? camera : undefined,
    ...(mode === "t2v" && cinemaOn ? cinema : {}),
    // Positional, matching the badges on the thumbnails, so the server can
    // turn "@image2" into "reference image 2 (Fatima)".
    referenceLabels: mentionTargets.map((t) => t.label),
  });

  // Generate with a specific image model id — a Seedream tier
  // (draft/standard/hero) or a Google model ("nano" / "nano-pro").
  const runGenerate = (modelId: string) => {
    const choice = imageModelChoice(modelId);
    if (!choice) return;
    const nextResolution = choice.resolutions.includes(
      resolution as ImageResolutionOption
    )
      ? resolution
      : choice.resolutions[choice.resolutions.length - 1];
    applyImageModel(modelId, choice);
    submit(buildPromptInputs(), {
      tier: choice.tier ?? undefined,
      imageModel: choice.imageModel ?? "seedream",
      resolution: nextResolution,
    });
  };

  const onGenerate = async () => {
    // Client is required — everything downstream (projects, brand kits,
    // reporting) hangs off it, so nothing is generated unattributed.
    if (!activeClientId) {
      toast.error("Pick a client first — it's the chip at the top of this dock");
      setClientNudge(true);
      window.setTimeout(() => setClientNudge(false), 1600);
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
    // Ask the guide whether a different model fits this prompt better.
    const currentModelId = imageModelId;
    setCheckingModel(true);
    try {
      const rec = await fetch("/api/recommend-model", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ prompt: subject, current: currentModelId }),
      }).then((r) => r.json());
      if (rec?.differs && rec.best) {
        setModelSuggestion({
          best: rec.best,
          label: rec.label,
          reason: rec.reason,
          current: currentModelId,
        });
        setCheckingModel(false);
        return;
      }
    } catch {
      // guide is advisory — fall through and generate
    }
    setCheckingModel(false);
    runGenerate(currentModelId);
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
    const list = Array.from(files).filter(isAudioFile);
    if (!list.length) {
      toast.error("Only MP3, WAV, M4A, AAC, or OGG audio");
      return;
    }
    const remaining = MAX_AUDIO_CLIPS - audioSources.length;
    if (remaining <= 0) {
      toast.error(`Up to ${MAX_AUDIO_CLIPS} audio clips per video`);
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
            MAX_AUDIO_CLIPS
          )
        );
      }
      toast.success(
        batch.length === 1
          ? "Audio attached — the character will speak these lines"
          : `${batch.length} audio clips attached`
      );
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Audio upload failed");
    } finally {
      setUploadingAudio(false);
      if (audioFileInput.current) audioFileInput.current.value = "";
    }
  };

  // Attach a verified asset from the BytePlus portrait library
  // (asset://… refs pass moderation where raw people photos are blocked)
  const attachAsset = (rawId: string) => {
    const id = rawId.replace(/^asset:\/\//, "").trim();
    if (!id) return;
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

  const loadAssets = useCallback(async () => {
    setAssetsLoading(true);
    try {
      const res = await fetch("/api/assets");
      const json = await res.json();
      setLibraryAssets(json.assets ?? []);
    } catch {
      setLibraryAssets([]);
    } finally {
      setAssetsLoading(false);
    }
  }, []);

  // The registered-asset list loads lazily — typing @ in the video prompt
  // is the moment it becomes visible, so fetch it then.
  useEffect(() => {
    if (mention && mode === "t2v" && libraryAssets === null && !assetsLoading) {
      void loadAssets();
    }
  }, [mention, mode, libraryAssets, assetsLoading, loadAssets]);

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
      const url = await uploadReference(file);
      const assetName =
        name.trim().slice(0, 60) ||
        file.name.replace(/\.[^.]+$/, "").slice(0, 60);
      const { res, json } = await postJson<{ error?: string }>("/api/assets", {
        imageUrl: url,
        name: assetName,
        category: category === "auto" ? undefined : category,
      });
      if (!res.ok) throw new Error(json.error ?? "Could not register character");
      toast.success(
        "Photo submitted — BytePlus is verifying it. It appears in the asset list once approved (about a minute)."
      );
      // Registration finishes server-side after this response — refresh the
      // list when it has plausibly landed, and once more for slow passes.
      window.setTimeout(() => void loadAssets(), 20_000);
      window.setTimeout(() => void loadAssets(), 75_000);
      await loadAssets();
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
      void onVideoSourceFiles(e.dataTransfer.files);
    } else {
      void onReferenceFiles(e.dataTransfer.files);
    }
  };

  const promptInputsOf = (g: GenerationRecord): PromptInputs => {
    const stored = (g.input_payload as { prompt_inputs?: PromptInputs })
      .prompt_inputs;
    return stored ?? { subject: g.final_prompt };
  };

  // Re-runs a generation with its exact settings (a paid regeneration) — gated
  // behind a confirmation so a curious click doesn't spend on a new render.
  const runReproduce = (g: GenerationRecord) => {
    let sourceImages:
      | { url: string; generationId: string | null }[]
      | undefined;
    let sourceVideo:
      | { url: string; generationId: string | null }
      | null
      | undefined;
    if (isVideo(g)) {
      const payload = g.input_payload as {
        source_generation_id?: string;
        source_image_url?: string;
        source_image_urls?: string[];
        source_video_url?: string;
        source_video_generation_id?: string;
      };
      const imageUrls = payload.source_image_urls?.length
        ? payload.source_image_urls
        : payload.source_image_url
          ? [payload.source_image_url]
          : [];
      sourceImages = imageUrls.map((url, i) => ({
        url,
        generationId: i === 0 ? (payload.source_generation_id ?? null) : null,
      }));
      sourceVideo = payload.source_video_url
        ? {
            url: payload.source_video_url,
            generationId: payload.source_video_generation_id ?? null,
          }
        : null;
    }
    setReproducingId(g.id);
    toast.message("Reproducing…");
    void submit(promptInputsOf(g), {
      seed: g.seed ?? undefined,
      tier: g.tier,
      mode: (isVideo(g) ? "t2v" : "t2i") as StudioMode,
      durationS: g.duration_s ?? undefined,
      sourceImages,
      sourceVideo,
      stayOnView: true,
    }).finally(() => setReproducingId(null));
  };

  const onKeyDown = (e: React.KeyboardEvent) => {
    if ((e.metaKey || e.ctrlKey) && e.key === "Enter") {
      e.preventDefault();
      onGenerate();
    }
    if ((e.metaKey || e.ctrlKey) && e.key.toLowerCase() === "e") {
      e.preventDefault();
      setEditorOpen(true);
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
    setThemeReady(true);
  }, []);

  useEffect(() => {
    if (!connectionsOpen) return;
    let cancelled = false;
    setStatusLoading(true);
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

  useEffect(() => {
    if (view !== "create") return;
    const onGlobal = (e: KeyboardEvent) => {
      if ((e.metaKey || e.ctrlKey) && e.key.toLowerCase() === "e") {
        e.preventDefault();
        setEditorOpen((o) => !o);
      }
    };
    window.addEventListener("keydown", onGlobal);
    return () => window.removeEventListener("keydown", onGlobal);
  }, [view]);

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
      onClick={() => {
        onClick();
        setSidebarOpen(false);
      }}
      className={cn(
        "flex w-full items-center gap-3 rounded-lg py-1.5 athar-nav transition",
        active
          ? "bg-white/8 text-foreground"
          : "text-muted-foreground hover:bg-white/5 hover:text-foreground"
      )}
    >
      {icon}
      <span>{label}</span>
    </button>
  );

  /**
   * Select mode drives two batch actions with different eligibility:
   * Upscale takes stills only, bulk delete (admins) takes anything. So the
   * card selection itself is unrestricted and each action filters its own
   * targets.
   */
  const toggleSelected = (g: GenerationRecord) => {
    setSelectedIds((prev) =>
      prev.includes(g.id) ? prev.filter((x) => x !== g.id) : [...prev, g.id]
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
      const res = await fetch("/api/generations/bulk-delete", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ ids }),
      });
      const json = await res.json();
      if (!res.ok) throw new Error(json.error ?? "Bulk delete failed");

      const deleted = new Set<string>(json.ids ?? []);
      setGenerations((prev) =>
        prev ? prev.filter((row) => !deleted.has(row.id)) : prev
      );
      setSelectedIds([]);
      setBulkDeleteOpen(false);
      // Close the detail overlay if it was showing something just removed.
      setDetailTarget((cur) => (cur && deleted.has(cur.id) ? null : cur));
      toast.success(
        `Deleted ${json.deleted} generation${json.deleted === 1 ? "" : "s"}`
      );
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Bulk delete failed");
    } finally {
      setBulkDeleting(false);
    }
  };

  const renderCard = (g: GenerationRecord, i: number) => (
    <article
      key={g.id}
      className={cn(
        "animate-card-in group relative overflow-hidden rounded-2xl bg-[#161616] ring-1 ring-white/8",
        selectMode &&
          selectedIds.includes(g.id) &&
          "ring-2 ring-gold"
      )}
      style={{ animationDelay: `${Math.min(i, 8) * 40}ms` }}
    >
      <button
        type="button"
        className="block w-full text-left"
        onClick={() => (selectMode ? toggleSelected(g) : openDetail(g))}
        title={selectMode ? "Select" : "Open details"}
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

      {reproducingId === g.id && (
        <div className="absolute inset-0 z-20 flex flex-col items-center justify-center bg-black/70">
          <Loader2 className="size-6 animate-spin text-gold" />
          <p className="mt-2 text-xs text-white">Reproducing…</p>
        </div>
      )}

      {selectMode && !isVideo(g) && g.output_url && (
        <span
          className={cn(
            "pointer-events-none absolute top-2.5 left-2.5 flex size-6 items-center justify-center rounded-full ring-1 transition",
            selectedIds.includes(g.id)
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
          <span>· ${Number(g.cost).toFixed(3)}</span>
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
            onClick={() => setReproduceTarget(g)}
          >
            {reproducingId === g.id ? (
              <Loader2 className="size-3 animate-spin" />
            ) : (
              <RefreshCw className="size-3" />
            )}
            Reproduce
          </Button>
        </div>
      </div>
    </article>
  );

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
        className={cn(
          "fixed inset-y-0 left-0 z-50 flex h-full w-56 shrink-0 flex-col overflow-hidden border-r border-sidebar-border bg-sidebar px-4 pt-5 pb-5 transition-transform duration-200 ease-out",
          "md:relative md:z-10 md:translate-x-0",
          sidebarOpen ? "translate-x-0" : "-translate-x-full"
        )}
      >
        {/* Same lockup treatment as the login page: Athar, a hairline
            divider, then the "by YAZ Media" mark. */}
        <div className="flex items-center gap-2">
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
        <div className="mt-3" />

        <div data-tour="new-generation" className="relative mt-4 mb-4">
          <Button
            className="athar-label h-9 w-full justify-center gap-2 rounded-xl bg-gold text-primary-foreground hover:bg-gold/90"
            onClick={() => setGenerateMenuOpen((o) => !o)}
            aria-haspopup="menu"
            aria-expanded={generateMenuOpen}
          >
            <Plus className="size-4" />
            Generate
            <ChevronDown
              className={cn(
                "size-3.5 transition",
                generateMenuOpen && "rotate-180"
              )}
            />
          </Button>

          {generateMenuOpen && (
            <>
              <button
                type="button"
                aria-hidden
                tabIndex={-1}
                className="fixed inset-0 z-30 cursor-default"
                onClick={() => setGenerateMenuOpen(false)}
              />
              <div
                role="menu"
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
                    icon: <Wand2 className="size-4" />,
                    label: "Assistant",
                    hint: "Edit an image with a prompt",
                    run: () => openAssistant(null),
                  },
                  {
                    icon: <Shuffle className="size-4" />,
                    label: "Variations",
                    hint: "Riff on a still",
                    run: () => {
                      const latestStill = generations?.find(
                        (g) => !isVideo(g) && g.output_url
                      );
                      if (latestStill) openVary(latestStill);
                      else toast.message("Generate a still first");
                    },
                  },
                ].map((opt) => (
                  <button
                    key={opt.label}
                    type="button"
                    role="menuitem"
                    onClick={() => {
                      setGenerateMenuOpen(false);
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

        <div className="min-h-0 flex-1 overflow-y-auto">
        <nav className="space-y-0.5">
          {navBtn(
            view === "home",
            () => setView("home"),
            <Home className="size-4" />,
            "Home"
          )}
          {navBtn(
            view === "library",
            () => setView("library"),
            <Library className="size-4" />,
            "Library",
            "library"
          )}
          {navBtn(
            view === "assets",
            () => setView("assets"),
            <Boxes className="size-4" />,
            "Assets",
            "assets"
          )}
          {navBtn(
            view === "orchestrate",
            () => setView("orchestrate"),
            <Workflow className="size-4" />,
            "Campaign",
            "campaign"
          )}
          {navBtn(
            view === "storyboard",
            () => setView("storyboard"),
            <Film className="size-4" />,
            "Storyboard",
            "storyboard"
          )}
          {navBtn(
            view === "transcribe",
            () => setView("transcribe"),
            <AudioLines className="size-4" />,
            "Transcribe",
            "transcribe"
          )}
          {isManagement &&
            navBtn(
              view === "usage",
              () => setView("usage"),
              <BarChart3 className="size-4" />,
              "Usage",
              "usage"
            )}
        </nav>

        <div className="my-4 h-px bg-sidebar-border" />

        {/* Client / project / brand kit now live in the generate dock, next
            to the other things you set before pressing Generate. */}

        <p className="mb-1 text-[10px] font-medium tracking-[0.16em] text-muted-foreground uppercase">
          Tools
        </p>
        <nav className="space-y-0.5">
          {navBtn(
            view === "create" && mode === "t2i",
            () => openTool("t2i"),
            <ImageIcon className="size-4" />,
            "Image Generator"
          )}
          {navBtn(
            view === "create" && mode === "t2v",
            () => openTool("t2v"),
            <Clapperboard className="size-4" />,
            "Video Generator"
          )}
          {navBtn(
            view === "edit",
            () => openAssistant(null),
            <Wand2 className="size-4" />,
            "Assistant"
          )}
          {navBtn(
            view === "vary",
            () => {
              const latestStill = generations?.find(
                (g) => !isVideo(g) && g.output_url
              );
              if (latestStill) openVary(latestStill);
              else toast.message("Generate a still first");
            },
            <Shuffle className="size-4" />,
            "Variations"
          )}
        </nav>
        </div>

        <div className="relative mt-3 shrink-0 border-t border-sidebar-border pt-3">
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

          <div className="flex items-center gap-1 px-1">
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
              onClick={() => setConnectionsOpen((o) => !o)}
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
          <SidebarUser onManageTeam={() => setView("team")} />
        </div>
      </aside>

      {/* Main */}
      <main className="relative z-10 flex min-w-0 flex-1 flex-col">
        <button
          type="button"
          aria-label="Open menu"
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
              void (async () => {
                if (!n.generationId) {
                  toast.error(
                    "This notification has no library item — it may be from the other database."
                  );
                  return;
                }
                let g = (generations ?? []).find(
                  (r) => r.id === n.generationId
                );
                if (!g) {
                  try {
                    const res = await fetch(
                      `/api/generations/${n.generationId}`
                    );
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
                if (isVideo(g)) setVideoDetailTarget(g);
                else setDetailTarget(g);
              })();
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
            onEdit={openEdit}
            onVary={openVary}
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
            onClose={() => setVideoDetailTarget(null)}
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
          <div className="flex-1 overflow-y-auto px-6 py-8 sm:px-10">
            <div className="mx-auto max-w-4xl text-center">
              {session?.user && (
                <p className="mb-2 text-sm text-muted-foreground">
                  {(() => {
                    const h = new Date().getHours();
                    return h < 12
                      ? "Good morning"
                      : h < 18
                        ? "Good afternoon"
                        : "Good evening";
                  })()}
                  ,{" "}
                  <span className="font-medium text-foreground">
                    {firstName}
                  </span>{" "}
                  — what are we making?
                </p>
              )}
              <h1 className="athar-display">
                Generate
          </h1>

              <div className="mx-auto mt-6 flex max-w-xl items-center gap-2 rounded-full bg-card px-4 py-3 ring-1 ring-border shadow-sm">
                <Search className="size-4 shrink-0 text-muted-foreground" />
                <input
                  value={query}
                  onChange={(e) => setQuery(e.target.value)}
                  placeholder="Search"
                  className="w-full bg-transparent text-sm text-foreground outline-none placeholder:text-muted-foreground"
                />
                <kbd className="hidden rounded-md bg-muted px-1.5 py-0.5 font-mono text-[10px] text-muted-foreground sm:inline">
                  ⌘K
                </kbd>
              </div>

              <div className="mx-auto mt-6 flex max-w-lg flex-wrap justify-center gap-3">
                {[
                  {
                    label: "Image",
                    icon: ImageIcon,
                    onClick: () => openTool("t2i"),
                  },
                  {
                    label: "Video",
                    icon: Clapperboard,
                    onClick: () => openTool("t2v"),
                  },
                  {
                    label: "Assistant",
                    icon: Wand2,
                    onClick: () => openAssistant(null),
                  },
                  {
                    label: "Transcribe",
                    icon: AudioLines,
                    onClick: () => setView("transcribe"),
                  },
                  {
                    label: "Variations",
                    icon: Shuffle,
                    onClick: () => {
                      const latestStill = generations?.find(
                        (g) => !isVideo(g) && g.output_url
                      );
                      if (latestStill) openVary(latestStill);
                      else
                        toast.message(
                          "Generate a still first"
                        );
                    },
                  },
                ].map((t) => (
                  <button
                    key={t.label}
                    type="button"
                    onClick={t.onClick}
                    className="group flex w-[4.75rem] flex-col items-center gap-2"
                  >
                    <span
                      className={cn(
                        "flex size-14 items-center justify-center rounded-2xl bg-secondary text-foreground ring-1 ring-border transition group-hover:scale-[1.03]",
                      )}
                    >
                      <t.icon className="size-5" />
          </span>
                    <span className="text-xs text-muted-foreground group-hover:text-foreground">
                      {t.label}
                    </span>
                  </button>
                ))}
        </div>
            </div>

            <div className="mx-auto mt-12 max-w-6xl">
              <div className="mb-4 flex items-center justify-between">
                <div className="flex items-center gap-2.5">
                  <h2 className="text-sm font-medium text-foreground">
                    Recent generations
                  </h2>
                  {activeProject && (
                    <button
                      type="button"
                      onClick={() => setActiveProjectId(null)}
                      title="Showing this project only — click to show all"
                      className="inline-flex items-center gap-1.5 rounded-full bg-gold-soft px-2.5 py-0.5 text-[11px] text-foreground ring-1 ring-gold/25 transition hover:opacity-80"
                    >
                      <FolderKanban className="size-3" />
                      {activeProject.name}
                      {filtered && (
                        <span className="text-muted-foreground">
                          · {filtered.length}
                        </span>
                      )}
                      <X className="size-3 opacity-60" />
                    </button>
                  )}
                </div>
                <div className="flex items-center gap-2">
                  <div className="flex items-center gap-0.5 rounded-full bg-card p-0.5 ring-1 ring-border">
                    {(
                      [
                        { v: "all", label: "All" },
                        { v: "image", label: "Images" },
                        { v: "video", label: "Videos" },
                      ] as const
                    ).map((t) => (
                      <button
                        key={t.v}
                        type="button"
                        onClick={() => setTypeFilter(t.v)}
                        className={cn(
                          "rounded-full px-2.5 py-1 text-[11px] transition",
                          typeFilter === t.v
                            ? "bg-gold text-primary-foreground"
                            : "text-muted-foreground hover:text-foreground"
                        )}
                      >
                        {t.label}
                      </button>
                    ))}
                  </div>
                  <button
                    type="button"
                    onClick={() => setView("library")}
                    className="text-xs text-muted-foreground hover:text-foreground"
                  >
                  View library →
                </button>
                </div>
              </div>

              {filtered === null || galleryLoading ? (
                galleryLoader
              ) : filtered.length === 0 ? (
                <div className="rounded-2xl bg-[#121212] px-6 py-16 text-center ring-1 ring-white/6">
                  <Sparkles className="mx-auto mb-3 size-6 text-gold" />
                  <p className="athar-headline">
                    {activeProject
                      ? `Nothing in ${activeProject.name} yet`
                      : "Nothing here yet"}
                  </p>
                  <p className="mt-1 text-sm text-muted-foreground">
                    {activeProject
                      ? "New work you generate is tagged to this project. Switch to All projects to see everything."
                      : "Generate an image or video."}
                  </p>
                  {activeProject && (
                    <button
                      type="button"
                      onClick={() => setActiveProjectId(null)}
                      className="mt-3 text-xs text-muted-foreground underline-offset-2 hover:text-foreground hover:underline"
                    >
                      Show all projects
                    </button>
                  )}
                  <div>
                    <Button
                      className="mt-5 rounded-full bg-gold text-primary-foreground"
                      onClick={() => openTool("t2i")}
                    >
                      <Plus className="size-4" />
                      Generate
                    </Button>
                  </div>
                </div>
              ) : (
                <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 xl:grid-cols-3">
                  {filtered.slice(0, 6).map((g, i) => renderCard(g, i))}
                </div>
              )}
            </div>
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
              <UsagePanel />
            </div>
          </>
        )}

        {(view === "create" || view === "library") && (
          <>
            <header className="flex items-center justify-between px-6 py-5 pl-16 sm:px-8 md:pl-6 lg:pl-8">
              <div>
                <h1 className="athar-headline">
                  {view === "library"
                    ? "Library"
                    : mode === "t2i"
                      ? "Image Generator"
                      : "Video Generator"}
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
                        : "Text → Video"}
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
                  {videoJobs.length > 0 && (
                    <div className="mx-auto mb-6 w-full max-w-2xl space-y-2.5">
                      <p className="px-1 text-[11px] font-medium tracking-[0.16em] text-muted-foreground uppercase">
                        {videoJobs.some(isImageJob) &&
                        videoJobs.some((j) => !isImageJob(j))
                          ? "Renders"
                          : videoJobs.some(isImageJob)
                            ? "Image renders"
                            : "Video renders"}
                      </p>
                      {videoJobs.map((job) => {
                        const active =
                          job.status === "running" || job.status === "queued";
                        const referenceTs = job.completed_at
                          ? new Date(job.completed_at).getTime()
                          : jobsClock || new Date(job.updated_at).getTime();
                        const elapsedS = Math.max(
                          0,
                          Math.round(
                            (referenceTs - new Date(job.created_at).getTime()) /
                              1000
                          )
                        );
                        return (
                          <div
                            key={job.id}
                            className="flex items-center gap-3 rounded-xl bg-card px-4 py-3 ring-1 ring-border"
                          >
                            {active ? (
                              <Loader2 className="size-4 shrink-0 animate-spin text-gold" />
                            ) : job.status === "completed" ? (
                              isImageJob(job) ? (
                                <ImageIcon className="size-4 shrink-0 text-gold" />
                              ) : (
                                <Clapperboard className="size-4 shrink-0 text-gold" />
                              )
                            ) : (
                              <X className="size-4 shrink-0 text-muted-foreground" />
                            )}
                            <div className="min-w-0 flex-1">
                              <p className="truncate text-sm">
                                {job.final_prompt}
                              </p>
                              <p className="mt-0.5 text-xs text-muted-foreground">
                                {active
                                  ? `${stageLabel(
                                      isImageJob(job)
                                        ? "image"
                                        : job.kind === "v2v"
                                          ? "edit"
                                          : "video",
                                      elapsedS
                                    )} ${elapsedS}s`
                                  : job.status === "completed"
                                    ? "Done — saved to Library"
                                    : (job.error ?? "Failed")}
                                {" · "}
                                {isImageJob(job)
                                  ? (job.input as { imageModel?: string })
                                      .imageModel === "nano-banana-pro"
                                    ? "Nano Banana Pro"
                                    : "Nano Banana"
                                  : job.duration_s != null
                                    ? `${Number(job.duration_s)}s clip`
                                    : job.tier}
                              </p>
                              {active && (
                                <ProgressBar
                                  value={easedProgress(
                                    isImageJob(job)
                                      ? "image"
                                      : job.kind === "v2v"
                                        ? "edit"
                                        : "video",
                                    elapsedS
                                  )}
                                  className="mt-1.5"
                                />
                              )}
                            </div>
                            {job.status === "failed" && (
                              <Button
                                size="sm"
                                variant="outline"
                                className="h-7 shrink-0 text-xs"
                                onClick={() => void retryJob(job)}
                              >
                                Retry
                              </Button>
                            )}
                            {job.status === "completed" &&
                              job.generation_id && (
                                <Button
                                  size="sm"
                                  variant="outline"
                                  className="h-7 shrink-0 text-xs"
                                  onClick={() => {
                                    const g = generations?.find(
                                      (r) => r.id === job.generation_id
                                    );
                                    if (g) {
                                      if (isImageJob(job)) {
                                        setDetailTarget(g);
                                      } else {
                                        setVideoDetailTarget(g);
                                      }
                                    } else {
                                      setView("library");
                                    }
                                  }}
                                >
                                  View
                                </Button>
                              )}
                            {!active && (
                              <button
                                type="button"
                                aria-label="Dismiss"
                                onClick={() => dismissJob(job)}
                                className="shrink-0 rounded-md p-1 text-muted-foreground transition hover:bg-sidebar-accent hover:text-foreground"
                              >
                                <X className="size-3.5" />
                              </button>
                            )}
                          </div>
                        );
                      })}
                    </div>
                  )}
                  {generating ? (
                    <div
                      className={cn(
                        "mx-auto grid w-full gap-4 pt-2",
                        mode === "t2i" && numOutputs > 1
                          ? "max-w-4xl grid-cols-1 sm:grid-cols-2"
                          : "max-w-2xl grid-cols-1"
                      )}
                    >
                      {Array.from({
                        length: mode === "t2i" ? numOutputs : 1,
                      }).map((_, i) => (
                        <GenerationPlaceholderCard
                          key={i}
                          kind={
                            mode === "t2i"
                              ? "image"
                              : videoEditSource
                                ? "edit"
                                : "video"
                          }
                          aspect={aspect}
                        />
                      ))}
                    </div>
                  ) : mode === "t2i" && activeImageJobs.length > 0 ? (
                    <div
                      className={cn(
                        "mx-auto grid w-full gap-4 pt-2",
                        activeImageJobs.length > 1
                          ? "max-w-4xl grid-cols-1 sm:grid-cols-2"
                          : "max-w-2xl grid-cols-1"
                      )}
                    >
                      {activeImageJobs.map((job) => (
                        <GenerationPlaceholderCard
                          key={job.id}
                          kind="image"
                          aspect={job.aspect || "16:9"}
                          startedAtMs={new Date(job.created_at).getTime()}
                        />
                      ))}
                    </div>
                  ) : mode === "t2v" && activeClipJobs.length > 0 ? (
                    <div className="mx-auto grid w-full max-w-2xl grid-cols-1 gap-4 pt-2">
                      {activeClipJobs.map((job) => (
                        <GenerationPlaceholderCard
                          key={job.id}
                          kind={job.kind === "v2v" ? "edit" : "video"}
                          aspect={job.aspect || "16:9"}
                          startedAtMs={new Date(job.created_at).getTime()}
                        />
                      ))}
                    </div>
                  ) : lastRun.length > 0 ? (
                    /* This run stays put. It is the thing you just paid for —
                       rating it, refining it or downloading it should not
                       start with a search. */
                    <div className="mx-auto w-full max-w-4xl pt-1">
                      <div className="mb-3 flex items-center gap-2 px-1">
                        <p className="text-[11px] font-medium tracking-[0.16em] text-muted-foreground uppercase">
                          This run
                        </p>
                        <span className="text-[11px] text-muted-foreground">
                          {lastRun.length}{" "}
                          {lastRun.length === 1 ? "result" : "results"} · also
                          saved to the Library
                        </span>
                        <div className="flex-1" />
                        <button
                          type="button"
                          onClick={() => setLastRun([])}
                          className="text-[11px] text-muted-foreground transition hover:text-foreground"
                        >
                          Clear
                        </button>
                      </div>
                      <div
                        className={cn(
                          "grid gap-4",
                          lastRun.length > 1
                            ? "grid-cols-1 sm:grid-cols-2"
                            : "grid-cols-1"
                        )}
                      >
                        {lastRun.map((g, i) => renderCard(g, i))}
                      </div>
                    </div>
                  ) : (
                    <div className="flex h-[min(52vh,420px)] flex-col items-center justify-center text-center">
                      <div className="mb-4 flex size-14 items-center justify-center rounded-2xl bg-gold-soft ring-1 ring-gold/25">
                        {mode === "t2v" ? (
                          <Clapperboard className="size-6 text-gold" />
                        ) : (
                          <ImageIcon className="size-6 text-gold" />
                        )}
                      </div>
                      <p className="athar-headline">
                        {mode === "t2v" ? "Describe a shot" : "Describe an image"}
                      </p>
                      <p className="mt-2 max-w-md text-sm text-muted-foreground">
                        Paste a prompt in the dock. Your results stay here and
                        in the Library.
                      </p>
                    </div>
                  )}
                </>
              ) : (
                <>
                  <div className="mb-5 flex items-center gap-2">
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
                    <Select
                      value={ownerFilter}
                      onValueChange={(v) =>
                        setOwnerFilter(v as typeof ownerFilter)
                      }
                    >
                      <SelectTrigger className="h-10 w-auto min-w-[7rem] shrink-0 rounded-full border-border bg-card px-4 text-xs">
                        <SelectValue />
                      </SelectTrigger>
                      <SelectContent>
                        <SelectItem value="all">Everyone</SelectItem>
                        <SelectItem value="mine">Mine only</SelectItem>
                      </SelectContent>
                    </Select>
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
                      </SelectContent>
                    </Select>
                    {/* The dock's client/project chips only exist in Create,
                        so Library carries its own scope control. */}
                    <Select
                      value={activeClientId ?? "all"}
                      onValueChange={(v) =>
                        onActiveClientChange(v === "all" ? null : v)
                      }
                    >
                      <SelectTrigger
                        aria-label="Filter by client"
                        className="h-10 w-auto min-w-[7rem] shrink-0 rounded-full border-border bg-card px-4 text-xs"
                      >
                        <SelectValue />
                      </SelectTrigger>
                      <SelectContent>
                        <SelectItem value="all">All clients</SelectItem>
                        {clients.map((c) => (
                          <SelectItem key={c.id} value={c.id}>
                            {c.name}
                          </SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                    <Select
                      value={activeProjectId ?? "all"}
                      onValueChange={(v) =>
                        setActiveProjectId(v === "all" ? null : v)
                      }
                    >
                      <SelectTrigger
                        aria-label="Filter by project"
                        className="h-10 w-auto min-w-[7rem] shrink-0 rounded-full border-border bg-card px-4 text-xs"
                      >
                        <SelectValue />
                      </SelectTrigger>
                      <SelectContent>
                        <SelectItem value="all">All projects</SelectItem>
                        {projects.map((p) => (
                          <SelectItem key={p.id} value={p.id}>
                            {p.name}
                          </SelectItem>
                        ))}
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

                  {filtered === null || galleryLoading ? (
                    galleryLoader
                  ) : filtered.length === 0 ? (
                    <div className="flex h-[min(48vh,380px)] flex-col items-center justify-center text-center">
                      <Sparkles className="mb-3 size-6 text-gold" />
                      {/* An empty *source* list is a different story from a
                          search/type filter that matched nothing. */}
                      {(generations?.length ?? 0) === 0 ? (
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
                          {(activeClientId || ownerFilter === "mine") && (
                            <button
                              type="button"
                              onClick={() => {
                                onActiveClientChange(null);
                                setActiveProjectId(null);
                                setOwnerFilter("all");
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
                    <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 xl:grid-cols-3">
                      {filtered.map((g, i) => renderCard(g, i))}
                    </div>
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
          open={assetToDelete != null}
          onOpenChange={(open) => {
            if (!open) setAssetToDelete(null);
          }}
          title="Delete this character?"
          description={
            assetToDelete &&
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

        {/* Reproduce confirmation — global, fires from cards on any view */}
        <Dialog
          open={reproduceTarget != null}
          onOpenChange={(o) => {
            if (!o) setReproduceTarget(null);
          }}
        >
          <DialogContent className="sm:max-w-md">
            <DialogHeader>
              <DialogTitle>Reproduce this generation?</DialogTitle>
            </DialogHeader>
            <p className="text-sm text-muted-foreground">
              This runs a{" "}
              <span className="text-foreground">new paid render</span> with the
              exact same settings and seed. It doesn&apos;t edit the original —
              it creates another one.
            </p>
            <div className="mt-4 flex justify-end gap-2">
              <Button variant="outline" onClick={() => setReproduceTarget(null)}>
                Cancel
              </Button>
              <Button
                className="bg-gold text-primary-foreground hover:bg-gold/90"
                onClick={() => {
                  const g = reproduceTarget;
                  setReproduceTarget(null);
                  if (g) runReproduce(g);
                }}
              >
                <RefreshCw className="size-4" />
                Reproduce
              </Button>
            </div>
          </DialogContent>
        </Dialog>

        {/* Model guide — suggests a better-fit model for the prompt */}
        <Dialog
          open={modelSuggestion != null}
          onOpenChange={(o) => {
            if (!o) setModelSuggestion(null);
          }}
        >
          <DialogContent className="sm:max-w-md">
            <DialogHeader>
              <DialogTitle className="flex items-center gap-2">
                <Sparkles className="size-4 text-gold" />
                Better with {modelSuggestion?.label}?
              </DialogTitle>
            </DialogHeader>
            <p className="text-sm text-muted-foreground">
              For this prompt,{" "}
              <span className="text-foreground">{modelSuggestion?.label}</span>{" "}
              is a stronger fit — {modelSuggestion?.reason}
            </p>
            <div className="mt-4 flex justify-end gap-2">
              <Button
                variant="outline"
                onClick={() => {
                  const s = modelSuggestion;
                  setModelSuggestion(null);
                  if (s) runGenerate(s.current);
                }}
              >
                Keep current
              </Button>
              <Button
                className="gap-1.5 bg-gold text-primary-foreground hover:bg-gold/90"
                onClick={() => {
                  const s = modelSuggestion;
                  setModelSuggestion(null);
                  if (s) runGenerate(s.best);
                }}
              >
                <Sparkles className="size-4" />
                Use {modelSuggestion?.label}
              </Button>
            </div>
          </DialogContent>
        </Dialog>

        {/* Floating prompt dock — create views only */}
        {showDock && (
          <>
          <div className="pointer-events-none absolute inset-x-0 bottom-0 z-20 flex justify-center px-4 pb-4 sm:pb-6">
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
                        ? "Drop image(s) for the video"
                        : "Drop reference image"}
                    </p>
                    <p className="text-[11px] text-muted-foreground">
                      {mode === "t2v"
                        ? `JPEG, PNG, or WebP · up to ${MAX_VIDEO_IMAGES} · 1 = first frame, 2+ = references`
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
                  accept="audio/*,.mp3,.wav,.m4a,.aac,.ogg"
                  multiple
                  className="hidden"
                  onChange={(e) => void onAudioFiles(e.target.files)}
                />
              )}

              {mode === "t2v" && videoEditSource && (
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

              {mode === "t2v" && videoSources.length > 0 && (
                <div className="mb-2 flex items-center gap-2.5 rounded-xl border border-gold/25 bg-gold-soft/60 px-2.5 py-2">
                  <div className="flex max-w-[60%] flex-wrap items-center gap-1.5">
                    {videoSources.map((s, i) => (
                      <div key={`${s.url}-${i}`} className="relative">
                        {s.url.startsWith("asset://") ? (
                          <span
                            title={s.url}
                            className="flex size-11 items-center justify-center rounded-lg bg-white/5 ring-1 ring-gold/30"
                          >
                            <ShieldCheck className="size-4 text-gold" />
                          </span>
                        ) : (
                          // eslint-disable-next-line @next/next/no-img-element
                          <img
                            src={s.url}
                            alt={`Attached image ${i + 1}`}
                            className="size-11 rounded-lg object-cover ring-1 ring-white/10"
                          />
                        )}
                        <span className="pointer-events-none absolute top-0.5 left-0.5 rounded bg-black/70 px-1 font-mono text-[9px] leading-4 text-white">
                          {i + 1}
                        </span>
                        <button
                          type="button"
                          aria-label={`Remove image ${i + 1}`}
                          onClick={() =>
                            setVideoSources((prev) =>
                              prev.filter((_, idx) => idx !== i)
                            )
                          }
                          className="absolute -top-1.5 -right-1.5 flex size-4 items-center justify-center rounded-full bg-foreground text-background shadow transition hover:scale-110"
                        >
                          <X className="size-2.5" />
                        </button>
                      </div>
                    ))}
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
                        : "Seedance blends these subjects into the clip"}
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

              {mode === "t2v" && audioSources.length > 0 && (
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

              {mode === "t2i" && referenceUrls.length > 0 && (
                <div className="mb-2 flex flex-wrap items-center gap-2 px-1">
                  {referenceUrls.map((url, refIndex) => (
                    <div
                      key={url}
                      title={referenceNames[url] ?? `Image ${refIndex + 1}`}
                      className="group relative size-12 overflow-hidden rounded-lg border border-white/10 bg-black/40"
                    >
                      {/* eslint-disable-next-line @next/next/no-img-element */}
                      <img
                        src={url}
                        alt="Reference"
                        className="size-full object-cover"
                      />
                      {/* The number is the whole point of the badge: it is what
                          you type after @ to tag this image in the prompt. */}
                      <span className="pointer-events-none absolute top-0.5 left-0.5 rounded bg-black/70 px-1 font-mono text-[9px] leading-4 text-white">
                        {refIndex + 1}
                      </span>
                      <div className="absolute inset-0 flex items-center justify-center gap-1 bg-black/60 opacity-0 transition group-hover:opacity-100">
                        <button
                          type="button"
                          aria-label="Save to library"
                          title="Save to library"
                          onClick={() => openSaveReference(url)}
                          className="flex size-6 items-center justify-center rounded-md bg-white/15 text-white transition hover:bg-white/30"
                        >
                          <Boxes className="size-3.5" />
                        </button>
                        <button
                          type="button"
                          aria-label="Remove reference"
                          title="Remove"
                          onClick={() =>
                            setReferenceUrls((prev) =>
                              prev.filter((u) => u !== url)
                            )
                          }
                          className="flex size-6 items-center justify-center rounded-md bg-white/15 text-white transition hover:bg-white/30"
                        >
                          <X className="size-3.5" />
                        </button>
                      </div>
                    </div>
                  ))}
                </div>
              )}

            {/* Cinema Studio — the director chips row (Higgsfield-style).
                Wraps instead of scrolling so the upward popovers aren't
                clipped by an overflow container. */}
            {!generating && mode === "t2v" && cinemaOn && (
              <div className="mb-1.5 flex flex-wrap items-center gap-1.5 px-1">
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
                    camera !== "raw" || cinema.shotId !== "raw"
                      ? [
                          presetLabel(CAMERA_PRESETS, camera),
                          presetLabel(SHOT_PRESETS, cinema.shotId),
                        ]
                          .filter((v) => v !== "Auto")
                          .join(" · ")
                      : "Auto"
                  }
                  active={camera !== "raw" || cinema.shotId !== "raw"}
                >
                  <PresetList
                    title="Movement"
                    presets={CAMERA_PRESETS}
                    value={camera}
                    onChange={setCamera}
                  />
                  <PresetList
                    title="Framing"
                    presets={SHOT_PRESETS}
                    value={cinema.shotId}
                    onChange={(shotId) => setCinema((c) => ({ ...c, shotId }))}
                  />
                </ChipPopover>

                <ChipPopover
                  label="Color palette"
                  value={presetLabel(GRADE_PRESETS, cinema.gradeId)}
                  active={cinema.gradeId !== "raw"}
                  width="w-72"
                >
                  <PresetList
                    presets={GRADE_PRESETS}
                    value={cinema.gradeId}
                    onChange={(gradeId) => setCinema((c) => ({ ...c, gradeId }))}
                  />
                </ChipPopover>

                <ChipPopover
                  label="Lighting"
                  value={presetLabel(LIGHT_LOOK_PRESETS, cinema.lightLookId)}
                  active={cinema.lightLookId !== "raw"}
                  width="w-72"
                >
                  <PresetList
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

            {generating ? (
              <div className="flex items-center gap-3 px-1 py-3">
                <Loader2 className="size-4 shrink-0 animate-spin text-gold" />
                <div className="min-w-0 flex-1">
                  <p className="truncate text-sm text-foreground">
                    {subject ||
                      (mode === "t2v" ? "Starting render…" : "Generating…")}
                  </p>
                  <p className="text-[11px] text-muted-foreground">
                    {smartStage
                      ? smartStage
                      : mode === "t2v"
                        ? "Starting render — it keeps going even if you leave"
                        : `Generating ${numOutputs} image${
                            numOutputs > 1 ? "s" : ""
                          }… preview appears above`}
                  </p>
                </div>
              </div>
            ) : (
              <div className="relative">
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
                      : "Describe the shot — subject, action, camera, mood…"
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
                  "field-sizing-fixed relative block h-40 max-h-40 min-h-40 resize-none overflow-y-auto border-0 bg-transparent text-white shadow-none caret-white [-webkit-text-fill-color:transparent] focus-visible:ring-0",
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
                    onMouseDown={(e) => {
                      // mousedown, not click: blur would close the menu first.
                      e.preventDefault();
                      insertMention(t);
                    }}
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

              {!generating && (
              <div className="mt-1 flex items-center justify-between gap-2 px-1">
                <button
                  type="button"
                  onClick={() => setDetailsOpen((o) => !o)}
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
                <button
                  type="button"
                  onClick={() => setEditorOpen(true)}
                  data-tour="prompt-editor"
                  className="inline-flex items-center gap-1.5 rounded-full border border-white/10 bg-white/5 px-2.5 py-1 text-[11px] text-muted-foreground transition hover:border-gold/30 hover:text-foreground"
                  title="Prompt editor (⌘E)"
                >
                  <SquarePen className="size-3" />
                  Prompt editor
                  <kbd className="ml-0.5 hidden font-mono text-[9px] opacity-60 sm:inline">
                    ⌘E
                  </kbd>
                </button>
          </div>
              )}

              {!generating && detailsOpen && (
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
                      disabled={uploadingRef || referenceUrls.length >= 4}
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

                  {mode === "t2v" && (
                    <button
                      type="button"
                      disabled={
                        uploadingVideoSource ||
                        videoSources.length >= MAX_VIDEO_IMAGES
                      }
                      onClick={() => videoFileInput.current?.click()}
                      aria-label="Attach images"
                      className={cn(
                        "inline-flex h-8 items-center gap-1.5 rounded-full border border-white/10 bg-white/5 px-3 text-xs text-muted-foreground transition hover:text-foreground disabled:opacity-50",
                        videoSources.length > 0 &&
                          "border-gold/30 text-foreground"
                      )}
                    >
                      {uploadingVideoSource ? (
                        <Loader2 className="size-3.5 animate-spin" />
                      ) : (
                        <Paperclip className="size-3.5" />
                      )}
                      {videoSources.length === 0
                        ? "Attach"
                        : videoSources.length === 1
                          ? "First frame"
                          : `${videoSources.length} images`}
                    </button>
                  )}

                  {mode === "t2v" && (
                    <button
                      type="button"
                      disabled={
                        uploadingAudio ||
                        audioSources.length >= MAX_AUDIO_CLIPS
                      }
                      onClick={() => audioFileInput.current?.click()}
                      aria-label="Attach lip-sync audio"
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

                  <button
                    type="button"
                    onClick={() => setRefLibOpen(true)}
                    aria-label="Pick from reference library"
                    className="inline-flex h-8 items-center gap-1.5 rounded-full border border-white/10 bg-white/5 px-3 text-xs text-muted-foreground transition hover:text-foreground"
                  >
                    <Boxes className="size-3.5" />
                    Library
                  </button>

                  {mode === "t2v" && (
                    <button
                      type="button"
                      onClick={() =>
                        setAssetIdOpen((o) => {
                          if (!o && libraryAssets === null) void loadAssets();
                          return !o;
                        })
                      }
                      aria-label="Attach verified asset"
                      className={cn(
                        "inline-flex h-8 items-center gap-1.5 rounded-full border border-white/10 bg-white/5 px-3 text-xs text-muted-foreground transition hover:text-foreground",
                        assetIdOpen && "border-gold/30 text-foreground"
                      )}
                    >
                      <ShieldCheck className="size-3.5" />
                      Asset ID
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
                        onValueChange={(v) => setTier(v as Tier)}
                      >
                        <SelectTrigger className="h-8 w-auto min-w-[9.5rem] rounded-full border-white/10 bg-white/5 px-3 text-xs">
                          <SelectValue>{selectedModelLabel}</SelectValue>
                        </SelectTrigger>
                        <SelectContent>
                          {modelOptions.map((m) => (
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
                  title="Smart: pick the best of the batch, upscale the winner, and brand-check it — automatically."
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

              {mode === "t2v" && (
                <button
                  type="button"
                  onClick={() => setCinemaOn((o) => !o)}
                  aria-pressed={cinemaOn}
                  title="Cinema Studio — direct genre, camera, colour, light, emotion and pacing"
                  className={cn(
                    "inline-flex h-8 items-center gap-1.5 rounded-full border px-3 text-xs transition",
                    cinemaOn
                      ? "border-gold bg-gold/15 text-foreground"
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

              {/* The plain camera pick lives inside the Cinema chips when the
                  studio is on — two controls writing one value reads as a bug. */}
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

              <span data-tour="output" className="inline-flex">
              <Select
                value={aspect}
                onValueChange={(v) => setAspect(v as AspectRatio)}
              >
                  <SelectTrigger className="h-8 w-auto min-w-[5rem] rounded-full border-white/10 bg-white/5 px-3 text-xs">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {ASPECTS.map((a) => (
                    <SelectItem key={a} value={a}>
                      {a}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>

                {mode === "t2i" && (
                  <Select
                    value={resolution}
                    onValueChange={(v) => setResolution(v as ImageResolution)}
                  >
                    <SelectTrigger className="h-8 w-auto min-w-[4rem] rounded-full border-white/10 bg-white/5 px-3 text-xs">
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      {RESOLUTIONS.filter(
                        (r) =>
                          r.value !== "4K" ||
                          googleModel === "nano-banana-pro"
                      ).map((r) => (
                        <SelectItem key={r.value} value={r.value}>
                          {r.label}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                )}

                {mode === "t2v" && videoEditSource ? (
                  <span
                    title="Seedance keeps the source clip's length when you edit a video"
                    className="inline-flex h-8 items-center rounded-full border border-white/10 bg-white/5 px-3 text-xs text-muted-foreground"
                  >
                    {videoEditSource.durationS
                      ? `${Math.round(Number(videoEditSource.durationS))}s source`
                      : "Same as source"}
                  </span>
                ) : mode === "t2v" ? (
                    <Select
                      value={String(durationS)}
                      onValueChange={(v) => setDurationS(Number(v))}
                    >
                      <SelectTrigger className="h-8 w-auto min-w-[4.5rem] rounded-full border-white/10 bg-white/5 px-3 text-xs">
                        <SelectValue />
                      </SelectTrigger>
                      <SelectContent>
                        {VIDEO_DURATIONS.filter(
                          (d) => d <= (model.maxDuration || 30)
                        ).map((d) => (
                          <SelectItem key={d} value={String(d)}>
                            {d}s
                          </SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                  ) : null}

                {mode === "t2v" ? (
                    <Select
                      value={videoResolution}
                      onValueChange={(v) =>
                        setVideoResolution(v as typeof videoResolution)
                      }
                    >
                      <SelectTrigger className="h-8 w-auto min-w-[5.5rem] rounded-full border-white/10 bg-white/5 px-3 text-xs">
                        <SelectValue />
                      </SelectTrigger>
                      <SelectContent>
                        <SelectItem value="480p">480p · fast</SelectItem>
                        <SelectItem value="720p">720p</SelectItem>
                        {/* Seedance 2.5 only — the draft tier's 2.0 Mini has
                            no 1080p path, so it is clamped server-side. */}
                        <SelectItem value="1080p" disabled={tier === "draft"}>
                          1080p{tier === "draft" ? " · needs Standard+" : ""}
                        </SelectItem>
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
            disabled={generating || checkingModel}
            title={
              !activeClientId
                ? "Pick a client first — generations are always attributed to one"
                : undefined
            }
            className={cn(
              "h-10 rounded-full px-6 font-medium text-primary-foreground",
              (generating || checkingModel) && "animate-gen-pulse",
              !activeClientId && "opacity-50"
            )}
          >
                  {checkingModel ? (
                    <>
                      <Loader2 className="size-4 animate-spin" />
                      Picking the best model…
                    </>
                  ) : generating ? (
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
                    <Select
                      value={saveRefClientId ?? "none"}
                      onValueChange={(v) => {
                        setSaveRefClientId(v === "none" ? null : v);
                        setSaveRefProjectId(null);
                      }}
                    >
                      <SelectTrigger className="h-9">
                        <SelectValue />
                      </SelectTrigger>
                      <SelectContent>
                        <SelectItem value="none">Shared (no client)</SelectItem>
                        {clients.map((c) => (
                          <SelectItem key={c.id} value={c.id}>
                            {c.name}
                          </SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                  </div>
                  <div className="space-y-1">
                    <span className="text-[10px] tracking-[0.14em] text-muted-foreground uppercase">
                      Project
                    </span>
                    <Select
                      value={saveRefProjectId ?? "none"}
                      onValueChange={(v) =>
                        setSaveRefProjectId(v === "none" ? null : v)
                      }
                    >
                      <SelectTrigger className="h-9">
                        <SelectValue />
                      </SelectTrigger>
                      <SelectContent>
                        <SelectItem value="none">Client-wide</SelectItem>
                        {projects
                          .filter(
                            (p) =>
                              !saveRefClientId ||
                              p.client_id === saveRefClientId
                          )
                          .map((p) => (
                            <SelectItem key={p.id} value={p.id}>
                              {p.name}
                            </SelectItem>
                          ))}
                      </SelectContent>
                    </Select>
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

          <PromptEditor
            open={editorOpen}
            onOpenChange={setEditorOpen}
            mode={mode}
            value={{
              subject,
              action,
              lighting,
              brandTokens,
              negativeAdditions: negativeAdditions || undefined,
            }}
            onApply={(next) => {
              setSubject(next.subject);
              setAction(next.action ?? "");
              setLighting(next.lighting ?? "");
              setBrandTokens(next.brandTokens ?? "");
              setNegativeAdditions(next.negativeAdditions ?? "");
              setDetailsOpen(
                Boolean(
                  next.action ||
                    next.lighting ||
                    next.brandTokens ||
                    next.negativeAdditions
                )
              );
              toast.success("Prompt applied");
            }}
          />
          </>
        )}
      </main>
    </div>
  );
}
