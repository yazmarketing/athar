"use client";

import { useCallback, useEffect, useState } from "react";
import { FolderKanban, Loader2, Pencil, Plus } from "lucide-react";
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
import type { ProjectRecord } from "@/lib/types";

export const ACTIVE_PROJECT_STORAGE_KEY = "yaz-motion-active-project";

/** Sentinels for the actions folded into the dropdown in compact mode. */
const NEW = "__new__";
const RENAME = "__rename__";
const DELETE = "__delete__";

type Props = {
  activeProjectId: string | null;
  onActiveProjectChange: (id: string | null) => void;
  projects: ProjectRecord[];
  onProjectsChange: (projects: ProjectRecord[]) => void;
  /** Scope the list + new projects to this client (null = all clients). */
  clientId?: string | null;
  /** Dock variant: a single pill sized for the generate bar's chip row. */
  compact?: boolean;
  className?: string;
};

export function ProjectPicker({
  activeProjectId,
  onActiveProjectChange,
  projects,
  onProjectsChange,
  clientId,
  compact = false,
  className,
}: Props) {
  const [createOpen, setCreateOpen] = useState(false);
  const [renameOpen, setRenameOpen] = useState(false);
  const [name, setName] = useState("");
  const [client, setClient] = useState("");
  const [creating, setCreating] = useState(false);

  const loadProjects = useCallback(async () => {
    try {
      const qs = clientId ? `?clientId=${encodeURIComponent(clientId)}` : "";
      const res = await fetch(`/api/projects${qs}`);
      const json = await res.json();
      if (!res.ok) throw new Error(json.error);
      onProjectsChange(json.projects as ProjectRecord[]);
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Load failed");
    }
  }, [onProjectsChange, clientId]);

  useEffect(() => {
    void loadProjects();
  }, [loadProjects]);

  const activeProject = projects.find((p) => p.id === activeProjectId);

  async function onCreate(e: React.FormEvent) {
    e.preventDefault();
    if (!name.trim()) return;
    setCreating(true);
    try {
      const res = await fetch("/api/projects", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          name: name.trim(),
          client: client.trim() || undefined,
          clientId: clientId ?? undefined,
        }),
      });
      const json = await res.json();
      if (!res.ok) throw new Error(json.error);
      const project = json.project as ProjectRecord;
      onProjectsChange([project, ...projects]);
      onActiveProjectChange(project.id);
      setCreateOpen(false);
      setName("");
      setClient("");
      toast.success(`Project “${project.name}” created`);
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Create failed");
    } finally {
      setCreating(false);
    }
  }

  const dialogs = (
    <>
      {activeProject && (
        <RenameDialog
          open={renameOpen}
          onOpenChange={setRenameOpen}
          entityLabel="project"
          currentName={activeProject.name}
          endpoint={`/api/projects/${activeProject.id}`}
          onRenamed={(newName) =>
            onProjectsChange(
              projects.map((p) =>
                p.id === activeProject.id ? { ...p, name: newName } : p
              )
            )
          }
        />
      )}

      <Dialog open={createOpen} onOpenChange={setCreateOpen}>
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle>New project</DialogTitle>
            <DialogDescription>
              Group generations by client or campaign. New creates go to the
              active project.
            </DialogDescription>
          </DialogHeader>
          <form onSubmit={onCreate} className="space-y-3">
            <Input
              placeholder="Project name"
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
                "New project"
              )}
            </Button>
          </form>
        </DialogContent>
      </Dialog>
    </>
  );

  /**
   * Only ever removes an empty project — the API refuses with 409 and explains
   * what is still attached, which is surfaced verbatim.
   */
  const onDelete = async () => {
    if (!activeProject) return;
    const ok = window.confirm(
      `Delete “${activeProject.name}”? This only works if it's empty.`
    );
    if (!ok) return;
    try {
      const res = await fetch(`/api/projects/${activeProject.id}`, { method: "DELETE" });
      const json = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(json.error ?? "Delete failed");
      onProjectsChange(projects.filter((x) => x.id !== activeProject.id));
      onActiveProjectChange(null);
      toast.success(`Deleted “${activeProject.name}”`);
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Delete failed");
    }
  };

  const handleValueChange = (v: string) => {
    if (v === NEW) {
      setCreateOpen(true);
      return;
    }
    if (v === RENAME) {
      setRenameOpen(true);
      return;
    }
    if (v === DELETE) {
      void onDelete();
      return;
    }
    onActiveProjectChange(v === "all" ? null : v);
  };

  if (compact) {
    return (
      <>
        <Select value={activeProjectId ?? "all"} onValueChange={handleValueChange}>
          <SelectTrigger
            aria-label="Project"
            className={cn(
              "h-8 w-auto gap-1.5 rounded-full border border-white/10 bg-white/5 px-3 text-xs text-muted-foreground transition hover:text-foreground",
              activeProject && "text-foreground",
              className
            )}
          >
            <FolderKanban className="size-3.5 shrink-0" />
            <SelectValue>{activeProject?.name ?? "No project"}</SelectValue>
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="all">No project</SelectItem>
            {projects.map((p) => (
              <SelectItem key={p.id} value={p.id}>
                {p.name}
              </SelectItem>
            ))}
            <SelectSeparator />
            <SelectItem value={NEW}>＋ New project…</SelectItem>
            {activeProject && (
              <SelectItem value={RENAME}>✎ Rename “{activeProject.name}”…</SelectItem>
            )}
            {activeProject && (
              <SelectItem value={DELETE}>🗑 Delete “{activeProject.name}”…</SelectItem>
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
          Project
        </p>
        <div className="flex items-center gap-0.5">
          {activeProject && (
            <button
              type="button"
              title={`Rename ${activeProject.name}`}
              aria-label={`Rename ${activeProject.name}`}
              onClick={() => setRenameOpen(true)}
              className="rounded-md p-1 text-muted-foreground transition hover:bg-sidebar-accent hover:text-foreground"
            >
              <Pencil className="size-3.5" />
            </button>
          )}
          <button
            type="button"
            title="New project"
            aria-label="New project"
            onClick={() => setCreateOpen(true)}
            className="rounded-md p-1 text-muted-foreground transition hover:bg-sidebar-accent hover:text-foreground"
          >
            <Plus className="size-3.5" />
          </button>
        </div>
      </div>

      <Select
        value={activeProjectId ?? "all"}
        onValueChange={(v) => onActiveProjectChange(v === "all" ? null : v)}
      >
        <SelectTrigger className="h-9 w-full border-sidebar-border bg-sidebar-accent/50 px-3 text-xs">
          <div className="flex min-w-0 items-center gap-2">
            <FolderKanban className="size-3.5 shrink-0 text-muted-foreground" />
            <SelectValue placeholder="All projects">
              {activeProject ? activeProject.name : "All projects"}
            </SelectValue>
          </div>
        </SelectTrigger>
        <SelectContent>
          <SelectItem value="all">All projects</SelectItem>
          {projects.map((p) => (
            <SelectItem key={p.id} value={p.id}>
              <span className="flex flex-col items-start gap-0.5 py-0.5">
                <span>{p.name}</span>
                {(p.client || p.generation_count != null) && (
                  <span className="text-[10px] text-muted-foreground">
                    {[p.client, p.generation_count != null ? `${p.generation_count} items` : null]
                      .filter(Boolean)
                      .join(" · ")}
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
