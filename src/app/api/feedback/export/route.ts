import { NextRequest, NextResponse } from "next/server";
import { getSessionUser } from "@/lib/auth-session";
import { friendlyModelName } from "@/config/models";
import {
  FEEDBACK_REASONS,
  feedbackSummary,
  listFeedbackForExport,
  type FeedbackExportRow,
} from "@/lib/generation-feedback";

const REASON_LABEL: Record<string, string> = Object.fromEntries(
  FEEDBACK_REASONS.map((r) => [r.id, r.label])
);

/**
 * Render the export as one block of text meant to be pasted straight into a
 * model with "here is what our users rated badly — what should we change?".
 *
 * Deliberately prose-with-structure rather than raw JSON: the failure counts
 * lead, because that is the part that decides what to fix, and each case
 * carries the exact request that produced it so a fix can be reasoned about
 * without opening the app.
 */
function toBriefing(
  rows: FeedbackExportRow[],
  summary: Awaited<ReturnType<typeof feedbackSummary>>,
  windowLabel: string
): string {
  const lines: string[] = [];
  const { up, down } = summary.totals;
  const total = up + down;

  lines.push("# Athar — generation feedback");
  lines.push("");
  lines.push(
    `Window: ${windowLabel}. ${total} rated — ${up} good, ${down} not good` +
      (total ? ` (${Math.round((down / total) * 100)}% negative).` : ".")
  );
  lines.push("");
  lines.push(
    "Each case below is a generation the person who made it marked as not good,",
    "with the reasons they gave and the exact request that produced it.",
    "The prompt shown is the final prompt sent to the image/video model, after",
    "the app's own composition (style tokens, identity text, framing).",
    ""
  );

  if (summary.byReason.length > 0) {
    lines.push("## What is going wrong, by count");
    lines.push("");
    for (const r of summary.byReason) {
      lines.push(`- ${REASON_LABEL[r.reason] ?? r.reason}: ${r.n}`);
    }
    lines.push("");
  }

  if (summary.byModel.length > 0) {
    lines.push("## By model");
    lines.push("");
    for (const m of summary.byModel) {
      lines.push(
        `- ${friendlyModelName(m.model_endpoint)}: ${m.up} good, ${m.down} not good`
      );
    }
    lines.push("");
  }

  lines.push("## Cases");
  lines.push("");
  rows.forEach((r, i) => {
    const verdict = r.rating === 1 ? "GOOD" : "NOT GOOD";
    lines.push(`### ${i + 1}. ${verdict} — ${r.mode} · ${friendlyModelName(r.model_endpoint)} · ${r.tier}`);
    if (r.rating === -1 && r.reasons.length > 0) {
      lines.push(
        `Reasons: ${r.reasons.map((x) => REASON_LABEL[x] ?? x).join(", ")}`
      );
    }
    if (r.note.trim()) lines.push(`They said: ${r.note.trim()}`);
    lines.push(
      `Settings: ${r.aspect}${r.resolution ? ` · ${r.resolution}` : ""} · ${
        r.reference_count
      } reference image(s)${r.client_name ? ` · client ${r.client_name}` : ""}`
    );
    lines.push(`Prompt: ${r.final_prompt}`);
    if (r.negative_prompt?.trim()) {
      lines.push(`Negative: ${r.negative_prompt}`);
    }
    if (r.output_url) lines.push(`Output: ${r.output_url}`);
    lines.push("");
  });

  if (rows.length === 0) {
    lines.push("_Nothing rated in this window yet._");
  }

  return lines.join("\n");
}

/**
 * The feedback dump. `format=text` (the default) returns the briefing above
 * ready to paste; `format=json` returns the rows for anything else.
 */
export async function GET(req: NextRequest) {
  try {
    const user = await getSessionUser();
    if (!user?.id) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }
    // The whole team's ratings — management data, not personal data.
    if (user.role !== "admin") {
      return NextResponse.json(
        { error: "Admin access required" },
        { status: 403 }
      );
    }

    const qs = req.nextUrl.searchParams;
    const days = Math.max(0, Math.min(Number(qs.get("days") ?? 0) || 0, 3650));
    const ratingParam = qs.get("rating");
    const rating =
      ratingParam === "up" ? 1 : ratingParam === "down" ? -1 : null;

    const [rows, summary] = await Promise.all([
      listFeedbackForExport({ days, rating, limit: 500 }),
      feedbackSummary(days),
    ]);

    if (qs.get("format") === "json") {
      return NextResponse.json({ summary, rows });
    }

    const windowLabel = days === 0 ? "all time" : `last ${days} days`;
    return new NextResponse(toBriefing(rows, summary, windowLabel), {
      headers: {
        "Content-Type": "text/plain; charset=utf-8",
        "Cache-Control": "no-store",
      },
    });
  } catch (err) {
    const message = err instanceof Error ? err.message : "Export failed";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
