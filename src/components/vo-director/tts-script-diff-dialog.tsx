"use client";

import { useState } from "react";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { diffWords, joinDiffSpans } from "@/lib/word-diff";
import { cn } from "@/lib/utils";

export type DiffRow = { id: string; label?: string; original: string; tts: string };

type Props = {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  rows: DiffRow[];
  /** Called with the row's full rebuilt text after an inline edit. */
  onEditRow: (id: string, newText: string) => void;
  title?: string;
};

/**
 * "View TTS Script" / Pronunciation Editor — same dialog, two entry points.
 * Highlights every word Athar changed from the original script and lets the
 * user override one without touching the original text in the block editor.
 */
export function TtsScriptDiffDialog({ open, onOpenChange, rows, onEditRow, title }: Props) {
  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-h-[85dvh] gap-4 overflow-y-auto sm:max-w-2xl">
        <DialogHeader>
          <DialogTitle>{title ?? "View TTS script"}</DialogTitle>
        </DialogHeader>
        <p className="text-xs text-muted-foreground">
          Highlighted words were adapted for pronunciation or dialect. Click one to override it —
          your original script is never changed.
        </p>
        <div className="space-y-4">
          {rows.map((row) => (
            <DiffRowView key={row.id} row={row} onEdit={(text) => onEditRow(row.id, text)} />
          ))}
          {rows.length === 0 && (
            <p className="py-6 text-center text-xs text-muted-foreground">Nothing to show yet.</p>
          )}
        </div>
      </DialogContent>
    </Dialog>
  );
}

function DiffRowView({ row, onEdit }: { row: DiffRow; onEdit: (text: string) => void }) {
  const [editingKey, setEditingKey] = useState<number | null>(null);
  const [draft, setDraft] = useState("");
  const spans = diffWords(row.original, row.tts);

  const commit = (key: number, value: string) => {
    const next = spans.map((s) => (s.key === key ? { ...s, text: value } : s));
    onEdit(joinDiffSpans(next));
    setEditingKey(null);
  };

  return (
    <div className="rounded-lg border border-white/8 p-3">
      {row.label && (
        <p className="mb-1 text-[10px] tracking-wide text-muted-foreground uppercase">
          {row.label}
        </p>
      )}
      <p dir="rtl" className="mb-1.5 text-xs text-muted-foreground/70 line-through decoration-muted-foreground/30">
        {row.original}
      </p>
      <div dir="rtl" className="flex flex-wrap gap-x-1 text-sm leading-relaxed">
        {spans.map((span) =>
          span.changed ? (
            editingKey === span.key ? (
              <input
                key={span.key}
                autoFocus
                value={draft}
                onChange={(e) => setDraft(e.target.value)}
                onBlur={() => commit(span.key, draft)}
                onKeyDown={(e) => {
                  if (e.key === "Enter") commit(span.key, draft);
                  if (e.key === "Escape") setEditingKey(null);
                }}
                dir="rtl"
                className="min-w-8 rounded bg-black/30 px-1 text-sm ring-1 ring-gold/40 outline-none"
                style={{ width: `${Math.max(2, draft.length)}ch` }}
              />
            ) : (
              <button
                key={span.key}
                type="button"
                onClick={() => {
                  setEditingKey(span.key);
                  setDraft(span.text);
                }}
                className={cn(
                  "rounded px-1 ring-1 ring-gold/40 transition hover:bg-gold-soft/20",
                  "bg-gold-soft/10 text-gold"
                )}
              >
                {span.text || "…"}
              </button>
            )
          ) : (
            <span key={span.key}>{span.text}</span>
          )
        )}
      </div>
    </div>
  );
}
