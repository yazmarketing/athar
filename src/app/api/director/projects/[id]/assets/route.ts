import { NextResponse } from "next/server";
import { addAsset } from "@/lib/director/media";
import { DirectorError, getProject, MAX_UPLOAD_BYTES } from "@/lib/director/store";
import { directorError, directorUser, type ProjectContext } from "@/lib/director/http";
export const runtime = "nodejs";
export const maxDuration = 300;
export async function POST(req: Request, context: ProjectContext) {
  try {
    const user = await directorUser(true); const { id } = await context.params;
    await getProject(id, user.id);
    if (Number(req.headers.get("content-length")) > MAX_UPLOAD_BYTES + 1024 * 1024) throw new DirectorError("Each file must be 100 MB or smaller", 413);
    let form: FormData;
    try { form = await req.formData(); }
    catch { throw new DirectorError("The upload arrived incomplete or could not be read. Please retry the file (maximum 100 MB).", 400); }
    const file = form.get("file");
    if (!(file instanceof File)) throw new DirectorError("Choose a media file to upload");
    return NextResponse.json(await addAsset(id, user.id, file), { status: 201 });
  } catch (e) { return directorError(e); }
}
