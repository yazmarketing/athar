"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import {
  Archive,
  ArrowRight,
  Building2,
  FolderKanban,
  Images,
  Loader2,
  Pencil,
  Plus,
  RotateCcw,
  Search,
  Sparkles,
} from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { RenameDialog } from "@/components/rename-dialog";
import { cn } from "@/lib/utils";
import type { ClientRecord, ProjectRecord } from "@/lib/types";

type Props = {
  clients: ClientRecord[];
  projects: ProjectRecord[];
  activeClientId: string | null;
  activeProjectId: string | null;
  onClientsChange: (clients: ClientRecord[]) => void;
  onProjectsChange: (projects: ProjectRecord[]) => void;
  onActiveClientChange: (id: string | null) => void;
  onActiveProjectChange: (id: string | null) => void;
  onOpenLibrary: () => void;
  onOpenCreate: () => void;
};

function formatDate(value: string) {
  return new Intl.DateTimeFormat("en", {
    day: "numeric",
    month: "short",
    year: "numeric",
  }).format(new Date(value));
}

export function ClientProjectsWorkspace({
  clients,
  projects,
  activeClientId,
  activeProjectId,
  onClientsChange,
  onProjectsChange,
  onActiveClientChange,
  onActiveProjectChange,
  onOpenLibrary,
  onOpenCreate,
}: Props) {
  const [clientQuery, setClientQuery] = useState("");
  const [projectQuery, setProjectQuery] = useState("");
  const [showArchived, setShowArchived] = useState(false);
  const [loading, setLoading] = useState(false);
  const [createClientOpen, setCreateClientOpen] = useState(false);
  const [createProjectOpen, setCreateProjectOpen] = useState(false);
  const [renameClientOpen, setRenameClientOpen] = useState(false);
  const [renameProjectOpen, setRenameProjectOpen] = useState(false);
  const [newClientName, setNewClientName] = useState("");
  const [newProjectName, setNewProjectName] = useState("");
  const [saving, setSaving] = useState(false);

  const activeClient = clients.find((client) => client.id === activeClientId) ?? null;
  const activeProject = projects.find((project) => project.id === activeProjectId) ?? null;

  const loadProjects = useCallback(async () => {
    if (!activeClientId) {
      onProjectsChange([]);
      return;
    }
    setLoading(true);
    try {
      const params = new URLSearchParams({ clientId: activeClientId });
      if (showArchived) params.set("archived", "true");
      const response = await fetch(`/api/projects?${params.toString()}`, {
        cache: "no-store",
      });
      const json = await response.json();
      if (!response.ok) throw new Error(json.error ?? "Could not load projects");
      onProjectsChange(json.projects as ProjectRecord[]);
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "Could not load projects");
    } finally {
      setLoading(false);
    }
  }, [activeClientId, onProjectsChange, showArchived]);

  useEffect(() => {
    if (!activeClientId && clients[0]) onActiveClientChange(clients[0].id);
  }, [activeClientId, clients, onActiveClientChange]);

  useEffect(() => {
    const frame = window.requestAnimationFrame(() => void loadProjects());
    return () => window.cancelAnimationFrame(frame);
  }, [loadProjects]);

  const filteredClients = useMemo(() => {
    const query = clientQuery.trim().toLowerCase();
    return clients.filter((client) => !query || client.name.toLowerCase().includes(query));
  }, [clientQuery, clients]);

  const filteredProjects = useMemo(() => {
    const query = projectQuery.trim().toLowerCase();
    return projects.filter((project) => {
      if (!showArchived && project.archived_at) return false;
      return !query || project.name.toLowerCase().includes(query);
    });
  }, [projectQuery, projects, showArchived]);

  async function createClient(event: React.FormEvent) {
    event.preventDefault();
    if (!newClientName.trim()) return;
    setSaving(true);
    try {
      const response = await fetch("/api/clients", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ name: newClientName.trim() }),
      });
      const json = await response.json();
      if (!response.ok) throw new Error(json.error ?? "Could not create client");
      const client = json.client as ClientRecord;
      onClientsChange(
        [client, ...clients.filter((item) => item.id !== client.id)].sort((a, b) =>
          a.name.localeCompare(b.name)
        )
      );
      onActiveClientChange(client.id);
      setNewClientName("");
      setCreateClientOpen(false);
      toast.success(`Client “${client.name}” created`);
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "Could not create client");
    } finally {
      setSaving(false);
    }
  }

  async function createProject(event: React.FormEvent) {
    event.preventDefault();
    if (!newProjectName.trim() || !activeClient) return;
    setSaving(true);
    try {
      const response = await fetch("/api/projects", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          name: newProjectName.trim(),
          clientId: activeClient.id,
          client: activeClient.name,
        }),
      });
      const json = await response.json();
      if (!response.ok) throw new Error(json.error ?? "Could not create project");
      const project = json.project as ProjectRecord;
      onProjectsChange([project, ...projects]);
      onClientsChange(
        clients.map((client) =>
          client.id === activeClient.id
            ? { ...client, project_count: (client.project_count ?? 0) + 1 }
            : client
        )
      );
      onActiveProjectChange(project.id);
      setNewProjectName("");
      setCreateProjectOpen(false);
      toast.success(`Project “${project.name}” created`);
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "Could not create project");
    } finally {
      setSaving(false);
    }
  }

  async function setArchived(project: ProjectRecord, archived: boolean) {
    try {
      const response = await fetch(`/api/projects/${project.id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ archived }),
      });
      const json = await response.json();
      if (!response.ok) throw new Error(json.error ?? "Could not update project");
      const updated = json.project as ProjectRecord;
      onProjectsChange(
        showArchived
          ? projects.map((item) =>
              item.id === project.id
                ? { ...item, ...updated, generation_count: item.generation_count }
                : item
            )
          : projects.filter((item) => item.id !== project.id)
      );
      onClientsChange(
        clients.map((client) =>
          client.id === activeClientId
            ? {
                ...client,
                project_count: Math.max(
                  0,
                  (client.project_count ?? 0) + (archived ? -1 : 1)
                ),
              }
            : client
        )
      );
      if (archived && activeProjectId === project.id) onActiveProjectChange(null);
      toast.success(archived ? "Project archived" : "Project restored");
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "Could not update project");
    }
  }

  return (
    <div className="flex min-h-0 flex-1 flex-col">
      <header className="flex flex-wrap items-end justify-between gap-4 px-6 py-5 pl-16 sm:px-8 md:pl-6 lg:pl-8">
        <div>
          <p className="text-[10px] font-medium tracking-[0.16em] text-muted-foreground uppercase">
            Workspace
          </p>
          <h1 className="athar-headline">Clients &amp; projects</h1>
          <p className="mt-1 text-sm text-muted-foreground">
            Keep every campaign filed under the right client.
          </p>
        </div>
        <Button
          onClick={() => setCreateClientOpen(true)}
          className="bg-gold text-primary-foreground hover:bg-gold/90"
        >
          <Plus className="size-4" /> New client
        </Button>
      </header>

      <div className="grid min-h-0 flex-1 gap-4 overflow-y-auto px-4 pb-6 sm:px-6 md:grid-cols-[17rem_minmax(0,1fr)] md:overflow-hidden lg:px-8">
        <aside className="flex min-h-64 flex-col rounded-2xl border border-border bg-card/60 p-3 md:min-h-0">
          <div className="relative mb-3">
            <Search className="pointer-events-none absolute top-1/2 left-3 size-4 -translate-y-1/2 text-muted-foreground" />
            <Input
              value={clientQuery}
              onChange={(event) => setClientQuery(event.target.value)}
              placeholder="Find a client"
              className="h-10 border-border bg-background/60 pl-9"
            />
          </div>
          <div className="min-h-0 flex-1 space-y-1 overflow-y-auto">
            {filteredClients.map((client) => {
              const selected = client.id === activeClientId;
              return (
                <button
                  key={client.id}
                  type="button"
                  onClick={() => onActiveClientChange(client.id)}
                  className={cn(
                    "group flex w-full items-center gap-3 rounded-xl px-3 py-3 text-left transition",
                    selected
                      ? "bg-sidebar-accent text-foreground ring-1 ring-gold/30"
                      : "text-muted-foreground hover:bg-sidebar-accent/60 hover:text-foreground"
                  )}
                >
                  <span className={cn("grid size-9 shrink-0 place-items-center rounded-lg", selected ? "bg-gold/15 text-gold" : "bg-white/5")}>
                    <Building2 className="size-4" />
                  </span>
                  <span className="min-w-0 flex-1">
                    <span className="block truncate text-sm font-medium">{client.name}</span>
                    <span className="mt-0.5 block text-[11px] text-muted-foreground">
                      {client.project_count ?? 0} projects · {client.brand_kit_count ?? 0} brand kits
                    </span>
                  </span>
                  <ArrowRight className={cn("size-3.5 shrink-0 transition", selected ? "text-gold" : "opacity-0 group-hover:opacity-100")} />
                </button>
              );
            })}
            {filteredClients.length === 0 && (
              <div className="px-3 py-10 text-center text-xs text-muted-foreground">
                {clients.length === 0 ? "Create the first client to begin." : "No clients match that search."}
              </div>
            )}
          </div>
        </aside>

        <section className="flex min-h-[28rem] min-w-0 flex-col rounded-2xl border border-border bg-card/60 md:min-h-0">
          {activeClient ? (
            <>
              <div className="flex flex-wrap items-center justify-between gap-3 border-b border-border px-4 py-4 sm:px-5">
                <div className="min-w-0">
                  <div className="flex items-center gap-2">
                    <h2 className="truncate text-lg font-medium">{activeClient.name}</h2>
                    <button
                      type="button"
                      onClick={() => setRenameClientOpen(true)}
                      className="rounded-md p-1.5 text-muted-foreground hover:bg-white/5 hover:text-foreground"
                      aria-label={`Rename ${activeClient.name}`}
                    >
                      <Pencil className="size-3.5" />
                    </button>
                  </div>
                  <p className="text-xs text-muted-foreground">Projects for this client only</p>
                </div>
                <Button size="sm" onClick={() => setCreateProjectOpen(true)}>
                  <Plus className="size-4" /> New project
                </Button>
              </div>

              <div className="flex flex-wrap items-center gap-2 px-4 py-3 sm:px-5">
                <div className="relative min-w-[12rem] flex-1">
                  <Search className="pointer-events-none absolute top-1/2 left-3 size-4 -translate-y-1/2 text-muted-foreground" />
                  <Input
                    value={projectQuery}
                    onChange={(event) => setProjectQuery(event.target.value)}
                    placeholder="Search this client’s projects"
                    className="h-9 border-border bg-background/60 pl-9"
                  />
                </div>
                <button
                  type="button"
                  onClick={() => setShowArchived((value) => !value)}
                  className={cn(
                    "h-9 rounded-lg border px-3 text-xs transition",
                    showArchived
                      ? "border-gold/40 bg-gold/10 text-gold"
                      : "border-border text-muted-foreground hover:text-foreground"
                  )}
                >
                  {showArchived ? "Showing archived" : "Show archived"}
                </button>
              </div>

              <div className="min-h-0 flex-1 overflow-y-auto px-4 pb-4 sm:px-5 sm:pb-5">
                {loading ? (
                  <div className="grid min-h-52 place-items-center text-sm text-muted-foreground">
                    <span className="flex items-center gap-2"><Loader2 className="size-4 animate-spin" /> Loading projects…</span>
                  </div>
                ) : filteredProjects.length > 0 ? (
                  <div className="grid gap-3 xl:grid-cols-2">
                    {filteredProjects.map((project) => {
                      const selected = project.id === activeProjectId;
                      const archived = Boolean(project.archived_at);
                      return (
                        <article
                          key={project.id}
                          className={cn(
                            "group rounded-2xl border p-4 transition",
                            selected ? "border-gold/45 bg-gold/[0.06]" : "border-border bg-background/35 hover:border-white/20",
                            archived && "opacity-70"
                          )}
                        >
                          <button type="button" onClick={() => !archived && onActiveProjectChange(project.id)} className="w-full text-left">
                            <div className="flex items-start gap-3">
                              <span className={cn("grid size-10 shrink-0 place-items-center rounded-xl", selected ? "bg-gold/15 text-gold" : "bg-white/5 text-muted-foreground")}>
                                <FolderKanban className="size-4" />
                              </span>
                              <span className="min-w-0 flex-1">
                                <span className="flex items-center gap-2">
                                  <span className="truncate text-sm font-medium text-foreground">{project.name}</span>
                                  {archived && <span className="rounded-full bg-white/5 px-2 py-0.5 text-[9px] tracking-wide text-muted-foreground uppercase">Archived</span>}
                                </span>
                                <span className="mt-1 block text-[11px] text-muted-foreground">
                                  {project.generation_count ?? 0} items · Updated {formatDate(project.updated_at)}
                                </span>
                                <span className="mt-2 block text-[11px] text-muted-foreground">
                                  Spend: {project.spend_cap == null ? "Unlimited" : `$${Number(project.spend_cap).toFixed(0)} cap`}
                                </span>
                              </span>
                            </div>
                          </button>
                          <div className="mt-4 flex flex-wrap items-center gap-1.5 border-t border-border pt-3">
                            {!archived && (
                              <>
                                <Button size="sm" variant={selected ? "default" : "secondary"} onClick={() => { onActiveProjectChange(project.id); onOpenLibrary(); }}>
                                  <Images className="size-3.5" /> Library
                                </Button>
                                <Button size="sm" variant="ghost" onClick={() => { onActiveProjectChange(project.id); onOpenCreate(); }}>
                                  <Sparkles className="size-3.5" /> Create
                                </Button>
                                <button type="button" onClick={() => { onActiveProjectChange(project.id); setRenameProjectOpen(true); }} className="ml-auto rounded-lg p-2 text-muted-foreground hover:bg-white/5 hover:text-foreground" aria-label={`Rename ${project.name}`}>
                                  <Pencil className="size-3.5" />
                                </button>
                              </>
                            )}
                            <button type="button" onClick={() => void setArchived(project, !archived)} className={cn("rounded-lg p-2 text-muted-foreground hover:bg-white/5 hover:text-foreground", archived && "ml-auto")} aria-label={archived ? `Restore ${project.name}` : `Archive ${project.name}`}>
                              {archived ? <RotateCcw className="size-3.5" /> : <Archive className="size-3.5" />}
                            </button>
                          </div>
                        </article>
                      );
                    })}
                  </div>
                ) : (
                  <div className="grid min-h-64 place-items-center rounded-2xl border border-dashed border-border text-center">
                    <div className="max-w-xs p-6">
                      <FolderKanban className="mx-auto size-7 text-muted-foreground" />
                      <p className="mt-3 text-sm font-medium">{projectQuery ? "No matching projects" : "No projects here yet"}</p>
                      <p className="mt-1 text-xs leading-relaxed text-muted-foreground">
                        {projectQuery ? "Try a different search." : `Create the first project for ${activeClient.name}.`}
                      </p>
                      {!projectQuery && <Button size="sm" onClick={() => setCreateProjectOpen(true)} className="mt-4"><Plus className="size-4" /> New project</Button>}
                    </div>
                  </div>
                )}
              </div>
            </>
          ) : (
            <div className="grid flex-1 place-items-center text-center">
              <div className="max-w-sm p-8">
                <Building2 className="mx-auto size-8 text-muted-foreground" />
                <h2 className="mt-4 text-lg font-medium">Choose or create a client</h2>
                <p className="mt-1 text-sm text-muted-foreground">Projects stay organized under their client instead of appearing as one long mixed list.</p>
              </div>
            </div>
          )}
        </section>
      </div>

      {activeClient && (
        <RenameDialog
          open={renameClientOpen}
          onOpenChange={setRenameClientOpen}
          entityLabel="client"
          currentName={activeClient.name}
          endpoint={`/api/clients/${activeClient.id}`}
          onRenamed={(name) => onClientsChange(clients.map((client) => client.id === activeClient.id ? { ...client, name } : client))}
        />
      )}
      {activeProject && (
        <RenameDialog
          open={renameProjectOpen}
          onOpenChange={setRenameProjectOpen}
          entityLabel="project"
          currentName={activeProject.name}
          endpoint={`/api/projects/${activeProject.id}`}
          onRenamed={(name) => onProjectsChange(projects.map((project) => project.id === activeProject.id ? { ...project, name } : project))}
        />
      )}

      <Dialog open={createClientOpen} onOpenChange={setCreateClientOpen}>
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle>New client</DialogTitle>
            <DialogDescription>The top-level folder for that client’s projects and brand assets.</DialogDescription>
          </DialogHeader>
          <form onSubmit={createClient} className="space-y-3">
            <Input value={newClientName} onChange={(event) => setNewClientName(event.target.value)} placeholder="Client name" autoFocus required />
            <Button type="submit" disabled={saving || !newClientName.trim()} className="w-full bg-gold text-primary-foreground hover:bg-gold/90">
              {saving ? <><Loader2 className="size-4 animate-spin" /> Creating…</> : "Create client"}
            </Button>
          </form>
        </DialogContent>
      </Dialog>

      <Dialog open={createProjectOpen} onOpenChange={setCreateProjectOpen}>
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle>New project</DialogTitle>
            <DialogDescription>This project will belong to {activeClient?.name ?? "the selected client"}.</DialogDescription>
          </DialogHeader>
          <form onSubmit={createProject} className="space-y-3">
            <Input value={newProjectName} onChange={(event) => setNewProjectName(event.target.value)} placeholder="Campaign or project name" autoFocus required />
            <Button type="submit" disabled={saving || !newProjectName.trim() || !activeClient} className="w-full bg-gold text-primary-foreground hover:bg-gold/90">
              {saving ? <><Loader2 className="size-4 animate-spin" /> Creating…</> : "Create project"}
            </Button>
          </form>
        </DialogContent>
      </Dialog>
    </div>
  );
}
