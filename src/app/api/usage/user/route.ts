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
    const ttsFilter = unassigned ? "created_by is null" : "created_by = $1";

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
    let hasTts = true;
    try {
      await pool.query("select 1 from tts_generations limit 1");
    } catch {
      hasTts = false;
    }

    // Each source normalized to the same columns, unioned once and reused —
    // same shape as /api/usage's team-wide version.
    const sources = [
      `select id::text as id, 'generation' as kind, mode as type, model_endpoint,
              cost::float as cost, created_at, final_prompt as title, output_url as thumb, project_id
       from generations where ${genFilter}`,
    ];
    if (hasTranscripts) {
      sources.push(
        `select id::text as id, 'transcript' as kind, 'audio' as type, 'openai:whisper-1' as model_endpoint,
                cost::float as cost, created_at,
                coalesce(nullif(title, ''), 'Untitled transcript') as title,
                null as thumb, project_id
         from transcripts where status = 'ready' and ${trFilter}`
      );
    }
    if (hasTts) {
      sources.push(
        `select id::text as id, 'tts' as kind, 'voice' as type, 'munsit:' || nullif(model, '') as model_endpoint,
                cost::float as cost, created_at,
                coalesce(nullif(title, ''), 'Untitled voice-over') as title,
                null as thumb, project_id
         from tts_generations where status = 'ready' and ${ttsFilter}`
      );
    }
    const COMBINED = sources.join(" union all ");

    const byModelSql = `
      with combined as (${COMBINED})
      select model_endpoint as label, coalesce(sum(cost), 0)::float as cost, count(*)::int as count
      from combined group by model_endpoint order by cost desc
    `;

    const byProjectSql = `
      with combined as (${COMBINED})
      select coalesce(p.name, 'No project') as label,
             coalesce(sum(c.cost), 0)::float as cost, count(*)::int as count
      from combined c
      left join projects p on p.id = c.project_id
      group by 1 order by cost desc
    `;

    // Individually pricier renders float to the top — the ones actually
    // worth asking about, not just the most recent.
    const recentSql = `
      with combined as (${COMBINED})
      select c.id, c.kind, c.type, c.model_endpoint, c.cost, c.created_at, c.title, c.thumb,
             coalesce(p.name, 'No project') as project_name
      from combined c
      left join projects p on p.id = c.project_id
      order by c.cost desc limit 20
    `;

    // Everything this person has made, most recent first — the full audit
    // trail, not just what's expensive.
    const allSql = `
      with combined as (${COMBINED})
      select c.id, c.kind, c.type, c.model_endpoint, c.cost, c.created_at, c.title, c.thumb,
             coalesce(p.name, 'No project') as project_name
      from combined c
      left join projects p on p.id = c.project_id
      order by c.created_at desc limit 300
    `;

    const [byModel, byProject, recent, all] = await Promise.all([
      pool.query(byModelSql, params),
      pool.query(byProjectSql, params),
      pool.query(recentSql, params),
      pool.query(allSql, params),
    ]);

    return NextResponse.json({
      label,
      byModel: byModel.rows,
      byProject: byProject.rows,
      recent: recent.rows,
      all: all.rows,
    });
  } catch (err) {
    const message = err instanceof Error ? err.message : "Query failed";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
