"use client";

import { useCallback, useEffect, useState } from "react";
import {
  ArrowLeft,
  Clapperboard,
  Download,
  Film,
  Heart,
  ImageIcon,
  Loader2,
  RefreshCw,
  ShieldAlert,
} from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";
import { friendlyModelName } from "@/config/models";
import type { GenerationRecord } from "@/lib/types";

type Row = { label: string; count: number; cost: number };
type DayRow = { day: string; count: number; cost: number };

type ActivityGeneration = GenerationRecord & {
  project_name: string | null;
  client_name: string | null;
};

type AuditRow = {
  id: string;
  action: string;
  subject_type: string;
  subject_id: string | null;
  meta: Record<string, unknown>;
  created_at: string;
};

type Activity = {
  user: {
    id: string;
    email: string;
    name: string | null;
    role: string;
    team: string | null;
    active: boolean;
    created_at: string;
    last_login_at: string | null;
    onboarded_at: string | null;
  };
  summary: {
    total: number;
    cost: number;
    videos: number;
    images: number;
    favourites: number;
    failed: number;
    avg_render_ms: number | null;
    active_days: number;
    first_at: string | null;
    last_at: string | null;
  };
  byMode: Row[];
  byModel: Row[];
  byClient: Row[];
  byDay: DayRow[];
  storyboards: { id: string; title: string; frame_count: number }[];
  audit: AuditRow[];
  generations: ActivityGeneration[];
  hasMore: boolean;
};

const RANGES = [
  { days: 7, label: "7 days" },
  { days: 30, label: "30 days" },
  { days: 90, label: "90 days" },
  { days: 0, label: "All time" },
];

const KINDS = [
  { value: "all", label: "Everything" },
  { value: "image", label: "Stills" },
  { value: "video", label: "Clips" },
] as const;

const VIDEO_MODES = new Set(["t2v", "i2v", "v2v"]);

const MODE_LABEL: Record<string, string> = {
  t2i: "Image",
  t2v: "Video",
  i2v: "Image → video",
  v2v: "Video edit",
  upscale: "Upscale",
};

function usd(v: number) {
  return `$${(v ?? 0).toFixed(2)}`;
}

function dubaiTime(iso: string) {
  return (
    new Intl.DateTimeFormat("en-GB", {
      timeZone: "Asia/Dubai",
      day: "2-digit",
      month: "short",
      hour: "2-digit",
      minute: "2-digit",
      hour12: false,
    }).format(new Date(iso)) + " GST"
  );
}

function shortDate(iso: string | null) {
  if (!iso) return "—";
  return new Date(iso).toLocaleDateString(undefined, {
    day: "numeric",
    month: "short",
    year: "numeric",
  });
}

function initials(name: string | null, email: string) {
  const parts = (name || email).trim().split(/[\s@.]+/).filter(Boolean);
  return ((parts[0]?.[0] ?? "") + (parts[1]?.[0] ?? "")).toUpperCase() || "?";
}

/**
 * Everything one member has made, in detail.
 *
 * Reads from `/api/users/[id]/activity`, which admins can call for anyone and
 * everyone else only for themselves — the same rule the UI relies on for the
 * "your own activity" entry point.
 */
export function MemberActivity({
  userId,
  onBack,
  onOpenGeneration,
}: {
  userId: string;
  onBack: () => void;
  /** Hands a row to the studio's existing image/video detail modals. */
  onOpenGeneration?: (g: GenerationRecord) => void;
}) {
  const [data, setData] = useState<Activity | null>(null);
  const [loading, setLoading] = useState(false);
  const [days, setDays] = useState(30);
  const [kind, setKind] = useState<(typeof KINDS)[number]["value"]>("all");
  const [more, setMore] = useState<ActivityGeneration[]>([]);
  const [loadingMore, setLoadingMore] = useState(false);
  const [hasMore, setHasMore] = useState(false);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const res = await fetch(
        `/api/users/${userId}/activity?days=${days}&kind=${kind}`,
        { cache: "no-store" }
      );
      const json = await res.json();
      if (!res.ok) throw new Error(json.error ?? "Could not load activity");
      setData(json as Activity);
      // A changed filter invalidates whatever was paged in under the old one.
      setMore([]);
      setHasMore(Boolean((json as Activity).hasMore));
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Could not load activity");
    } finally {
      setLoading(false);
    }
  }, [userId, days, kind]);

  useEffect(() => {
    let cancelled = false;
    void (async () => {
      setLoading(true);
      try {
        const res = await fetch(
          `/api/users/${userId}/activity?days=${days}&kind=${kind}`,
          { cache: "no-store" }
        );
        const json = await res.json();
        if (!res.ok) throw new Error(json.error ?? "Could not load activity");
        if (cancelled) return;
        setData(json as Activity);
        setMore([]);
        setHasMore(Boolean((json as Activity).hasMore));
      } catch (err) {
        if (!cancelled) {
          toast.error(
            err instanceof Error ? err.message : "Could not load activity"
          );
        }
      } finally {
        if (!cancelled) setLoading(false);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [userId, days, kind]);

  const rows: ActivityGeneration[] = data
    ? [...data.generations, ...more]
    : [];

  async function loadMore() {
    if (!data) return;
    setLoadingMore(true);
    try {
      const res = await fetch(
        `/api/users/${userId}/activity?days=${days}&kind=${kind}&offset=${rows.length}`,
        { cache: "no-store" }
      );
      const json = await res.json();
      if (!res.ok) throw new Error(json.error ?? "Could not load more");
      setMore((prev) => [...prev, ...(json.generations as ActivityGeneration[])]);
      setHasMore(Boolean(json.hasMore));
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Could not load more");
    } finally {
      setLoadingMore(false);
    }
  }

  /** The list as CSV — what a manager actually asks for after looking at it. */
  function exportCsv() {
    if (!data) return;
    const esc = (v: unknown) => `"${String(v ?? "").replace(/"/g, '""')}"`;
    const header =
      "Time (GST),Type,Model,Tier,Status,Client,Project,Cost (USD),Favourite,Prompt,Output URL\n";
    const body = rows
      .map((g) =>
        [
          esc(dubaiTime(g.created_at)),
          esc(MODE_LABEL[g.mode] ?? g.mode),
          esc(friendlyModelName(g.model_endpoint)),
          esc(g.tier),
          esc(g.status),
          esc(g.client_name ?? ""),
          esc(g.project_name ?? ""),
          esc((g.cost ?? 0).toFixed(4)),
          esc(g.is_favorite ? "yes" : ""),
          esc(g.final_prompt),
          esc(g.output_url ?? ""),
        ].join(",")
      )
      .join("\n");
    const blob = new Blob([header + body], { type: "text/csv" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = `athar-activity-${data.user.email.split("@")[0]}-${
      days === 0 ? "all" : `${days}d`
    }.csv`;
    document.body.appendChild(a);
    a.click();
    a.remove();
    URL.revokeObjectURL(url);
    toast.success(`Exported ${rows.length} generations`);
  }

  if (!data) {
    return (
      <div className="flex items-center gap-2 py-16 text-sm text-muted-foreground">
        <Loader2 className="size-4 animate-spin" />
        Loading activity…
      </div>
    );
  }

  const { user, summary } = data;
  const maxDay = Math.max(...data.byDay.map((d) => d.count), 1);

  return (
    <div className="mx-auto max-w-5xl space-y-7 pb-10">
      {/* Who */}
      <div className="flex flex-wrap items-center gap-3">
        <Button variant="outline" size="sm" className="gap-1.5" onClick={onBack}>
          <ArrowLeft className="size-3.5" />
          Team
        </Button>
        <span className="flex size-11 shrink-0 items-center justify-center rounded-full bg-secondary text-sm font-semibold">
          {initials(user.name, user.email)}
        </span>
        <div className="min-w-0 flex-1">
          <p className="truncate text-base font-medium">
            {user.name || user.email.split("@")[0]}
            {!user.active && (
              <span className="ml-2 rounded-full bg-secondary px-2 py-0.5 text-[10px] text-muted-foreground">
                Disabled
              </span>
            )}
          </p>
          <p className="truncate text-[11px] text-muted-foreground">
            {user.email}
            {user.team ? ` · ${user.team}` : ""} · {user.role} · joined{" "}
            {shortDate(user.created_at)} · last login{" "}
            {user.last_login_at ? shortDate(user.last_login_at) : "never"}
          </p>
        </div>
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

      {/* Filters */}
      <div className="flex flex-wrap items-center gap-2">
        <div className="flex gap-1 rounded-full bg-card p-1 ring-1 ring-border">
          {RANGES.map((r) => (
            <button
              key={r.days}
              type="button"
              onClick={() => setDays(r.days)}
              className={cn(
                "rounded-full px-3 py-1 text-xs transition",
                days === r.days
                  ? "bg-gold text-primary-foreground"
                  : "text-muted-foreground hover:text-foreground"
              )}
            >
              {r.label}
            </button>
          ))}
        </div>
        <div className="flex gap-1 rounded-full bg-card p-1 ring-1 ring-border">
          {KINDS.map((k) => (
            <button
              key={k.value}
              type="button"
              onClick={() => setKind(k.value)}
              className={cn(
                "rounded-full px-3 py-1 text-xs transition",
                kind === k.value
                  ? "bg-gold text-primary-foreground"
                  : "text-muted-foreground hover:text-foreground"
              )}
            >
              {k.label}
            </button>
          ))}
        </div>
        <div className="flex-1" />
        <button
          type="button"
          onClick={exportCsv}
          disabled={rows.length === 0}
          className="inline-flex items-center gap-1.5 rounded-full bg-card px-3 py-1.5 text-xs text-muted-foreground ring-1 ring-border transition hover:text-foreground disabled:opacity-40"
        >
          <Download className="size-3.5" />
          Export CSV
        </button>
      </div>

      {/* Headline numbers */}
      <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
        <Stat label="Generations" value={String(summary.total ?? 0)} />
        <Stat label="Spend" value={usd(summary.cost)} />
        <Stat
          label="Stills · clips"
          value={`${summary.images ?? 0} · ${summary.videos ?? 0}`}
        />
        <Stat
          label="Active days"
          value={String(summary.active_days ?? 0)}
          hint={
            summary.last_at ? `Last on ${shortDate(summary.last_at)}` : undefined
          }
        />
      </div>

      {summary.total === 0 ? (
        <p className="rounded-2xl bg-card px-4 py-16 text-center text-sm text-muted-foreground ring-1 ring-border">
          Nothing generated in this window.
        </p>
      ) : (
        <>
          {/* Daily activity */}
          {data.byDay.length > 1 && (
            <section>
              <h3 className="mb-3 text-sm font-medium">Generations per day</h3>
              <div className="flex h-24 items-end gap-1 rounded-2xl bg-card p-4 ring-1 ring-border">
                {data.byDay.map((d) => (
                  <div
                    key={d.day}
                    title={`${d.day} — ${d.count} generation${
                      d.count === 1 ? "" : "s"
                    } · ${usd(d.cost)}`}
                    className="min-w-1 flex-1 rounded-t bg-gold/70 transition hover:bg-gold"
                    style={{ height: `${Math.max(6, (d.count / maxDay) * 100)}%` }}
                  />
                ))}
              </div>
            </section>
          )}

          <div className="grid gap-6 lg:grid-cols-3">
            <Breakdown
              title="By client"
              rows={data.byClient}
              format={(r) => `${r.count} · ${usd(r.cost)}`}
            />
            <Breakdown
              title="By type"
              rows={data.byMode.map((r) => ({
                ...r,
                label: MODE_LABEL[r.label] ?? r.label,
              }))}
              format={(r) => `${r.count} · ${usd(r.cost)}`}
            />
            <Breakdown
              title="By model"
              rows={data.byModel.map((r) => ({
                ...r,
                label: friendlyModelName(r.label),
              }))}
              format={(r) => `${r.count} · ${usd(r.cost)}`}
            />
          </div>

          {/* The detail: every generation */}
          <section>
            <h3 className="mb-1 text-sm font-medium">
              Every generation{" "}
              <span className="text-muted-foreground">
                ({rows.length}
                {hasMore ? "+" : ""})
              </span>
            </h3>
            <p className="mb-3 text-xs text-muted-foreground">
              Newest first. Click any row to open it.
              {summary.favourites > 0
                ? ` ${summary.favourites} favourited.`
                : ""}
              {summary.failed > 0 ? ` ${summary.failed} failed.` : ""}
            </p>

            <div className="overflow-hidden rounded-2xl ring-1 ring-border">
              {rows.map((g, i) => {
                const video = VIDEO_MODES.has(g.mode);
                return (
                  <button
                    key={g.id}
                    type="button"
                    onClick={() => onOpenGeneration?.(g)}
                    disabled={!onOpenGeneration || !g.output_url}
                    className={cn(
                      "flex w-full items-center gap-3 bg-card px-3 py-2.5 text-left transition hover:bg-secondary/50 disabled:cursor-default disabled:hover:bg-card",
                      i > 0 && "border-t border-border"
                    )}
                  >
                    <span className="relative flex size-12 shrink-0 items-center justify-center overflow-hidden rounded-lg bg-secondary text-muted-foreground">
                      {g.output_url && !video ? (
                        // eslint-disable-next-line @next/next/no-img-element
                        <img
                          src={g.output_url}
                          alt=""
                          loading="lazy"
                          className="size-full object-cover"
                        />
                      ) : video ? (
                        <Clapperboard className="size-4" />
                      ) : (
                        <ImageIcon className="size-4" />
                      )}
                      {g.is_favorite && (
                        <Heart className="absolute right-0.5 bottom-0.5 size-3 fill-gold text-gold" />
                      )}
                    </span>

                    <span className="min-w-0 flex-1">
                      <span className="line-clamp-1 text-xs text-foreground">
                        {g.final_prompt || "—"}
                      </span>
                      <span className="mt-0.5 block truncate text-[11px] text-muted-foreground">
                        {MODE_LABEL[g.mode] ?? g.mode} ·{" "}
                        {friendlyModelName(g.model_endpoint)} · {g.tier}
                        {g.client_name ? ` · ${g.client_name}` : ""}
                        {g.project_name ? ` ▸ ${g.project_name}` : ""}
                        {g.status !== "ready" ? ` · ${g.status}` : ""}
                      </span>
                    </span>

                    <span className="hidden shrink-0 text-right text-[11px] text-muted-foreground sm:block">
                      <span className="block">{usd(g.cost)}</span>
                      <span className="block">{dubaiTime(g.created_at)}</span>
                    </span>
                  </button>
                );
              })}
            </div>

            {hasMore && (
              <div className="mt-3 flex justify-center">
                <Button
                  variant="outline"
                  size="sm"
                  disabled={loadingMore}
                  onClick={() => void loadMore()}
                  className="gap-1.5"
                >
                  {loadingMore && <Loader2 className="size-3.5 animate-spin" />}
                  Load more
                </Button>
              </div>
            )}
          </section>
        </>
      )}

      {data.storyboards.length > 0 && (
        <section>
          <h3 className="mb-3 flex items-center gap-2 text-sm font-medium">
            <Film className="size-4 text-gold" />
            Storyboards created
          </h3>
          <div className="overflow-hidden rounded-2xl ring-1 ring-border">
            {data.storyboards.map((s, i) => (
              <div
                key={s.id}
                className={cn(
                  "flex items-center gap-3 bg-card px-4 py-2.5 text-xs",
                  i > 0 && "border-t border-border"
                )}
              >
                <span className="min-w-0 flex-1 truncate text-foreground">
                  {s.title}
                </span>
                <span className="shrink-0 text-muted-foreground">
                  {s.frame_count} frame{s.frame_count === 1 ? "" : "s"}
                </span>
              </div>
            ))}
          </div>
        </section>
      )}

      {data.audit.length > 0 && (
        <section>
          <h3 className="mb-1 flex items-center gap-2 text-sm font-medium">
            <ShieldAlert className="size-4 text-gold" />
            Audited actions
          </h3>
          <p className="mb-3 text-xs text-muted-foreground">
            Deletes, QC decisions and account changes — the things that leave no
            generation behind.
          </p>
          <div className="overflow-hidden rounded-2xl ring-1 ring-border">
            {data.audit.map((a, i) => (
              <div
                key={a.id}
                className={cn(
                  "flex items-center gap-3 bg-card px-4 py-2.5 text-xs",
                  i > 0 && "border-t border-border"
                )}
              >
                <span className="min-w-0 flex-1 truncate text-muted-foreground">
                  {a.action.replace(/_/g, " ")} · {a.subject_type}
                  {a.subject_id ? ` ${a.subject_id.slice(0, 8)}…` : ""}
                </span>
                <span className="shrink-0 text-muted-foreground/70">
                  {dubaiTime(a.created_at)}
                </span>
              </div>
            ))}
          </div>
        </section>
      )}
    </div>
  );
}

function Stat({
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

function Breakdown({
  title,
  rows,
  format,
}: {
  title: string;
  rows: Row[];
  format: (r: Row) => string;
}) {
  const max = Math.max(...rows.map((r) => r.count), 1);
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
              <div className="flex items-baseline justify-between gap-2 text-xs">
                <span className="min-w-0 truncate text-foreground">
                  {r.label}
                </span>
                <span className="shrink-0 text-muted-foreground">
                  {format(r)}
                </span>
              </div>
              <div className="mt-1 h-1 overflow-hidden rounded-full bg-secondary">
                <div
                  className="h-full rounded-full bg-gold/70"
                  style={{ width: `${(r.count / max) * 100}%` }}
                />
              </div>
            </div>
          ))}
        </div>
      )}
    </section>
  );
}
