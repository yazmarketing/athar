import { NextRequest, NextResponse } from "next/server";
import { getSessionUser } from "@/lib/auth-session";
import { db } from "@/lib/db";
import { openaiConfigured, openaiScoreImages } from "@/lib/openai-server";

export const maxDuration = 60;

const UUID_RE =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

type Body = {
  prompt?: string;
  images?: { id: string; url: string }[];
};

/**
 * Best-of-N auto-score. Rates each candidate with OpenAI vision, writes the
 * score to generations.qc_score (0–1), and returns the ranking + winner.
 * Soft-fails (200, scored:false) when no vision model / quota is available, so
 * the batch still shows unscored rather than erroring the whole generation.
 */
export async function POST(req: NextRequest) {
  try {
    const sessionUser = await getSessionUser();
    if (!sessionUser?.id) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    if (!openaiConfigured()) {
      return NextResponse.json({
        scored: false,
        reason: "No OpenAI model configured for scoring.",
        ranking: [],
      });
    }

    const body = (await req.json()) as Body;
    const images = (body.images ?? []).filter(
      (im) => im?.id && UUID_RE.test(im.id) && im.url
    );
    if (images.length === 0) {
      return NextResponse.json({ error: "No images to score" }, { status: 400 });
    }

    let scores;
    try {
      scores = await openaiScoreImages({
        prompt: body.prompt ?? "",
        imageUrls: images.map((im) => im.url),
      });
    } catch (err) {
      // Quota / model / vision failure → soft-fail so the batch still shows.
      const reason = err instanceof Error ? err.message : "Scoring failed";
      return NextResponse.json({ scored: false, reason, ranking: [] });
    }

    // Map scores back to generation ids and persist to qc_score (0–1).
    const ranking = scores
      .filter((s) => s.index >= 0 && s.index < images.length)
      .map((s) => ({
        id: images[s.index].id,
        score: s.score,
        reason: s.reason,
      }))
      .sort((a, b) => b.score - a.score);

    await Promise.all(
      ranking.map((r) =>
        db().query(
          `update generations set qc_score = $2 where id = $1`,
          [r.id, r.score / 100]
        )
      )
    );

    return NextResponse.json({
      scored: true,
      bestId: ranking[0]?.id ?? null,
      ranking,
    });
  } catch (err) {
    const message = err instanceof Error ? err.message : "Score failed";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
