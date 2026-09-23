import { NextResponse } from "next/server";
import { startDirectorRun } from "@/lib/director/runs";
import { directorBody, directorError, directorUser, type ProjectContext } from "@/lib/director/http";
export const runtime = "nodejs";
export async function POST(req: Request, context: ProjectContext) {
  try { const user = await directorUser(true); const { id } = await context.params; const body = await directorBody(req); return NextResponse.json({ project: await startDirectorRun(id, user.id, { operation: "plan", instruction: typeof body.instruction === "string" ? body.instruction : "", render: body.render !== false }) }, { status: 202 }); }
  catch (e) { return directorError(e); }
}
