"use client";

import { useCallback, useEffect, useState } from "react";
import { FolderKanban, Loader2, Plus } from "lucide-react";
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
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { cn } from "@/lib/utils";
import type { ProjectRecord } from "@/lib/types";

export const ACTIVE_PROJECT_STORAGE_KEY = "yaz-motion-active-project";

type Props = {
  activeProjectId: string | null;
  onActiveProjectChange: (id: string | null) => void;
  projects: ProjectRecord[];
  onProjectsChange: (projects: ProjectRecord[]) => void;
  className?: string;
};

export function ProjectPicker({
  activeProjectId,
  onActiveProjectChange,
  projects,
  onProjectsChange,
  className,
}: Props) {
  const [createOpen, setCreateOpen] = useState(false);
  const [name, setName] = useState("");
  const [client, setClient] = useState("");
  const [creating, setCreating] = useState(false);

  const loadProjects = useCallback(async () => {
    try {
      const res = await fetch("/api/projects");
      const json = await res.json();
      if (!res.ok) throw new Error(json.error);
      onProjectsChange(json.projects as ProjectRecord[]);
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Load failed");
    }
  }, [onProjectsChange]);

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
        body: JSON.stringify({ name: name.trim(), client: client.trim() || undefined }),
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

  return (
    <div className={cn("space-y-2", className)}>
      <div className="flex items-center justify-between">
        <p className="text-[10px] font-medium tracking-[0.16em] text-muted-foreground uppercase">
          Project
        </p>
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
    </div>
  );
}
