"use client";

import { useCallback, useEffect, useState } from "react";
import { Building2, Loader2, Pencil, Plus } from "lucide-react";
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
import {
  Select,
  SelectContent,
  SelectItem,
  SelectSeparator,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { RenameDialog } from "@/components/rename-dialog";
import { cn } from "@/lib/utils";
import type { ClientRecord } from "@/lib/types";

export const ACTIVE_CLIENT_STORAGE_KEY = "yaz-motion-active-client";

/** Sentinels for the actions folded into the dropdown in compact mode. */
const NEW = "__new__";
const RENAME = "__rename__";

type Props = {
  activeClientId: string | null;
  onActiveClientChange: (id: string | null) => void;
  clients: ClientRecord[];
  onClientsChange: (clients: ClientRecord[]) => void;
  /**
   * Dock variant: a single pill that fits the generate bar's chip row, with
   * "New" and "Rename" folded into the menu instead of separate icon buttons.
   */
  compact?: boolean;
  className?: string;
};

export function ClientPicker({
  activeClientId,
  onActiveClientChange,
  clients,
  onClientsChange,
  compact = false,
  className,
}: Props) {
  const [createOpen, setCreateOpen] = useState(false);
  const [renameOpen, setRenameOpen] = useState(false);
  const [name, setName] = useState("");
  const [creating, setCreating] = useState(false);

  const loadClients = useCallback(async () => {
    try {
      const res = await fetch("/api/clients");
      const json = await res.json();
      if (!res.ok) throw new Error(json.error);
      onClientsChange(json.clients as ClientRecord[]);
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Load failed");
    }
  }, [onClientsChange]);

  useEffect(() => {
    void loadClients();
  }, [loadClients]);

  const activeClient = clients.find((c) => c.id === activeClientId);

  async function onCreate(e: React.FormEvent) {
    e.preventDefault();
    if (!name.trim()) return;
    setCreating(true);
    try {
      const res = await fetch("/api/clients", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ name: name.trim() }),
      });
      const json = await res.json();
      if (!res.ok) throw new Error(json.error);
      const client = json.client as ClientRecord;
      onClientsChange([
        client,
        ...clients.filter((c) => c.id !== client.id),
      ]);
      onActiveClientChange(client.id);
      setCreateOpen(false);
      setName("");
      toast.success(`Client “${client.name}” ready`);
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Create failed");
    } finally {
      setCreating(false);
    }
  }

  const handleValueChange = (v: string) => {
    if (v === NEW) {
      setCreateOpen(true);
      return;
    }
    if (v === RENAME) {
      setRenameOpen(true);
      return;
    }
    onActiveClientChange(v === "all" ? null : v);
  };

  const dialogs = (
    <>
      {activeClient && (
        <RenameDialog
          open={renameOpen}
          onOpenChange={setRenameOpen}
          entityLabel="client"
          currentName={activeClient.name}
          endpoint={`/api/clients/${activeClient.id}`}
          onRenamed={(newName) =>
            onClientsChange(
              clients.map((c) =>
                c.id === activeClient.id ? { ...c, name: newName } : c
              )
            )
          }
        />
      )}

      <Dialog open={createOpen} onOpenChange={setCreateOpen}>
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle>New client</DialogTitle>
            <DialogDescription>
              The top level. Projects and brand kits you create while this
              client is active belong to it.
            </DialogDescription>
          </DialogHeader>
          <form onSubmit={onCreate} className="space-y-3">
            <Input
              placeholder="Client name — e.g. Aurum"
              value={name}
              onChange={(e) => setName(e.target.value)}
              required
              autoFocus
            />
            <Button
              type="submit"
              disabled={creating || !name.trim()}
              className="w-full bg-gold text-primary-foreground hover:bg-gold/90"
            >
              {creating ? (
                <>
                  <Loader2 className="size-4 animate-spin" />
                  Creating…
                </>
              ) : (
                "New client"
              )}
            </Button>
          </form>
        </DialogContent>
      </Dialog>
    </>
  );

  if (compact) {
    // Client is required before generating, so an unset one is styled as a
    // prompt rather than a neutral chip.
    const unset = !activeClient;
    return (
      <>
        <Select value={activeClientId ?? ""} onValueChange={handleValueChange}>
          <SelectTrigger
            aria-label="Client"
            className={cn(
              "h-8 w-auto gap-1.5 rounded-full border px-3 text-xs transition",
              unset
                ? "border-gold/40 bg-gold/10 text-foreground"
                : "border-white/10 bg-white/5 text-muted-foreground hover:text-foreground",
              className
            )}
          >
            <Building2 className="size-3.5 shrink-0" />
            <SelectValue placeholder="Select client">
              {activeClient?.name}
            </SelectValue>
          </SelectTrigger>
          <SelectContent>
            {clients.map((c) => (
              <SelectItem key={c.id} value={c.id}>
                {c.name}
              </SelectItem>
            ))}
            {clients.length > 0 && <SelectSeparator />}
            <SelectItem value={NEW}>＋ New client…</SelectItem>
            {activeClient && (
              <SelectItem value={RENAME}>✎ Rename “{activeClient.name}”…</SelectItem>
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
          Client
        </p>
        <div className="flex items-center gap-0.5">
          {activeClient && (
            <button
              type="button"
              title={`Rename ${activeClient.name}`}
              aria-label={`Rename ${activeClient.name}`}
              onClick={() => setRenameOpen(true)}
              className="rounded-md p-1 text-muted-foreground transition hover:bg-sidebar-accent hover:text-foreground"
            >
              <Pencil className="size-3.5" />
            </button>
          )}
          <button
            type="button"
            title="New client"
            aria-label="New client"
            onClick={() => setCreateOpen(true)}
            className="rounded-md p-1 text-muted-foreground transition hover:bg-sidebar-accent hover:text-foreground"
          >
            <Plus className="size-3.5" />
          </button>
        </div>
      </div>

      <Select
        value={activeClientId ?? "all"}
        onValueChange={(v) => onActiveClientChange(v === "all" ? null : v)}
      >
        <SelectTrigger className="h-9 w-full border-sidebar-border bg-sidebar-accent/50 px-3 text-xs">
          <div className="flex min-w-0 items-center gap-2">
            <Building2 className="size-3.5 shrink-0 text-muted-foreground" />
            <SelectValue placeholder="All clients">
              {activeClient ? activeClient.name : "All clients"}
            </SelectValue>
          </div>
        </SelectTrigger>
        <SelectContent>
          <SelectItem value="all">All clients</SelectItem>
          {clients.map((c) => (
            <SelectItem key={c.id} value={c.id}>
              <span className="flex flex-col items-start gap-0.5 py-0.5">
                <span>{c.name}</span>
                <span className="text-[10px] text-muted-foreground">
                  {[
                    c.project_count != null
                      ? `${c.project_count} project${c.project_count === 1 ? "" : "s"}`
                      : null,
                    c.brand_kit_count != null
                      ? `${c.brand_kit_count} kit${c.brand_kit_count === 1 ? "" : "s"}`
                      : null,
                  ]
                    .filter(Boolean)
                    .join(" · ")}
                </span>
              </span>
            </SelectItem>
          ))}
        </SelectContent>
      </Select>

      {dialogs}
    </div>
  );
}
