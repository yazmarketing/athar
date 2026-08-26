import { NextRequest, NextResponse } from "next/server";
import { getSessionUser } from "@/lib/auth-session";
import { requireCreator } from "@/lib/authz";
import { resolveDbUserId } from "@/lib/auth-users";
import { favoriteVoice, listFavoriteVoices, unfavoriteVoice } from "@/lib/tts";

export async function GET(req: NextRequest) {
  try {
    const sessionUser = await getSessionUser();
    if (!sessionUser?.id) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }
    const clientId = req.nextUrl.searchParams.get("clientId");
    const favorites = await listFavoriteVoices(clientId);
    return NextResponse.json({ favorites });
  } catch (err) {
    const message = err instanceof Error ? err.message : "Query failed";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}

export async function POST(req: NextRequest) {
  try {
    const auth = await requireCreator();
    if (auth.response) return auth.response;

    const body = (await req.json()) as {
      voiceId?: string;
      voiceName?: string;
      clientId?: string | null;
    };
    if (!body.voiceId || !body.voiceName) {
      return NextResponse.json({ error: "voiceId and voiceName are required" }, { status: 400 });
    }

    const createdBy = await resolveDbUserId(auth.user);
    const favorite = await favoriteVoice({
      voiceId: body.voiceId,
      voiceName: body.voiceName,
      clientId: body.clientId ?? null,
      createdBy,
    });
    return NextResponse.json({ favorite });
  } catch (err) {
    const message = err instanceof Error ? err.message : "Could not save favorite";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}

export async function DELETE(req: NextRequest) {
  try {
    const auth = await requireCreator();
    if (auth.response) return auth.response;

    const voiceId = req.nextUrl.searchParams.get("voiceId");
    const clientId = req.nextUrl.searchParams.get("clientId");
    if (!voiceId) {
      return NextResponse.json({ error: "voiceId is required" }, { status: 400 });
    }
    await unfavoriteVoice(voiceId, clientId);
    return NextResponse.json({ ok: true });
  } catch (err) {
    const message = err instanceof Error ? err.message : "Could not remove favorite";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
