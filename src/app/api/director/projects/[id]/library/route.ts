import { NextResponse } from "next/server";
import { directorBody, directorError, directorUser, type ProjectContext } from "@/lib/director/http";
import { importLibraryAsset } from "@/lib/director/library-import";

export const runtime = "nodejs";
export const maxDuration = 300;

export async function POST(req: Request, context: ProjectContext) {
  try {
    const user = await directorUser(true); const { id } = await context.params;
    const body = await directorBody(req);
    return NextResponse.json(await importLibraryAsset(id, user.id, body.source, body.sourceId), { status: 201 });
  } catch (error) { return directorError(error); }
}
