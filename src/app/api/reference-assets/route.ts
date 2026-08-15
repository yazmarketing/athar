import { NextRequest, NextResponse } from "next/server";
import { getSessionUser } from "@/lib/auth-session";
import {
  createReferenceAsset,
  listReferenceAssets,
  type ReferenceKind,
} from "@/lib/reference-assets";

const KINDS = ["character", "product", "brand", "style", "reference"];

export async function GET(req: NextRequest) {
  try {
    const sessionUser = await getSessionUser();
    if (!sessionUser?.id) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }
    const clientId = req.nextUrl.searchParams.get("clientId") || null;
    const projectId = req.nextUrl.searchParams.get("projectId") || null;
    const kindParam = req.nextUrl.searchParams.get("kind");
    const kind =
      kindParam && KINDS.includes(kindParam)
        ? (kindParam as ReferenceKind)
        : null;
    const references = await listReferenceAssets({ clientId, kind, projectId });
    return NextResponse.json({ references });
  } catch (err) {
    const message = err instanceof Error ? err.message : "Query failed";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}

export async function POST(req: NextRequest) {
  try {
    const sessionUser = await getSessionUser();
    if (!sessionUser?.id) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }
    const body = (await req.json()) as {
      name?: string;
      url?: string;
      kind?: ReferenceKind;
      clientId?: string | null;
      projectId?: string | null;
      notes?: string;
    };
    if (!body.name?.trim()) {
      return NextResponse.json({ error: "Name is required" }, { status: 400 });
    }
    if (!body.url?.trim()) {
      return NextResponse.json(
        { error: "Reference image is required" },
        { status: 400 }
      );
    }
    const reference = await createReferenceAsset({
      name: body.name,
      url: body.url,
      kind: body.kind,
      clientId: body.clientId ?? null,
      projectId: body.projectId ?? null,
      notes: body.notes,
      createdBy: sessionUser.id,
    });
    return NextResponse.json({ reference });
  } catch (err) {
    const message = err instanceof Error ? err.message : "Create failed";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
