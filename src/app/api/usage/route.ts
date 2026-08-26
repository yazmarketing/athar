import { NextRequest, NextResponse } from "next/server";
import { getSessionUser } from "@/lib/auth-session";
import { listAudit } from "@/lib/audit";
import { db } from "@/lib/db";
import { dubaiToday, parseUsageRange } from "@/lib/usage";

/**
 * Internal usage & cost aggregates (spec Phase 9). Read-only — uses the
 * cost saved on every generation. No billing.
 *
 * Optional filters: range=all|month|day, month=YYYY-MM, date=YYYY-MM-DD.
 * Dates are Dubai calendar days, same as the rest of this panel.
 */
export async function GET(req: NextRequest) {
  try {
    const sessionUser = await getSessionUser();
    if (!sessionUser?.id) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const url = req.nextUrl;
    const today = dubaiToday();
    const range = parseUsageRange({
      range: url.searchParams.get("range"),
      month: url.searchParams.get("month"),
      date: url.searchParams.get("date"),
      today,
    });
    const from = range.from;
    const to = range.to;
    const pool = db();

    /**
     * Half-open Dubai-date window. $1/$2 are YYYY-MM-DD or null (all-time).
     * Used on every aggregate so the cards, breakdowns, and chart agree.
     */
    const IN_RANGE = `
      ($1::date is null or (created_at at time zone 'Asia/Dubai')::date >= $1::date)
      and ($2::date is null or (created_at at time zone 'Asia/Dubai')::date < $2::date)
    `;

    const [totals, byMode, byModel, audit] = await Promise.all([
      pool.query(
        `select
           coalesce(sum(cost), 0)::float as total_cost,
           count(*)::int as total_count,
           coalesce(sum(cost) filter (where created_at > now() - interval '30 days'), 0)::float as cost_30d,
           count(*) filter (where created_at > now() - interval '30 days')::int as count_30d
         from generations
         where ${IN_RANGE}`,
        [from, to]
      ),
      pool.query(
        `select mode, coalesce(sum(cost), 0)::float as cost, count(*)::int as count
         from generations
         where ${IN_RANGE}
         group by mode order by cost desc`,
        [from, to]
      ),
      pool.query(
        `select model_endpoint, coalesce(sum(cost), 0)::float as cost, count(*)::int as count
         from generations
         where ${IN_RANGE}
         group by model_endpoint order by cost desc limit 12`,
        [from, to]
      ),
      listAudit(50),
    ]);

    /**
     * Daily activity — one row per day in the chart window, whether or not
     * anything happened on it.
     *
     * All-time still charts the last 30 days (a full history is unreadable).
     * Month and day chart exactly that window, in Dubai dates.
     */
    const chartFrom =
      range.kind === "all"
        ? dubaiTodayOffset(today, -29)
        : (from as string);
    const chartToInclusive =
      range.kind === "all"
        ? today
        : dubaiTodayOffset(to as string, -1);

    const DAILY_SQL = (withTranscripts: boolean) => `
      with days as (
        select generate_series($3::date, $4::date, interval '1 day')::date as day
      ),
      gen as (
        select (created_at at time zone 'Asia/Dubai')::date as day,
               coalesce(sum(cost), 0)::float as cost,
               count(*)::int as count
        from generations
        where ${IN_RANGE}
        group by 1
      )${
        withTranscripts
          ? `,
      tr as (
        select (created_at at time zone 'Asia/Dubai')::date as day,
               count(*)::int as count,
               coalesce(sum(duration_s), 0)::float as seconds
        from transcripts
        where status = 'ready' and ${IN_RANGE}
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
      byDay = (await pool.query(DAILY_SQL(true), [from, to, chartFrom, chartToInclusive]))
        .rows;
    } catch {
      byDay = (await pool.query(DAILY_SQL(false), [from, to, chartFrom, chartToInclusive]))
        .rows;
    }

    let byUser: unknown[] = [];
    try {
      const res = await pool.query(
        `select coalesce(u.email, 'unassigned') as label,
                coalesce(sum(g.cost), 0)::float as cost, count(*)::int as count
         from generations g
         left join users u on u.id = g.user_id
         where ($1::date is null or (g.created_at at time zone 'Asia/Dubai')::date >= $1::date)
           and ($2::date is null or (g.created_at at time zone 'Asia/Dubai')::date < $2::date)
         group by 1 order by cost desc limit 12`,
        [from, to]
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
         where ($1::date is null or (g.created_at at time zone 'Asia/Dubai')::date >= $1::date)
           and ($2::date is null or (g.created_at at time zone 'Asia/Dubai')::date < $2::date)
         group by 1 order by cost desc limit 12`,
        [from, to]
      );
      byProject = res.rows;
    } catch {
      /* projects table missing */
    }

    let transcription: Record<string, number> | null = null;
    try {
      const res = await pool.query(
        `select count(*)::int as count,
                coalesce(sum(duration_s), 0)::float as audio_seconds,
                coalesce(sum(render_ms), 0)::float as compute_ms,
                count(*) filter (where created_at > now() - interval '30 days')::int as count_30d,
                coalesce(sum(duration_s) filter (where created_at > now() - interval '30 days'), 0)::float as audio_seconds_30d
         from transcripts
         where status = 'ready' and ${IN_RANGE}`,
        [from, to]
      );
      transcription = res.rows[0] ?? null;
    } catch {
      /* transcripts table missing */
    }

    return NextResponse.json({
      range: { ...range, today },
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

/** Shift a YYYY-MM-DD by `days` without a timezone surprise. */
function dubaiTodayOffset(day: string, days: number): string {
  const d = new Date(`${day}T00:00:00Z`);
  d.setUTCDate(d.getUTCDate() + days);
  return d.toISOString().slice(0, 10);
}
