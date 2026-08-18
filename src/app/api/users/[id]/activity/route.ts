import { NextRequest, NextResponse } from "next/server";
import { getSessionUser } from "@/lib/auth-session";
import { db } from "@/lib/db";

type Params = { params: Promise<{ id: string }> };

const UUID_RE =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

/** Video modes. `upscale` and anything else counts as a still. */
const VIDEO_MODES = ["t2v", "i2v", "v2v"];

const PAGE_SIZE = 60;

/**
 * Everything one member has done, in detail.
 *
 * Admins can read anyone; everyone else can read only themselves. Generation
 * rows are the source of truth for output, the audit log for the destructive
 * actions that leave no generation behind (deletes, shares, role changes).
 */
export async function GET(req: NextRequest, { params }: Params) {
  try {
    const sessionUser = await getSessionUser();
    if (!sessionUser?.id) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const { id } = await params;
    if (!UUID_RE.test(id)) {
      return NextResponse.json({ error: "Invalid id" }, { status: 400 });
    }
    if (sessionUser.role !== "admin" && sessionUser.id !== id) {
      return NextResponse.json(
        { error: "You can only view your own activity" },
        { status: 403 }
      );
    }

    const qs = req.nextUrl.searchParams;
    // 0 means "all time" — the window is applied as a nullable interval so a
    // single query shape covers both.
    const days = Math.max(0, Math.min(Number(qs.get("days") ?? 30) || 0, 3650));
    const kind = qs.get("kind") === "video" ? "video" : qs.get("kind") === "image" ? "image" : "all";
    const offset = Math.max(0, Number(qs.get("offset") ?? 0) || 0);

    const pool = db();

    const { rows: userRows } = await pool.query(
      `select id, email, name, role, team, active, created_at, last_login_at,
              onboarded_at
       from public.users where id = $1`,
      [id]
    );
    const user = userRows[0];
    if (!user) {
      return NextResponse.json({ error: "Member not found" }, { status: 404 });
    }

    // Shared predicate for every aggregate below: this member, not deleted,
    // inside the window, matching the still/clip filter.
    const scope = `
      g.user_id = $1
      and g.deleted_at is null
      and ($2::int = 0 or g.created_at > now() - ($2::int * interval '1 day'))
      and ($3::text = 'all'
           or ($3::text = 'video' and g.mode = any($4::text[]))
           or ($3::text = 'image' and not (g.mode = any($4::text[]))))
    `;
    const scopeArgs = [id, days, kind, VIDEO_MODES];

    const [summary, byMode, byModel, byClient, byDay, page, storyboards, audit] =
      await Promise.all([
        pool.query(
          `select
             count(*)::int as total,
             coalesce(sum(g.cost), 0)::float as cost,
             count(*) filter (where g.mode = any($4::text[]))::int as videos,
             count(*) filter (where not (g.mode = any($4::text[])))::int as images,
             count(*) filter (where g.is_favorite)::int as favourites,
             count(*) filter (where g.status = 'failed')::int as failed,
             avg(g.render_ms)::float as avg_render_ms,
             count(distinct g.created_at::date)::int as active_days,
             min(g.created_at) as first_at,
             max(g.created_at) as last_at
           from generations g where ${scope}`,
          scopeArgs
        ),
        pool.query(
          `select g.mode as label, count(*)::int as count,
                  coalesce(sum(g.cost), 0)::float as cost
           from generations g where ${scope}
           group by 1 order by count desc`,
          scopeArgs
        ),
        pool.query(
          `select g.model_endpoint as label, count(*)::int as count,
                  coalesce(sum(g.cost), 0)::float as cost
           from generations g where ${scope}
           group by 1 order by count desc limit 10`,
          scopeArgs
        ),
        pool.query(
          `select coalesce(c.name, 'Unfiled') as label, count(*)::int as count,
                  coalesce(sum(g.cost), 0)::float as cost
           from generations g
           left join projects p on p.id = g.project_id
           left join clients c on c.id = p.client_id
           where ${scope}
           group by 1 order by count desc limit 10`,
          scopeArgs
        ),
        pool.query(
          `select to_char(g.created_at::date, 'YYYY-MM-DD') as day,
                  count(*)::int as count,
                  coalesce(sum(g.cost), 0)::float as cost
           from generations g where ${scope}
           group by 1 order by 1`,
          scopeArgs
        ),
        // One row past the page so the client knows whether to offer "more".
        pool.query(
          `select g.*, p.name as project_name, c.name as client_name
           from generations g
           left join projects p on p.id = g.project_id
           left join clients c on c.id = p.client_id
           where ${scope}
           order by g.created_at desc
           limit ${PAGE_SIZE + 1} offset $5`,
          [...scopeArgs, offset]
        ),
        pool
          .query(
            `select s.id, s.title, s.created_at,
                    count(f.id)::int as frame_count
             from storyboards s
             left join storyboard_frames f on f.storyboard_id = s.id
             where s.created_by = $1
             group by s.id
             order by s.updated_at desc limit 20`,
            [id]
          )
          // Tolerate the table not existing yet on an un-migrated database.
          .catch(() => ({ rows: [] })),
        pool
          .query(
            `select id, action, subject_type, subject_id, meta, created_at
             from audit_log
             where user_id = $1
               and ($2::int = 0 or created_at > now() - ($2::int * interval '1 day'))
             order by created_at desc limit 40`,
            [id, days]
          )
          .catch(() => ({ rows: [] })),
      ]);

    const rows = page.rows;
    const hasMore = rows.length > PAGE_SIZE;

    return NextResponse.json({
      user,
      summary: summary.rows[0],
      byMode: byMode.rows,
      byModel: byModel.rows,
      byClient: byClient.rows,
      byDay: byDay.rows,
      storyboards: storyboards.rows,
      audit: audit.rows,
      generations: hasMore ? rows.slice(0, PAGE_SIZE) : rows,
      hasMore,
      pageSize: PAGE_SIZE,
    });
  } catch (err) {
    const message = err instanceof Error ? err.message : "Query failed";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
