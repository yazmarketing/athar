import { NextRequest, NextResponse } from "next/server";
import { requireAdmin } from "@/lib/authz";
import { db } from "@/lib/db";

const UUID_RE =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

/**
 * One person's spend, broken down enough to have the actual conversation:
 * which models, which projects, and the individual renders worth pointing
 * at — "this $4 render, on this project, on this date." The usage panel's
 * "By user" table only names a total; this is what turns that into
 * something an admin can act on.
 *
 * `id` is a user id, or the literal "unassigned" for generations/transcripts
 * with no user on them.
 */
export async function GET(req: NextRequest) {
  try {
    const auth = await requireAdmin();
    if (auth.response) return auth.response;

    const id = req.nextUrl.searchParams.get("id");
    if (!id || (id !== "unassigned" && !UUID_RE.test(id))) {
      return NextResponse.json({ error: "Invalid id" }, { status: 400 });
    }
    const unassigned = id === "unassigned";
    const params = unassigned ? [] : [id];
    const genFilter = unassigned ? "user_id is null" : "user_id = $1";
    const trFilter = unassigned ? "created_by is null" : "created_by = $1";

    const pool = db();

    let label = "unassigned";
    if (!unassigned) {
      const res = await pool.query<{ email: string }>(
        "select email from users where id = $1",
        params
      );
      label = res.rows[0]?.email ?? "Deleted user";
    }

    let hasTranscripts = true;
    try {
      await pool.query("select 1 from transcripts limit 1");
    } catch {
      hasTranscripts = false;
    }

    const byModelSql = hasTranscripts
      ? `select model_endpoint as label, coalesce(sum(cost), 0)::float as cost, count(*)::int as count
         from (
           select model_endpoint, cost from generations where ${genFilter}
           union all
           select 'openai:whisper-1' as model_endpoint, cost from transcripts
           where status = 'ready' and ${trFilter}
         ) combined group by model_endpoint order by cost desc`
      : `select model_endpoint as label, coalesce(sum(cost), 0)::float as cost, count(*)::int as count
         from generations where ${genFilter} group by model_endpoint order by cost desc`;

    const byProjectSql = hasTranscripts
      ? `select coalesce(p.name, 'No project') as label,
                coalesce(sum(c.cost), 0)::float as cost, count(*)::int as count
         from (
           select project_id, cost from generations where ${genFilter}
           union all
           select project_id, cost from transcripts where status = 'ready' and ${trFilter}
         ) c
         left join projects p on p.id = c.project_id
         group by 1 order by cost desc`
      : `select coalesce(p.name, 'No project') as label,
                coalesce(sum(g.cost), 0)::float as cost, count(*)::int as count
         from generations g
         left join projects p on p.id = g.project_id
         where ${genFilter}
         group by 1 order by cost desc`;

    // Individually pricier renders float to the top — the ones actually
    // worth asking about, not just the most recent.
    const recentSql = hasTranscripts
      ? `select c.id, c.kind, c.type, c.model_endpoint, c.cost, c.created_at, c.title, c.thumb,
                coalesce(p.name, 'No project') as project_name
         from (
           select id::text as id, 'generation' as kind, mode as type, model_endpoint,
                  cost::float as cost, created_at, final_prompt as title, output_url as thumb, project_id
           from generations where ${genFilter}
           union all
           select id::text as id, 'transcript' as kind, 'audio' as type, 'openai:whisper-1' as model_endpoint,
                  cost::float as cost, created_at,
                  coalesce(nullif(title, ''), 'Untitled transcript') as title,
                  null as thumb, project_id
           from transcripts where status = 'ready' and ${trFilter}
         ) c
         left join projects p on p.id = c.project_id
         order by c.cost desc limit 20`
      : `select g.id::text as id, 'generation' as kind, g.mode as type, g.model_endpoint,
                g.cost::float as cost, g.created_at, g.final_prompt as title, g.output_url as thumb,
                coalesce(p.name, 'No project') as project_name
         from generations g
         left join projects p on p.id = g.project_id
         where ${genFilter}
         order by g.cost desc limit 20`;

    const [byModel, byProject, recent] = await Promise.all([
      pool.query(byModelSql, params),
      pool.query(byProjectSql, params),
      pool.query(recentSql, params),
    ]);

    return NextResponse.json({
      label,
      byModel: byModel.rows,
      byProject: byProject.rows,
      recent: recent.rows,
    });
  } catch (err) {
    const message = err instanceof Error ? err.message : "Query failed";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
