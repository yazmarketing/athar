import { NextResponse } from "next/server";
import { deleteAsset } from "@/lib/director/media";
import { directorError, directorUser } from "@/lib/director/http";
export const runtime = "nodejs";
export async function DELETE(_req: Request, context: { params: Promise<{ id: string; assetId: string }> }) {
  try { const user = await directorUser(true); const { id, assetId } = await context.params; return NextResponse.json({ project: await deleteAsset(id, user.id, assetId) }); }
  catch (e) { return directorError(e); }
}
