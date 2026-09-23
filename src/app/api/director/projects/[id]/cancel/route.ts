import { NextResponse } from "next/server";
import { cancelDirectorRun } from "@/lib/director/runs";
import { directorError, directorUser, type ProjectContext } from "@/lib/director/http";
export const runtime = "nodejs";
export async function POST(_req: Request, context: ProjectContext) {
  try { const user = await directorUser(true); const { id } = await context.params; return NextResponse.json({ project: await cancelDirectorRun(id, user.id) }); }
  catch (e) { return directorError(e); }
}
