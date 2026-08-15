"use client";

import { useState } from "react";
import { Loader2 } from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";

type Props = {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  /** What is being renamed, lowercase — "client", "project", "brand kit". */
  entityLabel: string;
  currentName: string;
  /** PATCH endpoint; receives `{ name }` and returns the updated record. */
  endpoint: string;
  /** Called with the new name once the server confirms it. */
  onRenamed: (name: string) => void;
};

/**
 * Shared rename dialog for clients, projects and brand kits — all three
 * expose the same PATCH `{ name }` contract, so the UI is identical.
 */
export function RenameDialog({
  open,
  onOpenChange,
  entityLabel,
  currentName,
  endpoint,
  onRenamed,
}: Props) {
  const [name, setName] = useState(currentName);
  const [saving, setSaving] = useState(false);

  // Re-seed the field each time the dialog opens, using React's documented
  // "adjust state during render" pattern rather than an effect.
  const [prevOpen, setPrevOpen] = useState(open);
  if (open !== prevOpen) {
    setPrevOpen(open);
    if (open) setName(currentName);
  }

  const trimmed = name.trim();
  const unchanged = trimmed === currentName.trim();

  async function onSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (!trimmed || saving || unchanged) return;
    setSaving(true);
    try {
      const res = await fetch(endpoint, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ name: trimmed }),
      });
      const json = await res.json();
      if (!res.ok) throw new Error(json.error ?? "Rename failed");
      onRenamed(trimmed);
      onOpenChange(false);
      toast.success(`Renamed to “${trimmed}”`);
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Rename failed");
    } finally {
      setSaving(false);
    }
  }

  return (
    <Dialog open={open} onOpenChange={(o) => !saving && onOpenChange(o)}>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle>Rename {entityLabel}</DialogTitle>
          <DialogDescription>
            This updates the name everywhere. Nothing else changes — existing
            work stays attached.
          </DialogDescription>
        </DialogHeader>
        <form onSubmit={onSubmit} className="space-y-3">
          <Input
            value={name}
            onChange={(e) => setName(e.target.value)}
            placeholder={`${entityLabel} name`}
            maxLength={120}
            required
            autoFocus
          />
          <Button
            type="submit"
            disabled={saving || !trimmed || unchanged}
            className="w-full bg-gold text-primary-foreground hover:bg-gold/90"
          >
            {saving ? (
              <>
                <Loader2 className="size-4 animate-spin" />
                Saving…
              </>
            ) : (
              "Save name"
            )}
          </Button>
        </form>
      </DialogContent>
    </Dialog>
  );
}
