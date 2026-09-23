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
  className,
}: {
  onManageTeam?: () => void;
  className?: string;
}) {
  const { data: session } = useSession();
  const user = session?.user;
  const isAdmin = user?.role === "admin";

  if (!user?.email) return null;

  const name = user.name || user.email.split("@")[0];
  const role = ROLE_LABEL[user.role] ?? "Creator";

  return (
    <div className={cn("flex min-w-0 items-center gap-2 rounded-xl bg-sidebar-accent/40 p-2 ring-1 ring-sidebar-border", className)}>
      <div className="flex min-w-0 flex-1 items-center gap-2">
        {user.image ? (
          // eslint-disable-next-line @next/next/no-img-element
          <img
            src={user.image}
            alt={name}
            referrerPolicy="no-referrer"
            className="size-8 shrink-0 rounded-full object-cover ring-1 ring-sidebar-border"
          />
        ) : (
          <span className="flex size-8 shrink-0 items-center justify-center rounded-full bg-gold text-[10px] font-semibold text-primary-foreground">
            {initials(user.name, user.email)}
          </span>
        )}
        <div className="min-w-0 flex-1 leading-tight">
          <p
            className="truncate text-xs font-medium text-foreground"
            title={name}
          >
            {name}
          </p>
          <p className="truncate text-[9px] text-muted-foreground">
            {role}
            {user.team ? ` · ${user.team}` : ""}
          </p>
        </div>
      </div>

      <div className="flex shrink-0 items-center gap-0.5">
        {isAdmin && (
          <button
            type="button"
            onClick={onManageTeam}
            aria-label="Team"
            title="Team"
            className="flex size-7 items-center justify-center rounded-lg text-muted-foreground transition hover:bg-sidebar-accent hover:text-foreground"
          >
            <Users className="size-3.5" />
          </button>
        )}
        <button
          type="button"
          onClick={() => signOut({ callbackUrl: "/login" })}
          aria-label="Sign out"
          title="Sign out"
          className="flex size-7 items-center justify-center rounded-lg text-muted-foreground transition hover:bg-sidebar-accent hover:text-foreground"
        >
          <LogOut className="size-3.5" />
        </button>
      </div>
    </div>
  );
}
