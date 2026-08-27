import { NextRequest, NextResponse } from "next/server";
import { getSessionUser } from "@/lib/auth-session";
import { listRecentJobs } from "@/lib/jobs";

export async function GET(req: NextRequest) {
  try {
    const sessionUser = await getSessionUser();
    if (!sessionUser?.id) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const limit = Number(req.nextUrl.searchParams.get("limit") ?? 10);
    const jobs = await listRecentJobs(sessionUser.id, Number.isFinite(limit) ? limit : 10);
    return NextResponse.json({ jobs });
  } catch (err) {
    const message = err instanceof Error ? err.message : "Query failed";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
