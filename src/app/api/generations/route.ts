import { NextRequest, NextResponse } from "next/server";
import { getSessionUser } from "@/lib/auth-session";
import { db } from "@/lib/db";
import { ensureFeedbackTable } from "@/lib/generation-feedback";
import { ensureLibraryIndex } from "@/lib/generations-store";

const UUID_RE =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

export async function GET(req: NextRequest) {
  try {
    const sessionUser = await getSessionUser();
    if (!sessionUser?.id) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const projectId = req.nextUrl.searchParams.get("projectId");
    if (projectId && !UUID_RE.test(projectId)) {
      return NextResponse.json({ error: "Invalid projectId" }, { status: 400 });
    }
    const clientId = req.nextUrl.searchParams.get("clientId");
    if (clientId && !UUID_RE.test(clientId)) {
      return NextResponse.json({ error: "Invalid clientId" }, { status: 400 });
    }
    const mineOnly = req.nextUrl.searchParams.get("createdBy") === "me";

    // Feedback table is tiny; the expensive work is indexing generations,
    // which must not block this request.
    await ensureFeedbackTable();
    void ensureLibraryIndex().catch((err) => {
      console.error("library index guard failed", err);
    });

    const where: string[] = ["g.deleted_at is null"];
    const values: unknown[] = [];
    if (projectId) {
      values.push(projectId);
      where.push(`g.project_id = $${values.length}`);
    }
    if (clientId) {
      values.push(clientId);
      // Generations have no client column — they inherit it from their
      // project. Unfiled rows (no project) used to vanish whenever a
      // client was selected, which is why a finished video could notify
      // and still leave the Library empty.
      where.push(
        `(g.project_id in (select id from projects where client_id = $${values.length}) or g.project_id is null)`
      );
    }
    if (mineOnly) {
      values.push(sessionUser.id);
      where.push(`g.user_id = $${values.length}`);
    }

    // The viewer's own rating rides along, so the gallery can show the thumb
    // state without a second request per card.
    values.push(sessionUser.id);
    const mine = `$${values.length}`;

    // Sort ids first (index columns only), then load card columns only.
    // `select g.*` pulled every jsonb payload; All-clients (no clientId) was
    // 120 fat rows and timed out at the gateway, so the UI cleared to empty.
    const { rows } = await db().query(
      `with page as (
         select g.id
         from generations g
         ${where.length ? `where ${where.join(" and ")}` : ""}
         order by g.is_favorite desc, g.created_at desc
         limit 120
       )
       select g.id, g.project_id, g.user_id, g.mode, g.preset_id, g.brand_kit_id,
              g.model_endpoint, g.model_version, g.tier, g.final_prompt, g.seed,
              g.reference_urls, g.status, g.output_url, g.cost, g.duration_s,
              g.resolution, g.aspect, g.fps, g.qc_status, g.qc_score,
              g.client_ready, g.is_favorite, g.created_at, g.completed_at,
              g.render_ms, '{}'::jsonb as input_payload, '' as negative_prompt,
              u.name as creator_name, u.email as creator_email,
              f.rating as my_rating, f.reasons as my_reasons, f.note as my_note
       from page
       join generations g on g.id = page.id
       left join public.users u on u.id = g.user_id
       left join public.generation_feedback f
         on f.generation_id = g.id and f.user_id = ${mine}::uuid
       order by g.is_favorite desc, g.created_at desc`,
      values
    );

    return NextResponse.json({ generations: rows });
  } catch (err) {
    const message = err instanceof Error ? err.message : "Query failed";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
