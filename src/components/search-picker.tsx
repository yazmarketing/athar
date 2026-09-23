"use client";

import { useMemo, useState, type ReactNode } from "react";
import { Check, Search } from "lucide-react";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { cn } from "@/lib/utils";

export type SearchPickerOption = {
  value: string;
  label: string;
  description?: string;
};

export type SearchPickerAction = {
  label: string;
  onSelect: () => void;
  destructive?: boolean;
  disabled?: boolean;
};

type Props = {
  value: string | null;
  onValueChange: (value: string) => void;
  options: SearchPickerOption[];
  label: string;
  placeholder: string;
  searchPlaceholder?: string;
  icon?: ReactNode;
  className?: string;
  disabled?: boolean;
  actions?: SearchPickerAction[];
};

/**
 * A searchable, mobile-friendly replacement for long native-style menus.
 * Client and project lists routinely grow past what a dropdown can scan.
 */
export function SearchPicker({
  value,
  onValueChange,
  options,
  label,
  placeholder,
  searchPlaceholder,
  icon,
  className,
  disabled,
  actions = [],
}: Props) {
  const [open, setOpen] = useState(false);
  const [query, setQuery] = useState("");
  const selected = options.find((option) => option.value === value);
  const matches = useMemo(() => {
    const q = query.trim().toLocaleLowerCase();
    if (!q) return options;
    return options.filter((option) =>
      `${option.label} ${option.description ?? ""}`.toLocaleLowerCase().includes(q)
    );
  }, [options, query]);

  return (
    <>
      <button
        type="button"
        aria-label={label}
        aria-haspopup="dialog"
        aria-expanded={open}
        disabled={disabled}
        onClick={() => setOpen(true)}
        className={cn(
          "inline-flex h-8 min-w-0 items-center gap-1.5 rounded-full border border-white/10 bg-white/5 px-3 text-xs text-muted-foreground transition hover:text-foreground disabled:cursor-not-allowed disabled:opacity-50",
          selected && "text-foreground",
          className
        )}
      >
        {icon}
        <span className="max-w-44 truncate">{selected?.label ?? placeholder}</span>
        <Search className="ml-0.5 size-3 shrink-0 opacity-60" />
      </button>

      <Dialog
        open={open}
        onOpenChange={(next) => {
          setOpen(next);
          if (!next) setQuery("");
        }}
      >
        <DialogContent className="gap-3 sm:max-w-md">
          <DialogHeader>
            <DialogTitle>{label}</DialogTitle>
            <DialogDescription>
              Search by name, then choose one from the matching results.
            </DialogDescription>
          </DialogHeader>
          <div className="relative">
            <Search className="pointer-events-none absolute left-3 top-1/2 size-4 -translate-y-1/2 text-muted-foreground" />
            <Input
              autoFocus
              value={query}
              onChange={(event) => setQuery(event.target.value)}
              placeholder={searchPlaceholder ?? `Search ${label.toLocaleLowerCase()}…`}
              className="pl-9"
            />
          </div>
          <div className="max-h-[45vh] space-y-1 overflow-y-auto overscroll-contain pr-1">
            {matches.map((option) => (
              <button
                key={option.value}
                type="button"
                onClick={() => {
                  onValueChange(option.value);
                  setOpen(false);
                }}
                className={cn(
                  "flex w-full items-center gap-3 rounded-lg px-3 py-2.5 text-left transition hover:bg-sidebar-accent",
                  option.value === value && "bg-sidebar-accent"
                )}
              >
                <span className="min-w-0 flex-1">
                  <span className="block truncate text-sm">{option.label}</span>
                  {option.description && (
                    <span className="mt-0.5 block truncate text-[11px] text-muted-foreground">
                      {option.description}
                    </span>
                  )}
                </span>
                {option.value === value && <Check className="size-4 shrink-0 text-gold" />}
              </button>
            ))}
            {matches.length === 0 && (
              <p className="py-8 text-center text-sm text-muted-foreground">No matches</p>
            )}
          </div>
          {actions.length > 0 && (
            <div className="flex flex-wrap gap-2 border-t border-border pt-3">
              {actions.map((action) => (
                <button
                  key={action.label}
                  type="button"
                  disabled={action.disabled}
                  onClick={() => {
                    setOpen(false);
                    action.onSelect();
                  }}
                  className={cn(
                    "rounded-lg border border-border px-3 py-2 text-xs transition hover:bg-sidebar-accent disabled:opacity-40",
                    action.destructive && "text-destructive"
                  )}
                >
                  {action.label}
                </button>
              ))}
            </div>
          )}
        </DialogContent>
      </Dialog>
    </>
  );
}
