import { NextRequest, NextResponse } from "next/server";
import { getSessionUser } from "@/lib/auth-session";
import { createStylePreset, listStylePresets } from "@/lib/style-presets";

export async function GET(req: NextRequest) {
  try {
    const sessionUser = await getSessionUser();
    if (!sessionUser?.id) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }
    const clientId = req.nextUrl.searchParams.get("clientId") || null;
    const presets = await listStylePresets(clientId);
    return NextResponse.json({ presets });
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
      positive?: string;
      negative?: string;
      clientId?: string | null;
    };
    if (!body.name?.trim()) {
      return NextResponse.json({ error: "Name is required" }, { status: 400 });
    }
    if (!body.positive?.trim()) {
      return NextResponse.json(
        { error: "Style tokens are required" },
        { status: 400 }
      );
    }
    const preset = await createStylePreset({
      name: body.name,
      positive: body.positive,
      negative: body.negative,
      clientId: body.clientId ?? null,
      createdBy: sessionUser.id,
    });
    return NextResponse.json({ preset });
  } catch (err) {
    const message = err instanceof Error ? err.message : "Create failed";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
