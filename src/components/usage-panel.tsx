"use client";

import { useEffect, useState } from "react";
import {
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
import { toast } from "sonner";
import { cn } from "@/lib/utils";
import { friendlyModelName } from "@/config/models";
import {
  barHeight,
  formatMetric,
  shortDate,
  summariseDays,
  type DailyMetric,
  type DayRow,
} from "@/lib/usage";

type UsageRow = { label?: string; mode?: string; model_endpoint?: string; cost: number; count: number };
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
    count_30d: number;
    audio_seconds_30d: number;
  } | null;
  audit: AuditRow[];
};

function usd(v: number) {
  return `$${v.toFixed(2)}`;
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
export function UsagePanel() {
  const [data, setData] = useState<UsageData | null>(null);
  const [loading, setLoading] = useState(false);
  const [auditFrom, setAuditFrom] = useState("");
  const [auditTo, setAuditTo] = useState("");
  const [exporting, setExporting] = useState(false);
  const [feedbackDays, setFeedbackDays] = useState(30);
  const [feedbackScope, setFeedbackScope] = useState<"down" | "all" | "up">(
    "down"
  );
  const [feedbackBusy, setFeedbackBusy] = useState(false);
  const [feedbackPreview, setFeedbackPreview] = useState("");

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

  const load = async () => {
    setLoading(true);
    try {
      const res = await fetch("/api/usage");
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
        const res = await fetch("/api/usage");
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
  }, []);

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
      <div className="flex items-center justify-between">
        <p className="text-sm text-muted-foreground">
          Internal cost visibility — no billing. Numbers are provider estimates
          saved per generation.
        </p>
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

      {/* Stat cards */}
      <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
        <StatCard label="Total spend" value={usd(data.totals.total_cost)} />
        <StatCard
          label="Total generations"
          value={String(data.totals.total_count)}
        />
        <StatCard label="Spend — last 30 days" value={usd(data.totals.cost_30d)} />
        <StatCard
          label="Generations — last 30 days"
          value={String(data.totals.count_30d)}
        />
      </div>

      {/* Transcription runs on our own hardware, so hours of audio and machine
          time are the honest numbers here — there is no per-minute spend. */}
      {data.transcription && data.transcription.count > 0 && (
        <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
          <StatCard
            label="Transcripts"
            value={String(data.transcription.count)}
          />
          <StatCard
            label="Audio transcribed"
            value={`${(data.transcription.audio_seconds / 3600).toFixed(1)}h`}
          />
          <StatCard
            label="Audio — last 30 days"
            value={`${(data.transcription.audio_seconds_30d / 3600).toFixed(1)}h`}
          />
          <StatCard
            label="Worker time"
            value={`${(data.transcription.compute_ms / 3600000).toFixed(1)}h`}
          />
        </div>
      )}

      <DailyActivity days={data.byDay} />

      <div className="grid gap-6 lg:grid-cols-2">
        <BreakdownTable
          title="By type"
          rows={data.byMode.map((r) => ({
            label: (r.mode ?? "").toUpperCase(),
            cost: r.cost,
            count: r.count,
          }))}
        />
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
          rows={data.byUser.map((r) => ({
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
function DailyActivity({ days }: { days: DayRow[] }) {
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
          <h3 className="text-sm font-medium">Last 30 days</h3>
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
          <span>Today</span>
        </div>
      </div>
    </section>
  );
}

function StatCard({ label, value }: { label: string; value: string }) {
  return (
    <div className="rounded-2xl bg-card px-4 py-4 ring-1 ring-border">
      <p className="text-[11px] tracking-wide text-muted-foreground uppercase">
        {label}
      </p>
      <p className="mt-1 athar-headline">{value}</p>
    </div>
  );
}

function BreakdownTable({
  title,
  rows,
}: {
  title: string;
  rows: { label: string; cost: number; count: number }[];
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
          {rows.map((r) => (
            <div key={r.label}>
              <div className="mb-1 flex items-center justify-between gap-3 text-xs">
                <span className="min-w-0 truncate text-foreground/90">
                  {r.label}
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
            </div>
          ))}
        </div>
      )}
    </section>
  );
}
