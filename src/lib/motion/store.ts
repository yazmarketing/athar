import "server-only";
import { referenceCompositions, motionPreviewTimes } from "./reference";
import { after } from "next/server";
import path from "node:path";
import { createHash, randomUUID } from "node:crypto";
import { mkdir, readFile, writeFile, rename, readdir, stat, statfs, unlink } from "node:fs/promises";
import { synthesizeSoundtrack } from "./sound";
import { validateScene } from "./schema";
import { encodePreview, sampleRenderedFrames, decodeSourceFrame } from "./media";
import type { MotionProject, NativeSnapshot } from "./schema";

export function motionEnabled() { return process.env.ATHAR_MOTION_LOCAL === "1" || process.env.NODE_ENV === "development"; }
export function userRoot(user: string) { return path.join(process.cwd(), ".athar", "motion", createHash("sha256").update(user).digest("hex").slice(0, 24)); }
export function projectRoot(user: string, id: string) { if (!/^[0-9a-f-]{36}$/.test(id)) throw new Error("Invalid project id"); return path.join(userRoot(user), "projects", id); }
export async function atomicJson(file: string, value: unknown) { await mkdir(path.dirname(file), { recursive: true }); const tmp = `${file}.${randomUUID()}.tmp`; await writeFile(tmp, JSON.stringify(value), { mode: 0o600 }); await rename(tmp, file); }
export async function jsonFile<T>(file: string): Promise<T | null> { try { return JSON.parse(await readFile(file, "utf8")) as T; } catch (e) { if ((e as NodeJS.ErrnoException).code === "ENOENT") return null; throw e; } }
export async function saveProject(user: string, project: MotionProject) { project.updatedAt = new Date().toISOString(); await atomicJson(path.join(projectRoot(user, project.id), "project.json"), project); return project; }
export async function bridgeStatus(user: string) {
  const snapshot = await jsonFile<NativeSnapshot>(path.join(userRoot(user), "heartbeat.json"));
  return { connected: !!snapshot && Date.now() - snapshot.updatedAt < 15000, snapshot };
}
export async function createProject(user: string, name: string, mode: "create" | "edit") {
  const p: MotionProject = { id: randomUUID(), name: name.trim().slice(0, 160) || "Untitled motion", mode, createdAt: new Date().toISOString(), updatedAt: new Date().toISOString(), assets: [], scene: null, revisions: [], brief: "", status: "idle", error: null, commandId: null, baseComp: null };
  return saveProject(user, p);
}
export async function getProject(user: string, id: string) {
  const dir = projectRoot(user, id); const p = await jsonFile<MotionProject>(path.join(dir, "project.json"));
  if (!p) throw new Error("Project not found");
  if (p.commandId && ["queued", "working"].includes(p.status)) {
    const out = path.join(dir, "runs", p.commandId);
    const result = await jsonFile<{ ok: boolean; error?: string; compId?: number; previewError?: string }>(path.join(out, "result.json"));
    if (result?.ok && p.commandKind === "inspect") {
      const report = await jsonFile<{version:number;comp:NonNullable<NativeSnapshot["activeComp"]>;compositions:unknown[];frames:{time:number}[];truncated:boolean;coverage?:{properties:number;unreadableProperties?:number}}>(path.join(out,"study.json"));
      if (!report || ![1,2].includes(report.version) || report.comp?.id !== result.compId || !Number.isFinite(report.comp?.duration) || report.comp.duration<=0 || !Array.isArray(report.comp.layers) || !Array.isArray(report.compositions) || !Array.isArray(report.frames) || report.frames.length !== 12 || report.frames.some(f=>!Number.isFinite(f.time)||f.time<0||f.time>=report.comp.duration)) {
        p.status="failed";p.error="After Effects returned an incomplete source study. Capture the source again.";await saveProject(user,p);return p;
      }
      const frames=report.frames.map((f,i)=>({file:`runs/${p.commandId}/source-${i}.png`,time:f.time}));
      try {
        for(let i=0;i<frames.length;i++)if(!await exists(path.join(dir,frames[i].file)) && await exists(path.join(out,`source-${i}.mov`))){await decodeSourceFrame(path.join(out,`source-${i}.mov`),path.join(dir,frames[i].file));await unlink(path.join(out,`source-${i}.mov`));}
      }catch{p.status="failed";p.error="The native source frames could not be decoded. Capture the source again.";await saveProject(user,p);return p;}
      // Native PNG writes can finish after result.json. Keep waiting rather than
      // claiming Astra has a visual reference before those images exist.
      if (!(await Promise.all(frames.map(f=>exists(path.join(dir,f.file))))).every(Boolean)) {
        p.status="working";
        if(Date.now()-(p.commandAt??0)>300000){p.status="failed";p.error="Source frames did not finish writing. Study the source again.";}
        await saveProject(user,p);return p;
      }
      if((p.referenceComp ?? p.baseComp)?.id !== report.comp.id) {
        p.scene=null;p.revisions=[];p.frames=undefined;p.review=undefined;p.nativeCompId=undefined;p.nativeProject=undefined;p.preview=undefined;p.movie=undefined;p.master=undefined;
      }
      const {id:compId,name,width,height,duration,fps,layers}=report.comp;
      const captured={id:compId,name,width,height,duration,fps,layers:layers.map(({index,name,type,text,enabled})=>({index,name,type,text,enabled}))};
      if(p.pendingSourceUse === "reference" || p.referenceComp){p.referenceComp=captured;p.baseComp=null;p.mode="create";}else{p.baseComp=captured;p.mode="edit";}
      p.pendingSourceUse=undefined;p.referenceTreatment=undefined;
      p.sourceStudy={compId,capturedAt:new Date().toISOString(),report:`runs/${p.commandId}/study.json`,frames,compositionCount:report.compositions.length,truncated:report.truncated,capturedProperties:report.coverage?.properties,unreadableProperties:report.coverage?.unreadableProperties};
      p.status=p.nativeCompId?"complete":p.scene?"ready":"idle";p.error=null;p.designJob=undefined;
      await saveProject(user,p);return p;
    }
    if (result) {
      p.status = result.ok ? "complete" : "failed"; p.error = result.error ?? null;
      if(result.ok && result.previewError)p.error="Your editable composition was built, but its preview render failed. Render the video or inspect the composition in After Effects.";
      if (result.ok) {
        if(p.commandKind === "build")p.frameTimes=(await jsonFile<number[]>(path.join(out,"preview-times.json"))) ?? undefined;
        p.nativeCompId = result.compId;
        if (await exists(path.join(out, "project.aep"))) p.nativeProject = `runs/${p.commandId}/project.aep`;
        if(p.commandKind === "build")try{for(let i=0;i<6;i++){const destination=path.join(out,i===5?"poster.png":`frame-${i}.png`);if(!await exists(destination) && await exists(path.join(out,`preview-${i}.mov`))){await decodeSourceFrame(path.join(out,`preview-${i}.mov`),destination);await unlink(path.join(out,`preview-${i}.mov`));}}}
        catch{p.error="Your editable composition was built, but preview frames could not be decoded. Render the video to review it.";}
        if ((await Promise.all(Array.from({length:5},(_,i)=>exists(path.join(out,`frame-${i}.png`))))).every(Boolean)) p.frames = Array.from({length:5},(_,i)=>`runs/${p.commandId}/frame-${i}.png`);
        if (await exists(path.join(out, "poster.png"))) p.preview = `runs/${p.commandId}/poster.png`;
        if (await exists(path.join(out, "output.mov"))) {
          p.master = `runs/${p.commandId}/output.mov`;
          if (await exists(path.join(out,"output.mp4"))) p.movie = `runs/${p.commandId}/output.mp4`;
          else {
            p.status = "encoding";
            const commandId = p.commandId;
            after(async () => {
              let error: string | null = null, movieReady=false, framesReady=false;
              try { await encodePreview(path.join(out,"output.mov"),path.join(out,"output.mp4"));movieReady=true; }
              catch { error = "The native render completed, but web preview encoding failed. Download the master video."; }
              if(movieReady)try{await sampleRenderedFrames(path.join(out,"output.mp4"),out,p.scene!.duration);framesReady=true;}catch{error="Your video is ready. Review-frame extraction failed; play the video to inspect this render.";}
              await locked(user,id,async () => { const latest = await jsonFile<MotionProject>(path.join(dir,"project.json")); if (!latest || latest.commandId !== commandId) return; latest.status="complete"; latest.error=error; if(movieReady)latest.movie=`runs/${commandId}/output.mp4`;latest.frameTimes=undefined;latest.frames=framesReady?Array.from({length:5},(_,i)=>`runs/${commandId}/frame-${i}.png`):undefined;latest.review=undefined; await saveProject(user,latest); });
            });
          }
        }
      }
      await saveProject(user, p);
    } else if (await exists(path.join(out, "started.json"))) { p.status = "working"; }
    else if (Date.now() - (p.commandAt ?? 0) > 120000) { p.status = "failed"; p.error = "After Effects did not pick up the command. Reconnect the bridge before trying again."; await saveProject(user, p); }
  }
  // After Effects can flush saveFrameToPng outputs after its script returns. Reconcile
  // completed builds on later polls instead of permanently losing late preview files.
  if(p.status === "complete" && p.commandKind === "build" && p.commandId && (!p.preview || !p.frames)) {
    const out=path.join(dir,"runs",p.commandId);let changed=false;
    if(!p.preview && await exists(path.join(out,"poster.png"))){p.preview=`runs/${p.commandId}/poster.png`;changed=true;}
    if(!p.frames && (await Promise.all(Array.from({length:5},(_,i)=>exists(path.join(out,`frame-${i}.png`))))).every(Boolean)){p.frames=Array.from({length:5},(_,i)=>`runs/${p.commandId}/frame-${i}.png`);changed=true;}
    if(changed)await saveProject(user,p);
  }
  if (p.status === "encoding" && Date.now()-new Date(p.updatedAt).getTime()>900000) { p.status="complete";p.error="Preview encoding was interrupted. Your native master is available to download.";await saveProject(user,p); }
  if (p.status === "working" && Date.now()-(p.commandAt ?? 0)>5400000) { p.status="failed";p.error="No completion received from After Effects for 90 minutes. Check the render queue in After Effects before retrying.";await saveProject(user,p); }
  if (p.status === "designing" && p.designJob && p.designJob.nextCheckAt <= Date.now() && (p.designJob.leaseUntil ?? 0) <= Date.now()) {
    after(async () => { const { advanceDesign } = await import("./designer"); await advanceDesign(user, id); });
  }
  if (p.status === "designing" && !p.designJob && Date.now() - new Date(p.updatedAt).getTime() > 300000) { p.status = "failed"; p.error = "Astra's request was interrupted. Please retry the direction."; await saveProject(user, p); }
  if (p.status === "failed" && !p.designJob && p.error === "The operation was aborted due to timeout") {
    p.error = "This revision hit the old request time limit. Your previous animation and assets are safe. Please enter the revision again; new requests now save your direction and run in the background.";
  }
  return p;
}
export async function listProjects(user: string) {
  const root = path.join(userRoot(user), "projects"); await mkdir(root, { recursive: true });
  const names = (await readdir(root)).filter(n => /^[0-9a-f-]{36}$/.test(n));
  const results = await Promise.all(names.map(async id => { try { return await locked(user,id,()=>getProject(user,id)); } catch { return jsonFile<MotionProject>(path.join(projectRoot(user,id),"project.json")); } }));
  return results.filter((p): p is MotionProject => !!p).sort((a,b) => b.updatedAt.localeCompare(a.updatedAt));
}
export async function exists(file: string) { try { return (await stat(file)).isFile(); } catch { return false; } }
const state = globalThis as typeof globalThis & { atharMotionQueues?: Map<string, Promise<void>> };
export async function locked<T>(user: string, id: string, fn: () => Promise<T>) {
  const queues = state.atharMotionQueues ??= new Map(); const key = `${user}:${id}`;
  const previous = queues.get(key) ?? Promise.resolve(); let release!: () => void;
  const current = new Promise<void>(resolve => { release = resolve; });
  queues.set(key,current); await previous;
  try { return await fn(); } finally { release(); if(queues.get(key)===current) queues.delete(key); }
}
export function assertIdle(p: MotionProject) { if (["queued", "working", "designing", "encoding"].includes(p.status)) throw new Error("Wait for the current operation to finish"); }
export async function requireRenderSpace(user:string,width:number,height:number,frames:number) {
  const disk=await statfs(userRoot(user));
  const required=Math.max(5*1024**3,width*height*4*frames+3*1024**3);
  if(disk.bavail*disk.bsize<required)throw Error(`Free at least ${(required/1024**3).toFixed(1)} GB on this Mac before rendering. Native previews and lossless video need temporary disk space; your design is saved.`);
}
export async function queueSourceStudy(user: string, p: MotionProject, active: boolean, use: "edit" | "reference" = p.referenceComp ? "reference" : "edit") {
  const bridge=await bridgeStatus(user);
  if(!bridge.connected)throw Error("Connect After Effects before studying the source");
  if((bridge.snapshot?.capabilities??1)<6)throw Error("Prepare the updated bridge and run it again to capture source colours, effects, timing and frames.");
  const source=active?bridge.snapshot?.activeComp:(p.referenceComp ?? p.baseComp);
  if(!source)throw Error("Open a source composition in After Effects first");
  await requireRenderSpace(user,source.width,source.height,12);
  // Selecting another source starts its own workspace; retain every previous
  // revision and native output under the original project.
  if((p.referenceComp ?? p.baseComp) && ((p.referenceComp ?? p.baseComp)!.id !== source.id || (use === "reference") !== !!p.referenceComp) || use === "reference" && !!p.scene && !p.referenceComp)p=await createProject(user,source.name,use === "reference" ? "create" : "edit");
  const id=randomUUID(),out=path.join(projectRoot(user,p.id),"runs",id);await mkdir(out,{recursive:true});
  p.pendingSourceUse=use;
  p.status="queued";p.error=null;p.commandKind="inspect";p.commandId=id;p.commandAt=Date.now();
  await saveProject(user,p);
  try{await atomicJson(path.join(userRoot(user),"inbox",`${id}.json`),{id,kind:"inspect",compId:source.id,createdAt:Date.now(),outputDir:out});}
  catch(e){p.status="failed";p.error="Could not queue the source study. Try again.";await saveProject(user,p);throw e;}
  return p;
}
export async function queueNative(user: string, p: MotionProject, kind: "build" | "render") {
  const bridge = await bridgeStatus(user);
  if (!bridge.connected) throw new Error("Connect the After Effects bridge first");
  if (!p.scene) throw new Error("Create a design first");
  const report=p.sourceStudy ? await jsonFile<unknown>(path.join(projectRoot(user,p.id),p.sourceStudy.report)) : null;
  const referenceComps=referenceCompositions(report);
  p.scene = validateScene(p.scene,p.assets,p.baseComp,referenceComps);
  if(p.scene.nativeModules?.length && (bridge.snapshot?.capabilities ?? 1)<6)throw Error("Prepare the updated bridge to reuse native reference compositions.");
  if(p.scene.layers.some(l=>l.masks?.some(m=>m.space === "layer-box")) && (bridge.snapshot?.capabilities??1)<6)throw Error("Prepare the updated bridge for shape-mask coordinates.");
  const advanced = p.scene.precompositions || p.scene.camera || p.scene.motionBlur || p.scene.soundtrack || p.scene.beats || p.scene.layers.some(l => l.threeD || l.vector || l.trim || l.stroke || l.masks || l.repeat || l.parentId || l.type === "null" || l.effects.some(e=>e.animation) || Object.values(l.animation).some(keys => keys.some(k=>k.influenceIn || k.influenceOut)));
  if (p.scene.precompositions?.length && (bridge.snapshot?.capabilities ?? 1) < 3) throw Error("Prepare the updated bridge and run it again to build grouped compositions.");
  if (advanced && (bridge.snapshot?.capabilities ?? 1) < 2) throw Error("Prepare the updated bridge and run it again in After Effects to enable the new motion tools.");
  if (kind === "render" && !p.nativeCompId) throw new Error("Build this revision in After Effects before rendering");
  await requireRenderSpace(user,p.scene.width,p.scene.height,kind === "render" ? Math.ceil(p.scene.duration*p.scene.fps) : 6);
  const commandId = randomUUID(); const out = path.join(projectRoot(user, p.id), "runs", commandId);
  await mkdir(out, { recursive: true });
  const soundtrack = p.scene.soundtrack ? path.join(out,"soundtrack.wav") : undefined;
  if (soundtrack) await writeFile(soundtrack,synthesizeSoundtrack(p.scene.duration,p.scene.soundtrack!));
  const command = { referenceComps, previewTimes:motionPreviewTimes(p.scene), soundtrack, id: commandId, kind, createdAt: Date.now(), outputDir: out, scene: p.scene, baseComp: p.baseComp, compId: p.nativeCompId ?? null, assets: p.assets.map(a => ({ ...a, path: path.join(projectRoot(user, p.id), "assets", a.filename) })) };
  p.review = undefined;
  if(kind === "build") { p.movie = undefined; p.master = undefined; p.frames = undefined; p.review = undefined; }
  p.status = "queued"; p.commandId = commandId; p.commandKind = kind; p.commandAt = Date.now(); p.error = null;
  await saveProject(user, p);
  try { await atomicJson(path.join(userRoot(user), "inbox", `${commandId}.json`), command); } catch(e) { p.status="failed"; p.error="Could not queue the After Effects command. Retry."; await saveProject(user,p); throw e; }
  return p;
}
