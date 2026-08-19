import { NextRequest, NextResponse } from "next/server";
import { getSessionUser } from "@/lib/auth-session";
import { listStoryboards } from "@/lib/storyboards";

/** Boards for the active client (or all of them). */
export async function GET(req: NextRequest) {
  const sessionUser = await getSessionUser();
  if (!sessionUser?.id) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }
  try {
    const clientId = req.nextUrl.searchParams.get("clientId") || null;
    const storyboards = await listStoryboards(clientId);
    return NextResponse.json({ storyboards });
  } catch (err) {
    const message = err instanceof Error ? err.message : "Query failed";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
