import { NextResponse } from "next/server";
import { getSessionUser } from "@/lib/auth-session";
import { listAudit } from "@/lib/audit";
import { db } from "@/lib/db";

/**
 * Internal usage & cost aggregates (spec Phase 9). Read-only — uses the
 * cost saved on every generation. No billing.
 */
export async function GET() {
  try {
    const sessionUser = await getSessionUser();
    if (!sessionUser?.id) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const pool = db();

    const [totals, byMode, byModel, byDay, audit] = await Promise.all([
      pool.query(
        `select
           coalesce(sum(cost), 0)::float as total_cost,
           count(*)::int as total_count,
           coalesce(sum(cost) filter (where created_at > now() - interval '30 days'), 0)::float as cost_30d,
           count(*) filter (where created_at > now() - interval '30 days')::int as count_30d
         from generations`
      ),
      pool.query(
        `select mode, coalesce(sum(cost), 0)::float as cost, count(*)::int as count
         from generations group by mode order by cost desc`
      ),
      pool.query(
        `select model_endpoint, coalesce(sum(cost), 0)::float as cost, count(*)::int as count
         from generations group by model_endpoint order by cost desc limit 12`
      ),
      pool.query(
        `select to_char(created_at::date, 'YYYY-MM-DD') as day,
                coalesce(sum(cost), 0)::float as cost, count(*)::int as count
         from generations
         where created_at > now() - interval '30 days'
         group by 1 order by 1`
      ),
      listAudit(50),
    ]);

    // users/projects tables auto-create on first use — tolerate their absence
    let byUser: unknown[] = [];
    try {
      const res = await pool.query(
        `select coalesce(u.email, 'unassigned') as label,
                coalesce(sum(g.cost), 0)::float as cost, count(*)::int as count
         from generations g
         left join users u on u.id = g.user_id
         group by 1 order by cost desc limit 12`
      );
      byUser = res.rows;
    } catch {
      /* users table missing */
    }

    let byProject: unknown[] = [];
    try {
      const res = await pool.query(
        `select coalesce(p.name, 'No project') as label,
                coalesce(sum(g.cost), 0)::float as cost, count(*)::int as count
         from generations g
         left join projects p on p.id = g.project_id
         group by 1 order by cost desc limit 12`
      );
      byProject = res.rows;
    } catch {
      /* projects table missing */
    }

    return NextResponse.json({
      totals: totals.rows[0],
      byMode: byMode.rows,
      byModel: byModel.rows,
      byUser,
      byProject,
      byDay: byDay.rows,
      audit,
    });
  } catch (err) {
    const message = err instanceof Error ? err.message : "Query failed";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
