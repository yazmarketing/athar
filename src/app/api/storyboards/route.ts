import { NextRequest, NextResponse } from "next/server";
import { getSessionUser } from "@/lib/auth-session";
import { requireCreator } from "@/lib/authz";
import { createStoryboard, listStoryboards } from "@/lib/storyboards";

export async function GET(req: NextRequest) {
  try {
    const sessionUser = await getSessionUser();
    if (!sessionUser?.id) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const params = req.nextUrl.searchParams;
    const storyboards = await listStoryboards({
      clientId: params.get("clientId") || null,
      projectId: params.get("projectId") || null,
      includeArchived: params.get("archived") === "true",
    });
    return NextResponse.json({ storyboards });
  } catch (err) {
    const message = err instanceof Error ? err.message : "Query failed";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}

export async function POST(req: NextRequest) {
  try {
    // A board is a working document, not a read — viewers stay read-only.
    const auth = await requireCreator();
    if (auth.response) return auth.response;

    const body = (await req.json()) as {
      title?: string;
      brief?: string;
      clientId?: string | null;
      projectId?: string | null;
      brandKitId?: string | null;
      aspect?: string;
      styleId?: string;
      referenceUrls?: string[];
    };

    const storyboard = await createStoryboard({
      title: body.title ?? "",
      brief: body.brief,
      clientId: body.clientId ?? null,
      projectId: body.projectId ?? null,
      brandKitId: body.brandKitId ?? null,
      aspect: body.aspect,
      styleId: body.styleId,
      referenceUrls: body.referenceUrls,
      createdBy: auth.user.id,
    });
    return NextResponse.json({ storyboard });
  } catch (err) {
    const message = err instanceof Error ? err.message : "Create failed";
    const status = message.includes("required") ? 400 : 500;
    return NextResponse.json({ error: message }, { status });
  }
}
