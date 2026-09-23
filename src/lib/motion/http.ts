import "server-only";
import { NextResponse } from "next/server";
import { requireCreator } from "@/lib/authz";
import { motionEnabled } from "./store";
export async function motionAuth(req: Request) {
  const auth = await requireCreator(); if (auth.response) return auth;
  const url = new URL(req.url);
  if (!motionEnabled() || !["localhost", "127.0.0.1", "[::1]"].includes(url.hostname)) return { response: NextResponse.json({ error: "Native motion design must run in Athar on this computer." }, { status: 503 }) };
  const origin = req.headers.get("origin");
  if (origin && origin !== url.origin) return { response: NextResponse.json({ error: "Invalid origin" }, { status: 403 }) };
  return auth;
}
export function motionError(e: unknown) { return NextResponse.json({ error: e instanceof Error ? e.message : "Motion operation failed" }, { status: 400 }); }
