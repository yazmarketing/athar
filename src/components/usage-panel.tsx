"use client";

import { useEffect, useState } from "react";
import {
  ChevronRight,
  ClipboardCopy,
  Download,
  Loader2,
  MessageSquare,
  RefreshCw,
  ShieldAlert,
} from "lucide-react";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { toast } from "sonner";
import { cn } from "@/lib/utils";
import { friendlyModelName } from "@/config/models";
import {
  barHeight,
  dubaiToday,
  formatMetric,
  shortDate,
  summariseDays,
  type DailyMetric,
  type DayRow,
  type UsageRangeKind,
} from "@/lib/usage";

type UsageRow = {
  label?: string;
  mode?: string;
  model_endpoint?: string;
  /** Present on byUser rows — null means unassigned. */
  user_id?: string | null;
  cost: number;
  count: number;
};
type AuditRow = {
  id: string;
  user_email: string | null;
  action: string;
  subject_type: string;
  subject_id: string | null;
  meta: Record<string, unknown>;
  created_at: string;
};

type UsageData = {
  range?: {
    kind: UsageRangeKind;
    from: string | null;
    to: string | null;
    today: string;
  };
  totals: {
    total_cost: number;
    total_count: number;
    cost_30d: number;
    count_30d: number;
  };
  byMode: UsageRow[];
  byModel: UsageRow[];
  byUser: UsageRow[];
  byProject: UsageRow[];
  byDay: DayRow[];
  /** Null until the first transcription has been run. */
  transcription: {
    count: number;
    audio_seconds: number;
    compute_ms: number;
    cost: number;
    count_30d: number;
    audio_seconds_30d: number;
    cost_30d: number;
  } | null;
  /** Null until the first voice-over has been generated. */
  tts: {
    count: number;
    audio_seconds: number;
    char_count: number;
    cost: number;
    count_30d: number;
    audio_seconds_30d: number;
    cost_30d: number;
  } | null;
  audit: AuditRow[];
};

function usd(v: number) {
  return `$${v.toFixed(2)}`;
}

/** "N renders + N transcripts + N voice-overs" — only the parts that apply. */
function generationCountHint(
  data: UsageData,
  key: "count" | "count_30d"
): string | undefined {
  const parts = [`${data.totals[key === "count" ? "total_count" : "count_30d"]} renders`];
  const transcriptCount = data.transcription?.[key];
  const ttsCount = data.tts?.[key];
  if (transcriptCount) parts.push(`${transcriptCount} transcripts`);
  if (ttsCount) parts.push(`${ttsCount} voice-overs`);
  return parts.length > 1 ? parts.join(" + ") : undefined;
}

/** Map raw audit action codes to plain-English verbs. */
const AUDIT_VERBS: Record<string, string> = {
  generation_delete: "deleted",
  asset_create: "added to the asset library",
  asset_delete: "removed from the asset library",
  job_retry: "retried the render for",
  user_update: "updated the account",
  qc_pass: "passed QC on",
  qc_revise: "sent back for revision",
  qc_reject: "rejected",
  client_ready: "marked client-ready",
};

/** Friendly nouns for the thing acted on. */
const AUDIT_SUBJECTS: Record<string, string> = {
  generation: "image",
  video: "video",
  asset: "asset",
  user: "user",
  job: "render",
};

function describeAudit(a: AuditRow): { who: string; what: string } {
  const who = a.user_email ?? "Someone";
  const verb = AUDIT_VERBS[a.action] ?? a.action.replace(/_/g, " ");
  const noun = AUDIT_SUBJECTS[a.subject_type] ?? a.subject_type;
  const ref = a.subject_id ? ` ${a.subject_id.slice(0, 8)}…` : "";
  return { who, what: `${verb} ${noun}${ref}`.trim() };
}

/** Format an ISO timestamp in Dubai time (GST, GMT+4). */
function dubaiTime(iso: string): string {
  return (
    new Intl.DateTimeFormat("en-GB", {
      timeZone: "Asia/Dubai",
      day: "2-digit",
      month: "short",
      year: "numeric",
      hour: "2-digit",
      minute: "2-digit",
      hour12: false,
    }).format(new Date(iso)) + " GST"
  );
}

/** Internal spend dashboard (spec Phase 9) — cost saved per generation. */
export function UsagePanel({
  onOpenItem,
}: {
  /** Opens a generation/transcript/voice-over elsewhere in the app. */
  onOpenItem?: (item: { kind: "generation" | "transcript" | "tts"; id: string }) => void;
} = {}) {
  const [data, setData] = useState<UsageData | null>(null);
  const [loading, setLoading] = useState(false);
  const [rangeKind, setRangeKind] = useState<UsageRangeKind>("all");
  const [month, setMonth] = useState(() => dubaiToday().slice(0, 7));
  const [date, setDate] = useState(() => dubaiToday());
  const [auditFrom, setAuditFrom] = useState("");
  const [auditTo, setAuditTo] = useState("");
  const [exporting, setExporting] = useState(false);
  const [feedbackDays, setFeedbackDays] = useState(30);
  const [feedbackScope, setFeedbackScope] = useState<"down" | "all" | "up">(
    "down"
  );
  const [feedbackBusy, setFeedbackBusy] = useState(false);
  const [feedbackPreview, setFeedbackPreview] = useState("");
  // A user id (or the "unassigned" bucket) whose drill-down is open — see
  // UserAuditDialog. Null closes it.
  const [userDrillId, setUserDrillId] = useState<string | null>(null);

  async function fetchFeedback(): Promise<string> {
    const params = new URLSearchParams({ days: String(feedbackDays) });
    if (feedbackScope !== "all") params.set("rating", feedbackScope);
    const res = await fetch(`/api/feedback/export?${params.toString()}`);
    if (!res.ok) {
      const json = await res.json().catch(() => ({}));
      throw new Error(json.error ?? "Export failed");
    }
    return res.text();
  }

  async function copyFeedback() {
    setFeedbackBusy(true);
    try {
      const text = await fetchFeedback();
      setFeedbackPreview(text);
      await navigator.clipboard.writeText(text);
      toast.success("Copied — paste it straight into an AI");
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Export failed");
    } finally {
      setFeedbackBusy(false);
    }
  }

  async function downloadFeedback() {
    setFeedbackBusy(true);
    try {
      const text = await fetchFeedback();
      setFeedbackPreview(text);
      const url = URL.createObjectURL(
        new Blob([text], { type: "text/markdown" })
      );
      const a = document.createElement("a");
      a.href = url;
      a.download = `athar-feedback-${feedbackScope}-${feedbackDays || "all"}d.md`;
      document.body.appendChild(a);
      a.click();
      a.remove();
      URL.revokeObjectURL(url);
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Export failed");
    } finally {
      setFeedbackBusy(false);
    }
  }

  async function exportAudit() {
    setExporting(true);
    try {
      const params = new URLSearchParams();
      if (auditFrom) params.set("from", new Date(auditFrom).toISOString());
      if (auditTo) {
        // Include the whole "to" day.
        const end = new Date(auditTo);
        end.setHours(23, 59, 59, 999);
        params.set("to", end.toISOString());
      }
      const res = await fetch(`/api/audit?${params.toString()}`);
      const json = await res.json();
      if (!res.ok) throw new Error(json.error ?? "Export failed");
      const rows = json.audit as AuditRow[];
      const esc = (v: string) => `"${String(v).replace(/"/g, '""')}"`;
      const header = "Time (GST),User,Action,Type,Subject ID\n";
      const body = rows
        .map((a) =>
          [
            esc(dubaiTime(a.created_at)),
            esc(a.user_email ?? ""),
            esc(a.action),
            esc(a.subject_type),
            esc(a.subject_id ?? ""),
          ].join(",")
        )
        .join("\n");
      const blob = new Blob([header + body], { type: "text/csv" });
      const url = URL.createObjectURL(blob);
      const a = document.createElement("a");
      a.href = url;
      a.download = `athar-audit-${auditFrom || "all"}_${auditTo || "now"}.csv`;
      document.body.appendChild(a);
      a.click();
      a.remove();
      URL.revokeObjectURL(url);
      toast.success(`Exported ${rows.length} audit rows`);
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Export failed");
    } finally {
      setExporting(false);
    }
  }

  const auditInRange = (iso: string) => {
    const t = new Date(iso).getTime();
    if (auditFrom && t < new Date(auditFrom).getTime()) return false;
    if (auditTo) {
      const end = new Date(auditTo);
      end.setHours(23, 59, 59, 999);
      if (t > end.getTime()) return false;
    }
    return true;
  };

  const usageQuery = () => {
    const params = new URLSearchParams({ range: rangeKind });
    if (rangeKind === "month") params.set("month", month);
    if (rangeKind === "day") params.set("date", date);
    return `/api/usage?${params.toString()}`;
  };

  const load = async () => {
    setLoading(true);
    try {
      const res = await fetch(usageQuery());
      const json = await res.json();
      if (!res.ok) throw new Error(json.error ?? "Failed to load usage");
      setData(json as UsageData);
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Failed to load usage");
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        const res = await fetch(usageQuery());
        const json = await res.json();
        if (!res.ok) throw new Error(json.error ?? "Failed to load usage");
        if (!cancelled) setData(json as UsageData);
      } catch (err) {
        if (!cancelled) {
          toast.error(
            err instanceof Error ? err.message : "Failed to load usage"
          );
        }
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [rangeKind, month, date]);

  if (!data) {
    return (
      <div className="flex items-center gap-2 py-16 text-sm text-muted-foreground">
        <Loader2 className="size-4 animate-spin" />
        Loading usage…
      </div>
    );
  }

  return (
    <div className="space-y-8 pb-10">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <p className="text-sm text-muted-foreground">
          Internal cost visibility — no billing. Numbers are provider estimates
          saved per generation.
        </p>
        <div className="flex flex-wrap items-center gap-2">
          <div className="flex rounded-full bg-card p-0.5 ring-1 ring-border">
            {(
              [
                ["all", "All time"],
                ["month", "Month"],
                ["day", "Day"],
              ] as const
            ).map(([id, label]) => (
              <button
                key={id}
                type="button"
                onClick={() => setRangeKind(id)}
                className={cn(
                  "rounded-full px-3 py-1 text-xs transition",
                  rangeKind === id
                    ? "bg-gold text-primary-foreground"
                    : "text-muted-foreground hover:text-foreground"
                )}
              >
                {label}
              </button>
            ))}
          </div>
          {rangeKind === "month" && (
            <input
              type="month"
              value={month}
              onChange={(e) => setMonth(e.target.value)}
              className="h-8 rounded-lg border border-border bg-card px-2.5 text-xs text-foreground"
            />
          )}
          {rangeKind === "day" && (
            <input
              type="date"
              value={date}
              onChange={(e) => setDate(e.target.value)}
              className="h-8 rounded-lg border border-border bg-card px-2.5 text-xs text-foreground"
            />
          )}
          <button
            type="button"
            onClick={() => void load()}
            disabled={loading}
            className="inline-flex items-center gap-1.5 rounded-full bg-card px-3 py-1.5 text-xs text-muted-foreground ring-1 ring-border transition hover:text-foreground disabled:opacity-50"
          >
            <RefreshCw className={cn("size-3.5", loading && "animate-spin")} />
            Refresh
          </button>
        </div>
      </div>

      {/* Spend and generation counts for the selected window. All-time also
          shows the last 30 days so a quiet month is not mistaken for zero. */}
      <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
        <StatCard
          label={rangeKind === "all" ? "Total spend" : "Spend"}
          value={usd(data.totals.total_cost)}
        />
        <StatCard
          label={rangeKind === "all" ? "Total generations" : "Generations"}
          value={String(
            data.totals.total_count +
              (data.transcription?.count ?? 0) +
              (data.tts?.count ?? 0)
          )}
          hint={generationCountHint(data, "count")}
        />
        {rangeKind === "all" && (
          <>
            <StatCard
              label="Spend — last 30 days"
              value={usd(data.totals.cost_30d)}
            />
            <StatCard
              label="Generations — last 30 days"
              value={String(
                data.totals.count_30d +
                  (data.transcription?.count_30d ?? 0) +
                  (data.tts?.count_30d ?? 0)
              )}
              hint={generationCountHint(data, "count_30d")}
            />
          </>
        )}
      </div>

      <DailyActivity
        days={data.byDay}
        title={
          rangeKind === "month"
            ? new Date(`${month}-01T00:00:00Z`).toLocaleDateString("en-GB", {
                month: "long",
                year: "numeric",
                timeZone: "UTC",
              })
            : rangeKind === "day"
              ? shortDate(date)
              : "Last 30 days"
        }
        endLabel={rangeKind === "all" ? "Today" : undefined}
      />

      <div className="grid gap-6 lg:grid-cols-2">
        <BreakdownTable
          title="By type"
          rows={data.byMode.map((r) => ({
            label: (r.mode ?? "").toUpperCase(),
            cost: r.cost,
            count: r.count,
          }))}
        />
        {/* Server already folds transcription's whisper-1 row into byModel
            (see the BY_MODEL_SQL union in the usage route), real cost included. */}
        <BreakdownTable
          title="By model"
          rows={data.byModel.map((r) => ({
            label: friendlyModelName(r.model_endpoint),
            cost: r.cost,
            count: r.count,
          }))}
        />
        <BreakdownTable
          title="By user"
          onRowClick={(id) => setUserDrillId(id)}
          rows={data.byUser.map((r) => ({
            id: r.user_id ?? "unassigned",
            label: r.label ?? "—",
            cost: r.cost,
            count: r.count,
          }))}
        />
        <BreakdownTable
          title="By project"
          rows={data.byProject.map((r) => ({
            label: r.label ?? "—",
            cost: r.cost,
            count: r.count,
          }))}
        />
      </div>

      <UserAuditDialog
        id={userDrillId}
        open={userDrillId != null}
        onOpenChange={(o) => !o && setUserDrillId(null)}
        onOpenItem={onOpenItem}
      />

      {/* Generation feedback — the thing we actually change the pipeline on */}
      <section>
        <h3 className="mb-1 flex items-center gap-2 text-sm font-medium">
          <MessageSquare className="size-4 text-gold" />
          Generation feedback
        </h3>
        <p className="mb-3 text-xs text-muted-foreground">
          Every thumbs-down the team gave, with the reasons and the exact
          request that produced it. Copy it and paste it into an AI with “what
          should we change?” — it is written to be read that way.
        </p>
        <div className="flex flex-wrap items-center gap-2">
          <Select
            value={String(feedbackDays)}
            onValueChange={(v) => setFeedbackDays(Number(v))}
          >
            <SelectTrigger className="h-9 w-auto min-w-[8rem] text-xs">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="7">Last 7 days</SelectItem>
              <SelectItem value="30">Last 30 days</SelectItem>
              <SelectItem value="90">Last 90 days</SelectItem>
              <SelectItem value="0">All time</SelectItem>
            </SelectContent>
          </Select>
          <Select
            value={feedbackScope}
            onValueChange={(v) => setFeedbackScope(v as typeof feedbackScope)}
          >
            <SelectTrigger className="h-9 w-auto min-w-[9rem] text-xs">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="down">Only the bad ones</SelectItem>
              <SelectItem value="all">Everything rated</SelectItem>
              <SelectItem value="up">Only the good ones</SelectItem>
            </SelectContent>
          </Select>
          <div className="flex-1" />
          <button
            type="button"
            onClick={() => void copyFeedback()}
            disabled={feedbackBusy}
            className="inline-flex items-center gap-1.5 rounded-full bg-gold px-3.5 py-1.5 text-xs font-medium text-primary-foreground transition hover:bg-gold/90 disabled:opacity-60"
          >
            {feedbackBusy ? (
              <Loader2 className="size-3.5 animate-spin" />
            ) : (
              <ClipboardCopy className="size-3.5" />
            )}
            Copy for AI
          </button>
          <button
            type="button"
            onClick={() => void downloadFeedback()}
            disabled={feedbackBusy}
            className="inline-flex items-center gap-1.5 rounded-full bg-card px-3.5 py-1.5 text-xs text-muted-foreground ring-1 ring-border transition hover:text-foreground disabled:opacity-60"
          >
            <Download className="size-3.5" />
            Download
          </button>
        </div>
        {feedbackPreview && (
          <pre className="mt-3 max-h-72 overflow-auto rounded-2xl bg-card p-4 text-[11px] leading-relaxed whitespace-pre-wrap text-muted-foreground ring-1 ring-border">
            {feedbackPreview}
          </pre>
        )}
      </section>

      {/* Audit trail */}
      <section>
        <h3 className="mb-1 flex items-center gap-2 text-sm font-medium">
          <ShieldAlert className="size-4 text-gold" />
          Audit trail — sensitive actions
        </h3>
        <p className="mb-3 text-xs text-muted-foreground">
          Who did what, and when. Times in Dubai (GST, GMT+4). Filter a date
          range and export to CSV.
        </p>
        <div className="mb-3 flex flex-wrap items-end gap-2">
          <label className="flex flex-col gap-1 text-[10px] tracking-[0.14em] text-muted-foreground uppercase">
            From
            <input
              type="date"
              value={auditFrom}
              onChange={(e) => setAuditFrom(e.target.value)}
              className="rounded-lg border border-border bg-card px-2.5 py-1.5 text-xs text-foreground"
            />
          </label>
          <label className="flex flex-col gap-1 text-[10px] tracking-[0.14em] text-muted-foreground uppercase">
            To
            <input
              type="date"
              value={auditTo}
              onChange={(e) => setAuditTo(e.target.value)}
              className="rounded-lg border border-border bg-card px-2.5 py-1.5 text-xs text-foreground"
            />
          </label>
          {(auditFrom || auditTo) && (
            <button
              type="button"
              onClick={() => {
                setAuditFrom("");
                setAuditTo("");
              }}
              className="pb-1.5 text-xs text-muted-foreground hover:text-foreground"
            >
              Clear
            </button>
          )}
          <div className="flex-1" />
          <button
            type="button"
            onClick={() => void exportAudit()}
            disabled={exporting}
            className="inline-flex items-center gap-1.5 rounded-full bg-gold px-3.5 py-1.5 text-xs font-medium text-primary-foreground transition hover:bg-gold/90 disabled:opacity-60"
          >
            {exporting ? (
              <Loader2 className="size-3.5 animate-spin" />
            ) : (
              <Download className="size-3.5" />
            )}
            Export CSV
          </button>
        </div>
        {data.audit.filter((a) => auditInRange(a.created_at)).length === 0 ? (
          <p className="rounded-2xl bg-card px-4 py-6 text-sm text-muted-foreground ring-1 ring-border">
            No audited actions yet. Deletes, QC decisions, and client-ready
            changes are recorded here.
          </p>
        ) : (
          <div className="overflow-hidden rounded-2xl ring-1 ring-border">
            {data.audit
              .filter((a) => auditInRange(a.created_at))
              .map((a, i) => {
              const { who, what } = describeAudit(a);
              return (
                <div
                  key={a.id}
                  className={cn(
                    "flex items-center gap-3 bg-card px-4 py-2.5 text-xs",
                    i > 0 && "border-t border-border"
                  )}
                >
                  <span className="min-w-0 flex-1 truncate text-foreground">
                    <span className="font-medium">{who}</span>{" "}
                    <span className="text-muted-foreground">{what}</span>
                  </span>
                  <span
                    className="shrink-0 text-muted-foreground/70"
                    title={new Date(a.created_at).toISOString()}
                  >
                    {dubaiTime(a.created_at)}
                  </span>
                </div>
              );
            })}
          </div>
        )}
      </section>
    </div>
  );
}

/**
 * Thirty days of studio activity.
 *
 * The point of this chart is to answer "is anything unusual happening" at a
 * glance, which the old one could not: it drew only the days that had work,
 * unlabelled and unscaled, so a quiet fortnight and a busy one looked the
 * same and a single expensive day flattened everything else into dust.
 *
 * So: every day is present whether or not it had work, the axis says what the
 * numbers are, hovering names the day, and spend is not the only thing worth
 * looking at — a day can be busy and cheap, or quiet and expensive, and the
 * toggle is what tells those apart.
 */
function DailyActivity({
  days,
  title = "Last 30 days",
  endLabel = "Today",
}: {
  days: DayRow[];
  title?: string;
  endLabel?: string;
}) {
  const [metric, setMetric] = useState<DailyMetric>("cost");
  const [hovered, setHovered] = useState<number | null>(null);

  const hasTranscripts = days.some((d) => d.transcript_count > 0);
  const METRICS: { id: DailyMetric; label: string }[] = [
    { id: "cost", label: "Spend" },
    { id: "count", label: "Generations" },
    ...(hasTranscripts ? [{ id: "audio" as const, label: "Audio" }] : []),
  ];

  const { values, total, max, activeDays, busiestDay } = summariseDays(days, metric);
  const format = (value: number) => formatMetric(value, metric);
  const shown = hovered !== null ? days[hovered] : null;

  if (days.length === 0) return null;

  return (
    <section>
      <div className="mb-3 flex flex-wrap items-center justify-between gap-3">
        <div>
          <h3 className="text-sm font-medium">{title}</h3>
          <p className="text-xs text-muted-foreground">
            {activeDays === 0
              ? "Nothing yet in this window — bars appear as work lands"
              : `${format(total)} across ${activeDays} active ${
                  activeDays === 1 ? "day" : "days"
                } · busiest ${shortDate(busiestDay ?? "")} at ${format(max)}`}
          </p>
        </div>
        <div className="flex rounded-full bg-card p-0.5 ring-1 ring-border">
          {METRICS.map((option) => (
            <button
              key={option.id}
              type="button"
              onClick={() => setMetric(option.id)}
              className={cn(
                "rounded-full px-3 py-1 text-xs transition",
                metric === option.id
                  ? "bg-gold text-primary-foreground"
                  : "text-muted-foreground hover:text-foreground"
              )}
            >
              {option.label}
            </button>
          ))}
        </div>
      </div>

      <div className="rounded-2xl bg-card p-4 ring-1 ring-border">
        {/* Reserved row: the readout sits above the bars rather than floating
            over them, so nothing is ever hidden behind a tooltip. */}
        <div className="mb-2 flex h-8 items-center justify-between text-xs">
          {shown ? (
            <>
              <span className="font-medium">{shortDate(shown.day)}</span>
              <span className="flex gap-3 text-muted-foreground">
                <span>{usd(shown.cost)}</span>
                <span>
                  {shown.count} {shown.count === 1 ? "render" : "renders"}
                </span>
                {hasTranscripts && (
                  <span>
                    {shown.transcript_count} transcribed
                    {shown.audio_seconds > 0 &&
                      ` (${(shown.audio_seconds / 3600).toFixed(1)}h)`}
                  </span>
                )}
              </span>
            </>
          ) : (
            <>
              <span className="text-muted-foreground/70">
                Hover a day for the detail
              </span>
              <span className="font-mono text-muted-foreground/70">
                peak {format(max)}
              </span>
            </>
          )}
        </div>

        <div className="flex h-32 items-end gap-[3px]">
          {days.map((day, index) => {
            const value = values[index];
            const isToday = index === days.length - 1;
            return (
              <button
                key={day.day}
                type="button"
                onMouseEnter={() => setHovered(index)}
                onMouseLeave={() => setHovered(null)}
                onFocus={() => setHovered(index)}
                onBlur={() => setHovered(null)}
                aria-label={`${shortDate(day.day)}: ${format(value)}`}
                className="group flex h-full min-w-0 flex-1 flex-col justify-end"
              >
                <span
                  className={cn(
                    "w-full rounded-t transition",
                    value === 0
                      ? "bg-muted"
                      : hovered === index
                        ? "bg-gold"
                        : isToday
                          ? "bg-gold/90"
                          : "bg-gold/60 group-hover:bg-gold"
                  )}
                  style={{ height: barHeight(value, max) }}
                />
              </button>
            );
          })}
        </div>

        <div className="mt-2 flex justify-between text-[10px] text-muted-foreground/70">
          <span>{shortDate(days[0]?.day ?? "")}</span>
          <span>{shortDate(days[Math.floor(days.length / 2)]?.day ?? "")}</span>
          <span>{endLabel}</span>
        </div>
      </div>
    </section>
  );
}

function StatCard({
  label,
  value,
  hint,
}: {
  label: string;
  value: string;
  hint?: string;
}) {
  return (
    <div className="rounded-2xl bg-card px-4 py-4 ring-1 ring-border">
      <p className="text-[11px] tracking-wide text-muted-foreground uppercase">
        {label}
      </p>
      <p className="mt-1 athar-headline">{value}</p>
      {hint && (
        <p className="mt-0.5 text-[11px] text-muted-foreground">{hint}</p>
      )}
    </div>
  );
}

function BreakdownTable({
  title,
  rows,
  onRowClick,
}: {
  title: string;
  rows: { label: string; cost: number; count: number; id?: string }[];
  /** When set, rows with an `id` open the per-person drill-down on click. */
  onRowClick?: (id: string) => void;
}) {
  const max = Math.max(...rows.map((r) => r.cost), 0.0001);
  return (
    <section>
      <h3 className="mb-3 text-sm font-medium">{title}</h3>
      {rows.length === 0 ? (
        <p className="rounded-2xl bg-card px-4 py-5 text-xs text-muted-foreground ring-1 ring-border">
          No data yet
        </p>
      ) : (
        <div className="space-y-2 rounded-2xl bg-card p-4 ring-1 ring-border">
          {rows.map((r) => {
            const clickable = onRowClick && r.id;
            const bar = (
              <>
                <div className="mb-1 flex items-center justify-between gap-3 text-xs">
                  <span className="flex min-w-0 items-center gap-1 truncate text-foreground/90">
                    <span className="min-w-0 truncate">{r.label}</span>
                    {clickable && (
                      <ChevronRight className="size-3 shrink-0 text-muted-foreground/60" />
                    )}
                  </span>
                  <span className="shrink-0 font-mono text-muted-foreground">
                    {usd(r.cost)} · {r.count}
                  </span>
                </div>
                <div className="h-1.5 overflow-hidden rounded-full bg-muted">
                  <div
                    className="h-full rounded-full bg-gold/80"
                    style={{ width: `${Math.max(2, (r.cost / max) * 100)}%` }}
                  />
                </div>
              </>
            );
            return clickable ? (
              <button
                key={r.label}
                type="button"
                onClick={() => onRowClick!(r.id!)}
                title={`See ${r.label}'s spend by model and project`}
                className="-mx-1 block w-full rounded-lg px-1 py-0.5 text-left transition hover:bg-white/5"
              >
                {bar}
              </button>
            ) : (
              <div key={r.label}>{bar}</div>
            );
          })}
        </div>
      )}
    </section>
  );
}

type UserAuditItem = {
  id: string;
  kind: "generation" | "transcript" | "tts";
  type: string;
  model_endpoint: string;
  cost: number;
  created_at: string;
  title: string;
  thumb: string | null;
  project_name: string;
};

type UserAuditData = {
  /** The id this data was fetched for — lets a re-open with a new id show a
      spinner instead of the previous person's numbers while it loads. */
  forId: string;
  label: string;
  byModel: { label: string; cost: number; count: number }[];
  byProject: { label: string; cost: number; count: number }[];
  recent: UserAuditItem[];
  /** Every generation/transcript/voice-over this person has made, newest first. */
  all: UserAuditItem[];
};

/**
 * One person's spend, broken down enough to act on: what model, on what
 * project, and the individual renders worth pointing at. The "By user" table
 * only has a total — this is the audit trail behind it, for the actual
 * "you're spending a lot on X for Y, was that necessary?" conversation.
 */
function UserAuditDialog({
  id,
  open,
  onOpenChange,
  onOpenItem,
}: {
  id: string | null;
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onOpenItem?: (item: { kind: "generation" | "transcript" | "tts"; id: string }) => void;
}) {
  const [data, setData] = useState<UserAuditData | null>(null);

  useEffect(() => {
    if (!id) return;
    let cancelled = false;
    void (async () => {
      try {
        const res = await fetch(`/api/usage/user?id=${encodeURIComponent(id)}`);
        const json = await res.json();
        if (!res.ok) throw new Error(json.error ?? "Failed to load that person's usage");
        if (!cancelled) setData({ ...json, forId: id } as UserAuditData);
      } catch (err) {
        if (!cancelled) {
          toast.error(
            err instanceof Error ? err.message : "Failed to load that person's usage"
          );
        }
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [id]);

  const loading = id != null && data?.forId !== id;

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent
        className={cn(
          // The base dialog's `sm:max-w-sm` is a responsive variant — a bare
          // `max-w-none` doesn't win against it at sm+ (twMerge tracks each
          // breakpoint separately), so this was silently pinned to 24rem
          // regardless of the width set here, forcing the whole dialog to
          // scroll horizontally instead of laying out normally.
          "w-[min(42rem,calc(100vw-2rem))] sm:max-w-[min(42rem,calc(100vw-2rem))]",
          "border-white/10 bg-[#161616] text-foreground ring-white/10"
        )}
      >
        <DialogHeader>
          <DialogTitle className="truncate pr-8">{data?.label ?? "Loading…"}</DialogTitle>
        </DialogHeader>

        {loading ? (
          <div className="flex items-center gap-2 py-10 text-sm text-muted-foreground">
            <Loader2 className="size-4 animate-spin" />
            Loading…
          </div>
        ) : data ? (
          <div className="max-h-[70vh] space-y-6 overflow-y-auto pr-1">
            <div className="grid gap-6 sm:grid-cols-2">
              <BreakdownTable
                title="By model"
                rows={data.byModel.map((r) => ({
                  label: friendlyModelName(r.label),
                  cost: r.cost,
                  count: r.count,
                }))}
              />
              <BreakdownTable
                title="By project"
                rows={data.byProject.map((r) => ({
                  label: r.label,
                  cost: r.cost,
                  count: r.count,
                }))}
              />
            </div>

            <section>
              <h3 className="mb-3 text-sm font-medium">
                Priciest renders — what to point at
              </h3>
              {data.recent.length === 0 ? (
                <p className="rounded-2xl bg-card px-4 py-5 text-xs text-muted-foreground ring-1 ring-border">
                  No data yet
                </p>
              ) : (
                <div className="space-y-1.5">
                  {data.recent.map((item) => (
                    <UserAuditItemRow key={item.id} item={item} onOpenItem={onOpenItem} />
                  ))}
                </div>
              )}
            </section>

            <section>
              <h3 className="mb-3 text-sm font-medium">
                All generations — {data.all.length}
                {data.all.length >= 300 ? "+" : ""}
              </h3>
              {data.all.length === 0 ? (
                <p className="rounded-2xl bg-card px-4 py-5 text-xs text-muted-foreground ring-1 ring-border">
                  No data yet
                </p>
              ) : (
                <div className="max-h-80 space-y-1.5 overflow-y-auto pr-1">
                  {data.all.map((item) => (
                    <UserAuditItemRow key={item.id} item={item} onOpenItem={onOpenItem} />
                  ))}
                </div>
              )}
            </section>
          </div>
        ) : null}
      </DialogContent>
    </Dialog>
  );
}

/** One row in either the "Priciest renders" or "All generations" list. */
function UserAuditItemRow({
  item,
  onOpenItem,
}: {
  item: UserAuditItem;
  onOpenItem?: (item: { kind: "generation" | "transcript" | "tts"; id: string }) => void;
}) {
  const badge =
    item.kind === "transcript" ? "AUDIO" : item.kind === "tts" ? "VOICE" : item.type.toUpperCase();
  const clickable = Boolean(onOpenItem);

  const content = (
    <>
      {item.thumb ? (
        // eslint-disable-next-line @next/next/no-img-element
        <img
          src={item.thumb}
          alt=""
          className="size-9 shrink-0 rounded-md object-cover ring-1 ring-white/10"
        />
      ) : (
        <span className="flex size-9 shrink-0 items-center justify-center rounded-md bg-white/5 text-[10px] text-muted-foreground ring-1 ring-white/10">
          {badge}
        </span>
      )}
      <div className="min-w-0 flex-1">
        <p className="truncate text-xs text-foreground/90">{item.title || "Untitled"}</p>
        <p className="truncate text-[11px] text-muted-foreground">
          {friendlyModelName(item.model_endpoint)} · {item.project_name} ·{" "}
          {dubaiTime(item.created_at)}
        </p>
      </div>
      <span className="shrink-0 font-mono text-xs text-muted-foreground">{usd(item.cost)}</span>
    </>
  );

  if (clickable) {
    return (
      <button
        type="button"
        onClick={() => onOpenItem!({ kind: item.kind, id: item.id })}
        title="Open"
        className="flex w-full items-center gap-3 rounded-xl bg-card px-3 py-2 text-left ring-1 ring-border transition hover:bg-white/5"
      >
        {content}
      </button>
    );
  }
  return (
    <div className="flex items-center gap-3 rounded-xl bg-card px-3 py-2 ring-1 ring-border">
      {content}
    </div>
  );
}
