import { NextRequest, NextResponse } from "next/server";
import { requireAdmin } from "@/lib/authz";
import { logAudit } from "@/lib/audit";
import { deleteTtsVoice } from "@/lib/tts";

type Params = { params: Promise<{ id: string }> };

/** Removes it from Athar's "My Voices" only — Munsit keeps the clone. */
export async function DELETE(_req: NextRequest, { params }: Params) {
  try {
    const auth = await requireAdmin();
    if (auth.response) return auth.response;
    const { id } = await params;

    await deleteTtsVoice(id);
    await logAudit({
      userId: auth.user.id,
      userEmail: auth.user.email,
      action: "tts.voice.delete",
      subjectType: "tts_voice",
      subjectId: id,
    });
    return NextResponse.json({ ok: true });
  } catch (err) {
    const message = err instanceof Error ? err.message : "Delete failed";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
