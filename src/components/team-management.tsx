"use client";

import { useCallback, useEffect, useState } from "react";
import { useSession } from "next-auth/react";
import { Loader2, Check, X, SquarePen } from "lucide-react";
import { toast } from "sonner";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { cn } from "@/lib/utils";

type TeamUser = {
  id: string;
  email: string;
  name: string | null;
  role: "admin" | "creator" | "viewer";
  team: string | null;
  active: boolean;
  last_login_at: string | null;
};

const ROLE_LABEL: Record<string, string> = {
  admin: "Management",
  creator: "Creator",
  viewer: "Viewer",
};

function initials(name: string | null, email: string) {
  const src = (name || email).trim();
  const parts = src.split(/[\s@.]+/).filter(Boolean);
  return ((parts[0]?.[0] ?? "") + (parts[1]?.[0] ?? "")).toUpperCase() || "?";
}

export function TeamManagement() {
  const { data: session } = useSession();
  const myId = session?.user?.id;
  const [users, setUsers] = useState<TeamUser[] | null>(null);
  const [busyId, setBusyId] = useState<string | null>(null);
  const [editTeamId, setEditTeamId] = useState<string | null>(null);
  const [teamDraft, setTeamDraft] = useState("");

  const load = useCallback(async () => {
    try {
      const res = await fetch("/api/users");
      const json = await res.json();
      if (!res.ok) throw new Error(json.error ?? "Could not load team");
      setUsers(json.users as TeamUser[]);
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Could not load team");
      setUsers([]);
    }
  }, []);

  useEffect(() => {
    void load();
  }, [load]);

  async function patchUser(
    id: string,
    patch: { role?: string; active?: boolean; team?: string | null }
  ) {
    setBusyId(id);
    try {
      const res = await fetch("/api/users", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ userId: id, ...patch }),
      });
      const json = await res.json();
      if (!res.ok) throw new Error(json.error ?? "Update failed");
      const updated = json.user as TeamUser;
      setUsers((prev) =>
        prev ? prev.map((u) => (u.id === updated.id ? updated : u)) : prev
      );
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Update failed");
    } finally {
      setBusyId(null);
    }
  }

  const activeCount = users?.filter((u) => u.active).length ?? 0;

  return (
    <div className="mx-auto max-w-4xl">
      <p className="mb-4 text-xs text-muted-foreground">
        {users ? `${users.length} members · ${activeCount} active` : "…"} ·
        Members appear after their first Google sign-in. Team comes from their
        Google Workspace Department — edit it if it's blank.
      </p>

      {users === null ? (
        <div className="flex items-center gap-2 py-16 text-sm text-muted-foreground">
          <Loader2 className="size-4 animate-spin" /> Loading members…
        </div>
      ) : users.length === 0 ? (
        <p className="rounded-2xl bg-card px-4 py-16 text-center text-sm text-muted-foreground ring-1 ring-border">
          No members yet — they appear after their first sign-in.
        </p>
      ) : (
        <div className="overflow-hidden rounded-2xl ring-1 ring-border">
          {/* header */}
          <div className="hidden grid-cols-[1fr_9rem_9rem_6rem] gap-3 bg-secondary/60 px-4 py-2.5 text-[10px] font-medium tracking-[0.14em] text-muted-foreground uppercase sm:grid">
            <span>Member</span>
            <span>Team</span>
            <span>Role</span>
            <span className="text-right">Access</span>
          </div>
          {users.map((u) => {
            const isMe = u.id === myId;
            const busy = busyId === u.id;
            return (
              <div
                key={u.id}
                className={cn(
                  "grid grid-cols-1 gap-3 border-t border-border bg-card px-4 py-3 sm:grid-cols-[1fr_9rem_9rem_6rem] sm:items-center",
                  !u.active && "opacity-60"
                )}
              >
                {/* member */}
                <div className="flex min-w-0 items-center gap-3">
                  <span className="flex size-9 shrink-0 items-center justify-center rounded-full bg-secondary text-[11px] font-semibold text-foreground">
                    {initials(u.name, u.email)}
                  </span>
                  <div className="min-w-0">
                    <p className="truncate text-sm font-medium text-foreground">
                      {u.name || u.email.split("@")[0]}
                      {isMe && (
                        <span className="ml-1.5 text-[10px] text-muted-foreground">
                          (you)
                        </span>
                      )}
                    </p>
                    <p className="truncate text-[11px] text-muted-foreground">
                      {u.email}
                    </p>
                  </div>
                </div>

                {/* team (inline edit) */}
                <div className="min-w-0">
                  {editTeamId === u.id ? (
                    <input
                      autoFocus
                      value={teamDraft}
                      onChange={(e) => setTeamDraft(e.target.value)}
                      onBlur={() => {
                        setEditTeamId(null);
                        if (teamDraft.trim() !== (u.team ?? ""))
                          void patchUser(u.id, { team: teamDraft.trim() });
                      }}
                      onKeyDown={(e) => {
                        if (e.key === "Enter") e.currentTarget.blur();
                        if (e.key === "Escape") setEditTeamId(null);
                      }}
                      placeholder="Team"
                      className="w-full rounded-md border border-gold/40 bg-background px-2 py-1 text-xs outline-none"
                    />
                  ) : (
                    <button
                      type="button"
                      onClick={() => {
                        setEditTeamId(u.id);
                        setTeamDraft(u.team ?? "");
                      }}
                      className="group inline-flex items-center gap-1 text-xs text-foreground"
                    >
                      <span className={cn(!u.team && "text-muted-foreground")}>
                        {u.team || "— set team"}
                      </span>
                      <SquarePen className="size-3 text-muted-foreground opacity-0 transition group-hover:opacity-100" />
                    </button>
                  )}
                </div>

                {/* role */}
                <Select
                  value={u.role}
                  disabled={isMe || busy}
                  onValueChange={(v) => void patchUser(u.id, { role: v })}
                >
                  <SelectTrigger className="h-8 w-full border-border bg-background text-xs">
                    <SelectValue>{ROLE_LABEL[u.role] ?? u.role}</SelectValue>
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="admin">Management</SelectItem>
                    <SelectItem value="creator">Creator</SelectItem>
                    <SelectItem value="viewer">Viewer</SelectItem>
                  </SelectContent>
                </Select>

                {/* access */}
                <div className="flex sm:justify-end">
                  <button
                    type="button"
                    disabled={isMe || busy}
                    onClick={() => void patchUser(u.id, { active: !u.active })}
                    className={cn(
                      "inline-flex items-center gap-1.5 rounded-full px-2.5 py-1 text-[11px] ring-1 transition disabled:opacity-40",
                      u.active
                        ? "text-foreground ring-border hover:text-destructive hover:ring-destructive/40"
                        : "text-gold ring-gold/40"
                    )}
                  >
                    {busy ? (
                      <Loader2 className="size-3 animate-spin" />
                    ) : u.active ? (
                      <>
                        <Check className="size-3" /> Active
                      </>
                    ) : (
                      <>
                        <X className="size-3" /> Disabled
                      </>
                    )}
                  </button>
                </div>
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}
