import { NextRequest, NextResponse } from "next/server";
import { getSessionUser } from "@/lib/auth-session";
import { createBrandKit, listBrandKits } from "@/lib/brand-kits";

export async function GET(req: NextRequest) {
  try {
    const sessionUser = await getSessionUser();
    if (!sessionUser?.id) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const includeArchived = req.nextUrl.searchParams.get("archived") === "true";
    const clientId = req.nextUrl.searchParams.get("clientId") || null;
    const brandKits = await listBrandKits(includeArchived, clientId);
    return NextResponse.json({ brandKits });
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
      client?: string;
      clientId?: string | null;
      brandTokens?: string;
      negativeAdditions?: string;
      projectId?: string | null;
    };

    const name = body.name?.trim();
    if (!name) {
      return NextResponse.json({ error: "Name is required" }, { status: 400 });
    }
    if (!body.brandTokens?.trim()) {
      return NextResponse.json(
        { error: "Brand look (prompt guidance) is required" },
        { status: 400 }
      );
    }

    const brandKit = await createBrandKit({
      name,
      client: body.client,
      clientId: body.clientId ?? null,
      brandTokens: body.brandTokens,
      negativeAdditions: body.negativeAdditions,
      projectId: body.projectId ?? null,
      createdBy: sessionUser.id,
    });
    return NextResponse.json({ brandKit });
  } catch (err) {
    const message = err instanceof Error ? err.message : "Create failed";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
