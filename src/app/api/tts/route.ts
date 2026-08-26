import { NextRequest, NextResponse } from "next/server";
import { getSessionUser } from "@/lib/auth-session";
import { listTtsGenerations } from "@/lib/tts";

export async function GET(req: NextRequest) {
  try {
    const sessionUser = await getSessionUser();
    if (!sessionUser?.id) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }
    const params = req.nextUrl.searchParams;
    const generations = await listTtsGenerations({
      clientId: params.get("clientId"),
      projectId: params.get("projectId"),
      createdBy: params.get("owner") === "mine" ? sessionUser.id : null,
      groupId: params.get("groupId"),
      includeArchived: params.get("archived") === "true",
      limit: Number(params.get("limit")) || undefined,
    });
    return NextResponse.json({ generations });
  } catch (err) {
    const message = err instanceof Error ? err.message : "Query failed";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
