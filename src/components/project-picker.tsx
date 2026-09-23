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
import { RenameDialog } from "@/components/rename-dialog";
import { SearchPicker } from "@/components/search-picker";
import { cn } from "@/lib/utils";
import type { ProjectRecord } from "@/lib/types";

export const ACTIVE_PROJECT_STORAGE_KEY = "yaz-motion-active-project";

type Props = {
  activeProjectId: string | null;
  onActiveProjectChange: (id: string | null) => void;
  projects: ProjectRecord[];
  onProjectsChange: (projects: ProjectRecord[]) => void;
  /** Scope the list + new projects to this client. No client means no projects. */
  clientId?: string | null;
  /** Dock variant: a single pill sized for the generate bar's chip row. */
  compact?: boolean;
  required?: boolean;
  canManageSpend?: boolean;
  className?: string;
};

export function ProjectPicker({
  activeProjectId,
  onActiveProjectChange,
  projects,
  onProjectsChange,
  clientId,
  compact = false,
  required = false,
  canManageSpend = false,
  className,
}: Props) {
  const [createOpen, setCreateOpen] = useState(false);
  const [renameOpen, setRenameOpen] = useState(false);
  const [name, setName] = useState("");
  const [creating, setCreating] = useState(false);
  const [capOpen, setCapOpen] = useState(false);
  const [cap, setCap] = useState("");

  const loadProjects = useCallback(async () => {
    if (!clientId) {
      onProjectsChange([]);
      onActiveProjectChange(null);
      return;
    }
    try {
      const qs = `?clientId=${encodeURIComponent(clientId)}`;
      const res = await fetch(`/api/projects${qs}`);
      const json = await res.json();
      if (!res.ok) throw new Error(json.error);
      onProjectsChange(json.projects as ProjectRecord[]);
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Load failed");
    }
  }, [onProjectsChange, onActiveProjectChange, clientId]);

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
            <p className="rounded-lg bg-white/4 px-3 py-2 text-xs text-muted-foreground ring-1 ring-white/8">
              {clientId ? (
                <>
                  Belongs to the selected client. Switch client in the bar
                  below to file it elsewhere.
                </>
              ) : (
                <>
                  Pick a client first — projects always belong to one, so the
                  Library can filter by it.
                </>
              )}
            </p>
            <Button
              type="submit"
              disabled={creating || !name.trim() || !clientId}
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
      <Dialog open={capOpen} onOpenChange={setCapOpen}>
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle>Project spend cap</DialogTitle>
            <DialogDescription>
              Leave this blank for unlimited. Alerts still appear at $100, $200, and $300.
            </DialogDescription>
          </DialogHeader>
          <form
            className="space-y-3"
            onSubmit={async (e) => {
              e.preventDefault();
              if (!activeProject) return;
              const spendCap = cap.trim() === "" ? null : Number(cap);
              try {
                const res = await fetch(`/api/projects/${activeProject.id}`, {
                  method: "PATCH",
                  headers: { "Content-Type": "application/json" },
                  body: JSON.stringify({ spendCap }),
                });
                const json = await res.json();
                if (!res.ok) throw new Error(json.error ?? "Update failed");
                const project = json.project as ProjectRecord;
                onProjectsChange(projects.map((p) => p.id === project.id ? project : p));
                setCapOpen(false);
                toast.success(spendCap == null ? "Project spend is unlimited" : `Project capped at $${spendCap.toFixed(2)}`);
              } catch (err) {
                toast.error(err instanceof Error ? err.message : "Update failed");
              }
            }}
          >
            <Input type="number" min="0" step="1" value={cap} onChange={(e) => setCap(e.target.value)} placeholder="Unlimited" autoFocus />
            <Button type="submit" className="w-full bg-gold text-primary-foreground hover:bg-gold/90">Save cap</Button>
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
    onActiveProjectChange(v === "all" ? null : v);
  };

  if (compact) {
    return (
      <>
        <SearchPicker
          value={activeProjectId}
          onValueChange={handleValueChange}
          options={projects.map((project) => ({
            value: project.id,
            label: project.name,
            description: project.generation_count == null
              ? undefined
              : `${project.generation_count} item${project.generation_count === 1 ? "" : "s"}`,
          }))}
          label="Choose project"
          placeholder={clientId ? "Choose project" : "Choose client first"}
          icon={<FolderKanban className="size-3.5 shrink-0" />}
          disabled={!clientId}
          className={cn(activeProject && "text-foreground", className)}
          actions={[
            ...(!required ? [{ label: "No project", onSelect: () => onActiveProjectChange(null) }] : []),
            { label: "＋ New project", onSelect: () => setCreateOpen(true), disabled: !clientId },
            ...(activeProject
              ? [
                  { label: `✎ Rename “${activeProject.name}”`, onSelect: () => setRenameOpen(true) },
                  ...(canManageSpend
                    ? [{
                        label: "$ Set spend cap",
                        onSelect: () => {
                          setCap(activeProject.spend_cap == null ? "" : String(activeProject.spend_cap));
                          setCapOpen(true);
                        },
                      }]
                    : []),
                  { label: `Delete “${activeProject.name}”`, onSelect: () => void onDelete(), destructive: true },
                ]
              : []),
          ]}
        />
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

      <SearchPicker
        value={activeProjectId ?? "all"}
        onValueChange={(value) => onActiveProjectChange(value === "all" ? null : value)}
        options={[
          { value: "all", label: "All projects" },
          ...projects.map((project) => ({
            value: project.id,
            label: project.name,
            description: [
              project.client,
              project.generation_count != null ? `${project.generation_count} items` : null,
            ].filter(Boolean).join(" · "),
          })),
        ]}
        label="Choose project"
        placeholder="All projects"
        icon={<FolderKanban className="size-3.5 shrink-0" />}
        className="h-9 w-full justify-start rounded-lg border-sidebar-border bg-sidebar-accent/50"
      />

      {dialogs}
    </div>
  );
}
