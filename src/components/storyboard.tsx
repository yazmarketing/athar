"use client";

import { useCallback, useEffect, useState } from "react";
import {
  ArrowLeft,
  Check,
  Clapperboard,
  Film,
  Loader2,
  Printer,
  RefreshCw,
  Sparkles,
  TriangleAlert,
} from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { cn, postJson, readJson } from "@/lib/utils";
import type {
  StoryboardEntityRecord,
  StoryboardPanelRecord,
  StoryboardRecord,
  StoryboardRegister,
} from "@/lib/types";

const REGISTERS: { value: StoryboardRegister; label: string; hint: string }[] = [
  { value: "sketch", label: "Marker sketch", hint: "For approving the cut" },
  { value: "line", label: "Line art", hint: "Clean, diagrammatic" },
  { value: "mono", label: "Black & white", hint: "Photographic, no colour" },
  { value: "photoreal", label: "Photoreal", hint: "For pitch boards" },
];

const ASPECTS = ["16:9", "9:16", "1:1", "4:5", "21:9"];
const PANEL_COUNTS = [4, 6, 8, 10, 12, 16, 20, 24];

type Props = {
  clientId: string | null;
  projectId: string | null;
  brandKitId: string | null;
};

/**
 * Storyboards — script in, boarded sequence out.
 *
 * The flow is deliberately three steps rather than one button. The world is
 * decided and approved before a single panel is drawn, because forty panels
 * of the wrong face is the expensive mistake this feature exists to avoid.
 */
export function Storyboard({ clientId, projectId, brandKitId }: Props) {
  const [boards, setBoards] = useState<StoryboardRecord[] | null>(null);
  const [openId, setOpenId] = useState<string | null>(null);

  const load = useCallback(async () => {
    try {
      const params = clientId ? `?clientId=${clientId}` : "";
      const res = await fetch(`/api/storyboards${params}`);
      const json = await readJson<{ storyboards?: StoryboardRecord[] }>(res);
      setBoards(json.storyboards ?? []);
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Could not load boards");
      setBoards([]);
    }
  }, [clientId]);

  useEffect(() => {
    void load();
  }, [load]);

  if (openId) {
    return (
      <BoardDetail
        id={openId}
        onBack={() => {
          setOpenId(null);
          void load();
        }}
      />
    );
  }

  return (
    <div className="mx-auto max-w-5xl space-y-6">
      <NewBoard
        clientId={clientId}
        projectId={projectId}
        brandKitId={brandKitId}
        onCreated={(id) => {
          void load();
          setOpenId(id);
        }}
      />

      {boards === null ? (
        <div className="flex items-center justify-center gap-2 py-10 text-sm text-muted-foreground">
          <Loader2 className="size-4 animate-spin" /> Loading boards…
        </div>
      ) : boards.length === 0 ? (
        <p className="rounded-2xl border border-dashed border-border px-6 py-10 text-center text-sm text-muted-foreground">
          No boards yet. Paste a script or a brief above and Athar will break it
          into a cast, a set of locations, and a sequence of panels.
        </p>
      ) : (
        <div className="grid gap-3 sm:grid-cols-2">
          {boards.map((b) => (
            <button
              key={b.id}
              type="button"
              onClick={() => setOpenId(b.id)}
              className="rounded-2xl border border-border bg-card p-4 text-left transition hover:border-gold/40"
            >
              <p className="truncate text-sm font-medium text-foreground">
                {b.title}
              </p>
              <p className="mt-1 text-xs text-muted-foreground">
                {b.ready_count ?? 0}/{b.panel_count ?? 0} panels ·{" "}
                {REGISTERS.find((r) => r.value === b.register)?.label ??
                  b.register}{" "}
                · {b.aspect}
              </p>
            </button>
          ))}
        </div>
      )}
    </div>
  );
}

function NewBoard({
  clientId,
  projectId,
  brandKitId,
  onCreated,
}: Props & { onCreated: (id: string) => void }) {
  const [script, setScript] = useState("");
  const [title, setTitle] = useState("");
  const [panelCount, setPanelCount] = useState(8);
  const [register, setRegister] = useState<StoryboardRegister>("sketch");
  const [aspect, setAspect] = useState("16:9");
  const [busy, setBusy] = useState(false);

  const submit = async () => {
    if (!script.trim() || busy) return;
    setBusy(true);
    try {
      const { res, json } = await postJson<{
        storyboard?: StoryboardRecord;
        error?: string;
      }>("/api/storyboards/breakdown", {
        title,
        script,
        panelCount,
        register,
        aspect,
        clientId,
        projectId,
        brandKitId,
      });
      if (!res.ok || !json.storyboard) {
        throw new Error(json.error ?? "Breakdown failed");
      }
      toast.success("Broken down — approve the cast, then draw the panels");
      setScript("");
      setTitle("");
      onCreated(json.storyboard.id);
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Breakdown failed");
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="rounded-2xl border border-border bg-card p-4">
      <div className="mb-3 flex items-center gap-2">
        <Clapperboard className="size-4 text-gold" />
        <p className="text-sm font-medium text-foreground">New board</p>
      </div>

      <Textarea
        value={script}
        onChange={(e) => setScript(e.target.value)}
        placeholder="Paste the script, or describe the film. Name the people and the places — the more specific the brief, the tighter the board holds together."
        className="min-h-32 bg-background text-sm"
      />

      <div className="mt-3 flex flex-wrap items-center gap-2">
        <Input
          value={title}
          onChange={(e) => setTitle(e.target.value)}
          placeholder="Board title (optional)"
          className="h-9 min-w-[12rem] flex-1 bg-background text-sm"
        />

        <Select
          value={String(panelCount)}
          onValueChange={(v) => setPanelCount(Number(v))}
        >
          <SelectTrigger className="h-9 w-auto min-w-[6.5rem] bg-background text-xs">
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            {PANEL_COUNTS.map((n) => (
              <SelectItem key={n} value={String(n)}>
                {n} panels
              </SelectItem>
            ))}
          </SelectContent>
        </Select>

        <Select
          value={register}
          onValueChange={(v) => setRegister(v as StoryboardRegister)}
        >
          <SelectTrigger className="h-9 w-auto min-w-[9rem] bg-background text-xs">
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            {REGISTERS.map((r) => (
              <SelectItem key={r.value} value={r.value}>
                <span className="flex flex-col items-start gap-0.5 py-0.5">
                  <span>{r.label}</span>
                  <span className="text-[10px] text-muted-foreground">
                    {r.hint}
                  </span>
                </span>
              </SelectItem>
            ))}
          </SelectContent>
        </Select>

        <Select value={aspect} onValueChange={setAspect}>
          <SelectTrigger className="h-9 w-auto min-w-[5rem] bg-background text-xs">
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            {ASPECTS.map((a) => (
              <SelectItem key={a} value={a}>
                {a}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>

        <Button
          onClick={() => void submit()}
          disabled={busy || !script.trim()}
          className="h-9 gap-1.5 rounded-full bg-gold px-4 text-xs text-primary-foreground hover:bg-gold/90"
        >
          {busy ? (
            <Loader2 className="size-3.5 animate-spin" />
          ) : (
            <Sparkles className="size-3.5" />
          )}
          Break it down
        </Button>
      </div>
    </div>
  );
}

type Full = {
  board: StoryboardRecord;
  entities: StoryboardEntityRecord[];
  panels: StoryboardPanelRecord[];
};

function BoardDetail({ id, onBack }: { id: string; onBack: () => void }) {
  const [data, setData] = useState<Full | null>(null);
  const [busyIds, setBusyIds] = useState<string[]>([]);
  const [renderingAll, setRenderingAll] = useState(false);

  const load = useCallback(async () => {
    try {
      const res = await fetch(`/api/storyboards/${id}`);
      const json = await readJson<Full & { error?: string }>(res);
      if (!res.ok) throw new Error(json.error ?? "Could not load the board");
      setData(json);
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Could not load");
    }
  }, [id]);

  useEffect(() => {
    void load();
  }, [load]);

  const mark = (key: string, on: boolean) =>
    setBusyIds((prev) => (on ? [...prev, key] : prev.filter((k) => k !== key)));

  const renderSheet = async (entity: StoryboardEntityRecord) => {
    mark(entity.id, true);
    try {
      const { res, json } = await postJson<{ error?: string }>(
        `/api/storyboards/${id}/entities/${entity.id}`,
        {}
      );
      if (!res.ok) throw new Error(json.error ?? "Render failed");
      await load();
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Render failed");
    } finally {
      mark(entity.id, false);
    }
  };

  const approve = async (entity: StoryboardEntityRecord) => {
    try {
      const res = await fetch(`/api/storyboards/${id}/entities/${entity.id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ approved: !entity.approved_at }),
      });
      if (!res.ok) throw new Error("Could not update");
      await load();
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Could not update");
    }
  };

  const renderPanel = useCallback(
    async (panel: StoryboardPanelRecord) => {
      mark(panel.id, true);
      try {
        const { res, json } = await postJson<{ error?: string }>(
          `/api/storyboards/${id}/panels/${panel.id}`,
          {}
        );
        if (!res.ok) throw new Error(json.error ?? "Render failed");
        return true;
      } catch (err) {
        toast.error(
          `Panel ${panel.number}: ${err instanceof Error ? err.message : "failed"}`
        );
        return false;
      } finally {
        mark(panel.id, false);
      }
    },
    [id]
  );

  const renderAll = async () => {
    if (!data || renderingAll) return;
    const pending = data.panels.filter((p) => p.status !== "ready");
    if (pending.length === 0) return;
    setRenderingAll(true);
    try {
      // Three at a time: enough to keep the board moving without hammering
      // the provider or stacking cost faster than it can be watched.
      for (let i = 0; i < pending.length; i += 3) {
        await Promise.all(pending.slice(i, i + 3).map(renderPanel));
        await load();
      }
      toast.success("Board drawn");
    } finally {
      setRenderingAll(false);
      await load();
    }
  };

  if (!data) {
    return (
      <div className="flex items-center justify-center gap-2 py-16 text-sm text-muted-foreground">
        <Loader2 className="size-4 animate-spin" /> Loading board…
      </div>
    );
  }

  const { board, entities, panels } = data;
  const approvedCount = entities.filter((e) => e.approved_at).length;
  const readyCount = panels.filter((p) => p.status === "ready").length;
  const flagged = panels.filter((p) => p.status === "flagged").length;

  return (
    <div className="mx-auto max-w-5xl space-y-6">
      <div className="flex flex-wrap items-center gap-2">
        <Button
          variant="outline"
          size="sm"
          onClick={onBack}
          className="h-8 gap-1.5 rounded-full border-border bg-card text-xs"
        >
          <ArrowLeft className="size-3.5" /> All boards
        </Button>
        <div className="min-w-0 flex-1">
          <p className="truncate text-sm font-medium text-foreground">
            {board.title}
          </p>
          <p className="text-xs text-muted-foreground">
            {approvedCount}/{entities.length} approved · {readyCount}/
            {panels.length} panels
            {flagged > 0 ? ` · ${flagged} flagged` : ""}
          </p>
        </div>
        <Button
          variant="outline"
          size="sm"
          onClick={() => window.open(`/storyboards/${id}/print`, "_blank")}
          className="h-8 gap-1.5 rounded-full border-border bg-card text-xs"
          disabled={readyCount === 0}
        >
          <Printer className="size-3.5" /> Export
        </Button>
        <Button
          size="sm"
          onClick={() => void renderAll()}
          disabled={renderingAll || approvedCount === 0}
          className="h-8 gap-1.5 rounded-full bg-gold px-4 text-xs text-primary-foreground hover:bg-gold/90"
        >
          {renderingAll ? (
            <Loader2 className="size-3.5 animate-spin" />
          ) : (
            <Film className="size-3.5" />
          )}
          Draw the board
        </Button>
      </div>

      {/* The bible — approved before anything is drawn. */}
      <section>
        <h3 className="mb-2 text-xs tracking-[0.15em] text-muted-foreground uppercase">
          The bible
        </h3>
        {approvedCount === 0 && (
          <p className="mb-3 rounded-xl border border-gold/25 bg-gold-soft/40 px-3 py-2 text-xs text-muted-foreground">
            Render each character and location, then approve the ones that look
            right. Panels are drawn against these sheets — approving first is
            what keeps panel 20 the same person as panel 2.
          </p>
        )}
        <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 md:grid-cols-4">
          {entities.map((e) => (
            <div
              key={e.id}
              className={cn(
                "overflow-hidden rounded-xl border bg-card",
                e.approved_at ? "border-gold" : "border-border"
              )}
            >
              <div className="relative aspect-square bg-muted/30">
                {e.reference_url ? (
                  // eslint-disable-next-line @next/next/no-img-element
                  <img
                    src={e.reference_url}
                    alt={e.name}
                    className="size-full object-cover"
                  />
                ) : (
                  <div className="flex size-full items-center justify-center text-[11px] text-muted-foreground">
                    No sheet yet
                  </div>
                )}
                {busyIds.includes(e.id) && (
                  <div className="absolute inset-0 flex items-center justify-center bg-black/50">
                    <Loader2 className="size-5 animate-spin text-white" />
                  </div>
                )}
              </div>
              <div className="space-y-1.5 p-2.5">
                <p className="truncate text-xs font-medium text-foreground">
                  {e.name}
                </p>
                <p className="text-[10px] text-muted-foreground capitalize">
                  {e.kind}
                </p>
                <div className="flex gap-1.5">
                  <button
                    type="button"
                    onClick={() => void renderSheet(e)}
                    disabled={busyIds.includes(e.id)}
                    className="flex-1 rounded-md bg-white/5 py-1 text-[10px] text-muted-foreground transition hover:text-foreground"
                  >
                    {e.reference_url ? "Redraw" : "Draw"}
                  </button>
                  {e.reference_url && (
                    <button
                      type="button"
                      onClick={() => void approve(e)}
                      className={cn(
                        "flex-1 rounded-md py-1 text-[10px] transition",
                        e.approved_at
                          ? "bg-gold text-primary-foreground"
                          : "bg-white/5 text-muted-foreground hover:text-foreground"
                      )}
                    >
                      {e.approved_at ? "Approved" : "Approve"}
                    </button>
                  )}
                </div>
              </div>
            </div>
          ))}
        </div>
      </section>

      {/* The panels. */}
      <section>
        <h3 className="mb-2 text-xs tracking-[0.15em] text-muted-foreground uppercase">
          Panels
        </h3>
        <div className="grid gap-4 sm:grid-cols-2">
          {panels.map((p) => (
            <PanelCard
              key={p.id}
              panel={p}
              busy={busyIds.includes(p.id)}
              onRender={() => void renderPanel(p).then(load)}
            />
          ))}
        </div>
      </section>
    </div>
  );
}

function PanelCard({
  panel,
  busy,
  onRender,
}: {
  panel: StoryboardPanelRecord;
  busy: boolean;
  onRender: () => void;
}) {
  const score =
    panel.continuity_score != null ? Number(panel.continuity_score) : null;

  return (
    <div className="overflow-hidden rounded-2xl border border-border bg-card">
      <div className="relative aspect-video bg-muted/30">
        {panel.image_url ? (
          // eslint-disable-next-line @next/next/no-img-element
          <img
            src={panel.image_url}
            alt={`Panel ${panel.number}`}
            className="size-full object-cover"
          />
        ) : (
          <div className="flex size-full items-center justify-center text-xs text-muted-foreground">
            Not drawn yet
          </div>
        )}
        {busy && (
          <div className="absolute inset-0 flex items-center justify-center bg-black/55">
            <Loader2 className="size-6 animate-spin text-white" />
          </div>
        )}
        <span className="absolute top-2 left-2 rounded-md bg-black/70 px-2 py-0.5 text-[11px] font-medium text-white">
          {panel.number}
        </span>
        <span className="absolute top-2 right-2 rounded-md bg-black/70 px-2 py-0.5 text-[10px] tracking-wider text-white uppercase">
          {panel.shot_size}
        </span>
      </div>

      <div className="space-y-1.5 p-3">
        <p className="text-xs text-foreground/90">{panel.action}</p>
        {panel.dialogue && (
          <p className="text-xs text-muted-foreground italic">
            &ldquo;{panel.dialogue}&rdquo;
          </p>
        )}
        <p className="text-[10px] text-muted-foreground">
          {panel.angle} · {panel.lens || "lens tbd"} ·{" "}
          {panel.screen_direction}
          {panel.duration_s ? ` · ${Number(panel.duration_s)}s` : ""}
        </p>
        {panel.motion && (
          <p className="text-[10px] text-muted-foreground">↝ {panel.motion}</p>
        )}

        {panel.status === "flagged" && (
          <p className="flex items-start gap-1.5 rounded-md bg-amber-500/10 px-2 py-1.5 text-[10px] text-amber-300">
            <TriangleAlert className="mt-px size-3 shrink-0" />
            <span>
              Continuity {score != null ? `${Math.round(score * 100)}%` : "low"}
              {panel.continuity_notes ? ` — ${panel.continuity_notes}` : ""}
            </span>
          </p>
        )}
        {panel.status === "failed" && panel.error && (
          <p className="rounded-md bg-red-500/10 px-2 py-1.5 text-[10px] text-red-300">
            {panel.error}
          </p>
        )}
        {panel.status === "ready" && score != null && (
          <p className="flex items-center gap-1 text-[10px] text-muted-foreground">
            <Check className="size-3 text-gold" />
            Continuity {Math.round(score * 100)}%
          </p>
        )}

        <button
          type="button"
          onClick={onRender}
          disabled={busy}
          className="mt-1 flex w-full items-center justify-center gap-1.5 rounded-lg bg-white/5 py-1.5 text-[11px] text-muted-foreground transition hover:text-foreground"
        >
          <RefreshCw className="size-3" />
          {panel.image_url ? "Redraw panel" : "Draw panel"}
        </button>
      </div>
    </div>
  );
}
