import { NextRequest, NextResponse } from "next/server";
import { getSessionUser } from "@/lib/auth-session";
import { searchTtsGenerations } from "@/lib/tts";

/** "Find the ad VO that mentioned the launch date" — across every generation. */
export async function GET(req: NextRequest) {
  try {
    const sessionUser = await getSessionUser();
    if (!sessionUser?.id) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }
    const q = req.nextUrl.searchParams.get("q") ?? "";
    const hits = await searchTtsGenerations(
      q,
      Number(req.nextUrl.searchParams.get("limit")) || 50
    );
    return NextResponse.json({ hits });
  } catch (err) {
    const message = err instanceof Error ? err.message : "Search failed";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
