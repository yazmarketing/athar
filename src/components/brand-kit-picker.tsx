"use client";

import { useCallback, useEffect, useState } from "react";
import { Loader2, Palette, Plus, SquarePen } from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectSeparator,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { cn } from "@/lib/utils";
import type { BrandKitRecord } from "@/lib/types";

export const ACTIVE_BRAND_KIT_STORAGE_KEY = "yaz-motion-active-brand-kit";

/** Sentinels for the actions folded into the dropdown in compact mode. */
const NEW = "__new__";
const EDIT = "__edit__";

type Props = {
  activeBrandKitId: string | null;
  onActiveBrandKitChange: (id: string | null) => void;
  brandKits: BrandKitRecord[];
  onBrandKitsChange: (kits: BrandKitRecord[]) => void;
  /** Scope the list + new kits to this client (null = all clients). */
  clientId?: string | null;
  /** Dock variant: a single pill sized for the generate bar's chip row. */
  compact?: boolean;
  className?: string;
};

export function BrandKitPicker({
  activeBrandKitId,
  onActiveBrandKitChange,
  brandKits,
  onBrandKitsChange,
  clientId,
  compact = false,
  className,
}: Props) {
  const [createOpen, setCreateOpen] = useState(false);
  const [name, setName] = useState("");
  const [client, setClient] = useState("");
  const [brandTokens, setBrandTokens] = useState("");
  const [negativeAdditions, setNegativeAdditions] = useState("");
  const [creating, setCreating] = useState(false);
  const [editOpen, setEditOpen] = useState(false);
  const [editName, setEditName] = useState("");
  const [editClient, setEditClient] = useState("");
  const [editBrandTokens, setEditBrandTokens] = useState("");
  const [editNegativeAdditions, setEditNegativeAdditions] = useState("");
  const [saving, setSaving] = useState(false);

  const loadBrandKits = useCallback(async () => {
    try {
      const qs = clientId ? `?clientId=${encodeURIComponent(clientId)}` : "";
      const res = await fetch(`/api/brand-kits${qs}`);
      const json = await res.json();
      if (!res.ok) throw new Error(json.error);
      onBrandKitsChange(json.brandKits as BrandKitRecord[]);
    } catch (err) {
      toast.error(
        err instanceof Error ? err.message : "Load failed"
      );
    }
  }, [onBrandKitsChange, clientId]);

  useEffect(() => {
    void loadBrandKits();
  }, [loadBrandKits]);

  const activeKit = brandKits.find((k) => k.id === activeBrandKitId);

  function openEdit() {
    if (!activeKit) return;
    setEditName(activeKit.name);
    setEditClient(activeKit.client ?? "");
    setEditBrandTokens(activeKit.brand_tokens);
    setEditNegativeAdditions(activeKit.negative_additions ?? "");
    setEditOpen(true);
  }

  async function onSaveEdit(e: React.FormEvent) {
    e.preventDefault();
    if (!activeKit || !editName.trim() || !editBrandTokens.trim()) return;
    setSaving(true);
    try {
      const res = await fetch(`/api/brand-kits/${activeKit.id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          name: editName.trim(),
          client: editClient.trim() || null,
          brandTokens: editBrandTokens.trim(),
          negativeAdditions: editNegativeAdditions.trim(),
        }),
      });
      const json = await res.json();
      if (!res.ok) throw new Error(json.error);
      const updated = json.brandKit as BrandKitRecord;
      onBrandKitsChange(
        brandKits.map((k) => (k.id === updated.id ? updated : k))
      );
      setEditOpen(false);
      toast.success(`Brand kit “${updated.name}” updated`);
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Update failed");
    } finally {
      setSaving(false);
    }
  }

  async function onCreate(e: React.FormEvent) {
    e.preventDefault();
    if (!name.trim() || !brandTokens.trim()) return;
    setCreating(true);
    try {
      const res = await fetch("/api/brand-kits", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          name: name.trim(),
          client: client.trim() || undefined,
          clientId: clientId ?? undefined,
          brandTokens: brandTokens.trim(),
          negativeAdditions: negativeAdditions.trim() || undefined,
        }),
      });
      const json = await res.json();
      if (!res.ok) throw new Error(json.error);
      const kit = json.brandKit as BrandKitRecord;
      onBrandKitsChange([kit, ...brandKits]);
      onActiveBrandKitChange(kit.id);
      setCreateOpen(false);
      setName("");
      setClient("");
      setBrandTokens("");
      setNegativeAdditions("");
      toast.success(`Brand kit “${kit.name}” created`);
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Create failed");
    } finally {
      setCreating(false);
    }
  }

  const dialogs = (
    <>
      <Dialog open={editOpen} onOpenChange={setEditOpen}>
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle>Edit brand kit</DialogTitle>
            <DialogDescription>
              Changes apply to future generations that use this kit.
            </DialogDescription>
          </DialogHeader>
          <form onSubmit={onSaveEdit} className="space-y-3">
            <Input
              placeholder="Kit name"
              value={editName}
              onChange={(e) => setEditName(e.target.value)}
              required
              autoFocus
            />
            <Input
              placeholder="Client (optional)"
              value={editClient}
              onChange={(e) => setEditClient(e.target.value)}
            />
            <Textarea
              placeholder="Brand look"
              value={editBrandTokens}
              onChange={(e) => setEditBrandTokens(e.target.value)}
              required
              className="min-h-20"
            />
            <Textarea
              placeholder="Avoid (optional)"
              value={editNegativeAdditions}
              onChange={(e) => setEditNegativeAdditions(e.target.value)}
              className="min-h-14"
            />
            <Button
              type="submit"
              disabled={saving || !editName.trim() || !editBrandTokens.trim()}
              className="w-full bg-gold text-primary-foreground hover:bg-gold/90"
            >
              {saving ? (
                <>
                  <Loader2 className="size-4 animate-spin" />
                  Saving…
                </>
              ) : (
                "Save changes"
              )}
            </Button>
          </form>
        </DialogContent>
      </Dialog>

      <Dialog open={createOpen} onOpenChange={setCreateOpen}>
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle>New brand kit</DialogTitle>
            <DialogDescription>
              Reusable visual rules. The brand look is appended to every prompt
              generated while this kit is active.
            </DialogDescription>
          </DialogHeader>
          <form onSubmit={onCreate} className="space-y-3">
            <Input
              placeholder="Kit name — e.g. Athar Signature"
              value={name}
              onChange={(e) => setName(e.target.value)}
              required
              autoFocus
            />
            <Input
              placeholder="Client (optional)"
              value={client}
              onChange={(e) => setClient(e.target.value)}
            />
            <Textarea
              placeholder="Brand look — e.g. bold black and white, high contrast, editorial lighting"
              value={brandTokens}
              onChange={(e) => setBrandTokens(e.target.value)}
              required
              className="min-h-20"
            />
            <Textarea
              placeholder="Avoid (optional) — e.g. neon colors, cartoon style"
              value={negativeAdditions}
              onChange={(e) => setNegativeAdditions(e.target.value)}
              className="min-h-14"
            />
            <Button
              type="submit"
              disabled={creating || !name.trim() || !brandTokens.trim()}
              className="w-full bg-gold text-primary-foreground hover:bg-gold/90"
            >
              {creating ? (
                <>
                  <Loader2 className="size-4 animate-spin" />
                  Creating…
                </>
              ) : (
                "New kit"
              )}
            </Button>
          </form>
        </DialogContent>
      </Dialog>
    </>
  );

  const handleValueChange = (v: string) => {
    if (v === NEW) {
      setCreateOpen(true);
      return;
    }
    if (v === EDIT) {
      openEdit();
      return;
    }
    onActiveBrandKitChange(v === "none" ? null : v);
  };

  if (compact) {
    return (
      <>
        <Select value={activeBrandKitId ?? "none"} onValueChange={handleValueChange}>
          <SelectTrigger
            aria-label="Brand kit"
            className={cn(
              "h-8 w-auto gap-1.5 rounded-full border border-white/10 bg-white/5 px-3 text-xs text-muted-foreground transition hover:text-foreground",
              activeKit && "border-gold/30 text-foreground",
              className
            )}
          >
            <Palette className="size-3.5 shrink-0" />
            <SelectValue>{activeKit?.name ?? "No brand kit"}</SelectValue>
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="none">No brand kit</SelectItem>
            {brandKits.map((k) => (
              <SelectItem key={k.id} value={k.id}>
                {k.name}
              </SelectItem>
            ))}
            <SelectSeparator />
            <SelectItem value={NEW}>＋ New brand kit…</SelectItem>
            {activeKit && (
              <SelectItem value={EDIT}>✎ Edit “{activeKit.name}”…</SelectItem>
            )}
          </SelectContent>
        </Select>
        {dialogs}
      </>
    );
  }

  return (
    <div className={cn("space-y-2", className)}>
      <div className="flex items-center justify-between">
        <p className="text-[10px] font-medium tracking-[0.16em] text-muted-foreground uppercase">
          Brand kit
        </p>
        <div className="flex items-center gap-0.5">
          {activeKit && (
            <button
              type="button"
              title="Edit brand kit"
              aria-label="Edit brand kit"
              onClick={openEdit}
              className="rounded-md p-1 text-muted-foreground transition hover:bg-sidebar-accent hover:text-foreground"
            >
              <SquarePen className="size-3.5" />
            </button>
          )}
          <button
            type="button"
            title="New brand kit"
            aria-label="New brand kit"
            onClick={() => setCreateOpen(true)}
            className="rounded-md p-1 text-muted-foreground transition hover:bg-sidebar-accent hover:text-foreground"
          >
            <Plus className="size-3.5" />
          </button>
        </div>
      </div>

      <Select
        value={activeBrandKitId ?? "none"}
        onValueChange={(v) => onActiveBrandKitChange(v === "none" ? null : v)}
      >
        <SelectTrigger className="h-9 w-full border-sidebar-border bg-sidebar-accent/50 px-3 text-xs">
          <div className="flex min-w-0 items-center gap-2">
            <Palette className="size-3.5 shrink-0 text-muted-foreground" />
            <SelectValue placeholder="No brand kit">
              {activeKit ? activeKit.name : "No brand kit"}
            </SelectValue>
          </div>
        </SelectTrigger>
        <SelectContent>
          <SelectItem value="none">No brand kit</SelectItem>
          {brandKits.map((k) => (
            <SelectItem key={k.id} value={k.id}>
              <span className="flex flex-col items-start gap-0.5 py-0.5">
                <span>{k.name}</span>
                {k.client && (
                  <span className="text-[10px] text-muted-foreground">
                    {k.client}
                  </span>
                )}
              </span>
            </SelectItem>
          ))}
        </SelectContent>
      </Select>

      {dialogs}
    </div>
  );
}
