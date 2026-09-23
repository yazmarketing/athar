import { randomUUID } from "node:crypto";
import { spawn } from "node:child_process";
import { join } from "node:path";
import { assertIdle, DirectorError, getProject, readRecord, requireOwner, withRecord } from "./store";
import { directorConfigured } from "./planner";

export async function startDirectorRun(id: string, ownerId: string, opts: { operation: "plan" | "render"; instruction?: string; render?: boolean }) {
  await getProject(id, ownerId); // also marks an interrupted prior worker honestly
  if (opts.operation === "plan" && !directorConfigured()) throw new DirectorError("Director needs an OpenAI API key. You can still edit scenes and render manually.", 503);
  const runId = randomUUID(); const now = new Date().toISOString();
  await withRecord(id, (record) => {
    requireOwner(record, ownerId); assertIdle(record);
    if (opts.operation === "render" && !record.project.scenes.length) throw new DirectorError("Add scenes or ask Director to plan an edit first");
    record.run = { id: runId, pid: null, startedAt: now, heartbeatAt: now, cancelled: false, operation: opts.operation, instruction: (opts.instruction || "").trim().slice(0, 12000), render: opts.render !== false };
    record.project.status = opts.operation === "plan" ? "planning" : "rendering";
    record.project.stage = opts.operation === "plan" ? "Director is studying the brief" : "Preparing the render";
    record.project.progress = 2; record.project.error = null;
    if (opts.instruction?.trim()) record.project.messages.push({ id: randomUUID(), role: "user", content: opts.instruction.trim().slice(0, 12000), createdAt: now });
  });
  try {
    const child = spawn(process.execPath, [join(process.cwd(), "scripts", "director-worker.cjs"), id, runId], { cwd: process.cwd(), detached: true, stdio: "ignore", env: process.env });
    await new Promise<void>((resolve, reject) => { child.once("spawn", resolve); child.once("error", reject); });
    await withRecord(id, (record) => { if (record.run?.id === runId) record.run.pid = child.pid ?? null; });
    child.unref();
  } catch {
    await withRecord(id, (record) => { if (record.run?.id === runId) { record.run = null; record.project.status = "failed"; record.project.error = "The production worker could not start on this server."; record.project.stage = "Worker unavailable"; } });
    throw new DirectorError("The production worker could not start on this server", 503);
  }
  return (await readRecord(id)).project;
}
export async function cancelDirectorRun(id: string, ownerId: string) {
  return withRecord(id, (record) => {
    requireOwner(record, ownerId);
    if (record.run) { record.run.cancelled = true; record.project.stage = "Cancelling safely…"; }
    return record.project;
  });
}
