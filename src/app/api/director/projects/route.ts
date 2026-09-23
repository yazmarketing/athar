import { NextResponse } from "next/server";
import { createProject, listProjects } from "@/lib/director/store";
import { directorBody, directorCapabilities, directorError, directorUser } from "@/lib/director/http";
export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export async function GET() {
  try { const user = await directorUser(); return NextResponse.json({ projects: await listProjects(user.id), capabilities: await directorCapabilities() }); }
  catch (e) { return directorError(e); }
}
export async function POST(req: Request) {
  try { const user = await directorUser(true); return NextResponse.json({ project: await createProject(user.id, await directorBody(req)) }, { status: 201 }); }
  catch (e) { return directorError(e); }
}
