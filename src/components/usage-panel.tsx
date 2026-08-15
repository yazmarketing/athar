"use client";

import { useEffect, useState } from "react";
import { Download, Loader2, RefreshCw, ShieldAlert } from "lucide-react";
import { toast } from "sonner";
import { cn } from "@/lib/utils";

type UsageRow = { label?: string; mode?: string; model_endpoint?: string; cost: number; count: number };
type DayRow = { day: string; cost: number; count: number };
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
  audit: AuditRow[];
};

function usd(v: number) {
  return `$${v.toFixed(2)}`;
}

/** Map raw audit action codes to plain-English verbs. */
const AUDIT_VERBS: Record<string, string> = {
  generation_delete: "deleted",
  asset_create: "added to the asset library",
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

  const maxDayCost = Math.max(...data.byDay.map((d) => d.cost), 0.0001);

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

      {/* Daily bars */}
      {data.byDay.length > 0 && (
        <section>
          <h3 className="mb-3 text-sm font-medium">Daily spend — last 30 days</h3>
          <div className="flex h-28 items-end gap-1 rounded-2xl bg-card p-4 ring-1 ring-border">
            {data.byDay.map((d) => (
              <div
                key={d.day}
                title={`${d.day} — ${usd(d.cost)} · ${d.count} generations`}
                className="min-w-1 flex-1 rounded-t bg-gold/70 transition hover:bg-gold"
                style={{
                  height: `${Math.max(4, (d.cost / maxDayCost) * 100)}%`,
                }}
              />
            ))}
          </div>
        </section>
      )}

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
            label: (r.model_endpoint ?? "").replace(/^byteplus:|^fal:/, ""),
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
