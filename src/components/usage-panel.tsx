"use client";

import { useEffect, useState } from "react";
import { Loader2, RefreshCw, ShieldAlert } from "lucide-react";
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

/** Internal spend dashboard (spec Phase 9) — cost saved per generation. */
export function UsagePanel() {
  const [data, setData] = useState<UsageData | null>(null);
  const [loading, setLoading] = useState(false);

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
        <h3 className="mb-3 flex items-center gap-2 text-sm font-medium">
          <ShieldAlert className="size-4 text-gold" />
          Audit trail — recent sensitive actions
        </h3>
        {data.audit.length === 0 ? (
          <p className="rounded-2xl bg-card px-4 py-6 text-sm text-muted-foreground ring-1 ring-border">
            No audited actions yet. Deletes, QC decisions, and client-ready
            changes are recorded here.
          </p>
        ) : (
          <div className="overflow-hidden rounded-2xl ring-1 ring-border">
            {data.audit.map((a, i) => (
              <div
                key={a.id}
                className={cn(
                  "flex items-center gap-3 bg-card px-4 py-2.5 text-xs",
                  i > 0 && "border-t border-border"
                )}
              >
                <span className="rounded bg-muted px-1.5 py-0.5 font-mono text-[10px] text-muted-foreground">
                  {a.action}
                </span>
                <span className="min-w-0 flex-1 truncate text-muted-foreground">
                  {a.user_email ?? "unknown"} · {a.subject_type}{" "}
                  {a.subject_id ? `${a.subject_id.slice(0, 8)}…` : ""}
                </span>
                <span className="shrink-0 text-muted-foreground/70">
                  {new Date(a.created_at).toLocaleString()}
                </span>
              </div>
            ))}
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
