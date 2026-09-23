import { randomUUID } from "node:crypto";
import { mkdtemp, readFile, rm } from "node:fs/promises";
import { join } from "node:path";
import { tmpdir } from "node:os";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { createProject, getProject, listProjects, patchProject, readRecord, validateScenes, withRecord } from "../src/lib/director/store";
import { preserveLockedScenes } from "../src/lib/director/planner";
import { addAsset, probeMedia, runFfmpeg } from "../src/lib/director/media";
import { renderDirector } from "../src/lib/director/render";
import type { DirectorScene } from "../src/lib/director-types";
import { cancelDirectorRun, startDirectorRun } from "../src/lib/director/runs";
import sharp from "sharp";

function scene(fields: Partial<DirectorScene> = {}): DirectorScene { return { id: randomUUID(), assetId: null, sourceIn: 0, duration: 1.2, title: "A clear beginning", caption: "", voiceover: "", note: "", transition: "fade", fit: "cover", locked: false, background: "#10211c", ...fields }; }
let dir: string; const oldRoot = process.env.ATHAR_DIRECTOR_ROOT;
beforeEach(async () => { dir = await mkdtemp(join(tmpdir(), "athar-director-test-")); process.env.ATHAR_DIRECTOR_ROOT = dir; });
afterEach(async () => { process.env.ATHAR_DIRECTOR_ROOT = oldRoot; if (!oldRoot) delete process.env.ATHAR_DIRECTOR_ROOT; await rm(dir, { recursive: true, force: true }); });

describe("Director edit persistence and boundaries", () => {
  it("isolates owner access and serializes concurrent writes without losing history", async () => {
    const p = await createProject("owner-a", { title: "Brand reel", brief: "A launch" });
    await expect(getProject(p.id, "owner-b")).rejects.toMatchObject({ status: 404 });
    expect(await listProjects("owner-b")).toHaveLength(0);
    await Promise.all(Array.from({ length: 8 }, (_, i) => withRecord(p.id, (r) => { r.project.messages.push({ id: randomUUID(), role: "user", content: String(i), createdAt: new Date().toISOString() }); })));
    expect((await getProject(p.id, "owner-a")).messages).toHaveLength(8);
    await expect(getProject("../other", "owner-a")).rejects.toMatchObject({ status: 404 });
  });
  it("rejects missing sources, source overruns and excessively long edits", async () => {
    const p = await createProject("a", {});
    const assetId = randomUUID(); p.assets.push({ id: assetId, name: "clip.mp4", kind: "video", url: "private", size: 123, duration: 4, createdAt: "now" });
    expect(() => validateScenes([scene({ assetId, sourceIn: 3, duration: 2 })], p)).toThrow("extends past");
    expect(() => validateScenes([scene({ assetId: randomUUID() })], p)).toThrow("unavailable");
    expect(() => validateScenes([scene({ duration: 70 }), scene({ duration: 30 })], p)).toThrow("90 seconds");
    await expect(patchProject(p.id, "a", { audioVolume: 4 })).rejects.toThrow("between 0 and 1");
  });
  it("restores locked scenes exactly at their positions during a revision", () => {
    const a = scene(); const b = scene({ locked: true, title: "Approved exact wording" }); const c = scene();
    const result = preserveLockedScenes([{ ...b, title: "Changed" }, c, a], [a, b, c]);
    expect(result[1]).toEqual(b); expect(result.filter((s) => s.id === b.id)).toHaveLength(1);
  });
  it("marks an interrupted worker failed without replaying a paid request", async () => {
    const p = await createProject("a", {});
    await withRecord(p.id, (r) => { r.run = { id: randomUUID(), pid: 99999999, startedAt: "2020-01-01", heartbeatAt: "2020-01-01", cancelled: false, operation: "plan", instruction: "", render: true }; r.project.status = "planning"; });
    const recovered = await getProject(p.id, "a"); expect(recovered.status).toBe("failed"); expect(recovered.error).toContain("worker stopped"); expect((await readRecord(p.id)).run).toBeNull();
  });
  it("validates file contents rather than trusting the upload MIME", async () => {
    const p = await createProject("a", {});
    await expect(addAsset(p.id, "a", new File(["not an image"], "image.jpg", { type: "image/jpeg" }))).rejects.toThrow();
    expect((await getProject(p.id, "a")).assets).toHaveLength(0);
  });
});

describe("Director real video assembly", () => {
  it("runs a detached render to completion and rejects a duplicate launch", async () => {
    const p = await createProject("a", { title: "Worker integration" });
    await patchProject(p.id, "a", { scenes: [scene({ title: "Worker proof", duration: 1 })] });
    const first = await startDirectorRun(p.id, "a", { operation: "render" });
    expect(first.status).toBe("rendering");
    await expect(startDirectorRun(p.id, "a", { operation: "render" })).rejects.toMatchObject({ status: 409 });
    const deadline = Date.now() + 30000;
    let project = first;
    while (["rendering", "planning"].includes(project.status) && Date.now() < deadline) {
      await new Promise((r) => setTimeout(r, 200)); project = await getProject(p.id, "a");
    }
    expect(project.error).toBeNull(); expect(project.status).toBe("ready"); expect(project.exports).toHaveLength(1);
    expect(project.exports[0].url).toContain("/api/director/projects/");
  }, 45000);
  it("cancels a queued worker without discarding its saved edit", async () => {
    const p = await createProject("a", {}); await patchProject(p.id, "a", { scenes: [scene({ duration: 10 })] });
    await startDirectorRun(p.id, "a", { operation: "render" }); await cancelDirectorRun(p.id, "a");
    const deadline = Date.now() + 15000; let project = await getProject(p.id, "a");
    while (project.status === "rendering" && Date.now() < deadline) { await new Promise((r) => setTimeout(r, 200)); project = await getProject(p.id, "a"); }
    expect(project.status).toBe("draft"); expect(project.scenes).toHaveLength(1); expect(project.exports).toHaveLength(0);
  }, 20000);
  it("exports Arabic/English, an uploaded image and a source video with soundtrack into a verified 1080p MP4", async () => {
    const p = await createProject("a", { title: "Render verification", settings: { format: "9:16", duration: 3.6, brandName: "YAZ MEDIA" } });
    const image = join(dir, "photo.png"); const video = join(dir, "source.mp4"); const music = join(dir, "music.wav");
    await sharp({ create: { width: 1000, height: 1200, channels: 3, background: "#375b49" } }).png().toFile(image);
    await runFfmpeg(["-y", "-hide_banner", "-loglevel", "error", "-f", "lavfi", "-i", "testsrc2=size=640x360:rate=30", "-f", "lavfi", "-i", "sine=frequency=440:sample_rate=48000", "-t", "2", "-c:v", "libx264", "-threads", "2", "-pix_fmt", "yuv420p", "-c:a", "aac", video]);
    await runFfmpeg(["-y", "-hide_banner", "-loglevel", "error", "-f", "lavfi", "-i", "sine=frequency=220:sample_rate=48000", "-t", "1", music]);
    const imgId = randomUUID(), vidId = randomUUID(), musicId = randomUUID();
    p.assets = [{ id: imgId, kind: "image", name: "Image", url: "", duration: 0, size: 100, createdAt: "now" }, { id: vidId, kind: "video", name: "Video", url: "", duration: 2, size: 100, createdAt: "now" }, { id: musicId, kind: "audio", name: "Track", url: "", duration: 1, size: 100, createdAt: "now" }];
    p.audioAssetId = musicId;
    p.scenes = [scene({ title: "أثر يبقى", caption: "قصة نرويها معاً" }), scene({ assetId: imgId, title: "Made to matter", caption: "Designed with intention." }), scene({ assetId: vidId, title: "In motion", caption: "A source-grounded edit", sourceIn: .2 })];
    const paths = { [imgId]: image, [vidId]: video, [musicId]: music };
    const result = await renderDirector({ project: p, outputDir: join(dir, "render"), assetPath: async (id) => paths[id], onProgress: async () => undefined });
    const probe = await probeMedia(result.filePath);
    expect(probe).toMatchObject({ width: 1080, height: 1920, hasVideo: true, hasAudio: true, codec: "h264" });
    expect(Math.abs(probe.duration - 3.6)).toBeLessThan(.3);
    expect((await readFile(result.filePath)).length).toBeGreaterThan(10000);
    expect(result.checks.find((c) => c.id === "typography")?.status).toBe("pending");
    if (process.env.DIRECTOR_KEEP_TEST_RENDER) {
      const { copyFile, mkdir } = await import("node:fs/promises");
      await mkdir(process.env.DIRECTOR_KEEP_TEST_RENDER, { recursive: true });
      await copyFile(result.filePath, join(process.env.DIRECTOR_KEEP_TEST_RENDER, "director-verification.mp4"));
      await copyFile(result.thumbnailPath, join(process.env.DIRECTOR_KEEP_TEST_RENDER, "director-verification.jpg"));
    }
  }, 180000);
});
