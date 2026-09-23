import { directorError, serveDirectorMedia } from "@/lib/director/http";
export const runtime = "nodejs";
export const dynamic = "force-dynamic";
type Context = { params: Promise<{ id: string; mediaId: string }> };
export async function GET(req: Request, context: Context) {
  try { const { id, mediaId } = await context.params; return await serveDirectorMedia(req, id, mediaId); }
  catch (e) { return directorError(e); }
}
export async function HEAD(req: Request, context: Context) {
  try { const { id, mediaId } = await context.params; return await serveDirectorMedia(req, id, mediaId, true); }
  catch (e) { return directorError(e); }
}
