"use client";

import { signOut, useSession } from "next-auth/react";
import { LogOut, Users } from "lucide-react";
import { cn } from "@/lib/utils";

const ROLE_LABEL: Record<string, string> = {
  admin: "Management",
  creator: "Creator",
  viewer: "Viewer",
};

function initials(name: string | null | undefined, email: string) {
  const src = (name || email).trim();
  const parts = src.split(/[\s@.]+/).filter(Boolean);
  return ((parts[0]?.[0] ?? "") + (parts[1]?.[0] ?? "")).toUpperCase() || "?";
}

export function SidebarUser({
  onManageTeam,
}: {
  onManageTeam?: () => void;
}) {
  const { data: session } = useSession();
  const user = session?.user;
  const isAdmin = user?.role === "admin";

  if (!user?.email) return null;

  const name = user.name || user.email.split("@")[0];
  const role = ROLE_LABEL[user.role] ?? "Creator";

  return (
    <div className="mt-1 rounded-xl bg-sidebar-accent/40 p-2.5 ring-1 ring-sidebar-border">
      <div className="flex items-center gap-2.5">
        {user.image ? (
          // eslint-disable-next-line @next/next/no-img-element
          <img
            src={user.image}
            alt={name}
            referrerPolicy="no-referrer"
            className="size-9 shrink-0 rounded-full object-cover ring-1 ring-sidebar-border"
          />
        ) : (
          <span className="flex size-9 shrink-0 items-center justify-center rounded-full bg-gold text-[11px] font-semibold text-primary-foreground">
            {initials(user.name, user.email)}
          </span>
        )}
        <div className="min-w-0 flex-1 leading-tight">
          <p
            className="truncate text-sm font-medium text-foreground"
            title={name}
          >
            {name}
          </p>
          <p className="truncate text-[11px] text-muted-foreground">
            {role}
            {user.team ? ` · ${user.team}` : ""}
          </p>
        </div>
      </div>

      <div className="mt-2 flex items-center gap-1 border-t border-sidebar-border/70 pt-2">
        {isAdmin && (
          <button
            type="button"
            onClick={onManageTeam}
            className="flex flex-1 items-center justify-center gap-1.5 rounded-lg py-1.5 text-[11px] text-muted-foreground transition hover:bg-sidebar-accent hover:text-foreground"
          >
            <Users className="size-3.5" />
            Team
          </button>
        )}
        <button
          type="button"
          onClick={() => signOut({ callbackUrl: "/login" })}
          className="flex flex-1 items-center justify-center gap-1.5 rounded-lg py-1.5 text-[11px] text-muted-foreground transition hover:bg-sidebar-accent hover:text-foreground"
        >
          <LogOut className="size-3.5" />
          Sign out
        </button>
      </div>
    </div>
  );
}
