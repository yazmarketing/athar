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

    const [totals, byMode, byModel, audit] = await Promise.all([
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
      listAudit(50),
    ]);

    /**
     * Daily activity — one row per day for the last 30 days, whether or not
     * anything happened on it.
     *
     * Two things were wrong with grouping straight off `generations`. Days
     * with no work were simply absent, so ten scattered days rendered as ten
     * adjacent bars and the shape of a month was invisible. And the day
     * boundary was UTC, which put anything made after 4am Dubai time — most
     * of the working day — on the wrong date for a studio that reads every
     * other timestamp in this panel in GST.
     *
     * Transcripts join in here too: it is one usage timeline, not two.
     */
    const DAILY_SQL = (withTranscripts: boolean) => `
      with days as (
        select generate_series(
          (now() at time zone 'Asia/Dubai')::date - interval '29 days',
          (now() at time zone 'Asia/Dubai')::date,
          interval '1 day'
        )::date as day
      ),
      gen as (
        select (created_at at time zone 'Asia/Dubai')::date as day,
               coalesce(sum(cost), 0)::float as cost,
               count(*)::int as count
        from generations
        where created_at > now() - interval '32 days'
        group by 1
      )${
        withTranscripts
          ? `,
      tr as (
        select (created_at at time zone 'Asia/Dubai')::date as day,
               count(*)::int as count,
               coalesce(sum(duration_s), 0)::float as seconds
        from transcripts
        where status = 'ready' and created_at > now() - interval '32 days'
        group by 1
      )`
          : ""
      }
      select to_char(d.day, 'YYYY-MM-DD') as day,
             coalesce(g.cost, 0)::float as cost,
             coalesce(g.count, 0)::int as count,
             ${withTranscripts ? "coalesce(t.count, 0)::int" : "0"} as transcript_count,
             ${withTranscripts ? "coalesce(t.seconds, 0)::float" : "0"} as audio_seconds
      from days d
      left join gen g on g.day = d.day
      ${withTranscripts ? "left join tr t on t.day = d.day" : ""}
      order by d.day
    `;

    let byDay: unknown[] = [];
    try {
      byDay = (await pool.query(DAILY_SQL(true))).rows;
    } catch {
      // No transcripts table yet — the generations half still stands alone.
      byDay = (await pool.query(DAILY_SQL(false))).rows;
    }

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

    // Transcription is self-hosted, so the number that matters is machine
    // time and hours of audio, not spend. Absent on a database that has never
    // run a transcript.
    let transcription: Record<string, number> | null = null;
    try {
      const res = await pool.query(
        `select count(*)::int as count,
                coalesce(sum(duration_s), 0)::float as audio_seconds,
                coalesce(sum(render_ms), 0)::float as compute_ms,
                count(*) filter (where created_at > now() - interval '30 days')::int as count_30d,
                coalesce(sum(duration_s) filter (where created_at > now() - interval '30 days'), 0)::float as audio_seconds_30d
         from transcripts where status = 'ready'`
      );
      transcription = res.rows[0] ?? null;
    } catch {
      /* transcripts table missing */
    }

    return NextResponse.json({
      totals: totals.rows[0],
      byMode: byMode.rows,
      byModel: byModel.rows,
      byUser,
      byProject,
      byDay,
      transcription,
      audit,
    });
  } catch (err) {
    const message = err instanceof Error ? err.message : "Query failed";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
