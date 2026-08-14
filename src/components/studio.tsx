"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { toast } from "sonner";
import {
  ArrowUpToLine,
  BarChart3,
  Check,
  CheckSquare,
  ChevronDown,
  Clapperboard,
  Home,
  ImageIcon,
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
  Wand2,
  X,
} from "lucide-react";
import { useTheme } from "next-themes";
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
import { cn } from "@/lib/utils";
import { ImageChat } from "@/components/image-chat";
import { ImageDetail } from "@/components/image-detail";
import { PromptEditor } from "@/components/prompt-editor";
import { SidebarUser } from "@/components/sidebar-user";
import { UpscaleDialog } from "@/components/upscale-dialog";
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
  listModelOptions,
  resolveModel,
  type Capability,
  type Tier,
} from "@/config/models";
import type {
  AspectRatio,
  BrandKitRecord,
  GenerationJobRecord,
  GenerationRecord,
  ImageResolution,
  ProjectRecord,
  PromptInputs,
} from "@/lib/types";
import {
  ACTIVE_PROJECT_STORAGE_KEY,
  ProjectPicker,
} from "@/components/project-picker";
import {
  ACTIVE_BRAND_KIT_STORAGE_KEY,
  BrandKitPicker,
} from "@/components/brand-kit-picker";
import { AtharLogo, ATHAR_LOCKUP_MIN_HEIGHT } from "@/components/athar-logo";
import {
  NotificationsBell,
  type AppNotification,
} from "@/components/notifications-bell";

const ASPECTS: AspectRatio[] = ["16:9", "9:16", "1:1", "4:5", "21:9"];
const RESOLUTIONS: { value: ImageResolution; label: string }[] = [
  { value: "1K", label: "1K" },
  { value: "2K", label: "2K" },
];
const VIDEO_DURATIONS = [5, 8, 10, 15, 20, 30];
// Seedance 2.0 series accepts up to 9 reference images (2.5 allows more)
const MAX_VIDEO_IMAGES = 9;
const NOTIFICATIONS_STORAGE_KEY = "yaz-motion-notifications";

type StudioMode = Extract<Capability, "t2i" | "t2v">;
type View = "home" | "create" | "library" | "edit" | "vary" | "usage";

function isVideo(g: GenerationRecord) {
  return (
    g.mode === "t2v" ||
    g.mode === "i2v" ||
    g.mode === "v2v" ||
    Boolean(g.output_url?.includes(".mp4"))
  );
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
  const [aspect, setAspect] = useState<AspectRatio>("16:9");
  const [resolution, setResolution] = useState<ImageResolution>("2K");
  const [numOutputs, setNumOutputs] = useState(1);
  const [durationS, setDurationS] = useState(5);
  const [videoResolution, setVideoResolution] = useState<"480p" | "720p">(
    "720p"
  );
  const [generating, setGenerating] = useState(false);
  const [reproducingId, setReproducingId] = useState<string | null>(null);
  const [generations, setGenerations] = useState<GenerationRecord[] | null>(
    null
  );
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
  } | null>(null);
  const [uploadingVideoSource, setUploadingVideoSource] = useState(false);
  const [assetIdOpen, setAssetIdOpen] = useState(false);
  const [assetIdDraft, setAssetIdDraft] = useState("");
  const [libraryAssets, setLibraryAssets] = useState<
    { id: string; name: string; status: string; url: string | null }[] | null
  >(null);
  const [assetsLoading, setAssetsLoading] = useState(false);
  const videoFileInput = useRef<HTMLInputElement>(null);
  const [upscaleTargets, setUpscaleTargets] = useState<
    GenerationRecord[] | null
  >(null);
  const [jobsClock, setJobsClock] = useState(0);
  const [selectMode, setSelectMode] = useState(false);
  const [selectedIds, setSelectedIds] = useState<string[]>([]);
  const [qcFilter, setQcFilter] = useState<
    "all" | "pass" | "revise" | "reject" | "client_ready" | "unreviewed"
  >("all");
  const [ownerFilter, setOwnerFilter] = useState<"all" | "mine">("all");
  const [detailsOpen, setDetailsOpen] = useState(false);
  const [editorOpen, setEditorOpen] = useState(false);
  const [query, setQuery] = useState("");
  const [referenceUrls, setReferenceUrls] = useState<string[]>([]);
  const [uploadingRef, setUploadingRef] = useState(false);
  const [dragOver, setDragOver] = useState(false);
  const [editTarget, setEditTarget] = useState<GenerationRecord | null>(null);
  const [varyTarget, setVaryTarget] = useState<GenerationRecord | null>(null);
  const [detailTarget, setDetailTarget] = useState<GenerationRecord | null>(
    null
  );
  const [connectionsOpen, setConnectionsOpen] = useState(false);
  const [connectionStatus, setConnectionStatus] = useState<{
    modelArk: boolean;
    spaces: boolean;
    database: "ok" | "error" | "missing";
  } | null>(null);
  const [statusLoading, setStatusLoading] = useState(false);
  const { resolvedTheme, setTheme } = useTheme();
  const [themeReady, setThemeReady] = useState(false);
  const refFileInput = useRef<HTMLInputElement>(null);
  const dragDepth = useRef(0);

  const model = useMemo(() => resolveModel(mode, tier), [mode, tier]);
  const modelOptions = useMemo(() => listModelOptions(mode), [mode]);
  const selectedModelLabel =
    modelOptions.find((m) => m.tier === tier)?.label ?? model.slug;

  const openTool = (
    next: StudioMode,
    seed?: Partial<PromptInputs> | null
  ) => {
    setMode(next);
    if (next === "t2v" && tier === "draft") setTier("standard");
    if (next === "t2v") setNumOutputs(1);
    setSubject(seed?.subject ?? "");
    setAction(seed?.action ?? "");
    setLighting(seed?.lighting ?? "");
    setBrandTokens(seed?.brandTokens ?? "");
    setNegativeAdditions(seed?.negativeAdditions ?? "");
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

  const loadGallery = useCallback(async () => {
    try {
      const params = new URLSearchParams();
      if (activeProjectId) params.set("projectId", activeProjectId);
      if (ownerFilter === "mine") params.set("createdBy", "me");
      const qs = params.size ? `?${params.toString()}` : "";
      const res = await fetch(`/api/generations${qs}`);
      const json = await res.json();
      if (!res.ok) throw new Error(json.error);
      setGenerations(json.generations);
      // Keep the sidebar's per-project item counts in sync with the gallery
      try {
        const resProjects = await fetch("/api/projects");
        const jsonProjects = await resProjects.json();
        if (resProjects.ok) setProjects(jsonProjects.projects);
      } catch {
        // counts refresh is best-effort
      }
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Failed to load gallery");
      setGenerations([]);
    }
  }, [activeProjectId, ownerFilter]);

  useEffect(() => {
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
  }, []);

  useEffect(() => {
    if (!projectsReady) return;
    localStorage.setItem(
      NOTIFICATIONS_STORAGE_KEY,
      JSON.stringify(notifications)
    );
  }, [notifications, projectsReady]);

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
            toast.success("Video ready");
            pushNotification({
              kind: "video",
              status: "success",
              title: "Video ready",
              body: next.final_prompt,
              generationId: next.generation_id,
            });
            void loadGallery();
          } else if (next.status === "failed") {
            toast.error(`Video render failed: ${next.error ?? "unknown error"}`);
            pushNotification({
              kind: "video",
              status: "error",
              title: "Video render failed",
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
    void loadGallery();
  }, [loadGallery, projectsReady]);

  const filtered = useMemo(() => {
    if (!generations) return null;
    const q = query.trim().toLowerCase();
    let list = generations;
    if (qcFilter === "client_ready") {
      list = list.filter((g) => g.client_ready);
    } else if (qcFilter === "unreviewed") {
      list = list.filter((g) => !g.qc_status);
    } else if (qcFilter !== "all") {
      list = list.filter((g) => g.qc_status === qcFilter);
    }
    if (!q) return list;
    return list.filter(
      (g) =>
        g.final_prompt.toLowerCase().includes(q) ||
        g.mode.toLowerCase().includes(q) ||
        g.model_endpoint.toLowerCase().includes(q)
    );
  }, [generations, query, qcFilter]);

  const onQcChange = (next: GenerationRecord) => {
    setGenerations((prev) =>
      prev ? prev.map((r) => (r.id === next.id ? next : r)) : prev
    );
    setDetailTarget((prev) => (prev?.id === next.id ? next : prev));
    setVideoDetailTarget((prev) => (prev?.id === next.id ? next : prev));
  };

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
      } = {}
    ) => {
      setGenerating(true);
      const activeMode = opts.mode ?? mode;
      const activeVideoSources = opts.sourceImages ?? videoSources;
      const activeVideoEditSource =
        opts.sourceVideo !== undefined ? opts.sourceVideo : videoEditSource;
      try {
        const res = await fetch("/api/generate", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            mode: activeMode,
            tier: opts.tier ?? tier,
            prompt,
            aspect,
            numOutputs: activeMode === "t2v" ? 1 : numOutputs,
            resolution: activeMode === "t2i" ? resolution : undefined,
            durationS:
              activeMode === "t2v" ? (opts.durationS ?? durationS) : undefined,
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
          }),
        });
        const json = await res.json();
        if (!res.ok) throw new Error(json.error ?? "Generation failed");
        if (json.job) {
          // Video renders run as durable jobs — track and poll instead
          const job = json.job as GenerationJobRecord;
          setVideoJobs((prev) => [job, ...prev.filter((j) => j.id !== job.id)]);
          toast.success(
            "Video render started — it keeps going even if you leave"
          );
          return;
        }
        const seedLabel =
          json.generation.seed != null ? ` · seed ${json.generation.seed}` : "";
        toast.success(`Generated${seedLabel}`);
        pushNotification({
          kind: "image",
          status: "success",
          title: "Image generated",
          body: (json.generation as GenerationRecord).final_prompt,
          generationId: (json.generation as GenerationRecord).id,
          thumbnailUrl: (json.generation as GenerationRecord).output_url,
        });
        await loadGallery();
        const next = json.generation as GenerationRecord;
        if (activeMode === "t2i" && next?.output_url) {
          setDetailTarget(next);
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
    const resProjects = await fetch("/api/projects");
    const jsonProjects = await resProjects.json();
    if (resProjects.ok) setProjects(jsonProjects.projects);
    const project = projects.find((p) => p.id === projectId);
    toast.success(
      projectId && project
        ? `Moved to “${project.name}”`
        : "Removed from project"
    );
  };

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
    tier: Tier;
    aspect: AspectRatio;
    resolution: ImageResolution;
    referenceUrls?: string[];
  }): Promise<GenerationRecord | null> => {
    setGenerating(true);
    try {
      const res = await fetch("/api/generate", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          mode: "t2i",
          tier: args.tier,
          prompt: args.prompt,
          aspect: args.aspect,
          numOutputs: 1,
          resolution: args.resolution,
          referenceUrls: args.referenceUrls,
        }),
      });
      const json = await res.json();
      if (!res.ok) throw new Error(json.error ?? "Create failed");
      toast.success("Generated");
      await loadGallery();
      const next = json.generation as GenerationRecord;
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
    tier: Tier;
    aspect: AspectRatio;
    resolution: ImageResolution;
    prompt: PromptInputs;
    seed?: number;
  }): Promise<GenerationRecord[]> => {
    if (!args.source.output_url) throw new Error("Source image missing");
    setGenerating(true);
    try {
      const res = await fetch("/api/generate", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          mode: "t2i",
          tier: args.tier,
          prompt: args.prompt,
          aspect: args.aspect,
          numOutputs: args.count,
          resolution: args.resolution,
          referenceUrls: [args.source.output_url],
          seed: args.seed,
          projectId: activeProjectId,
        }),
      });
      const json = await res.json();
      if (!res.ok) throw new Error(json.error ?? "Variations failed");
      await loadGallery();
      const list = (json.generations ?? [json.generation]).filter(
        Boolean
      ) as GenerationRecord[];
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
    tier: Tier;
    aspect: AspectRatio;
    resolution: ImageResolution;
  }): Promise<GenerationRecord | null> => {
    setGenerating(true);
    try {
      const referenceUrls = [
        args.referenceUrl,
        ...(args.extraReferenceUrls ?? []),
      ].filter(Boolean);
      const res = await fetch("/api/generate", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          mode: "t2i",
          tier: args.tier,
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
      const json = await res.json();
      if (!res.ok) throw new Error(json.error ?? "Edit failed");
      toast.success("Image updated");
      await loadGallery();
      const next = json.generation as GenerationRecord;
      setEditTarget(next);
      return next;
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Edit failed");
      return null;
    } finally {
      setGenerating(false);
    }
  };

  const onGenerate = () => {
    if (!subject.trim()) {
      toast.error("Add a subject");
      return;
    }
    submit({
      subject,
      action,
      lighting,
      brandTokens,
      negativeAdditions: negativeAdditions || undefined,
    });
  };

  const uploadReference = async (file: File) => {
    const form = new FormData();
    form.append("file", file);
    const res = await fetch("/api/upload", { method: "POST", body: form });
    const json = await res.json();
    if (!res.ok) throw new Error(json.error ?? "Upload failed");
    return json.url as string;
  };

  const onReferenceFiles = async (files: FileList | File[] | null) => {
    if (!files) return;
    const allowed = new Set(["image/jpeg", "image/jpg", "image/png", "image/webp"]);
    const list = Array.from(files).filter((f) => allowed.has(f.type));
    if (!list.length) {
      toast.error("Only JPEG, PNG, or WebP images");
      return;
    }
    const remaining = 4 - referenceUrls.length;
    if (remaining <= 0) {
      toast.error("Up to 4 reference images");
      return;
    }
    const batch = list.slice(0, remaining);
    setUploadingRef(true);
    try {
      const urls = await Promise.all(batch.map((f) => uploadReference(f)));
      setReferenceUrls((prev) => [...prev, ...urls].slice(0, 4));
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
    toast.success("Verified asset attached");
  };

  const addAssetSource = () => {
    if (!assetIdDraft.trim()) return;
    attachAsset(assetIdDraft);
    setAssetIdDraft("");
    setAssetIdOpen(false);
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
    label: string
  ) => (
    <button
      type="button"
      onClick={onClick}
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

  const toggleSelected = (g: GenerationRecord) => {
    if (isVideo(g) || !g.output_url) {
      toast.message("Upscale stills only");
      return;
    }
    setSelectedIds((prev) =>
      prev.includes(g.id) ? prev.filter((x) => x !== g.id) : [...prev, g.id]
    );
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
            <video
              src={g.output_url}
              className="aspect-video w-full object-cover"
              playsInline
              muted
              loop
              preload="metadata"
            />
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

      {reproducingId === g.id && (
        <div className="absolute inset-0 z-20 flex flex-col items-center justify-center bg-black/70">
          <Loader2 className="size-6 animate-spin text-gold" />
          <p className="mt-2 text-xs text-white">Reproducing…</p>
        </div>
      )}

      {(g.qc_status || g.client_ready) && (
        <span
          className={cn(
            "pointer-events-none absolute top-2.5 right-2.5 rounded-full px-2 py-0.5 text-[10px] font-medium ring-1",
            g.client_ready
              ? "bg-foreground text-background ring-foreground"
              : "bg-background/90 text-foreground ring-border"
          )}
        >
          {g.client_ready
            ? "Client ready"
            : g.qc_status === "pass"
              ? "Pass"
              : g.qc_status === "revise"
                ? "Revise"
                : "Rejected"}
        </span>
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
            onClick={() => {
              // Videos: replay the exact lineage (first frame / references /
              // source video) instead of whatever is attached in the dock.
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
                  generationId:
                    i === 0 ? (payload.source_generation_id ?? null) : null,
                }));
                sourceVideo = payload.source_video_url
                  ? {
                      url: payload.source_video_url,
                      generationId:
                        payload.source_video_generation_id ?? null,
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
            }}
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

  return (
    <div className="relative flex h-dvh overflow-hidden bg-background text-foreground">
      {/* Magnific-style sidebar */}
      <aside className="relative z-10 flex h-full w-56 shrink-0 flex-col overflow-hidden border-r border-sidebar-border bg-sidebar px-4 pt-5 pb-5">
        <AtharLogo height={ATHAR_LOCKUP_MIN_HEIGHT} priority />
        <p className="mt-3 text-[10px] tracking-[0.14em] text-muted-foreground uppercase">
          Internal studio
        </p>

        <Button
          className="athar-label mt-4 mb-4 h-9 w-full justify-center gap-2 rounded-xl bg-gold text-primary-foreground hover:bg-gold/90"
          onClick={() => openTool("t2i")}
        >
          <Plus className="size-4" />
          Generate
        </Button>

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
            "Library"
          )}
          {navBtn(
            view === "usage",
            () => setView("usage"),
            <BarChart3 className="size-4" />,
            "Usage"
          )}
        </nav>

        <div className="my-4 h-px bg-sidebar-border" />

        <ProjectPicker
          activeProjectId={activeProjectId}
          onActiveProjectChange={setActiveProjectId}
          projects={projects}
          onProjectsChange={setProjects}
          className="mb-3"
        />

        <BrandKitPicker
          activeBrandKitId={activeBrandKitId}
          onActiveBrandKitChange={setActiveBrandKitId}
          brandKits={brandKits}
          onBrandKitsChange={setBrandKits}
          className="mb-4"
        />

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
          <SidebarUser />
        </div>
      </aside>

      {/* Main */}
      <main className="relative z-10 flex min-w-0 flex-1 flex-col">
        <div className="absolute top-5 right-6 z-40 sm:right-8">
          <NotificationsBell
            notifications={notifications}
            onMarkAllRead={() =>
              setNotifications((prev) =>
                prev.map((n) => (n.read ? n : { ...n, read: true }))
              )
            }
            onClearAll={() => setNotifications([])}
            onItemClick={(n) => {
              if (!n.generationId) return;
              const g = (generations ?? []).find(
                (r) => r.id === n.generationId
              );
              if (!g) {
                setView("library");
                return;
              }
              if (isVideo(g)) setVideoDetailTarget(g);
              else setDetailTarget(g);
            }}
          />
        </div>

        {detailTarget && (
          <ImageDetail
            generation={detailTarget}
            onClose={() => setDetailTarget(null)}
            onEdit={openEdit}
            onVary={openVary}
            onUpscale={(g) => setUpscaleTargets([g])}
            onQcChange={onQcChange}
            onRemoveBackground={async (g) => {
              try {
                const res = await fetch("/api/background/remove", {
                  method: "POST",
                  headers: { "Content-Type": "application/json" },
                  body: JSON.stringify({ generationId: g.id }),
                });
                const json = await res.json();
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
            onDelete={async (g) => {
              const res = await fetch(`/api/generations/${g.id}`, {
                method: "DELETE",
              });
              const json = await res.json();
              if (!res.ok) throw new Error(json.error ?? "Delete failed");
              setGenerations((prev) =>
                prev ? prev.filter((row) => row.id !== g.id) : prev
              );
              setDetailTarget(null);
            }}
            projects={projects}
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
              setUpscaleTargets(null);
              setSelectedIds([]);
              setSelectMode(false);
              await loadGallery();
              if (results.length === 1) setDetailTarget(results[0]);
            }}
          />
        )}

        {videoDetailTarget && (
          <VideoDetail
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
            onQcChange={onQcChange}
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
            onDelete={async (g) => {
              const res = await fetch(`/api/generations/${g.id}`, {
                method: "DELETE",
              });
              const json = await res.json();
              if (!res.ok) throw new Error(json.error ?? "Delete failed");
              setGenerations((prev) =>
                prev ? prev.filter((row) => row.id !== g.id) : prev
              );
              setVideoDetailTarget(null);
            }}
            projects={projects}
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
                <h2 className="text-sm font-medium text-foreground">
                  Recent generations
                </h2>
                <button
                  type="button"
                  onClick={() => setView("library")}
                  className="text-xs text-muted-foreground hover:text-foreground"
                >
                  View library →
                </button>
              </div>

              {filtered === null ? (
                galleryLoader
              ) : filtered.length === 0 ? (
                <div className="rounded-2xl bg-[#121212] px-6 py-16 text-center ring-1 ring-white/6">
                  <Sparkles className="mx-auto mb-3 size-6 text-gold" />
                  <p className="athar-headline">Nothing here yet</p>
                  <p className="mt-1 text-sm text-muted-foreground">
                    Generate an image or video.
                  </p>
                  <Button
                    className="mt-5 rounded-full bg-gold text-primary-foreground"
                    onClick={() => openTool("t2i")}
                  >
                    <Plus className="size-4" />
                    Generate
                  </Button>
                </div>
              ) : (
                <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 xl:grid-cols-3">
                  {filtered.slice(0, 6).map((g, i) => renderCard(g, i))}
                </div>
              )}
            </div>
          </div>
        )}

        {view === "usage" && (
          <>
            <header className="flex items-center justify-between px-6 py-5 sm:px-8">
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
            <header className="flex items-center justify-between px-6 py-5 sm:px-8">
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
                showDock ? "pb-52" : "pb-8"
              )}
            >
              {view === "create" ? (
                <>
                  {videoJobs.length > 0 && (
                    <div className="mx-auto mb-6 w-full max-w-2xl space-y-2.5">
                      <p className="px-1 text-[11px] font-medium tracking-[0.16em] text-muted-foreground uppercase">
                        Video renders
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
                              <Clapperboard className="size-4 shrink-0 text-gold" />
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
                                      job.kind === "v2v" ? "edit" : "video",
                                      elapsedS
                                    )} ${elapsedS}s`
                                  : job.status === "completed"
                                    ? "Done — saved to Library"
                                    : (job.error ?? "Failed")}
                                {" · "}
                                {job.duration_s != null
                                  ? `${Number(job.duration_s)}s clip`
                                  : job.tier}
                              </p>
                              {active && (
                                <ProgressBar
                                  value={easedProgress(
                                    job.kind === "v2v" ? "edit" : "video",
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
                                      setVideoDetailTarget(g);
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
                  ) : mode === "t2v" && activeVideoJobs.length > 0 ? (
                    <div className="mx-auto grid w-full max-w-2xl grid-cols-1 gap-4 pt-2">
                      {activeVideoJobs.map((job) => (
                        <GenerationPlaceholderCard
                          key={job.id}
                          kind={job.kind === "v2v" ? "edit" : "video"}
                          aspect={job.aspect || "16:9"}
                          startedAtMs={new Date(job.created_at).getTime()}
                        />
                      ))}
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
                        Paste a prompt in the dock. Results stay in Library.
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
                      value={qcFilter}
                      onValueChange={(v) => setQcFilter(v as typeof qcFilter)}
                    >
                      <SelectTrigger className="h-10 w-auto min-w-[8.5rem] shrink-0 rounded-full border-border bg-card px-4 text-xs">
                        <SelectValue />
                      </SelectTrigger>
                      <SelectContent>
                        <SelectItem value="all">All statuses</SelectItem>
                        <SelectItem value="pass">QC pass</SelectItem>
                        <SelectItem value="revise">Needs revision</SelectItem>
                        <SelectItem value="reject">Rejected</SelectItem>
                        <SelectItem value="unreviewed">Unreviewed</SelectItem>
                        <SelectItem value="client_ready">Client ready</SelectItem>
                      </SelectContent>
                    </Select>
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

                  {filtered === null ? (
                    galleryLoader
                  ) : filtered.length === 0 ? (
                    <div className="flex h-[min(48vh,380px)] flex-col items-center justify-center text-center">
                      <Sparkles className="mb-3 size-6 text-gold" />
                      <p className="athar-headline">
                        No matches
                      </p>
                      <p className="mt-1 max-w-sm text-sm text-muted-foreground">
                        Try another search.
                      </p>
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
                onClick={() => {
                  const targets = (generations ?? []).filter((g) =>
                    selectedIds.includes(g.id)
                  );
                  if (targets.length > 0) setUpscaleTargets(targets);
                }}
              >
                <ArrowUpToLine className="size-3.5" />
                Upscale {selectedIds.length}
              </Button>
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

        {/* Floating prompt dock — create views only */}
        {showDock && (
          <>
          <div className="pointer-events-none absolute inset-x-0 bottom-0 z-20 flex justify-center px-4 pb-4 sm:pb-6">
            <div
              className={cn(
                "animate-dock-in dock-glass pointer-events-auto relative w-full max-w-[56rem] rounded-2xl p-3 sm:p-4",
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
                        : "JPEG, PNG, or WebP · up to 4"}
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

              {mode === "t2v" && assetIdOpen && (
                <div className="mb-2 rounded-xl border border-white/10 bg-black/25 p-2.5">
                  <div className="mb-2 flex items-center justify-between px-0.5">
                    <p className="flex items-center gap-1.5 text-xs font-medium text-foreground">
                      <ShieldCheck className="size-3.5 text-gold" />
                      Asset library (verified faces &amp; characters)
                    </p>
                    <button
                      type="button"
                      onClick={() => void loadAssets()}
                      className="text-[11px] text-muted-foreground transition hover:text-foreground"
                    >
                      Refresh
                    </button>
                  </div>

                  {assetsLoading ? (
                    <div className="flex items-center gap-2 px-1 py-3 text-xs text-muted-foreground">
                      <Loader2 className="size-3.5 animate-spin" />
                      Loading assets…
                    </div>
                  ) : libraryAssets && libraryAssets.length > 0 ? (
                    <div className="mb-2 grid max-h-44 grid-cols-1 gap-1 overflow-y-auto">
                      {libraryAssets.map((a) => {
                        const active = a.status === "Active";
                        return (
                          <button
                            key={a.id}
                            type="button"
                            disabled={!active}
                            onClick={() => attachAsset(a.id)}
                            className={cn(
                              "flex items-center gap-2.5 rounded-lg px-2 py-1.5 text-left transition",
                              active
                                ? "hover:bg-white/8"
                                : "cursor-not-allowed opacity-50"
                            )}
                          >
                            {a.url ? (
                              // eslint-disable-next-line @next/next/no-img-element
                              <img
                                src={a.url}
                                alt=""
                                className="size-9 shrink-0 rounded-md object-cover ring-1 ring-white/10"
                              />
                            ) : (
                              <span className="flex size-9 shrink-0 items-center justify-center rounded-md bg-white/5 ring-1 ring-white/10">
                                <ShieldCheck className="size-3.5 text-gold" />
                              </span>
                            )}
                            <span className="min-w-0 flex-1">
                              <span className="block truncate text-xs text-foreground">
                                {a.name || a.id}
                              </span>
                              <span
                                className={cn(
                                  "text-[10px]",
                                  active
                                    ? "text-gold"
                                    : a.status === "Failed"
                                      ? "text-muted-foreground"
                                      : "text-muted-foreground"
                                )}
                              >
                                {active ? "Active — click to attach" : a.status}
                              </span>
                            </span>
                          </button>
                        );
                      })}
                    </div>
                  ) : libraryAssets ? (
                    <p className="mb-2 px-1 py-1 text-[11px] text-muted-foreground">
                      No assets yet — open an image in the Library and use
                      &ldquo;Add to asset library&rdquo;, or paste an asset ID
                      below.
                    </p>
                  ) : null}

                  <div className="flex items-center gap-2">
                    <Input
                      value={assetIdDraft}
                      onChange={(e) => setAssetIdDraft(e.target.value)}
                      onKeyDown={(e) => {
                        if (e.key === "Enter") {
                          e.preventDefault();
                          addAssetSource();
                        }
                        if (e.key === "Escape") setAssetIdOpen(false);
                      }}
                      placeholder="or paste an asset ID (asset-2026…)"
                      className="h-8 flex-1 border-white/8 bg-transparent text-xs"
                    />
                    <Button
                      size="sm"
                      className="h-8 rounded-full bg-gold px-3 text-xs text-primary-foreground"
                      onClick={addAssetSource}
                    >
                      Add
                    </Button>
                  </div>
                </div>
              )}

              {mode === "t2v" && videoEditSource && (
                <div className="mb-2 flex items-center gap-2.5 rounded-xl border border-gold/25 bg-gold-soft/60 px-2.5 py-2">
                  <video
                    src={videoEditSource.url}
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
                        ? "Continue @video1"
                        : videoEditSource.intent === "vary"
                          ? "Same scene, new take"
                          : "Change @video1"}
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

              {mode === "t2i" && referenceUrls.length > 0 && (
                <div className="mb-2 flex flex-wrap items-center gap-2 px-1">
                  {referenceUrls.map((url) => (
                    <div
                      key={url}
                      className="group relative size-12 overflow-hidden rounded-lg border border-white/10 bg-black/40"
                    >
                      {/* eslint-disable-next-line @next/next/no-img-element */}
                      <img
                        src={url}
                        alt="Reference"
                        className="size-full object-cover"
                      />
                      <button
                        type="button"
                        aria-label="Remove reference"
                        onClick={() =>
                          setReferenceUrls((prev) =>
                            prev.filter((u) => u !== url)
                          )
                        }
                        className="absolute inset-0 flex items-center justify-center bg-black/55 opacity-0 transition group-hover:opacity-100"
                      >
                        <X className="size-4 text-white" />
                      </button>
                    </div>
                  ))}
                </div>
              )}

            <Textarea
                placeholder={
                  mode === "t2v"
                    ? videoEditSource
                      ? videoEditSource.intent === "extend"
                        ? "Continue @video1"
                        : videoEditSource.intent === "vary"
                          ? "Vary @video1"
                          : "Change @video1"
                      : "Describe the shot"
                    : referenceUrls.length > 0
                      ? "Describe the change"
                      : "Describe the subject"
                }
              value={subject}
              onChange={(e) => setSubject(e.target.value)}
                onKeyDown={onKeyDown}
                rows={6}
                className="field-sizing-fixed h-40 max-h-40 min-h-40 resize-none overflow-y-auto border-0 bg-transparent px-1 py-1 text-[15px] shadow-none focus-visible:ring-0"
              />

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

              {detailsOpen && (
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

              <div className="mt-3 flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
                <div className="flex flex-wrap items-center gap-2">
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
                      {RESOLUTIONS.map((r) => (
                        <SelectItem key={r.value} value={r.value}>
                          {r.label}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                )}

                {mode === "t2v" ? (
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
                        setVideoResolution(v as "480p" | "720p")
                      }
                    >
                      <SelectTrigger className="h-8 w-auto min-w-[5.5rem] rounded-full border-white/10 bg-white/5 px-3 text-xs">
                        <SelectValue />
                      </SelectTrigger>
                      <SelectContent>
                        <SelectItem value="480p">480p · fast</SelectItem>
                        <SelectItem value="720p">720p</SelectItem>
                      </SelectContent>
                    </Select>
                  ) : (
            <Select
              value={String(numOutputs)}
              onValueChange={(v) => setNumOutputs(Number(v))}
            >
                      <SelectTrigger className="h-8 w-auto min-w-[4.5rem] rounded-full border-white/10 bg-white/5 px-3 text-xs">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                {[1, 2, 3, 4].map((n) => (
                  <SelectItem key={n} value={String(n)}>
                            {n}×
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
                  )}
          </div>

          <Button
            size="lg"
            onClick={onGenerate}
            disabled={generating}
                  className={cn(
                    "h-10 rounded-full px-6 font-medium text-primary-foreground",
                    generating && "animate-gen-pulse"
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
            </div>
            </div>

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
