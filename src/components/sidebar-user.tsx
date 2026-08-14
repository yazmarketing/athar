"use client";

import { useState } from "react";
import { signOut, useSession } from "next-auth/react";
import { LogOut, Users } from "lucide-react";
import { cn } from "@/lib/utils";
import { TeamDialog } from "@/components/team-dialog";

export function SidebarUser() {
  const { data: session } = useSession();
  const email = session?.user?.email;
  const isAdmin = session?.user?.role === "admin";
  const [teamOpen, setTeamOpen] = useState(false);

  if (!email) return null;

  return (
    <div className="mt-1 space-y-1">
      <p className="truncate px-1 text-[11px] leading-4 text-muted-foreground" title={email}>
        {email}
        {session?.user?.role && (
          <span className="ml-1 rounded bg-sidebar-accent px-1 py-px text-[9px] uppercase">
            {session.user.role}
          </span>
        )}
      </p>
      <div className="flex items-center gap-1">
        {isAdmin && (
          <button
            type="button"
            aria-label="Manage team"
            onClick={() => setTeamOpen(true)}
            className={cn(
              "group relative flex size-9 items-center justify-center rounded-lg text-muted-foreground transition",
              "hover:bg-sidebar-accent hover:text-foreground"
            )}
          >
            <Users className="size-4" />
            <span className="pointer-events-none absolute -top-8 left-1/2 z-50 -translate-x-1/2 rounded-md bg-foreground px-2 py-1 text-[10px] whitespace-nowrap text-background opacity-0 shadow-md transition-opacity duration-100 group-hover:opacity-100">
              Manage team
            </span>
          </button>
        )}
        <button
          type="button"
          aria-label="Sign out"
          onClick={() => signOut({ callbackUrl: "/login" })}
          className={cn(
            "group relative flex size-9 items-center justify-center rounded-lg text-muted-foreground transition",
            "hover:bg-sidebar-accent hover:text-foreground"
          )}
        >
          <LogOut className="size-4" />
          <span className="pointer-events-none absolute -top-8 left-1/2 z-50 -translate-x-1/2 rounded-md bg-foreground px-2 py-1 text-[10px] whitespace-nowrap text-background opacity-0 shadow-md transition-opacity duration-100 group-hover:opacity-100">
            Sign out
          </span>
        </button>
      </div>
      {isAdmin && <TeamDialog open={teamOpen} onOpenChange={setTeamOpen} />}
    </div>
  );
}
