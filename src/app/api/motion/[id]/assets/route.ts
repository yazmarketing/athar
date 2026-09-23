import { NextResponse } from "next/server";
import { randomUUID } from "node:crypto";
import { mkdir, writeFile, unlink } from "node:fs/promises";
import path from "node:path";
import { motionAuth, motionError } from "@/lib/motion/http";
import { assertIdle, getProject, locked, projectRoot, saveProject } from "@/lib/motion/store";
import { inspectAsset, normalizeWebp } from "@/lib/motion/media";
export const runtime = "nodejs";
export const maxDuration = 120;
const types: Record<string,string> = { ".png":"image/png", ".jpg":"image/jpeg", ".jpeg":"image/jpeg", ".webp":"image/webp", ".mp4":"video/mp4", ".mov":"video/quicktime", ".wav":"audio/wav", ".mp3":"audio/mpeg" };
export async function POST(req: Request, ctx: { params: Promise<{ id: string }> }) {
  const auth = await motionAuth(req); if (auth.response) return auth.response;
  try { const { id } = await ctx.params; const name = (new URL(req.url).searchParams.get("name") ?? "").slice(0,180); const ext = path.extname(name).toLowerCase();
    if (!types[ext]) throw new Error("Upload PNG, JPEG, WebP, MP4, MOV, WAV or MP3 assets");
    const limit = 80 * 1024 * 1024;
    if (Number(req.headers.get("content-length")) > limit) throw new Error("Each asset must be 80 MB or smaller");
    return await locked(auth.user.id, id, async () => {
      const p = await getProject(auth.user.id, id); assertIdle(p); if (p.assets.length >= 80) throw new Error("Up to 80 assets per project");
      const buffer = Buffer.from(await req.arrayBuffer()); if (!buffer.length || buffer.length > limit) throw new Error("Each asset must be between 1 byte and 80 MB");
      const aid = randomUUID(); let filename = `${aid}${ext}`; const dir = path.join(projectRoot(auth.user.id, id), "assets"); await mkdir(dir, { recursive:true }); await writeFile(path.join(dir,filename), buffer, { mode: 0o600 });
      let metadata;
      try { metadata = await inspectAsset(path.join(dir,filename),types[ext]); } catch(e) { await unlink(path.join(dir,filename)).catch(()=>{}); throw e; }
      if(ext === ".webp") { const png = `${aid}.png`; await normalizeWebp(path.join(dir,filename),path.join(dir,png)); filename=png; }
      p.assets.push({ id: aid, name, filename, type: ext === ".webp" ? "image/png" : types[ext], bytes: buffer.length, ...metadata }); return NextResponse.json({ project: await saveProject(auth.user.id, p) }, { status: 201 });
    });
  } catch(e) { return motionError(e); }
}
