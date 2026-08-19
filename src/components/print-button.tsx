"use client";

import { Printer } from "lucide-react";

/** Print / save as PDF. Hidden on the printed page itself. */
export function PrintButton() {
  return (
    <button
      type="button"
      onClick={() => window.print()}
      className="flex items-center gap-1.5 rounded-full border border-black/20 px-3 py-1.5 text-xs transition hover:bg-black/5 print:hidden"
    >
      <Printer className="size-3.5" />
      Print / save as PDF
    </button>
  );
}
