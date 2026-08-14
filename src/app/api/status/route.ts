import { NextResponse } from "next/server";
import { db } from "@/lib/db";

export async function GET() {
  const modelArk = Boolean(process.env.ARK_API_KEY?.trim());
  const spaces = Boolean(
    process.env.DO_SPACES_KEY?.trim() &&
      process.env.DO_SPACES_SECRET?.trim() &&
      process.env.DO_SPACES_BUCKET?.trim()
  );

  let database: "ok" | "error" | "missing" = "missing";
  if (process.env.DATABASE_URL?.trim()) {
    try {
      await db().query("select 1");
      database = "ok";
    } catch {
      database = "error";
    }
  }

  return NextResponse.json({
    modelArk,
    spaces,
    database,
  });
}
