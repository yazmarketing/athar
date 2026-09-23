import { NextResponse } from "next/server";
import { getProject, patchProject } from "@/lib/director/store";
import { directorBody, directorError, directorUser, type ProjectContext } from "@/lib/director/http";
export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export async function GET(_req: Request, context: ProjectContext) {
  try { const user = await directorUser(); const { id } = await context.params; return NextResponse.json({ project: await getProject(id, user.id) }); }
  catch (e) { return directorError(e); }
}
export async function PATCH(req: Request, context: ProjectContext) {
  try { const user = await directorUser(true); const { id } = await context.params; return NextResponse.json({ project: await patchProject(id, user.id, await directorBody(req)) }); }
  catch (e) { return directorError(e); }
}
