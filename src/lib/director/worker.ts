import { randomUUID } from "node:crypto";
import { join } from "node:path";
import { rm } from "node:fs/promises";
import { planDirector } from "./planner";
import { renderDirector } from "./render";
import { DirectorError, filePath, projectPath, readRecord, rootPath, snapshot, withRecord } from "./store";

export async function runDirectorWorker(id: string, runId: string) {
  const controller = new AbortController();
  const signal = controller.signal;
  const update = async (progress: number, stage: string) => withRecord(id, (record) => {
    if (record.run?.id !== runId || record.run.cancelled) { controller.abort(); throw new Error("Run cancelled"); }
    record.run.heartbeatAt = new Date().toISOString(); record.run.pid = process.pid;
    record.project.progress = Math.round(progress); record.project.stage = stage;
  });
  let polling = false;
  const timer = setInterval(async () => {
    if (polling) return; polling = true;
    try { const record = await readRecord(id); if (record.run?.id !== runId || record.run.cancelled) controller.abort(); }
    catch { controller.abort(); }
    finally { polling = false; }
  }, 750);
  const terminate = () => controller.abort();
  process.once("SIGTERM", terminate); process.once("SIGINT", terminate);
  const outputDir = join(projectPath(id), "exports", `run-${runId}`);
  try {
    await update(4, "Preparing source evidence");
    let record = await readRecord(id); const run = record.run;
    if (!run || run.id !== runId) return;
    if (run.operation === "plan") {
      const result = await planDirector(record.project, run.instruction, signal);
      signal.throwIfAborted();
      await withRecord(id, (current) => {
        if (current.run?.id !== runId || current.run.cancelled) throw new Error("Run cancelled");
        current.project.scenes = result.scenes; current.project.model = result.model;
        snapshot(current.project, run.instruction ? "Director revision" : "Director edit");
        current.project.messages.push({ id: randomUUID(), role: "assistant", content: result.explanation, createdAt: new Date().toISOString() });
        current.project.checks = [{ id: "evidence", label: "Source evidence", status: "pending", detail: "Director used source metadata and representative images. Review the full selected footage; a thumbnail cannot establish everything in a clip." }];
      });
      if (!run.render) {
        await withRecord(id, (current) => { if (current.run?.id === runId) { current.run = null; current.project.status = "draft"; current.project.stage = "Edit ready to review"; current.project.progress = 100; } });
        return;
      }
    }
    await withRecord(id, (current) => { if (current.run?.id !== runId) throw new Error("Run cancelled"); current.project.status = "rendering"; });
    record = await readRecord(id);
    const result = await renderDirector({ project: record.project, outputDir, signal, onProgress: update, assetPath: async (assetId) => {
      const stored = record.files[assetId]; if (!stored) throw new DirectorError("A source asset is unavailable");
      return filePath(id, stored.filename);
    } });
    signal.throwIfAborted();
    // Export files move into the stable owner-scoped media directory only after verification.
    const { rename } = await import("node:fs/promises");
    const exportId = randomUUID(); const filename = `exports/${exportId}.mp4`; const thumbnail = `exports/${exportId}.jpg`;
    await rename(result.filePath, filePath(id, filename)); await rename(result.thumbnailPath, filePath(id, thumbnail));
    await withRecord(id, (current) => {
      if (current.run?.id !== runId || current.run.cancelled) throw new Error("Run cancelled");
      current.exportFiles[exportId] = { filename, thumbnail, mime: "video/mp4" };
      current.project.exports.unshift({ id: exportId, url: `/api/director/projects/${id}/media/${exportId}`, thumbnailUrl: `/api/director/projects/${id}/media/${exportId}?thumbnail=1`, format: current.project.settings.format, width: result.width, height: result.height, duration: result.duration, createdAt: new Date().toISOString(), version: current.project.version });
      current.project.checks = result.checks; current.project.status = "ready"; current.project.progress = 100; current.project.stage = "Export ready for review"; current.project.error = null; current.run = null;
      current.project.messages.push({ id: randomUUID(), role: "assistant", content: "The finished MP4 is ready. Technical export checks passed; creative, factual and typography review remains with your team.", createdAt: new Date().toISOString() });
    });
  } catch (error) {
    const cancelled = signal.aborted;
    const raw = error instanceof Error ? error.message : "Production failed";
    const safe = raw.split(rootPath()).join("[private media]").split(process.cwd()).join("[application]").replace(/sk-[A-Za-z0-9_-]+/g, "[redacted]").slice(0, 1800);
    await withRecord(id, (current) => {
      if (current.run?.id !== runId) return;
      current.run = null; current.project.status = cancelled ? "draft" : "failed"; current.project.stage = cancelled ? "Run cancelled; edit saved" : "Production needs attention"; current.project.error = cancelled ? null : safe;
    }).catch(() => undefined);
  } finally {
    clearInterval(timer); process.off("SIGTERM", terminate); process.off("SIGINT", terminate);
    await rm(outputDir, { recursive: true, force: true }).catch(() => undefined);
  }
}
