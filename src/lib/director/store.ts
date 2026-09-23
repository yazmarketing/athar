import { randomUUID } from "node:crypto";
import { mkdir, readFile, readdir, rename, rm, stat, utimes, writeFile } from "node:fs/promises";
import { join } from "node:path";
import { DIRECTOR_DEFAULTS, type DirectorProject, type DirectorScene, type DirectorSettings } from "../director-types";

export class DirectorError extends Error {
  constructor(message: string, public status = 400) { super(message); }
}
export const MAX_ASSETS = 50;
export const MAX_UPLOAD_BYTES = 100 * 1024 * 1024;
export const MAX_SECONDS = 90;
export const MAX_SCENES = 24;
const ID = /^[a-f0-9]{8}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{12}$/i;
export function assertId(id: string) { if (!ID.test(id)) throw new DirectorError("Project or asset not found", 404); }
export function rootPath() { return process.env.ATHAR_DIRECTOR_ROOT || join(process.cwd(), ".athar", "director"); }
export function projectPath(id: string) { assertId(id); return join(rootPath(), id); }
export type StoredFile = { filename: string; thumbnail?: string; mime: string };
export type DirectorRun = { id: string; pid: number | null; startedAt: string; heartbeatAt: string; cancelled: boolean; operation: "plan" | "render"; instruction: string; render: boolean };
export type StoredProject = { ownerId: string; project: DirectorProject; files: Record<string, StoredFile>; exportFiles: Record<string, StoredFile>; run: DirectorRun | null };
const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

export async function withRecord<T>(id: string, action: (record: StoredProject) => Promise<T> | T): Promise<T> {
  const dir = projectPath(id);
  const lock = join(dir, ".lock");
  const deadline = Date.now() + 12_000;
  while (true) {
    try { await mkdir(lock); break; }
    catch (error) {
      const code = (error as NodeJS.ErrnoException).code;
      if (code === "ENOENT") throw new DirectorError("Project not found", 404);
      if (code !== "EEXIST") throw error;
      const age = await stat(lock).then((s) => Date.now() - s.mtimeMs).catch(() => 0);
      if (age > 60_000) { await rm(lock, { recursive: true, force: true }); continue; }
      if (Date.now() > deadline) throw new DirectorError("Project is busy. Try again in a moment.", 409);
      await sleep(35);
    }
  }
  const heartbeat = setInterval(() => { const now = new Date(); void utimes(lock, now, now).catch(() => undefined); }, 10_000);
  try {
    const record = await readRecord(id);
    const result = await action(record);
    record.project.updatedAt = new Date().toISOString();
    await writeRecord(record);
    return result;
  } finally { clearInterval(heartbeat); await rm(lock, { recursive: true, force: true }); }
}

export async function readRecord(id: string): Promise<StoredProject> {
  try { return JSON.parse(await readFile(join(projectPath(id), "project.json"), "utf8")) as StoredProject; }
  catch (error) { if ((error as NodeJS.ErrnoException).code === "ENOENT") throw new DirectorError("Project not found", 404); throw error; }
}
async function writeRecord(record: StoredProject) {
  const dir = projectPath(record.project.id);
  const tmp = join(dir, `.project-${randomUUID()}.tmp`);
  await writeFile(tmp, JSON.stringify(record), { mode: 0o600 });
  await rename(tmp, join(dir, "project.json"));
}
export function requireOwner(record: StoredProject, ownerId: string) { if (record.ownerId !== ownerId) throw new DirectorError("Project not found", 404); }
export function assertIdle(record: StoredProject) { if (record.run) throw new DirectorError("Wait for this run to finish, or cancel it before editing.", 409); }
function alive(pid: number) { try { process.kill(pid, 0); return true; } catch { return false; } }
export async function recoverProject(id: string) {
  const current = await readRecord(id);
  if (!current.run) return current;
  const run = current.run;
  if (run.pid ? alive(run.pid) : Date.now() - Date.parse(run.startedAt) < 30_000) return current;
  return withRecord(id, (record) => {
    if (record.run?.id === run.id) {
      record.run = null;
      record.project.status = "failed";
      record.project.stage = "Interrupted";
      record.project.error = "The production worker stopped. Your assets, edit and previous exports are saved. Start a new run to continue.";
    }
    return record;
  });
}
export async function getProject(id: string, ownerId: string) {
  const before = await readRecord(id); requireOwner(before, ownerId);
  return (await recoverProject(id)).project;
}
export async function listProjects(ownerId: string) {
  await mkdir(rootPath(), { recursive: true, mode: 0o700 });
  const names = await readdir(rootPath());
  const projects: DirectorProject[] = [];
  for (const name of names.filter((x) => ID.test(x))) {
    const record = await readRecord(name).catch(() => null);
    if (record?.ownerId === ownerId) projects.push((await recoverProject(name)).project);
  }
  return projects.sort((a, b) => b.updatedAt.localeCompare(a.updatedAt));
}
function short(value: unknown, fallback: string, max: number) { return typeof value === "string" ? value.trim().slice(0, max) : fallback; }
export function validateSettings(input: unknown, previous: DirectorSettings = DIRECTOR_DEFAULTS): DirectorSettings {
  if (input === undefined) return { ...previous };
  if (!input || typeof input !== "object" || Array.isArray(input)) throw new DirectorError("Invalid video settings");
  const x = input as Partial<DirectorSettings>;
  const duration = Number(x.duration ?? previous.duration);
  if (!Number.isFinite(duration) || duration < 1 || duration > MAX_SECONDS) throw new DirectorError("Duration must be between 1 and 90 seconds");
  const format = x.format ?? previous.format;
  const style = x.style ?? previous.style;
  if (!["9:16", "16:9", "1:1", "4:5"].includes(format)) throw new DirectorError("Unsupported video format");
  if (!["editorial", "cinematic", "kinetic", "minimal"].includes(style)) throw new DirectorError("Unsupported visual style");
  const accent = x.accent ?? previous.accent;
  if (!/^#[0-9a-f]{6}$/i.test(accent)) throw new DirectorError("Accent must be a six-digit hex colour");
  return { format, style, duration, accent, soundtrackLoop: typeof x.soundtrackLoop === "boolean" ? x.soundtrackLoop : previous.soundtrackLoop !== false, language: short(x.language, previous.language, 80), locale: short(x.locale, previous.locale, 120), brandName: short(x.brandName, previous.brandName, 100), culturalNotes: short(x.culturalNotes, previous.culturalNotes, 2000), preserveSourceAudio: typeof x.preserveSourceAudio === "boolean" ? x.preserveSourceAudio : previous.preserveSourceAudio };
}
export function validateScenes(input: unknown, project: DirectorProject): DirectorScene[] {
  if (!Array.isArray(input) || input.length > MAX_SCENES) throw new DirectorError("An edit supports up to 24 scenes");
  let total = 0; const ids = new Set<string>();
  return input.map((raw) => {
    if (!raw || typeof raw !== "object") throw new DirectorError("Invalid scene");
    const s = raw as Partial<DirectorScene>;
    const id = s.id || randomUUID(); assertId(id);
    if (ids.has(id)) throw new DirectorError("Scene IDs must be unique"); ids.add(id);
    const assetId = s.assetId || null;
    const asset = assetId ? project.assets.find((a) => a.id === assetId && a.kind !== "audio") : null;
    if (assetId && !asset) throw new DirectorError("A scene refers to an unavailable visual asset");
    const duration = Number(s.duration); const sourceIn = Number(s.sourceIn ?? 0);
    if (!Number.isFinite(duration) || duration < 0.5 || duration > MAX_SECONDS || !Number.isFinite(sourceIn) || sourceIn < 0) throw new DirectorError("Scene durations must be 0.5–90 seconds, with a valid source start");
    total += duration;
    if (total > MAX_SECONDS + 0.01) throw new DirectorError("The finished video must be 90 seconds or shorter");
    if (asset?.kind === "video" && (sourceIn + duration > asset.duration + 0.12)) throw new DirectorError(`The selected range extends past the end of ${asset.name}`);
    const background = s.background || "#101916";
    if (!/^#[0-9a-f]{6}$/i.test(background)) throw new DirectorError("Scene background must be a hex colour");
    return { id, assetId, sourceIn, duration, title: short(s.title, "", 180), caption: short(s.caption, "", 420), voiceover: short(s.voiceover, "", 1000), note: short(s.note, "", 2000), transition: s.transition === "cut" ? "cut" : "fade", fit: s.fit === "contain" ? "contain" : "cover", locked: s.locked === true, background };
  });
}
export async function createProject(ownerId: string, body: Record<string, unknown>) {
  const id = randomUUID(); const now = new Date().toISOString();
  const project: DirectorProject = { id, title: short(body.title, "Untitled production", 180) || "Untitled production", brief: short(body.brief, "", 12000), kind: body.kind === "event" || body.kind === "motion" ? body.kind : "social", settings: validateSettings(body.settings), assets: [], scenes: [], audioAssetId: null, audioVolume: 0.18, status: "draft", stage: "Ready to direct", progress: 0, error: null, model: null, version: 0, messages: [], checks: [], exports: [], history: [], createdAt: now, updatedAt: now, clientId: short(body.clientId, "", 128) || null, projectId: short(body.projectId, "", 128) || null, brandKitId: short(body.brandKitId, "", 128) || null };
  await mkdir(join(projectPath(id), "assets"), { recursive: true, mode: 0o700 });
  await mkdir(join(projectPath(id), "exports"), { recursive: true, mode: 0o700 });
  await writeRecord({ ownerId, project, files: {}, exportFiles: {}, run: null });
  return project;
}
export function snapshot(project: DirectorProject, label: string) {
  project.version += 1;
  project.history.push({ version: project.version, createdAt: new Date().toISOString(), label, scenes: structuredClone(project.scenes), settings: { ...project.settings } });
  project.history = project.history.slice(-50);
}
export async function patchProject(id: string, ownerId: string, body: Record<string, unknown>) {
  return withRecord(id, (record) => {
    requireOwner(record, ownerId); assertIdle(record); const p = record.project;
    if (body.version !== undefined && (!Number.isInteger(body.version) || body.version !== p.version)) {
      throw new DirectorError("This production has a newer version. Reopen it before applying these changes.", 409);
    }
    if (body.title !== undefined) p.title = short(body.title, p.title, 180) || p.title;
    if (body.brief !== undefined) p.brief = short(body.brief, p.brief, 12000);
    if (body.settings !== undefined) p.settings = validateSettings(body.settings, p.settings);
    if (body.scenes !== undefined) p.scenes = validateScenes(body.scenes, p);
    if (body.audioAssetId !== undefined) {
      const audioId = body.audioAssetId;
      if (audioId !== null && !p.assets.some((a) => a.id === audioId && a.kind === "audio")) throw new DirectorError("Select an uploaded audio track");
      p.audioAssetId = audioId as string | null;
    }
    if (body.audioVolume !== undefined) {
      const volume = Number(body.audioVolume);
      if (!Number.isFinite(volume) || volume < 0 || volume > 1) throw new DirectorError("Soundtrack volume must be between 0 and 1");
      p.audioVolume = volume;
    }
    snapshot(p, "Manual edit"); p.status = "draft"; p.stage = "Edit saved"; p.error = null; p.progress = 0; p.checks = [];
    return p;
  });
}
export function filePath(id: string, filename: string) {
  if (!/^(assets|exports)\/[a-zA-Z0-9._-]+$/.test(filename)) throw new DirectorError("Media not found", 404);
  return join(projectPath(id), filename);
}
