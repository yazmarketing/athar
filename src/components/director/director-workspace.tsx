"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { useSession } from "next-auth/react";
import {
  ArrowDownToLine, ArrowLeft, ArrowRight, ArrowUp, AudioLines, Check,
  CheckCircle2, Clapperboard, Copy, Download, FileVideo,
  Film, FolderOpen, Globe2, History, Layers3, Loader2,
  LockKeyhole, MessageSquare, MoreHorizontal, Music2,
  Plus, RotateCcw, Settings2, ShieldCheck, Sparkles, Trash2,
  TriangleAlert, UnlockKeyhole, Upload, WandSparkles, X,
} from "lucide-react";
import { toast } from "sonner";
import {
  DIRECTOR_DEFAULTS, DIRECTOR_FORMATS, directorDuration, directorTime,
  type DirectorAsset, type DirectorCapabilities, type DirectorFormat,
  type DirectorKind, type DirectorProject, type DirectorScene,
  type DirectorSettings, type DirectorStyle,
} from "@/lib/director-types";
import { cn } from "@/lib/utils";
import styles from "./director-workspace.module.css";
import { DirectorLibrary } from "./director-library";

type Props = { clientId?: string | null; projectId?: string | null; brandKitId?: string | null };
type Panel = "direction" | "assets" | "scene" | "settings";

const RECIPES: { kind: DirectorKind; title: string; description: string; brief: string; icon: typeof Film }[] = [
  { kind: "social", title: "Social film", description: "A story worth stopping for.", brief: "Create a polished 30-second social film from my assets. Open with the strongest visual, develop a clear story, and finish with a memorable closing frame. Keep the edit contemporary and the typography restrained.", icon: Clapperboard },
  { kind: "event", title: "Event recap", description: "Find the moments that matter.", brief: "Create a 45-second event recap using the footage I provide. Prioritize the opening, key moments, and genuine audience interaction. Preserve the meaning of any speech. Use accurate titles and a confident, considered pace.", icon: FileVideo },
  { kind: "motion", title: "Motion story", description: "Bring words and ideas to life.", brief: "Create a 20-second motion graphic introducing Athar, YAZ Media's creative production studio. Use these exact headlines: An idea. A new perspective. Something worth creating. End with Athar — Made with intention. Use bold typography, generous negative space, and precise rhythmic transitions.", icon: Layers3 },
];

async function request<T>(url: string, init?: RequestInit): Promise<T> {
  const res = await fetch(url, { ...init, headers: { ...(init?.body instanceof FormData ? {} : { "Content-Type": "application/json" }), ...init?.headers } });
  let data: Record<string, unknown>;
  try { data = await res.json(); } catch { throw new Error("The studio could not complete that request. Please try again."); }
  if (!res.ok) throw new Error(typeof data.error === "string" ? data.error : "Something went wrong. Please try again.");
  return data as T;
}

function freshScene(index: number): DirectorScene {
  return { id: crypto.randomUUID(), assetId: null, sourceIn: 0, duration: 4, title: index === 0 ? "Your story starts here" : "", caption: "", voiceover: "", note: "", transition: "fade", fit: "cover", locked: false, background: "#20262b" };
}

function KindIcon({ kind, className }: { kind: DirectorKind; className?: string }) {
  const Icon = RECIPES.find((r) => r.kind === kind)?.icon ?? Film;
  return <Icon className={className} />;
}

function DirectorText({ text }: { text: string }) {
  return <>{text.split(/(https:\/\/[^\s<>]+)/g).map((part, index) => part.startsWith("https://")
    ? <a key={index} href={part} target="_blank" rel="noopener noreferrer" className={styles.sourceLink}>{part}</a>
    : part)}</>;
}

function AssetVisual({ asset, className }: { asset?: DirectorAsset; className?: string }) {
  if (asset?.thumbnailUrl || asset?.kind === "image") {
    // Private media endpoints intentionally bypass the public image optimizer.
    // eslint-disable-next-line @next/next/no-img-element
    return <img src={asset.thumbnailUrl || asset.url} alt={asset.name} className={className} loading="lazy" />;
  }
  if (asset?.kind === "video") return <video src={asset.url} className={className} muted preload="metadata" playsInline />;
  return <div className={cn(styles.assetPlaceholder, className)}>{asset?.kind === "audio" ? <AudioLines /> : <Layers3 />}</div>;
}

export function DirectorWorkspace({ clientId, projectId, brandKitId }: Props) {
  const { data: session, status: sessionStatus } = useSession();
  const draftKey = session?.user?.id ? `athar-director-draft:${session.user.id}` : null;
  const [projects, setProjects] = useState<DirectorProject[]>([]);
  const [project, setProject] = useState<DirectorProject | null>(null);
  const [capabilities, setCapabilities] = useState<DirectorCapabilities | null>(null);
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState("");
  const [brief, setBrief] = useState("");
  const [kind, setKind] = useState<DirectorKind>("social");
  const [settings, setSettings] = useState<DirectorSettings>({ ...DIRECTOR_DEFAULTS });
  const [panel, setPanel] = useState<Panel>("direction");
  const [selectedSceneIndex, setSelected] = useState(0);
  const selected = Math.min(selectedSceneIndex, Math.max(0, (project?.scenes.length ?? 0) - 1));
  const [busy, setBusy] = useState("");
  const [uploadProgress, setUploadProgress] = useState("");
  const [instruction, setInstruction] = useState("");
  const [dirty, setDirty] = useState(false);
  const [projectsOpen, setProjectsOpen] = useState(false);
  const [historyOpen, setHistoryOpen] = useState(false);
  const [libraryOpen, setLibraryOpen] = useState(false);
  const [showExport, setShowExport] = useState(true);
  const [isDragging, setIsDragging] = useState(false);
  const filesRef = useRef<HTMLInputElement>(null);
  const folderRef = useRef<HTMLInputElement>(null);
  const chatEndRef = useRef<HTMLDivElement>(null);
  const mountedRef = useRef(true);
  const draftLoadedRef = useRef(false);

  useEffect(() => { mountedRef.current = true; return () => { mountedRef.current = false; }; }, []);

  const refreshProjects = useCallback(async () => {
    try {
      const data = await request<{ projects: DirectorProject[]; capabilities: DirectorCapabilities }>("/api/director/projects");
      if (!mountedRef.current) return;
      setProjects(data.projects); setCapabilities(data.capabilities); setLoadError("");
    } catch (error) {
      if (mountedRef.current) setLoadError(error instanceof Error ? error.message : "Could not load productions.");
    } finally { if (mountedRef.current) setLoading(false); }
  }, []);

  const adoptProject = useCallback((next: DirectorProject) => {
    setProject(next); setBrief(next.brief); setKind(next.kind); setSettings(next.settings); setDirty(false);
    setProjects((list) => [next, ...list.filter((p) => p.id !== next.id)]);
  }, []);

  // Keep the current edit across tool navigation and reloads, scoped to its owner.
  // Only merge an unsaved edit onto the same server version; a running worker wins.
  useEffect(() => {
    if (sessionStatus === "loading") return;
    let cancelled = false;
    request<{ projects: DirectorProject[]; capabilities: DirectorCapabilities }>("/api/director/projects").then((data) => {
      if (cancelled) return;
      setProjects(data.projects); setCapabilities(data.capabilities); setLoadError("");
      draftLoadedRef.current = true;
      if (!draftKey) return;
      try {
        const cached = JSON.parse(sessionStorage.getItem(draftKey) || "null") as { project: DirectorProject | null; brief: string; kind: DirectorKind; settings: DirectorSettings; selected: number; instruction: string; dirty: boolean } | null;
        if (!cached) return;
        const saved = data.projects.find((p) => p.id === cached.project?.id);
        if (cached.project && saved) {
          adoptProject(saved);
          if (cached.dirty && cached.project.version === saved.version && saved.status !== "planning" && saved.status !== "rendering") {
            setProject({ ...saved, title: cached.project.title, scenes: cached.project.scenes, audioAssetId: cached.project.audioAssetId, audioVolume: cached.project.audioVolume });
            setBrief(cached.brief); setSettings(cached.settings); setDirty(true);
          } else if (cached.dirty && cached.project.version !== saved.version) {
            sessionStorage.setItem(`${draftKey}:recovery`, JSON.stringify(cached));
            toast.info("A newer production version was loaded. Your previous draft is available to download.", { duration: Infinity, action: { label: "Download draft", onClick: () => {
              const url = URL.createObjectURL(new Blob([JSON.stringify(cached, null, 2)], { type: "application/json" }));
              const a = document.createElement("a"); a.href = url; a.download = "athar-recovered-draft.json"; a.click(); setTimeout(() => URL.revokeObjectURL(url), 1000);
            } } });
          }
        } else if (!cached.project) {
          setBrief(cached.brief); setKind(cached.kind); setSettings(cached.settings);
        }
        setSelected(cached.selected || 0); setInstruction(cached.instruction || "");
      } catch { /* An unavailable or obsolete browser cache never blocks a production. */ }
    }).catch((error: unknown) => {
      if (!cancelled) setLoadError(error instanceof Error ? error.message : "Could not load productions.");
    }).finally(() => { if (!cancelled) setLoading(false); });
    return () => { cancelled = true; };
  }, [sessionStatus, draftKey, adoptProject]);

  useEffect(() => {
    if (loading || !draftKey || !draftLoadedRef.current) return;
    try { sessionStorage.setItem(draftKey, JSON.stringify({ project, brief, kind, settings, selected, instruction, dirty })); }
    catch { /* Explicit Save remains available when browser storage is full. */ }
  }, [loading, draftKey, project, brief, kind, settings, selected, instruction, dirty]);

  const working = project?.status === "planning" || project?.status === "rendering";
  const disabled = Boolean(busy) || Boolean(working);

  useEffect(() => {
    if (!working || !project?.id) return;
    let cancelled = false;
    const poll = async () => {
      try {
        const data = await request<{ project: DirectorProject }>(`/api/director/projects/${project.id}`);
        if (cancelled) return;
        adoptProject(data.project);
        if (data.project.status === "ready") { setShowExport(true); toast.success("Your film is ready."); }
        if (data.project.status === "failed") toast.error(data.project.error || "Production stopped. Your project is saved.");
      } catch (error) {
        if (!cancelled) setLoadError(error instanceof Error ? error.message : "Reconnecting to production…");
      }
    };
    const timer = setInterval(() => void poll(), 2200);
    return () => { cancelled = true; clearInterval(timer); };
  }, [working, project?.id, adoptProject]);

  useEffect(() => { chatEndRef.current?.scrollIntoView({ behavior: "smooth", block: "nearest" }); }, [project?.messages.length, panel]);

  const scene = project?.scenes[Math.min(selected, Math.max(0, project.scenes.length - 1))];
  const sceneAsset = project?.assets.find((a) => a.id === scene?.assetId);
  const latestExport = project?.exports[0];
  const staleExport = latestExport && (dirty || latestExport.version !== project?.version);
  const duration = directorDuration(project?.scenes ?? []);
  const format = DIRECTOR_FORMATS[settings.format];

  async function ensureProject(): Promise<DirectorProject> {
    if (project) return project;
    const title = brief.trim() ? brief.trim().replace(/\s+/g, " ").split(" ").slice(0, 7).join(" ").slice(0, 70) : "Untitled production";
    const data = await request<{ project: DirectorProject }>("/api/director/projects", { method: "POST", body: JSON.stringify({ title, brief, kind, settings, clientId, projectId, brandKitId }) });
    adoptProject(data.project);
    return data.project;
  }

  async function saveProject(current = project): Promise<DirectorProject> {
    if (!current) return ensureProject();
    const data = await request<{ project: DirectorProject }>(`/api/director/projects/${current.id}`, { method: "PATCH", body: JSON.stringify({ title: current.title, brief, settings, scenes: current.scenes, audioAssetId: current.audioAssetId, audioVolume: current.audioVolume, version: current.version }) });
    adoptProject(data.project);
    return data.project;
  }

  async function startProduction(render = true, refinement?: string) {
    if (disabled) return;
    if (!brief.trim() && !refinement) { toast.error("Describe the film you want to make first."); return; }
    setBusy(render ? "Starting production" : "Planning your film");
    try {
      let current = await ensureProject();
      if (project) current = await saveProject(current);
      const data = await request<{ project: DirectorProject }>(`/api/director/projects/${current.id}/run`, { method: "POST", body: JSON.stringify({ render, ...(refinement ? { instruction: refinement } : {}) }) });
      adoptProject(data.project); setInstruction(""); setPanel("direction");
    } catch (error) { toast.error(error instanceof Error ? error.message : "Could not start production."); }
    finally { setBusy(""); }
  }

  async function renderProject() {
    if (disabled || !project?.scenes.length) return;
    setBusy("Preparing render");
    try {
      const current = await saveProject();
      const data = await request<{ project: DirectorProject }>(`/api/director/projects/${current.id}/render`, { method: "POST", body: "{}" });
      adoptProject(data.project); setPanel("direction");
    } catch (error) { toast.error(error instanceof Error ? error.message : "Could not render your film."); }
    finally { setBusy(""); }
  }

  async function openProject(id: string) {
    if (busy) return;
    setBusy("Opening production");
    try {
      if (dirty && project) await saveProject();
      const data = await request<{ project: DirectorProject }>(`/api/director/projects/${id}`);
      adoptProject(data.project); setSelected(0); setShowExport(true); setProjectsOpen(false); setHistoryOpen(false);
    } catch (error) { toast.error(error instanceof Error ? error.message : "Could not open production."); }
    finally { setBusy(""); }
  }

  async function newProject() {
    if (busy) return;
    if (dirty && project) {
      try { await saveProject(); } catch (error) { toast.error(error instanceof Error ? error.message : "Save your changes first."); return; }
    }
    setProject(null); setBrief(""); setKind("social"); setSettings({ ...DIRECTOR_DEFAULTS }); setSelected(0); setInstruction(""); setPanel("direction"); setDirty(false); setHistoryOpen(false); setShowExport(true);
    void refreshProjects();
  }

  async function uploadFiles(files: File[]) {
    if (disabled || !files.length) return;
    const supported = files.filter((f) => /^(image|video|audio)\//.test(f.type) || /\.(mp4|mov|m4v|webm|mkv|png|jpe?g|webp|gif|mp3|wav|m4a|aac|ogg)$/i.test(f.name));
    const eligible = supported.filter((f) => f.size <= 100 * 1024 * 1024);
    if (eligible.length !== files.length) toast.info("Only image, video, and audio files up to 100 MB each can be imported.");
    const available = 50 - (project?.assets.length ?? 0);
    const batch = eligible.slice(0, available);
    if (eligible.length > available) toast.info("Each production can contain up to 50 source files.");
    if (!batch.length) return;
    setBusy("Importing sources"); setPanel("assets");
    try {
      let current = await ensureProject();
      if (dirty && project) current = await saveProject(current);
      let imported = 0;
      for (const [index, file] of batch.entries()) {
        setUploadProgress(`${index + 1} of ${batch.length} · ${file.name}`);
        const data = new FormData(); data.set("file", file);
        try {
          const result = await request<{ project: DirectorProject; asset: DirectorAsset }>(`/api/director/projects/${current.id}/assets`, { method: "POST", body: data });
          current = result.project; adoptProject(current); imported++;
        } catch (error) { toast.error(`${file.name}: ${error instanceof Error ? error.message : "Import failed"}`); }
      }
      if (imported) toast.success(`${imported} source ${imported === 1 ? "file" : "files"} imported.`);
    } catch (error) { toast.error(error instanceof Error ? error.message : "Could not import files."); }
    finally { setBusy(""); setUploadProgress(""); if (filesRef.current) filesRef.current.value = ""; if (folderRef.current) folderRef.current.value = ""; }
  }

  function updateSettings(patch: Partial<DirectorSettings>) { setSettings((s) => ({ ...s, ...patch })); if (project) setDirty(true); }
  function updateScene(patch: Partial<DirectorScene>) {
    if (!project || !scene || disabled) return;
    setProject({ ...project, scenes: project.scenes.map((s) => s.id === scene.id ? { ...s, ...patch } : s) });
    setDirty(true); setShowExport(false);
  }

  async function addScene() {
    if (disabled) return;
    setBusy("Adding scene");
    try {
      const current = await ensureProject();
      if (current.scenes.length >= 24) { toast.error("A production can have up to 24 scenes."); return; }
      setProject({ ...current, scenes: [...current.scenes, freshScene(current.scenes.length)] });
      setSelected(current.scenes.length); setPanel("scene"); setDirty(true); setShowExport(false);
    } catch (error) { toast.error(error instanceof Error ? error.message : "Could not add scene."); }
    finally { setBusy(""); }
  }

  function moveScene(offset: number) {
    if (!project || !scene || disabled) return;
    const from = project.scenes.findIndex((s) => s.id === scene.id); const to = from + offset;
    if (to < 0 || to >= project.scenes.length) return;
    const scenes = [...project.scenes]; [scenes[from], scenes[to]] = [scenes[to], scenes[from]];
    setProject({ ...project, scenes }); setSelected(to); setDirty(true); setShowExport(false);
  }

  function exportProject() {
    if (!project) return;
    const blob = new Blob([JSON.stringify({ ...project, settings, brief }, null, 2)], { type: "application/json" });
    const url = URL.createObjectURL(blob); const a = document.createElement("a");
    a.href = url; a.download = `${project.title.replace(/[^\p{L}\p{N}\s-]/gu, "").trim() || "athar-production"}.json`;
    a.click(); setTimeout(() => URL.revokeObjectURL(url), 1000);
  }

  async function removeAsset(asset: DirectorAsset) {
    if (!project || disabled) return;
    if (project.scenes.some((s) => s.assetId === asset.id) || project.audioAssetId === asset.id) { toast.error("Remove this source from the sequence or soundtrack before deleting it."); return; }
    setBusy("Removing source");
    try {
      if (dirty) await saveProject();
      const data = await request<{ project: DirectorProject }>(`/api/director/projects/${project.id}/assets/${asset.id}`, { method: "DELETE" });
      adoptProject(data.project);
    } catch (error) { toast.error(error instanceof Error ? error.message : "Could not remove source."); }
    finally { setBusy(""); }
  }

  async function openLibrary() {
    if (disabled) return;
    setBusy("Opening library");
    try { await ensureProject(); setPanel("assets"); setLibraryOpen(true); }
    catch (error) { toast.error(error instanceof Error ? error.message : "Could not open the library."); }
    finally { setBusy(""); }
  }

  async function importCreation(source: "generation" | "voice", sourceId: string) {
    if (disabled || !project) return;
    setBusy("Importing creation");
    try {
      if (dirty) await saveProject();
      const data = await request<{ project: DirectorProject; asset: DirectorAsset }>(`/api/director/projects/${project.id}/library`, { method: "POST", body: JSON.stringify({ source, sourceId }) });
      adoptProject(data.project);
      if (source === "voice") {
        setProject({ ...data.project, audioAssetId: data.asset.id, audioVolume: 1 });
        setSettings({ ...data.project.settings, soundtrackLoop: false }); setDirty(true);
      }
      setLibraryOpen(false); toast.success(source === "voice" ? "Voice track imported and selected. It will play once." : "Creation added to your source material.");
    } catch (error) { toast.error(error instanceof Error ? error.message : "Could not import this creation."); }
    finally { setBusy(""); }
  }

  const fileInputs = <>
    <input ref={filesRef} type="file" accept="image/*,video/*,audio/*,.mov,.mkv" multiple hidden onChange={(e) => void uploadFiles(Array.from(e.target.files ?? []))} />
    <input ref={folderRef} type="file" multiple hidden {...{ webkitdirectory: "", directory: "" }} onChange={(e) => void uploadFiles(Array.from(e.target.files ?? []))} />
  </>;

  const formatSelect = <select aria-label="Output format" value={settings.format} onChange={(e) => updateSettings({ format: e.target.value as DirectorFormat })} disabled={disabled} className={styles.select}>
    {Object.entries(DIRECTOR_FORMATS).map(([value, f]) => <option key={value} value={value}>{value} · {f.label}</option>)}
  </select>;

  return <section className={styles.workspace} onDragOver={(e) => { e.preventDefault(); if (!disabled && e.dataTransfer.types.includes("Files")) setIsDragging(true); }} onDragLeave={(e) => { if (!e.currentTarget.contains(e.relatedTarget as Node)) setIsDragging(false); }} onDrop={(e) => { e.preventDefault(); setIsDragging(false); void uploadFiles(Array.from(e.dataTransfer.files)); }}>
    {fileInputs}
    <header className={styles.header}>
      <div className={styles.headingGroup}><span className={styles.mark}><Clapperboard size={20} /></span><div><h1>Director <span className={styles.beta}>PRODUCTION STUDIO</span></h1><p>Every element. One considered film.</p></div></div>
      <div className={styles.headerActions}>
        <button className={styles.quietButton} onClick={() => { setProjectsOpen(!projectsOpen); void refreshProjects(); }} aria-expanded={projectsOpen}><FolderOpen size={15} /><span>Productions</span>{projects.length > 0 && <small>{projects.length}</small>}</button>
        {project && <button className={styles.iconButton} onClick={() => void newProject()} title="New production" aria-label="New production"><Plus size={18} /></button>}
      </div>
    </header>

    {loadError && <div className={styles.errorBanner} role="alert"><TriangleAlert size={16} /><span>{loadError}</span><button onClick={() => void refreshProjects()}>Reconnect</button></div>}

    {projectsOpen && <div className={styles.projectShelf}>
      <div className={styles.shelfTitle}><span>Your productions</span><button className={styles.iconButton} onClick={() => setProjectsOpen(false)} aria-label="Close productions"><X size={16} /></button></div>
      {loading ? <p className={styles.emptyNote}>Loading productions…</p> : projects.length ? <div className={styles.projectGrid}>{projects.map((p) => <button key={p.id} className={cn(styles.projectCard, p.id === project?.id && styles.projectActive)} onClick={() => void openProject(p.id)} disabled={Boolean(busy)}><KindIcon kind={p.kind} /><strong>{p.title}</strong><span>{p.settings.format} · {directorTime(directorDuration(p.scenes) || p.settings.duration)}<i className={cn(styles.statusDot, p.status === "ready" && styles.statusReady)} />{p.status}</span></button>)}</div> : <p className={styles.emptyNote}>Your productions will live here. Start with a brief or a folder of footage.</p>}
    </div>}

    {!project ? <div className={styles.landing}>
      <div className={styles.intro}><div className={styles.eyebrow}><span /> A NEW WAY TO MAKE</div><h2>You bring the vision.<br /><span>Director brings it together.</span></h2><p>A complete film from your footage, images, and ideas.<br className={styles.desktopBreak} /> Shape the story, direct the details, and make it yours.</p></div>
      <div className={styles.recipeGrid}>{RECIPES.map((recipe) => <button key={recipe.kind} disabled={disabled} className={cn(styles.recipe, kind === recipe.kind && styles.recipeSelected)} onClick={() => { setKind(recipe.kind); setBrief(recipe.brief); updateSettings({ duration: recipe.kind === "event" ? 45 : recipe.kind === "motion" ? 20 : 30, style: recipe.kind === "motion" ? "kinetic" : recipe.kind === "event" ? "cinematic" : "editorial" }); }}><span className={styles.recipeIcon}><recipe.icon size={20} /></span><span><strong>{recipe.title}</strong><small>{recipe.description}</small></span><span className={styles.recipeRadio}>{kind === recipe.kind && <span />}</span></button>)}</div>
      <div className={styles.briefCard}>
        <label htmlFor="director-brief" className={styles.briefLabel}>What are we making?</label>
        <textarea id="director-brief" disabled={disabled} value={brief} onChange={(e) => setBrief(e.target.value)} placeholder="A cinematic launch film. A recap of last night's event. A bold motion story. Tell Director what you have in mind…" maxLength={12000} rows={4} />
        <div className={styles.briefOptions}>{formatSelect}<select aria-label="Target duration" disabled={disabled} className={styles.select} value={settings.duration} onChange={(e) => updateSettings({ duration: Number(e.target.value) })}>{[15, 20, 30, 45, 60, 90].map((n) => <option key={n} value={n}>{n} seconds</option>)}</select><select aria-label="Production language" disabled={disabled} className={styles.select} value={settings.language} onChange={(e) => updateSettings({ language: e.target.value })}>{["English", "Arabic", "Arabic & English"].map((language) => <option key={language}>{language}</option>)}</select><div className={styles.localeInput}><Globe2 size={14} /><input aria-label="Location and cultural context" disabled={disabled} value={settings.locale} onChange={(e) => updateSettings({ locale: e.target.value })} placeholder="Location, if relevant" maxLength={150} /></div></div>
        <div className={styles.briefFooter}><div className={styles.uploadActions}><button onClick={() => filesRef.current?.click()} disabled={disabled}><Plus size={16} /> Add assets</button><button onClick={() => folderRef.current?.click()} disabled={disabled}><FolderOpen size={16} /><span>Import folder</span></button><button onClick={() => void openLibrary()} disabled={disabled}><Layers3 size={16} /><span>From Athar</span></button></div><button className={styles.primaryButton} disabled={disabled || !brief.trim() || capabilities?.astraConfigured === false} onClick={() => void startProduction(true)}>{busy ? <Loader2 size={17} className="animate-spin" /> : <Sparkles size={17} />} {busy || "Create my film"}<ArrowUp size={16} /></button></div>
      </div>
      <div className={styles.landingFootnote}><span><LockKeyhole size={13} /> Sources stay in your production</span><span><Settings2 size={13} /> Every scene stays editable</span></div>
      {capabilities?.astraConfigured === false && <p className={styles.notice}>Connect OpenAI in the server configuration to use Director planning. You can still build and render a sequence manually.</p>}
      <div className={styles.startManually}><button onClick={() => void addScene()} disabled={disabled}>Start with a blank sequence <ArrowRight size={14} /></button></div>
      {projects.length > 0 && <div className={styles.recent}><div className={styles.sectionLabel}>PICK UP WHERE YOU LEFT OFF <span>{projects.length} productions</span></div><div className={styles.projectGrid}>{projects.slice(0, 3).map((p) => <button className={styles.projectCard} key={p.id} onClick={() => void openProject(p.id)}><KindIcon kind={p.kind} /><strong>{p.title}</strong><span>{p.scenes.length} scenes · {p.settings.format} · {p.status}</span><ArrowRight className={styles.projectArrow} size={16} /></button>)}</div></div>}
    </div> : <div className={styles.editor}>
      <div className={styles.productionBar}>
        <div className={styles.productionTitle}><KindIcon kind={project.kind} /><input aria-label="Production title" value={project.title} disabled={disabled} onChange={(e) => { setProject({ ...project, title: e.target.value }); setDirty(true); }} maxLength={100} /><span className={styles.version}>v{project.version}</span></div>
        <div className={styles.productionActions}>
          {dirty && <button className={styles.quietButton} disabled={disabled} onClick={async () => { setBusy("Saving"); try { await saveProject(); toast.success("Production saved."); } catch (error) { toast.error(error instanceof Error ? error.message : "Could not save."); } finally { setBusy(""); } }}><Check size={14} />Save changes</button>}
          <button className={styles.iconButton} onClick={() => setHistoryOpen(!historyOpen)} aria-expanded={historyOpen} title="Version history" aria-label="Version history"><History size={16} /></button>
          <button className={styles.iconButton} onClick={exportProject} title="Download editable project" aria-label="Download editable project"><Download size={16} /></button>
          {latestExport && <a className={styles.secondaryButton} href={`${latestExport.url}${latestExport.url.includes("?") ? "&" : "?"}download=1`} download><ArrowDownToLine size={15} />Export v{latestExport.version}</a>}
          <button className={styles.primaryButton} disabled={disabled || !project.scenes.length || capabilities?.renderAvailable === false} onClick={() => void renderProject()}>{working || busy ? <Loader2 size={15} className="animate-spin" /> : <Film size={15} />}<span>{working ? "Producing" : "Render video"}</span></button>
        </div>
      </div>

      {historyOpen && <div className={styles.historyPanel}><div className={styles.shelfTitle}><span>Production history</span><button onClick={() => setHistoryOpen(false)} className={styles.iconButton} aria-label="Close history"><X size={16} /></button></div>{project.history.length ? project.history.slice().reverse().map((version) => <button key={`${version.version}-${version.createdAt}`} disabled={disabled} onClick={() => { setProject({ ...project, scenes: version.scenes }); setSettings(version.settings); setDirty(true); setShowExport(false); setHistoryOpen(false); toast.info("Previous sequence restored. Save or render to create a new version."); }}><RotateCcw size={15} /><strong>Version {version.version}</strong><span>{version.label}</span><small>{new Date(version.createdAt).toLocaleDateString()}</small></button>) : <p className={styles.emptyNote}>Saved production versions will appear here.</p>}</div>}

      <div className={styles.editorGrid}>
        <div className={styles.stageColumn}>
          <div className={styles.stageToolbar}><div className={styles.segmented}><button className={!showExport || !latestExport ? styles.segmentActive : ""} onClick={() => setShowExport(false)}>Scene</button><button className={showExport && latestExport ? styles.segmentActive : ""} onClick={() => setShowExport(true)} disabled={!latestExport}>Rendered film</button></div><span>{format.width} × {format.height}<span className={styles.separator}>/</span>{directorTime(duration || settings.duration)}</span></div>
          <div className={styles.previewStage}>
            {showExport && latestExport ? <div className={styles.renderPreview} style={{ aspectRatio: `${DIRECTOR_FORMATS[latestExport.format].width}/${DIRECTOR_FORMATS[latestExport.format].height}` }}><video key={latestExport.id} src={latestExport.url} poster={latestExport.thumbnailUrl} controls playsInline preload="metadata" /><span className={styles.previewVersion}>RENDER v{latestExport.version}</span></div> : scene ? <div className={cn(styles.scenePreview, styles[`look_${settings.style}`])} style={{ aspectRatio: `${format.width}/${format.height}`, background: scene.background || "#20262b", "--scene-accent": settings.accent } as React.CSSProperties}>
              {sceneAsset && sceneAsset.kind !== "audio" ? <AssetVisual asset={sceneAsset} className={cn(styles.previewMedia, scene.fit === "contain" && styles.contain)} /> : <div className={styles.motionArtwork}><span /><i /><b /></div>}
              <div className={styles.sceneShade} />
              <div className={styles.previewBrand}>{settings.brandName || "ATHAR"}</div>
              <div className={styles.previewCopy} dir="auto">{scene.title && <h3>{scene.title}</h3>}{scene.caption && <p>{scene.caption}</p>}</div>
              <div className={styles.previewCount}><span>{String(selected + 1).padStart(2, "0")}</span><span>{String(project.scenes.length).padStart(2, "0")}</span></div>
            </div> : <div className={styles.emptyStage}><span className={styles.emptyStageIcon}><Clapperboard size={30} /></span><h3>Your story is taking shape.</h3><p>Add your source material and describe the film.<br />Director will turn it into an editable sequence.</p><button className={styles.secondaryButton} disabled={disabled} onClick={() => filesRef.current?.click()}><Upload size={15} /> Add source material</button></div>}
            {working && <div className={styles.workingBadge} role="status"><Loader2 size={16} className="animate-spin" /><span>{project.stage || "Building your production"}</span><strong>{Math.round(project.progress)}%</strong></div>}
          </div>
          <div className={styles.stageCaption}>{showExport && latestExport ? <><CheckCircle2 size={13} /><span>{staleExport ? "This export is from an earlier edit. Render to include your changes." : "Rendered export · ready to play and download"}</span></> : <><Layers3 size={13} /><span>Composition preview · render to see the complete motion and sound</span></>}{scene && !showExport && <span className={styles.sceneTime}>{scene.duration.toFixed(1)}s</span>}</div>
          {duration > 90 && <p className={styles.notice} role="alert">This sequence is {directorTime(duration)}. Trim it to 90 seconds or less before saving or rendering.</p>}<div className={styles.sequenceHeader}><div><span className={styles.sectionLabel}>YOUR SEQUENCE</span><span className={styles.sequenceCount}>{project.scenes.length} scenes</span></div><button className={styles.quietButton} onClick={() => void addScene()} disabled={disabled}><Plus size={14} />Add scene</button></div>
          <div className={styles.filmstrip}>{project.scenes.map((s, index) => <button key={s.id} className={cn(styles.sceneCard, index === selected && styles.sceneSelected)} onClick={() => { setSelected(index); setShowExport(false); setPanel("scene"); }}><div className={styles.sceneThumbnail} style={{ background: s.background }}><AssetVisual asset={project.assets.find((a) => a.id === s.assetId)} /><span className={styles.sceneNumber}>{String(index + 1).padStart(2, "0")}</span>{s.locked && <LockKeyhole size={12} className={styles.lockedBadge} />}<span className={styles.sceneDuration}>{s.duration.toFixed(1)}s</span></div><strong dir="auto">{s.title || project.assets.find((a) => a.id === s.assetId)?.name || `Scene ${index + 1}`}</strong><small>{s.assetId ? "Source footage" : "Motion graphic"}</small></button>)}<button className={styles.addSceneCard} onClick={() => void addScene()} disabled={disabled} aria-label="Add a scene"><Plus size={20} /><span>Add scene</span></button></div>
          {project.checks.length > 0 && <div className={styles.checks}><div className={styles.sectionLabel}><ShieldCheck size={13} />PRODUCTION CHECKS</div><div className={styles.checkGrid}>{project.checks.map((check) => <div key={check.id} className={styles.checkItem} title={check.detail}>{check.status === "pass" ? <CheckCircle2 size={14} className={styles.pass} /> : check.status === "warning" ? <TriangleAlert size={14} className={styles.warning} /> : <MoreHorizontal size={14} />}<span>{check.label}</span><small>{check.detail}</small></div>)}</div></div>}
        </div>

        <aside className={styles.inspector}>
          <div className={styles.inspectorTabs}>{([{ id: "direction", icon: MessageSquare, label: "Direct" }, { id: "assets", icon: FolderOpen, label: "Sources" }, { id: "scene", icon: Layers3, label: "Scene" }, { id: "settings", icon: Settings2, label: "Style" }] as const).map((tab) => <button key={tab.id} onClick={() => setPanel(tab.id)} className={panel === tab.id ? styles.inspectorTabActive : ""}><tab.icon size={15} />{tab.label}</button>)}</div>
          <div className={styles.panelContent}>
            {panel === "direction" && <>
              <div className={styles.directorIdentity}><span><Sparkles size={17} /></span><div><strong>Your production director</strong><small>{project.model || capabilities?.model || "GPT-6 Astra"}</small></div><i className={styles.onlineDot} /></div>
              <label className={styles.fieldLabel} htmlFor="project-production-brief">THE BRIEF</label><textarea id="project-production-brief" className={styles.briefEdit} value={brief} onChange={(e) => { setBrief(e.target.value); setDirty(true); }} disabled={disabled} rows={5} placeholder="Describe your film, the audience, and what matters most." maxLength={12000} />
              {!project.scenes.length && <div className={styles.planActions}><button className={styles.primaryButton} disabled={disabled || !brief.trim() || capabilities?.astraConfigured === false} onClick={() => void startProduction(true)}><Sparkles size={15} />Create my film</button><button className={styles.quietButton} disabled={disabled || !brief.trim() || capabilities?.astraConfigured === false} onClick={() => void startProduction(false)}>Plan the sequence first <ArrowRight size={14} /></button></div>}
              <div className={styles.messages}>{project.messages.map((message) => <div key={message.id} className={cn(styles.message, message.role === "user" && styles.userMessage, message.role === "system" && styles.systemMessage)}><span className={styles.messageAuthor}>{message.role === "user" ? "YOU" : message.role === "assistant" ? "DIRECTOR" : "PRODUCTION"}</span><p><DirectorText text={message.content} /></p></div>)}<div ref={chatEndRef} /></div>
              {project.error && <div className={styles.productionError} role="alert"><TriangleAlert size={16} /><p>{project.error}</p><button onClick={() => void startProduction(true)} disabled={disabled}>Try again</button></div>}
              {working && <div className={styles.progressCard}><div><Loader2 size={14} className="animate-spin" /><span>{project.stage}</span></div><progress max="100" value={project.progress} /><p>Your production is saved. You can return while it works.</p><button className={styles.quietButton} disabled={Boolean(busy) || project.stage.startsWith("Cancelling")} onClick={async () => { setBusy("Stopping production"); try { const data = await request<{ project: DirectorProject }>(`/api/director/projects/${project.id}/cancel`, { method: "POST", body: "{}" }); adoptProject(data.project); } catch (error) { toast.error(error instanceof Error ? error.message : "Could not stop production."); } finally { setBusy(""); } }}><X size={14} />Stop this run</button></div>}
              {project.scenes.length > 0 && <form className={styles.directionComposer} onSubmit={(e) => { e.preventDefault(); if (instruction.trim()) void startProduction(true, instruction.trim()); }}><textarea aria-label="Direction for your next edit" value={instruction} onChange={(e) => setInstruction(e.target.value)} placeholder="Make the opening stronger. Shorten scene 3. Keep the typography…" rows={3} maxLength={4000} /><div><span>{working ? "Send your next direction when this run finishes" : "Locked scenes stay unchanged"}</span><button type="submit" aria-label="Apply direction and render" disabled={disabled || !instruction.trim() || capabilities?.astraConfigured === false}><ArrowUp size={17} /></button></div></form>}
            </>}

            {panel === "assets" && (libraryOpen ? <DirectorLibrary disabled={disabled} onClose={() => setLibraryOpen(false)} onImport={importCreation} /> : <>
              <div className={styles.panelHeading}><h3>Source material</h3><span>{project.assets.length} / 50</span></div><p className={styles.panelDescription}>Your footage, photographs, and sound. Originals stay untouched.</p>
              <button className={styles.dropzone} onClick={() => filesRef.current?.click()} disabled={disabled}><Upload size={23} /><strong>{uploadProgress || "Drop files here or browse"}</strong><span>Video, images, and audio · up to 100 MB each</span></button><button className={styles.folderButton} onClick={() => folderRef.current?.click()} disabled={disabled}><FolderOpen size={15} /> Import a folder<ArrowRight size={14} /></button>
              <button className={styles.folderButton} onClick={() => setLibraryOpen(true)} disabled={disabled}><Layers3 size={15} /> Import from Athar library<ArrowRight size={14} /></button><div className={styles.assetList}>{project.assets.map((asset) => <div className={styles.assetRow} key={asset.id}><AssetVisual asset={asset} className={styles.assetThumb} /><div><strong title={asset.name}>{asset.name}</strong><span>{asset.kind} · {asset.duration ? directorTime(asset.duration) : `${((asset.size || 0) / 1048576).toFixed(1)} MB`}</span></div><button className={styles.iconButton} title="Remove source" aria-label={`Remove ${asset.name}`} disabled={disabled} onClick={() => void removeAsset(asset)}><Trash2 size={14} /></button></div>)}</div>
              {project.assets.length === 0 && <p className={styles.emptyNote}>Making a motion story? You can create it entirely from text and graphics.</p>}
            </>)}

            {panel === "scene" && (scene ? <>
              <div className={styles.panelHeading}><h3>Scene {selected + 1}</h3><button className={cn(styles.lockButton, scene.locked && styles.lockActive)} disabled={disabled} onClick={() => updateScene({ locked: !scene.locked })}>{scene.locked ? <LockKeyhole size={13} /> : <UnlockKeyhole size={13} />}{scene.locked ? "Locked" : "Lock scene"}</button></div><p className={styles.panelDescription}>{scene.locked ? "Director will preserve this scene during AI revisions. You can still edit it here." : "Fine-tune this moment. Every detail is yours to direct."}</p>
              <label className={styles.field}>Source<select className={styles.control} value={scene.assetId ?? ""} disabled={disabled} onChange={(e) => { const asset = project.assets.find((a) => a.id === e.target.value); updateScene({ assetId: e.target.value || null, sourceIn: 0, ...(asset?.kind === "video" ? { duration: Math.min(scene.duration, asset.duration) } : {}) }); }}><option value="">Motion graphic · no footage</option>{project.assets.filter((a) => a.kind !== "audio").map((asset) => <option key={asset.id} value={asset.id} disabled={asset.kind === "video" && asset.duration < 0.5}>{asset.name}{asset.kind === "video" && asset.duration < 0.5 ? " · too short" : ""}</option>)}</select></label>
              <div className={styles.fieldRow}><label className={styles.field}>Duration (seconds)<input className={styles.control} type="number" min="0.5" max="30" step="0.5" value={scene.duration} disabled={disabled} onChange={(e) => updateScene({ duration: Math.max(0.5, Math.min(30, Number(e.target.value) || 0.5)) })} /></label><label className={styles.field}>Source start<input className={styles.control} type="number" min="0" max={sceneAsset?.kind === "video" ? Math.max(0, sceneAsset.duration - scene.duration) : 0} step="0.1" value={scene.sourceIn} disabled={disabled || sceneAsset?.kind !== "video"} onChange={(e) => updateScene({ sourceIn: Math.max(0, Math.min((sceneAsset?.duration ?? 0) - scene.duration, Number(e.target.value) || 0)) })} /></label></div>
              <label className={styles.field}>Headline<textarea className={styles.control} value={scene.title} dir="auto" disabled={disabled} onChange={(e) => updateScene({ title: e.target.value })} rows={2} maxLength={180} placeholder="An intentional headline" /></label>
              <label className={styles.field}>Caption / supporting text<textarea className={styles.control} value={scene.caption} dir="auto" disabled={disabled} onChange={(e) => updateScene({ caption: e.target.value })} rows={3} maxLength={400} placeholder="A little more of the story" /></label>
              <div className={styles.fieldRow}><label className={styles.field}>Transition<select className={styles.control} value={scene.transition} disabled={disabled} onChange={(e) => updateScene({ transition: e.target.value as "fade" | "cut" })}><option value="fade">Soft fade</option><option value="cut">Clean cut</option></select></label><label className={styles.field}>Framing<select className={styles.control} value={scene.fit} disabled={disabled} onChange={(e) => updateScene({ fit: e.target.value as "cover" | "contain" })}><option value="cover">Fill frame</option><option value="contain">Keep full source</option></select></label></div>
              <label className={styles.field}>Background<div className={styles.colorField}><input aria-label="Scene background" type="color" value={scene.background} disabled={disabled} onChange={(e) => updateScene({ background: e.target.value })} /><span>{scene.background}</span></div></label>
              {scene.note && <div className={styles.sceneNote}><WandSparkles size={14} /><p>{scene.note}</p></div>}
              {scene.voiceover && <div className={styles.sceneNote}><AudioLines size={14} /><p><strong>Narration direction</strong>{scene.voiceover}</p></div>}
              <div className={styles.sceneTools}><button className={styles.quietButton} disabled={disabled || selected === 0} onClick={() => moveScene(-1)} aria-label="Move scene earlier"><ArrowLeft size={15} /></button><button className={styles.quietButton} disabled={disabled || selected === project.scenes.length - 1} onClick={() => moveScene(1)} aria-label="Move scene later"><ArrowRight size={15} /></button><button className={styles.quietButton} disabled={disabled || project.scenes.length >= 24} onClick={() => { const scenes = [...project.scenes]; scenes.splice(selected + 1, 0, { ...scene, id: crypto.randomUUID(), locked: false }); setProject({ ...project, scenes }); setSelected(selected + 1); setDirty(true); }}><Copy size={14} />Duplicate</button><button className={styles.iconButton} disabled={disabled} aria-label="Delete scene" onClick={() => { setProject({ ...project, scenes: project.scenes.filter((s) => s.id !== scene.id) }); setSelected(Math.max(0, selected - 1)); setDirty(true); setShowExport(false); }}><Trash2 size={15} /></button></div>
            </> : <div className={styles.panelEmpty}><Layers3 size={26} /><h3>Make room for the story.</h3><p>Let Director plan your sequence, or add a scene to start composing.</p><button className={styles.secondaryButton} onClick={() => void addScene()} disabled={disabled}><Plus size={15} />Add scene</button></div>)}

            {panel === "settings" && <>
              <div className={styles.panelHeading}><h3>The production look</h3><Settings2 size={16} /></div><p className={styles.panelDescription}>Set the frame, the feeling, and the local context.</p>
              <label className={styles.field}>Output format{formatSelect}</label>
              <label className={styles.field}>Visual direction<div className={styles.styleGrid}>{([{ id: "editorial", label: "Editorial" }, { id: "cinematic", label: "Cinematic" }, { id: "kinetic", label: "Kinetic" }, { id: "minimal", label: "Minimal" }] as { id: DirectorStyle; label: string }[]).map((look) => <button key={look.id} disabled={disabled} className={cn(styles.styleCard, styles[`style_${look.id}`], settings.style === look.id && styles.styleSelected)} onClick={() => updateSettings({ style: look.id })}><span>Aa</span><strong>{look.label}</strong>{settings.style === look.id && <Check size={12} />}</button>)}</div></label>
              <label className={styles.field}>Brand / closing signature<input className={styles.control} value={settings.brandName} disabled={disabled} onChange={(e) => updateSettings({ brandName: e.target.value })} maxLength={80} placeholder="Brand name" /></label>
              <label className={styles.field}>Accent color<div className={styles.swatches}>{["#d4ed87", "#efc68e", "#a9c8ee", "#e9a9bd", "#f0eee8"].map((color) => <button type="button" key={color} aria-label={`Use accent ${color}`} disabled={disabled} className={settings.accent === color ? styles.swatchSelected : ""} style={{ background: color }} onClick={() => updateSettings({ accent: color })}>{settings.accent === color && <Check size={13} />}</button>)}<input type="color" aria-label="Custom accent color" value={settings.accent} disabled={disabled} onChange={(e) => updateSettings({ accent: e.target.value })} /></div></label>
              <div className={styles.fieldRow}><label className={styles.field}>Language<input className={styles.control} value={settings.language} disabled={disabled} onChange={(e) => updateSettings({ language: e.target.value })} maxLength={80} /></label><label className={styles.field}>Target length<select className={styles.control} value={settings.duration} disabled={disabled} onChange={(e) => updateSettings({ duration: Number(e.target.value) })}>{[15,20,30,45,60,90].map((n) => <option value={n} key={n}>{n} seconds</option>)}</select></label></div>
              <label className={styles.field}>Location & audience<input className={styles.control} value={settings.locale} disabled={disabled} onChange={(e) => updateSettings({ locale: e.target.value })} placeholder="e.g. Abu Dhabi · contemporary UAE audience" maxLength={150} /></label>
              <label className={styles.field}>Cultural references & pronunciation<textarea className={styles.control} value={settings.culturalNotes} disabled={disabled} onChange={(e) => updateSettings({ culturalNotes: e.target.value })} placeholder="Approved facts, dialect, names, references, or details to preserve. Be as specific as the work needs." rows={4} maxLength={4000} /></label>
              <div className={styles.audioSection}><div className={styles.sectionLabel}><Music2 size={14} /> SOUNDTRACK</div><select className={styles.control} aria-label="Background soundtrack" value={project.audioAssetId ?? ""} disabled={disabled} onChange={(e) => { setProject({ ...project, audioAssetId: e.target.value || null }); setDirty(true); }}><option value="">No additional soundtrack</option>{project.assets.filter((a) => a.kind === "audio").map((asset) => <option key={asset.id} value={asset.id}>{asset.name}</option>)}</select>{project.audioAssetId && <label className={styles.volumeLabel}>Music level <input type="range" min="0" max="1" step="0.05" value={project.audioVolume} disabled={disabled} onChange={(e) => { setProject({ ...project, audioVolume: Number(e.target.value) }); setDirty(true); }} /><span>{Math.round(project.audioVolume * 100)}%</span></label>}<label className={styles.checkboxLabel}><input type="checkbox" checked={settings.soundtrackLoop !== false} disabled={disabled} onChange={(e) => updateSettings({ soundtrackLoop: e.target.checked })} />Loop imported track to fill the film</label><label className={styles.checkboxLabel}><input type="checkbox" checked={settings.preserveSourceAudio} disabled={disabled} onChange={(e) => updateSettings({ preserveSourceAudio: e.target.checked })} />Keep original footage audio</label><button className={styles.quietButton} onClick={() => filesRef.current?.click()} disabled={disabled}><Upload size={14} />Import music or a voice track</button></div>
            </>}
          </div>
        </aside>
      </div>
    </div>}
    {isDragging && <div className={styles.dragOverlay}><Upload size={44} /><h3>Bring your material in.</h3><p>Drop your footage, images, or audio to import.</p></div>}
    {busy && !working && <div className={styles.busyToast} role="status"><Loader2 size={16} className="animate-spin" />{uploadProgress || busy}</div>}
  </section>;
}
