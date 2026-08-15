import { NextRequest, NextResponse } from "next/server";
import { getSessionUser } from "@/lib/auth-session";
import { db } from "@/lib/db";
import { getBrandKit } from "@/lib/brand-kits";
import { openaiBrandCheck, openaiConfigured } from "@/lib/openai-server";

export const maxDuration = 60;

const UUID_RE =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

type Body = {
  generationId?: string;
  imageUrl?: string;
  brandKitId?: string;
};

/**
 * Brand-guideline enforcement. Checks an image against a brand kit's rules and
 * stamps generations.brand_flagged / brand_notes. Soft-fails (200, checked:false)
 * when no vision model / quota is available.
 */
export async function POST(req: NextRequest) {
  try {
    const sessionUser = await getSessionUser();
    if (!sessionUser?.id) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }
    if (!openaiConfigured()) {
      return NextResponse.json({ checked: false, reason: "No OpenAI model" });
    }

    const body = (await req.json()) as Body;
    if (!body.generationId || !UUID_RE.test(body.generationId)) {
      return NextResponse.json({ error: "Invalid generationId" }, { status: 400 });
    }
    if (!body.brandKitId || !UUID_RE.test(body.brandKitId)) {
      return NextResponse.json({ error: "Invalid brandKitId" }, { status: 400 });
    }

    const kit = await getBrandKit(body.brandKitId);
    if (!kit) {
      return NextResponse.json({ error: "Brand kit not found" }, { status: 404 });
    }

    let imageUrl = body.imageUrl?.trim() || null;
    if (!imageUrl) {
      const { rows } = await db().query<{ output_url: string | null }>(
        `select output_url from generations where id = $1`,
        [body.generationId]
      );
      imageUrl = rows[0]?.output_url ?? null;
    }
    if (!imageUrl) {
      return NextResponse.json({ error: "No image to check" }, { status: 400 });
    }

    let result;
    try {
      result = await openaiBrandCheck({
        imageUrl,
        brandLook: kit.brand_tokens,
        bans: kit.negative_additions,
      });
    } catch (err) {
      const reason = err instanceof Error ? err.message : "Check failed";
      return NextResponse.json({ checked: false, reason });
    }

    const flagged = !result.compliant;
    const notes = result.violations.join("; ");
    await db().query(
      `update generations set brand_flagged = $2, brand_notes = $3 where id = $1`,
      [body.generationId, flagged, notes]
    );

    return NextResponse.json({
      checked: true,
      compliant: result.compliant,
      violations: result.violations,
    });
  } catch (err) {
    const message = err instanceof Error ? err.message : "Brand check failed";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
