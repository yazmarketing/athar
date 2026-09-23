import { after, NextResponse } from "next/server";
import path from "node:path";
import { randomUUID } from "node:crypto";
import { stat } from "node:fs/promises";
import { createReadStream } from "node:fs";
import { Readable } from "node:stream";
import { referenceCompositions } from "@/lib/motion/reference";
import { validateScene } from "@/lib/motion/schema";
import { motionAuth, motionError } from "@/lib/motion/http";
import { jsonFile, assertIdle, bridgeStatus, getProject, locked, projectRoot, queueNative, queueSourceStudy, saveProject } from "@/lib/motion/store";
import { advanceDesign } from "@/lib/motion/designer";
import { MOTION_RECOVERY_BUDGET } from "@/lib/motion/response";
import { openaiConfigured } from "@/lib/openai-server";
export const runtime = "nodejs";
export const maxDuration = 300;
type Context = { params: Promise<{ id: string }> };
export async function GET(req: Request, ctx: Context) {
  const auth = await motionAuth(req); if (auth.response) return auth.response;
  try {
    const { id } = await ctx.params; const p = await locked(auth.user.id, id, () => getProject(auth.user.id, id));
    const output = new URL(req.url).searchParams.get("output");
    if (output) {
      const sourceFrame=/^source-(?:[0-9]|1[01])$/.test(output);
      const file = sourceFrame ? p.sourceStudy?.frames[Number(output.slice(7))]?.file : output === "master" ? p.master : output === "project" ? p.nativeProject : output === "preview" ? p.preview : output === "movie" ? p.movie : ( /^frame-[0-4]$/.test(output) ? p.frames?.[Number(output.slice(-1))] : p.assets.find(a => a.id === output)?.filename);
      if (!file) throw new Error("Output is not available yet");
      const asset = p.assets.find(a => a.id === output);
      const target = path.join(projectRoot(auth.user.id, id), asset ? "assets" : "", file);
      const size = (await stat(target)).size;
      const headers: Record<string,string> = { "Content-Type": sourceFrame || output === "preview" || /^frame-[0-4]$/.test(output) ? "image/png" : output === "movie" ? "video/mp4" : output === "master" ? "video/quicktime" : asset?.type ?? "application/octet-stream", "Content-Disposition": `${output === "project" || output === "master" || new URL(req.url).searchParams.has("download") ? "attachment" : "inline"}; filename="${output === "project" ? "Athar.aep" : output === "master" ? "Athar.mov" : output === "movie" ? "Athar.mp4" : asset?.filename ?? "preview.png"}"`, "Cache-Control": "private, no-store", "Accept-Ranges":"bytes" };
      let start=0,end=size-1,status=200; const range = req.headers.get("range");
      if(range){const m=/^bytes=(\d*)-(\d*)$/.exec(range);if(!m || (!m[1]&&!m[2]))return new Response(null,{status:416,headers:{"Content-Range":`bytes */${size}`}});start=m[1]?Number(m[1]):Math.max(0,size-Number(m[2]));end=m[1]&&m[2]?Math.min(Number(m[2]),size-1):size-1;if(start>end||start>=size)return new Response(null,{status:416,headers:{"Content-Range":`bytes */${size}`}});status=206;headers["Content-Range"]=`bytes ${start}-${end}/${size}`;}
      headers["Content-Length"]=String(end-start+1);
      return new Response(Readable.toWeb(createReadStream(target,{start,end})) as ReadableStream, {status,headers});
    }
    return NextResponse.json({ project: p, bridge: await bridgeStatus(auth.user.id) });
  } catch(e) { return motionError(e); }
}
export async function POST(req: Request, ctx: Context) {
  const auth = await motionAuth(req); if (auth.response) return auth.response;
  try { const { id } = await ctx.params; const body = await req.json();
    return await locked(auth.user.id, id, async () => {
      const p = await getProject(auth.user.id, id); assertIdle(p);
      const recovering = body.action === "retry-design";
      if (recovering) {
        if (p.status !== "failed" || !p.designJob || !(p.designJob.failureCode === "output_limit" || p.error?.includes("max_output_tokens"))) throw new Error("No interrupted design is available to recover");
        body.action = "design"; body.instruction = p.designJob.instruction; body.settings = p.designJob.settings;
      }
      if (body.action === "inspect" || body.action === "study-source" || body.action === "reference") return NextResponse.json({project:await queueSourceStudy(auth.user.id,p,body.action !== "study-source",body.action === "reference" ? "reference" : p.referenceComp ? "reference" : "edit")},{status:202});
      if (body.action === "restore") {
        if (!Number.isInteger(body.index) || !p.revisions[body.index]) throw new Error("Revision not found");
        p.scene = validateScene(p.revisions[body.index].scene,p.assets,p.baseComp,referenceCompositions(p.sourceStudy ? await jsonFile(path.join(projectRoot(auth.user.id,id),p.sourceStudy.report)) : null)); p.frames = undefined; p.review = undefined; p.brief = p.revisions[body.index].brief; p.status = "ready"; p.error = null; p.designJob = undefined; p.nativeCompId = undefined; p.nativeProject = undefined; p.preview = undefined; p.movie = undefined; p.master = undefined;
        return NextResponse.json({ project: await saveProject(auth.user.id, p) });
      }
      if (body.action === "review" || (recovering && p.designJob?.purpose === "review")) {
        if (!p.scene || !p.frames?.length) throw Error("Build the composition first to review actual rendered frames");
        if (!openaiConfigured()) throw Error("Connect OpenAI to review the design");
        p.status="designing";p.error=null;
        p.designJob={purpose:"review",id:randomUUID(),instruction:p.brief,settings:{width:p.scene.width,height:p.scene.height,duration:p.scene.duration,fps:p.scene.fps},fonts:[],startedAt:Date.now(),nextCheckAt:0};
        await saveProject(auth.user.id,p);after(()=>advanceDesign(auth.user.id,p.id));
        return NextResponse.json({project:p},{status:202});
      }
      if (body.action === "build" || body.action === "render") return NextResponse.json({ project: await queueNative(auth.user.id, p, body.action) }, { status: 202 });
      if (body.action !== "design" || typeof body.instruction !== "string" || !body.instruction.trim() || body.instruction.length > 16000) throw new Error("Describe the motion you want to create or change");
      if (!openaiConfigured()) throw new Error("Configure the OpenAI connection for GPT-6 Astra first");
      if (p.mode === "edit" && !p.baseComp) throw new Error("Read the active composition before directing an edit");
      if ((p.mode === "edit" || p.referenceComp) && (!p.sourceStudy || p.sourceStudy.compId !== (p.referenceComp ?? p.baseComp)?.id)) throw new Error("Study the source style first. Astra needs the original frames, colours and animation timing to follow your direction.");
      const settings = p.baseComp ? { width: p.baseComp.width, height: p.baseComp.height, duration: p.baseComp.duration, fps: p.baseComp.fps } : body.settings;
      if (!settings || !Number.isInteger(settings.width) || !Number.isInteger(settings.height) || settings.width < 64 || settings.height < 64 || settings.width > 7680 || settings.height > 7680 || !Number.isFinite(settings.duration) || settings.duration < 0.1 || settings.duration > 600 || (!p.baseComp && ![24,25,30,50,60].includes(settings.fps))) throw new Error("Use a valid composition size, frame rate and duration (up to 10 minutes)");
      const bridge = await bridgeStatus(auth.user.id);
      p.status = "designing"; p.error = null;
      p.designJob = { phase: recovering ? p.designJob?.phase : p.sourceStudy && !p.referenceTreatment ? "study" : "design", treatment:recovering ? p.designJob?.treatment : p.referenceTreatment, id: randomUUID(), instruction: body.instruction.trim(), settings, fonts: (bridge.snapshot?.fonts ?? []).slice(0, 2000), startedAt: Date.now(), nextCheckAt: 0, ...(recovering ? { maxOutputTokens: MOTION_RECOVERY_BUDGET, recoveryAttempt: 1 } : {}) };
      await saveProject(auth.user.id, p);
      after(() => advanceDesign(auth.user.id, p.id));
      return NextResponse.json({ project: p }, { status: 202 });
    });
  } catch(e) { return motionError(e); }
}
