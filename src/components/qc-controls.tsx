"use client";

import { useState } from "react";
import { BadgeCheck, CircleCheck, CircleX, Pencil } from "lucide-react";
import { toast } from "sonner";
import { cn } from "@/lib/utils";
import type { GenerationRecord } from "@/lib/types";

type Props = {
  generation: GenerationRecord;
  onUpdated?: (g: GenerationRecord) => void;
};

const QC_OPTIONS = [
  { id: "pass", label: "Pass", icon: CircleCheck, activeCls: "bg-foreground text-background ring-foreground" },
  { id: "revise", label: "Revise", icon: Pencil, activeCls: "bg-secondary text-foreground ring-border" },
  { id: "reject", label: "Reject", icon: CircleX, activeCls: "bg-transparent text-foreground ring-foreground" },
] as const;

/** Review gate: pass / revise / reject + client-ready flag (spec Phase 8). */
export function QcControls({ generation: g, onUpdated }: Props) {
  const [busy, setBusy] = useState(false);

  const patch = async (body: Record<string, unknown>, okMsg: string) => {
    if (busy) return;
    setBusy(true);
    try {
      const res = await fetch(`/api/generations/${g.id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(body),
      });
      const json = await res.json();
      if (!res.ok) throw new Error(json.error ?? "Update failed");
      toast.success(okMsg);
      onUpdated?.(json.generation as GenerationRecord);
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Update failed");
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="mt-3">
      <p className="mb-1.5 text-xs text-muted-foreground">Review</p>
      <div className="flex flex-wrap items-center gap-1.5">
        {QC_OPTIONS.map((opt) => {
          const active = g.qc_status === opt.id;
          const Icon = opt.icon;
          return (
            <button
              key={opt.id}
              type="button"
              disabled={busy}
              onClick={() =>
                void patch(
                  { qc_status: active ? null : opt.id },
                  active ? "Review cleared" : `Marked as ${opt.label}`
                )
              }
              className={cn(
                "inline-flex items-center gap-1.5 rounded-full px-3 py-1.5 text-xs ring-1 transition disabled:opacity-50",
                active
                  ? opt.activeCls
                  : "bg-white/5 text-muted-foreground ring-white/10 hover:text-foreground"
              )}
            >
              <Icon className="size-3.5" />
              {opt.label}
            </button>
          );
        })}

        <button
          type="button"
          disabled={busy}
          onClick={() =>
            void patch(
              { client_ready: !g.client_ready },
              g.client_ready ? "Client-ready removed" : "Marked client-ready"
            )
          }
          className={cn(
            "ml-auto inline-flex items-center gap-1.5 rounded-full px-3 py-1.5 text-xs ring-1 transition disabled:opacity-50",
            g.client_ready
              ? "bg-gold-soft text-gold ring-gold/40"
              : "bg-white/5 text-muted-foreground ring-white/10 hover:text-foreground"
          )}
        >
          <BadgeCheck className="size-3.5" />
          Client ready
        </button>
      </div>
    </div>
  );
}
