"use client";

import { useState } from "react";
import { Bell, CheckCheck, Clapperboard, ImageIcon, X } from "lucide-react";
import { cn } from "@/lib/utils";

export type AppNotification = {
  id: string;
  kind: "video" | "image";
  status: "success" | "error";
  title: string;
  body?: string;
  generationId?: string | null;
  thumbnailUrl?: string | null;
  createdAt: number;
  read: boolean;
};

function timeAgo(ts: number): string {
  const s = Math.max(0, Math.round((Date.now() - ts) / 1000));
  if (s < 60) return "just now";
  const m = Math.round(s / 60);
  if (m < 60) return `${m}m ago`;
  const h = Math.round(m / 60);
  if (h < 24) return `${h}h ago`;
  return new Date(ts).toLocaleDateString();
}

export function NotificationsBell({
  notifications,
  onMarkAllRead,
  onClearAll,
  onItemClick,
}: {
  notifications: AppNotification[];
  onMarkAllRead: () => void;
  onClearAll: () => void;
  onItemClick: (n: AppNotification) => void;
}) {
  const [open, setOpen] = useState(false);
  const unread = notifications.filter((n) => !n.read).length;

  const toggle = () => {
    // Opening the panel marks everything as seen. Kept outside the setOpen
    // updater — updaters must stay pure (React may run them during render).
    if (!open) onMarkAllRead();
    setOpen(!open);
  };

  return (
    <div className="relative">
      <button
        type="button"
        aria-label="Notifications"
        aria-expanded={open}
        onClick={toggle}
        className={cn(
          "relative flex size-9 items-center justify-center rounded-full bg-card text-muted-foreground ring-1 ring-border transition hover:text-foreground",
          open && "text-foreground ring-gold/40"
        )}
      >
        <Bell className="size-4" />
        {unread > 0 && (
          <span className="absolute -top-1 -right-1 flex h-4 min-w-4 items-center justify-center rounded-full bg-gold px-1 text-[10px] font-semibold text-primary-foreground">
            {unread > 9 ? "9+" : unread}
          </span>
        )}
      </button>

      {open && (
        <>
          {/* click-away backdrop */}
          <button
            type="button"
            aria-label="Close notifications"
            className="fixed inset-0 z-40 cursor-default"
            onClick={() => setOpen(false)}
          />
          <div className="absolute right-0 z-50 mt-2 w-[22rem] overflow-hidden rounded-2xl border border-border bg-card shadow-xl">
            <div className="flex items-center justify-between border-b border-border px-4 py-2.5">
              <p className="text-sm font-medium">Notifications</p>
              {notifications.length > 0 && (
                <button
                  type="button"
                  onClick={onClearAll}
                  className="inline-flex items-center gap-1 text-[11px] text-muted-foreground transition hover:text-foreground"
                >
                  <CheckCheck className="size-3" />
                  Clear all
                </button>
              )}
            </div>

            {notifications.length === 0 ? (
              <div className="px-4 py-10 text-center">
                <Bell className="mx-auto mb-2 size-5 text-muted-foreground" />
                <p className="text-sm text-muted-foreground">
                  Nothing yet — finished renders will show up here
                </p>
              </div>
            ) : (
              <ul className="max-h-[22rem] overflow-y-auto">
                {notifications.map((n) => (
                  <li key={n.id}>
                    <button
                      type="button"
                      onClick={() => {
                        setOpen(false);
                        onItemClick(n);
                      }}
                      className="flex w-full items-start gap-3 px-4 py-3 text-left transition hover:bg-sidebar-accent"
                    >
                      {n.thumbnailUrl ? (
                        // eslint-disable-next-line @next/next/no-img-element
                        <img
                          src={n.thumbnailUrl}
                          alt=""
                          className="size-10 shrink-0 rounded-lg object-cover ring-1 ring-border"
                        />
                      ) : (
                        <span
                          className={cn(
                            "flex size-10 shrink-0 items-center justify-center rounded-lg ring-1 ring-border",
                            n.status === "error"
                              ? "text-muted-foreground"
                              : "text-foreground"
                          )}
                        >
                          {n.status === "error" ? (
                            <X className="size-4" />
                          ) : n.kind === "video" ? (
                            <Clapperboard className="size-4" />
                          ) : (
                            <ImageIcon className="size-4" />
                          )}
                        </span>
                      )}
                      <span className="min-w-0 flex-1">
                        <span className="block truncate text-sm text-foreground">
                          {n.title}
                        </span>
                        {n.body && (
                          <span className="mt-0.5 block truncate text-xs text-muted-foreground">
                            {n.body}
                          </span>
                        )}
                        <span className="mt-0.5 block text-[11px] text-muted-foreground">
                          {timeAgo(n.createdAt)}
                        </span>
                      </span>
                      {!n.read && (
                        <span className="mt-1.5 size-2 shrink-0 rounded-full bg-gold" />
                      )}
                    </button>
                  </li>
                ))}
              </ul>
            )}
          </div>
        </>
      )}
    </div>
  );
}
