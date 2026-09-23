"use client";

import { Clapperboard, ImagePlus, Upload } from "lucide-react";
import { cn } from "@/lib/utils";

export type VideoWorkflow = "create" | "edit";

export function VideoWorkspaceControls({ workflow, onChange, busy, hasSource, imageCount, onSource, onImages }: {
  workflow: VideoWorkflow;
  onChange: (value: VideoWorkflow) => void;
  busy: boolean;
  hasSource: boolean;
  imageCount: number;
  onSource: () => void;
  onImages: () => void;
}) {
  return (
    <div className="mx-auto mb-5 w-full max-w-3xl">
      <div className="flex gap-1 border-b border-border" aria-label="Video workflow">
        {([['create', 'Create video'], ['edit', 'Edit video']] as const).map(([id, label]) => (
          <button key={id} type="button" disabled={busy} aria-pressed={workflow === id} onClick={() => onChange(id)} className={cn("border-b-2 px-3 py-3 text-sm transition disabled:opacity-50 sm:px-5", workflow === id ? "border-gold text-foreground" : "border-transparent text-muted-foreground hover:text-foreground")}>
            {label}
          </button>
        ))}
      </div>
      {workflow !== "create" && (
        <div className="mt-4 space-y-3">
          <div className="grid grid-cols-2 gap-3">
            <button type="button" disabled={busy} onClick={onSource} className="flex min-h-28 flex-col items-center justify-center gap-2 rounded-2xl border border-dashed border-border bg-card p-4 text-sm transition hover:border-gold/50 disabled:opacity-50">
              {busy ? <Upload className="size-5 animate-pulse text-gold" /> : <Clapperboard className="size-5 text-gold" />}
              <span>{busy ? "Uploading…" : hasSource ? "Replace source video" : "Upload a video to edit"}</span>
              <span className="text-xs text-muted-foreground">4–30 seconds · MP4 / MOV · 100 MB</span>
            </button>
            <button type="button" disabled={busy} onClick={onImages} className="flex min-h-28 flex-col items-center justify-center gap-2 rounded-2xl border border-dashed border-border bg-card p-4 text-sm transition hover:border-gold/50 disabled:opacity-50">
              <ImagePlus className="size-5 text-gold" />
              <span>{imageCount ? `${imageCount} image${imageCount > 1 ? "s" : ""} attached` : "Add elements or references"}</span>
              <span className="text-xs text-muted-foreground">Character, product or scene</span>
            </button>
          </div>
          <p className="text-xs leading-relaxed text-muted-foreground">
            Describe what to change in @video1. The edit preserves the source aspect ratio and approximate duration. Reference images guide replacements.
          </p>
        </div>
      )}
    </div>
  );
}
