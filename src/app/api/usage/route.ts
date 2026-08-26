import { NextRequest, NextResponse } from "next/server";
import { requireAdmin } from "@/lib/authz";
import { listAudit } from "@/lib/audit";
import { db } from "@/lib/db";
import { dubaiToday, parseUsageRange } from "@/lib/usage";

/**
 * Internal usage & cost aggregates (spec Phase 9). Read-only — uses the
 * cost saved on every generation. No billing.
 *
 * Optional filters: range=all|month|day, month=YYYY-MM, date=YYYY-MM-DD.
 * Dates are Dubai calendar days, same as the rest of this panel.
 *
 * Admin-only: this is every team member's spend by name, which the UI never
 * shows anyone but an admin — the API has to say no too, not just hide the
 * tab, or anyone signed in could just call it directly.
 */
export async function GET(req: NextRequest) {
  try {
    const auth = await requireAdmin();
    if (auth.response) return auth.response;

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

    // Each self-healing table may not exist yet on a fresh database — one
    // probe per table decides whether it joins the ledger below.
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

    // Every mode's spend in one ledger: 'audio' (transcription) and 'tts'
    // (voice-over generation) join the same rotation as every render mode,
    // rather than sitting off as separate footnotes for whichever provider
    // bills per minute or per character instead of per call.
    const combinedSources = [
      `select mode, model_endpoint, cost, user_id, project_id, created_at from generations`,
    ];
    if (hasTranscripts) {
      combinedSources.push(
        `select 'audio' as mode, 'openai:whisper-1' as model_endpoint, cost,
                created_by as user_id, project_id, created_at
         from transcripts where status = 'ready'`
      );
    }
    if (hasTts) {
      combinedSources.push(
        `select 'tts' as mode, 'munsit:' || nullif(model, '') as model_endpoint, cost,
                created_by as user_id, project_id, created_at
         from tts_generations where status = 'ready'`
      );
    }
    const COMBINED = combinedSources.join(" union all ");

    const TOTALS_SQL = `
      with combined as (${COMBINED})
      select
        coalesce((select sum(cost) from combined where ${IN_RANGE}), 0)::float as total_cost,
        (select count(*) from generations where ${IN_RANGE})::int as total_count,
        coalesce(
          (select sum(cost) from combined where created_at > now() - interval '30 days'), 0
        )::float as cost_30d,
        (select count(*) from generations where created_at > now() - interval '30 days')::int as count_30d
    `;
    const BY_MODE_SQL = `
      with combined as (${COMBINED})
      select mode, coalesce(sum(cost), 0)::float as cost, count(*)::int as count
      from combined where ${IN_RANGE} group by mode order by cost desc
    `;
    const BY_MODEL_SQL = `
      with combined as (${COMBINED})
      select model_endpoint, coalesce(sum(cost), 0)::float as cost, count(*)::int as count
      from combined where ${IN_RANGE} group by model_endpoint order by cost desc limit 12
    `;

    const [totals, byMode, byModel, audit] = await Promise.all([
      pool.query(TOTALS_SQL, [from, to]),
      pool.query(BY_MODE_SQL, [from, to]),
      pool.query(BY_MODEL_SQL, [from, to]),
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
      with combined as (${COMBINED}),
      days as (
        select generate_series($3::date, $4::date, interval '1 day')::date as day
      ),
      gen as (
        select (created_at at time zone 'Asia/Dubai')::date as day,
               coalesce(sum(cost), 0)::float as cost,
               count(*)::int as count
        from combined
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
      byDay = (
        await pool.query(DAILY_SQL(hasTranscripts), [from, to, chartFrom, chartToInclusive])
      ).rows;
    } catch {
      byDay = (
        await pool.query(DAILY_SQL(false), [from, to, chartFrom, chartToInclusive])
      ).rows;
    }

    let byUser: unknown[] = [];
    try {
      const labeledSources = [
        `select g.user_id, coalesce(u.email, 'unassigned') as label, g.cost, g.created_at
         from generations g left join users u on u.id = g.user_id`,
      ];
      if (hasTranscripts) {
        labeledSources.push(
          `select t.created_by as user_id, coalesce(u2.email, 'unassigned') as label, t.cost, t.created_at
           from transcripts t left join users u2 on u2.id = t.created_by
           where t.status = 'ready'`
        );
      }
      if (hasTts) {
        labeledSources.push(
          `select v.created_by as user_id, coalesce(u3.email, 'unassigned') as label, v.cost, v.created_at
           from tts_generations v left join users u3 on u3.id = v.created_by
           where v.status = 'ready'`
        );
      }
      const sql = `
        select user_id, label, coalesce(sum(cost), 0)::float as cost, count(*)::int as count
        from (${labeledSources.join(" union all ")}) combined
        where ${IN_RANGE}
        group by user_id, label order by cost desc limit 12
      `;
      byUser = (await pool.query(sql, [from, to])).rows;
    } catch {
      /* users table missing */
    }

    let byProject: unknown[] = [];
    try {
      const sql = `
        with combined as (${COMBINED})
        select coalesce(p.name, 'No project') as label,
               coalesce(sum(c.cost), 0)::float as cost, count(*)::int as count
        from combined c
        left join projects p on p.id = c.project_id
        where ${IN_RANGE}
        group by 1 order by cost desc limit 12
      `;
      byProject = (await pool.query(sql, [from, to])).rows;
    } catch {
      /* projects table missing */
    }

    // Transcription runs through OpenAI's hosted whisper-1 — billed per
    // minute like everything else here, not self-hosted. `cost` is the
    // estimate; hours and processing time are still useful alongside it.
    let transcription: Record<string, number> | null = null;
    if (hasTranscripts) {
      const res = await pool.query(
        `select count(*)::int as count,
                coalesce(sum(duration_s), 0)::float as audio_seconds,
                coalesce(sum(render_ms), 0)::float as compute_ms,
                coalesce(sum(cost), 0)::float as cost,
                count(*) filter (where created_at > now() - interval '30 days')::int as count_30d,
                coalesce(sum(duration_s) filter (where created_at > now() - interval '30 days'), 0)::float as audio_seconds_30d,
                coalesce(sum(cost) filter (where created_at > now() - interval '30 days'), 0)::float as cost_30d
         from transcripts
         where status = 'ready' and ${IN_RANGE}`,
        [from, to]
      );
      transcription = res.rows[0] ?? null;
    }

    // Voice-overs generated via Munsit — same shape as `transcription`, one
    // detail row behind the totals above.
    let tts: Record<string, number> | null = null;
    if (hasTts) {
      const res = await pool.query(
        `select count(*)::int as count,
                coalesce(sum(duration_s), 0)::float as audio_seconds,
                coalesce(sum(char_count), 0)::float as char_count,
                coalesce(sum(cost), 0)::float as cost,
                count(*) filter (where created_at > now() - interval '30 days')::int as count_30d,
                coalesce(sum(duration_s) filter (where created_at > now() - interval '30 days'), 0)::float as audio_seconds_30d,
                coalesce(sum(cost) filter (where created_at > now() - interval '30 days'), 0)::float as cost_30d
         from tts_generations
         where status = 'ready' and ${IN_RANGE}`,
        [from, to]
      );
      tts = res.rows[0] ?? null;
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
      tts,
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
