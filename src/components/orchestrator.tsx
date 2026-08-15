"use client";

import { useState } from "react";
import { toast } from "sonner";
import {
  Loader2,
  Sparkles,
  Wand2,
  X,
  Plus,
  Check,
  Clapperboard,
} from "lucide-react";
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
import { cn } from "@/lib/utils";

const ASPECTS = ["16:9", "9:16", "1:1", "4:5"];

type Shot = {
  id: string;
  title: string;
  prompt: string;
  aspect: string;
  status: "idle" | "running" | "done" | "error";
  url?: string | null;
  error?: string;
};

type Props = {
  clientId?: string | null;
  projectId?: string | null;
  brandKitId?: string | null;
  clientName?: string | null;
  projectName?: string | null;
  onGenerated?: () => void;
};

let uid = 0;
const nextId = () => `shot-${++uid}`;

export function Orchestrator({
  clientId,
  projectId,
  brandKitId,
  clientName,
  projectName,
  onGenerated,
}: Props) {
  const [brief, setBrief] = useState("");
  const [shotCount, setShotCount] = useState(4);
  const [planning, setPlanning] = useState(false);
  const [shots, setShots] = useState<Shot[] | null>(null);
  const [running, setRunning] = useState(false);

  async function planShots() {
    if (!brief.trim()) return;
    setPlanning(true);
    try {
      const res = await fetch("/api/orchestrate", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          brief: brief.trim(),
          shotCount,
          brandKitId: brandKitId ?? undefined,
        }),
      });
      const json = await res.json();
      if (!res.ok) throw new Error(json.error);
      setShots(
        (json.shots as Omit<Shot, "id" | "status">[]).map((s) => ({
          ...s,
          id: nextId(),
          status: "idle" as const,
        }))
      );
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Planning failed");
    } finally {
      setPlanning(false);
    }
  }

  function patchShot(id: string, patch: Partial<Shot>) {
    setShots(
      (prev) => prev?.map((s) => (s.id === id ? { ...s, ...patch } : s)) ?? null
    );
  }

  async function generateAll() {
    if (!shots?.length) return;
    setRunning(true);

    /**
     * The first rendered shot becomes the key frame, and every later shot is
     * generated against it as a visual reference. Describing the subject
     * identically isn't enough on its own — the model still redraws the face
     * and wardrobe each time. Anchoring to real pixels is what actually holds
     * a person across frames.
     *
     * The first shot is rendered at hero tier: everything downstream inherits
     * its look, so it's the one frame worth paying more for.
     */
    let keyFrameUrl: string | null = null;

    // Sequential so cost + rate are predictable, the story renders in order,
    // and the key frame exists before anything references it.
    for (const shot of shots) {
      if (!shot.prompt.trim()) continue;
      patchShot(shot.id, { status: "running", error: undefined });
      try {
        // Snapshot the anchor before the request. Reading the mutable
        // `keyFrameUrl` directly inside the body makes its narrowed type
        // depend on the response it is later assigned from, which TypeScript
        // (correctly) rejects as circular.
        const anchor: string | null = keyFrameUrl;
        const isKeyFrame = anchor === null;
        const res = await fetch("/api/generate", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            mode: "t2i",
            tier: isKeyFrame ? "hero" : "standard",
            prompt: { subject: shot.prompt },
            aspect: shot.aspect,
            numOutputs: 1,
            resolution: "2K",
            referenceUrls: anchor ? [anchor] : undefined,
            projectId: projectId ?? undefined,
            brandKitId: brandKitId ?? undefined,
          }),
        });
        // Annotated: without it the inferred type of `json` flows into
        // `keyFrameUrl`, which the request body reads, making `res` depend on
        // its own response.
        const json: {
          error?: string;
          generation?: { output_url?: string | null };
        } = await res.json();
        if (!res.ok) throw new Error(json.error ?? "Generation failed");
        const url: string | null = json.generation?.output_url ?? null;
        // Only promote a real URL — a failed key frame must not leave the
        // rest of the campaign anchored to nothing.
        if (!keyFrameUrl && url) keyFrameUrl = url;
        patchShot(shot.id, { status: "done", url });
      } catch (err) {
        patchShot(shot.id, {
          status: "error",
          error: err instanceof Error ? err.message : "Failed",
        });
      }
    }
    setRunning(false);
    onGenerated?.();
    toast.success("Campaign shots generated — saved to the Library");
  }

  const doneCount = shots?.filter((s) => s.status === "done").length ?? 0;

  return (
    <div className="mx-auto max-w-3xl space-y-6">
      {/* Brief */}
      <div className="rounded-2xl bg-card p-5 ring-1 ring-border">
        <label className="text-[11px] font-medium tracking-[0.16em] text-muted-foreground uppercase">
          Campaign brief
        </label>
        <Textarea
          value={brief}
          onChange={(e) => setBrief(e.target.value)}
          placeholder="e.g. 15-sec Eid campaign — a nostalgic UAE family gathering, warm and cultural, ending on the product. Casual, heartfelt."
          className="mt-2 min-h-24 bg-background"
        />
        <div className="mt-3 flex flex-wrap items-center gap-2">
          <Select
            value={String(shotCount)}
            onValueChange={(v) => setShotCount(Number(v))}
          >
            <SelectTrigger className="h-9 w-auto min-w-[6.5rem]">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              {[3, 4, 5, 6, 8].map((n) => (
                <SelectItem key={n} value={String(n)}>
                  {n} shots
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
          <div className="flex-1" />
          <Button
            onClick={planShots}
            disabled={planning || !brief.trim()}
            className="gap-2 bg-gold text-primary-foreground hover:bg-gold/90"
          >
            {planning ? (
              <Loader2 className="size-4 animate-spin" />
            ) : (
              <Wand2 className="size-4" />
            )}
            {shots ? "Re-plan shots" : "Break into shots"}
          </Button>
        </div>
        {(clientName || projectName) && (
          <p className="mt-3 text-[11px] text-muted-foreground">
            Shots save to{" "}
            <span className="text-foreground">
              {[clientName, projectName].filter(Boolean).join(" ▸ ")}
            </span>
            {brandKitId ? " · brand kit applied" : ""}.
          </p>
        )}
      </div>

      {/* Shot list */}
      {shots && (
        <div className="space-y-3">
          <div className="flex items-center justify-between">
            <p className="text-sm font-medium">
              Shot list{" "}
              <span className="text-muted-foreground">
                ({shots.length})
              </span>
            </p>
            <div className="flex items-center gap-2">
              {running && (
                <span className="text-xs text-muted-foreground">
                  {doneCount}/{shots.length} done
                </span>
              )}
              <Button
                onClick={generateAll}
                disabled={running || shots.length === 0}
                className="gap-2 bg-gold text-primary-foreground hover:bg-gold/90"
              >
                {running ? (
                  <Loader2 className="size-4 animate-spin" />
                ) : (
                  <Sparkles className="size-4" />
                )}
                Generate all {shots.length}
              </Button>
            </div>
          </div>

          {shots.map((shot, i) => (
            <div
              key={shot.id}
              className={cn(
                "flex gap-3 rounded-xl bg-card p-3 ring-1 transition",
                shot.status === "done"
                  ? "ring-gold/40"
                  : shot.status === "error"
                    ? "ring-red-500/40"
                    : "ring-border"
              )}
            >
              <div className="flex size-16 shrink-0 items-center justify-center overflow-hidden rounded-lg bg-secondary text-muted-foreground">
                {shot.status === "running" ? (
                  <Loader2 className="size-5 animate-spin text-gold" />
                ) : shot.url ? (
                  // eslint-disable-next-line @next/next/no-img-element
                  <img
                    src={shot.url}
                    alt={shot.title}
                    className="size-full object-cover"
                  />
                ) : shot.status === "done" ? (
                  <Check className="size-5 text-gold" />
                ) : (
                  <span className="font-mono text-sm">{i + 1}</span>
                )}
              </div>
              <div className="min-w-0 flex-1 space-y-1.5">
                <div className="flex items-center gap-2">
                  <Input
                    value={shot.title}
                    onChange={(e) =>
                      patchShot(shot.id, { title: e.target.value })
                    }
                    className="h-7 flex-1 border-0 bg-transparent px-1 text-sm font-medium"
                  />
                  <Select
                    value={shot.aspect}
                    onValueChange={(v) => patchShot(shot.id, { aspect: v })}
                  >
                    <SelectTrigger className="h-7 w-auto min-w-[4rem] text-xs">
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
                  <button
                    type="button"
                    aria-label="Remove shot"
                    onClick={() =>
                      setShots(
                        (prev) => prev?.filter((s) => s.id !== shot.id) ?? null
                      )
                    }
                    className="rounded-md p-1 text-muted-foreground hover:text-foreground"
                  >
                    <X className="size-3.5" />
                  </button>
                </div>
                <Textarea
                  value={shot.prompt}
                  onChange={(e) =>
                    patchShot(shot.id, { prompt: e.target.value })
                  }
                  className="min-h-14 bg-background text-xs"
                />
                {shot.error && (
                  <p className="text-[11px] text-red-400">{shot.error}</p>
                )}
              </div>
            </div>
          ))}

          <button
            type="button"
            onClick={() =>
              setShots((prev) => [
                ...(prev ?? []),
                {
                  id: nextId(),
                  title: "New shot",
                  prompt: "",
                  aspect: "4:5",
                  status: "idle",
                },
              ])
            }
            className="flex w-full items-center justify-center gap-1.5 rounded-xl border border-dashed border-border py-3 text-xs text-muted-foreground transition hover:text-foreground"
          >
            <Plus className="size-3.5" />
            Add a shot
          </button>

          <p className="flex items-center gap-1.5 px-1 text-[11px] text-muted-foreground">
            <Clapperboard className="size-3.5" />
            Next: animate the winning stills into clips — coming to the chain.
          </p>
        </div>
      )}
    </div>
  );
}
