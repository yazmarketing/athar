import { NextRequest, NextResponse } from "next/server";
import { requireCreator } from "@/lib/authz";
import { analyzeReferenceStyle } from "@/lib/reference-style";
import { getStoryboard, updateStoryboard } from "@/lib/storyboards";

export const maxDuration = 60;

type Params = { params: Promise<{ id: string }> };

const UUID_RE =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

/**
 * Look at the board's attached references and write down what they are —
 * the style contract every frame render carries. Idempotent: analyzing the
 * same set of references again just refreshes the contract.
 */
export async function POST(_req: NextRequest, { params }: Params) {
  try {
    // Spends AI credits — viewers must not be able to trigger it.
    const auth = await requireCreator();
    if (auth.response) return auth.response;

    const { id } = await params;
    if (!UUID_RE.test(id)) {
      return NextResponse.json({ error: "Invalid id" }, { status: 400 });
    }

    const board = await getStoryboard(id);
    if (!board) {
      return NextResponse.json({ error: "Not found" }, { status: 404 });
    }

    const urls = (board.reference_urls ?? []).filter(Boolean);
    if (urls.length === 0) {
      const storyboard = await updateStoryboard(id, { referenceStyle: null });
      return NextResponse.json({ storyboard });
    }

    const fingerprint = await analyzeReferenceStyle(urls);
    const storyboard = await updateStoryboard(id, {
      referenceStyle: fingerprint,
    });
    return NextResponse.json({ storyboard });
  } catch (err) {
    const message =
      err instanceof Error ? err.message : "Style analysis failed";
    return NextResponse.json({ error: message }, { status: 502 });
  }
}
