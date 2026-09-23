import { NextRequest, NextResponse } from "next/server";
import { getSessionUser } from "@/lib/auth-session";
import { requireCreator } from "@/lib/authz";
import { addPhoneticEntry, listPhoneticEntries } from "@/lib/tts-phonetics";
import type { TtsPhoneticEntry } from "@/lib/types";

export async function GET(req: NextRequest) {
  try {
    const sessionUser = await getSessionUser();
    if (!sessionUser?.id) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }
    const dialect = req.nextUrl.searchParams.get("dialect") ?? undefined;
    const status = (req.nextUrl.searchParams.get("status") ?? undefined) as
      | TtsPhoneticEntry["status"]
      | undefined;
    const entries = await listPhoneticEntries({ dialect, status });
    return NextResponse.json({ entries });
  } catch (err) {
    const message = err instanceof Error ? err.message : "Query failed";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}

type Body = {
  canonical?: string;
  respelling?: string;
  dialect?: string;
  notes?: string;
  exampleContext?: string;
};

export async function POST(req: NextRequest) {
  try {
    const auth = await requireCreator();
    if (auth.response) return auth.response;

    const body = (await req.json()) as Body;
    const canonical = body.canonical?.trim();
    const respelling = body.respelling?.trim();
    if (!canonical || !respelling) {
      return NextResponse.json(
        { error: "canonical and respelling are required" },
        { status: 400 }
      );
    }

    const entry = await addPhoneticEntry({
      canonical,
      respelling,
      dialect: body.dialect ?? "emirati",
      notes: body.notes ?? null,
      exampleContext: body.exampleContext ?? null,
      source: "manual",
      status: "active",
      createdBy: auth.user.id,
    });
    return NextResponse.json({ entry });
  } catch (err) {
    const message = err instanceof Error ? err.message : "Could not add entry";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
