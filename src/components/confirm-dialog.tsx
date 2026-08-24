"use client";

import { useState } from "react";
import { Loader2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";

type Props = {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  title: string;
  description: string;
  /** Estimated spend in USD, shown so nobody pays by mis-click. */
  cost?: number | null;
  confirmLabel: string;
  /** Red confirm button for irreversible deletes. */
  destructive?: boolean;
  onConfirm: () => Promise<void> | void;
};

/**
 * Confirmation for an action that spends money.
 *
 * Every render costs the account something, so anything that fires a provider
 * request off a single click asks first and says what it will cost.
 */
export function ConfirmDialog({
  open,
  onOpenChange,
  title,
  description,
  cost,
  confirmLabel,
  destructive,
  onConfirm,
}: Props) {
  const [busy, setBusy] = useState(false);

  return (
    <Dialog open={open} onOpenChange={(o) => !busy && onOpenChange(o)}>
      <DialogContent className="z-[70] w-[min(24rem,calc(100vw-2rem))] max-w-sm border-white/10 bg-[#161616] text-foreground ring-white/10">
        <DialogHeader>
          <DialogTitle>{title}</DialogTitle>
          <DialogDescription className="text-muted-foreground">
            {description}
          </DialogDescription>
        </DialogHeader>

        {cost != null && cost > 0 && (
          <p className="rounded-lg bg-white/5 px-3 py-2 text-xs text-muted-foreground">
            Costs about{" "}
            <span className="text-foreground">${cost.toFixed(2)}</span> and
            creates a new Library entry. The original stays as it is.
          </p>
        )}

        <div className="flex justify-end gap-2">
          <Button
            variant="outline"
            className="rounded-xl border-white/10 bg-transparent"
            disabled={busy}
            onClick={() => onOpenChange(false)}
          >
            Cancel
          </Button>
          <Button
            className={
              destructive
                ? "gap-2 rounded-xl bg-red-600 text-white hover:bg-red-600/90"
                : "gap-2 rounded-xl bg-gold text-primary-foreground hover:bg-gold/90"
            }
            disabled={busy}
            onClick={async () => {
              setBusy(true);
              try {
                await onConfirm();
                onOpenChange(false);
              } finally {
                setBusy(false);
              }
            }}
          >
            {busy && <Loader2 className="size-4 animate-spin" />}
            {confirmLabel}
          </Button>
        </div>
      </DialogContent>
    </Dialog>
  );
}
