"use client";

import { useState } from "react";
import { ExternalLink, Plug } from "lucide-react";
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from "@/components/ui/dialog";

export function CreativeIntegrations() {
  const [open, setOpen] = useState(false);
  return <>
    <button type="button" onClick={() => setOpen(true)} className="inline-flex items-center gap-2 rounded-full border border-border bg-card px-3 py-2 text-xs text-muted-foreground hover:text-foreground">
      <Plug className="size-4" /><span>ChatGPT &amp; After Effects</span>
    </button>
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogContent className="max-h-[85vh] overflow-y-auto sm:max-w-xl">
        <DialogHeader>
          <DialogTitle>Creative connections</DialogTitle>
          <DialogDescription>Understand what you can use in Athar and what needs a separate app.</DialogDescription>
        </DialogHeader>
        <div className="space-y-4 text-sm leading-relaxed">
          <section className="rounded-xl border border-border bg-muted/40 p-4">
            <h3 className="font-medium">GPT-6 Astra in Athar</h3>
            <p className="mt-2 text-muted-foreground">Open the GPT-6 Astra prompt editor in Image or Video to develop your shot, timing and cultural direction. Review the prompt, apply it, then generate with the selected rendering model. Requires your workspace’s OpenAI connection and model access.</p>
          </section>
          <section className="rounded-xl border border-border bg-muted/40 p-4">
            <h3 className="font-medium">Higgsfield in ChatGPT <span className="text-xs text-muted-foreground">· External service</span></h3>
            <p className="mt-2 text-muted-foreground">Their plugin gives ChatGPT access to Higgsfield’s creative tools. It uses a separate Higgsfield account and credits; it does not connect your Athar Library.</p>
            <a href="https://higgsfield.ai/mcp" target="_blank" rel="noopener noreferrer" className="mt-3 inline-flex items-center gap-2 text-gold">View Higgsfield’s plugin setup <ExternalLink className="size-3" /></a>
          </section>
          <section className="rounded-xl border border-border bg-muted/40 p-4">
            <h3 className="font-medium">After Effects <span className="text-xs text-muted-foreground">· Athar connection not available yet</span></h3>
            <p className="mt-2 text-muted-foreground">Higgsfield’s motion designer works with editable compositions, layers and keyframes in the desktop app. Athar currently creates media; it cannot control After Effects or build an editable composition there.</p>
            <a href="https://www.higgsfield.company/blog/ai-motion-designer-after-effects-gpt" target="_blank" rel="noopener noreferrer" className="mt-3 inline-flex items-center gap-2 text-gold">Read the After Effects setup guide <ExternalLink className="size-3" /></a>
          </section>
        </div>
      </DialogContent>
    </Dialog>
  </>;
}
