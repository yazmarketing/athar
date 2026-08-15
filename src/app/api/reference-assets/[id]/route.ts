import { NextRequest, NextResponse } from "next/server";
import { getSessionUser } from "@/lib/auth-session";
import { requireCreator } from "@/lib/authz";
import {
  addReferenceVersion,
  archiveReferenceAsset,
  renameReferenceAsset,
} from "@/lib/reference-assets";

type Params = { params: Promise<{ id: string }> };

const UUID_RE =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

/** Rename a reference. */
export async function PATCH(req: NextRequest, { params }: Params) {
  try {
    const sessionUser = await getSessionUser();
    if (!sessionUser?.id) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }
    const { id } = await params;
    if (!UUID_RE.test(id)) {
      return NextResponse.json({ error: "Invalid id" }, { status: 400 });
    }
    const body = (await req.json()) as { name?: string };
    if (!body.name?.trim()) {
      return NextResponse.json({ error: "Name is required" }, { status: 400 });
    }
    const reference = await renameReferenceAsset(id, body.name);
    if (!reference) {
      return NextResponse.json({ error: "Not found" }, { status: 404 });
    }
    return NextResponse.json({ reference });
  } catch (err) {
    const message = err instanceof Error ? err.message : "Rename failed";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}

/** Archive (soft-delete) a reference. */
export async function DELETE(_req: NextRequest, { params }: Params) {
  try {
    // Destructive — viewers are read-only.
    const { response: authError } = await requireCreator();
    if (authError) return authError;
    const { id } = await params;
    if (!UUID_RE.test(id)) {
      return NextResponse.json({ error: "Invalid id" }, { status: 400 });
    }
    await archiveReferenceAsset(id);
    return NextResponse.json({ ok: true });
  } catch (err) {
    const message = err instanceof Error ? err.message : "Archive failed";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}

/** Add a new version — supersedes the current one (e.g. "Gold Tin v2"). */
export async function POST(req: NextRequest, { params }: Params) {
  try {
    const sessionUser = await getSessionUser();
    if (!sessionUser?.id) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }
    const { id } = await params;
    if (!UUID_RE.test(id)) {
      return NextResponse.json({ error: "Invalid id" }, { status: 400 });
    }
    const body = (await req.json()) as { url?: string; notes?: string };
    if (!body.url?.trim()) {
      return NextResponse.json(
        { error: "New reference image is required" },
        { status: 400 }
      );
    }
    const reference = await addReferenceVersion(id, body.url, body.notes);
    return NextResponse.json({ reference });
  } catch (err) {
    const message = err instanceof Error ? err.message : "Version failed";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
