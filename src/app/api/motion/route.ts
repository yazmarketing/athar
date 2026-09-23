import { createIdentStudy } from "@/lib/motion/starter";
import { NextResponse } from "next/server";
import { readdir } from "node:fs/promises";
import { motionAuth, motionError } from "@/lib/motion/http";
import { bridgeStatus, createProject, listProjects } from "@/lib/motion/store";
import { openaiConfigured } from "@/lib/openai-server";
export const runtime = "nodejs";
export async function GET(req: Request) {
  const auth = await motionAuth(req); if (auth.response) return auth.response;
  try {
    const applications = await readdir("/Applications").catch(() => [] as string[]);
    const bridge = await bridgeStatus(auth.user.id);
    return NextResponse.json({ projects: await listProjects(auth.user.id), bridge, astraConfigured: openaiConfigured(), afterEffectsDetected: applications.some(n => /after effects/i.test(n)), local: true });
  } catch(e) { return motionError(e); }
}
export async function POST(req: Request) {
  const auth = await motionAuth(req); if (auth.response) return auth.response;
  try { const b = await req.json(); if (typeof b.name !== "string" || !["create", "edit"].includes(b.mode)) throw new Error("Choose a name and workflow"); return NextResponse.json({ project: b.starter === "athar-ident" ? await createIdentStudy(auth.user.id) : await createProject(auth.user.id, b.name, b.mode) }, { status: 201 }); } catch(e) { return motionError(e); }
}
