"use client";

import { useEffect, useState } from "react";
import { useSession } from "next-auth/react";
import { Loader2 } from "lucide-react";
import { toast } from "sonner";
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

type TeamUser = {
  id: string;
  email: string;
  name: string | null;
  role: "admin" | "creator" | "viewer";
  active: boolean;
  last_login_at: string | null;
};

const ROLE_HELP: Record<string, string> = {
  admin: "Everything + manage team",
  creator: "Generate & edit",
  viewer: "View only",
};

export function TeamDialog({
  open,
  onOpenChange,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
}) {
  const { data: session } = useSession();
  const myId = session?.user?.id;
  const [users, setUsers] = useState<TeamUser[] | null>(null);
  const [busyId, setBusyId] = useState<string | null>(null);

  useEffect(() => {
    if (!open) return;
    let cancelled = false;
    void (async () => {
      try {
        const res = await fetch("/api/users");
        const json = await res.json();
        if (!res.ok) throw new Error(json.error ?? "Could not load team");
        if (!cancelled) setUsers(json.users as TeamUser[]);
      } catch (err) {
        if (!cancelled) {
          toast.error(
            err instanceof Error ? err.message : "Could not load team"
          );
          setUsers([]);
        }
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [open]);

  async function patchUser(
    id: string,
    patch: { role?: string; active?: boolean }
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
      toast.success(`${updated.email} updated`);
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Update failed");
    } finally {
      setBusyId(null);
    }
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-lg">
        <DialogHeader>
          <DialogTitle>Team</DialogTitle>
          <DialogDescription>
            Members sign in with an allowed email. Admins manage roles here.
          </DialogDescription>
        </DialogHeader>

        {users === null ? (
          <div className="flex items-center gap-2 py-6 text-sm text-muted-foreground">
            <Loader2 className="size-4 animate-spin" />
            Loading team…
          </div>
        ) : users.length === 0 ? (
          <p className="py-6 text-sm text-muted-foreground">
            No members yet — they appear after their first sign-in.
          </p>
        ) : (
          <ul className="max-h-[22rem] space-y-2 overflow-y-auto">
            {users.map((u) => {
              const isMe = u.id === myId;
              return (
                <li
                  key={u.id}
                  className={cn(
                    "flex items-center gap-3 rounded-xl bg-white/4 px-3 py-2.5 ring-1 ring-white/6",
                    !u.active && "opacity-60"
                  )}
                >
                  <div className="min-w-0 flex-1">
                    <p className="truncate text-sm text-foreground">
                      {u.email}
                      {isMe && (
                        <span className="ml-1.5 text-[10px] text-muted-foreground">
                          (you)
                        </span>
                      )}
                    </p>
                    <p className="text-[11px] text-muted-foreground">
                      {ROLE_HELP[u.role]}
                      {!u.active && " · disabled"}
                    </p>
                  </div>
                  <Select
                    value={u.role}
                    disabled={isMe || busyId === u.id}
                    onValueChange={(v) => void patchUser(u.id, { role: v })}
                  >
                    <SelectTrigger className="h-8 w-28 border-white/10 bg-white/5 text-xs">
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="admin">Admin</SelectItem>
                      <SelectItem value="creator">Creator</SelectItem>
                      <SelectItem value="viewer">Viewer</SelectItem>
                    </SelectContent>
                  </Select>
                  <button
                    type="button"
                    disabled={isMe || busyId === u.id}
                    onClick={() => void patchUser(u.id, { active: !u.active })}
                    className={cn(
                      "shrink-0 rounded-full px-2.5 py-1 text-[11px] ring-1 transition disabled:opacity-40",
                      u.active
                        ? "text-muted-foreground ring-white/10 hover:text-destructive hover:ring-destructive/40"
                        : "text-gold ring-gold/40 hover:text-foreground"
                    )}
                  >
                    {busyId === u.id ? (
                      <Loader2 className="size-3 animate-spin" />
                    ) : u.active ? (
                      "Disable"
                    ) : (
                      "Enable"
                    )}
                  </button>
                </li>
              );
            })}
          </ul>
        )}
      </DialogContent>
    </Dialog>
  );
}
