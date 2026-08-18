"use client";

import { useState } from "react";
import {
  Copy,
  ExternalLink,
  Link2,
  Mail,
  MessageCircle,
  Share2,
} from "lucide-react";
import { toast } from "sonner";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";

/**
 * The one place a generation becomes a public link.
 *
 * Every route out of here goes through /s/<token> on the app's own domain —
 * never the raw Spaces URL. That keeps the storage location private, makes
 * the link revocable, and gives the recipient a page with a preview card
 * instead of a bare file download. Images and clips share the same flow;
 * only the download options differ, which the caller supplies.
 */

export function useShareLink(generationId: string) {
  const [shareUrl, setShareUrl] = useState<string | null>(null);
  const [pending, setPending] = useState(false);

  const ensure = async (): Promise<string | null> => {
    if (shareUrl) return shareUrl;
    setPending(true);
    try {
      const res = await fetch(`/api/generations/${generationId}/share`, {
        method: "POST",
      });
      const json = await res.json();
      if (!res.ok) throw new Error(json.error ?? "Could not create link");
      const url = `${window.location.origin}/s/${json.token}`;
      setShareUrl(url);
      return url;
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Could not create link");
      return null;
    } finally {
      setPending(false);
    }
  };

  const revoke = async () => {
    setPending(true);
    try {
      const res = await fetch(`/api/generations/${generationId}/share`, {
        method: "DELETE",
      });
      const json = await res.json();
      if (!res.ok) throw new Error(json.error ?? "Revoke failed");
      setShareUrl(null);
      toast.success("Link revoked — it no longer opens");
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Revoke failed");
    } finally {
      setPending(false);
    }
  };

  return { shareUrl, pending, ensure, revoke };
}

type Props = {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  generationId: string;
  /** "image" or "video" — only changes the wording. */
  kind: "image" | "video";
  /** Prompt excerpt used as the message body when sharing to an app. */
  shareText: string;
  /** The stored media URL, for "open in new tab". */
  mediaUrl: string;
  /** Download rows — format choices differ per media type. */
  downloads?: React.ReactNode;
  /** Copy the prompt to the clipboard. */
  onCopyPrompt?: () => void;
};

export function ShareDialog({
  open,
  onOpenChange,
  generationId,
  kind,
  shareText,
  mediaUrl,
  downloads,
  onCopyPrompt,
}: Props) {
  const { shareUrl, pending, ensure, revoke } = useShareLink(generationId);
  const noun = kind === "video" ? "clip" : "image";

  const openExternal = (url: string) => {
    window.open(url, "_blank", "noopener,noreferrer");
    onOpenChange(false);
  };

  const copyLink = async () => {
    const link = await ensure();
    if (!link) return;
    try {
      await navigator.clipboard.writeText(link);
      toast.success("Share link copied");
      onOpenChange(false);
    } catch {
      toast.error("Copy failed");
    }
  };

  const shareNative = async () => {
    if (!navigator.share) {
      toast.message("Share unavailable");
      return;
    }
    const link = await ensure();
    if (!link) return;
    try {
      await navigator.share({
        title: `Athar ${noun}`,
        text: shareText,
        url: link,
      });
      onOpenChange(false);
    } catch (err) {
      if (err instanceof Error && err.name === "AbortError") return;
      toast.error("Share failed");
    }
  };

  const shareEmail = async () => {
    const link = await ensure();
    if (!link) return;
    const subject = encodeURIComponent(`Athar ${noun}`);
    const body = encodeURIComponent(`${shareText}\n\n${link}`);
    openExternal(`mailto:?subject=${subject}&body=${body}`);
  };

  const shareWhatsApp = async () => {
    const link = await ensure();
    if (!link) return;
    openExternal(
      `https://wa.me/?text=${encodeURIComponent(`${shareText}\n${link}`)}`
    );
  };

  const shareX = async () => {
    const link = await ensure();
    if (!link) return;
    openExternal(
      `https://twitter.com/intent/tweet?text=${encodeURIComponent(
        `${shareText}\n${link}`
      )}`
    );
  };

  const shareLinkedIn = async () => {
    const link = await ensure();
    if (!link) return;
    openExternal(
      `https://www.linkedin.com/sharing/share-offsite/?url=${encodeURIComponent(
        link
      )}`
    );
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="z-[60] max-h-[85dvh] max-w-sm overflow-y-auto border-white/10 bg-[#161616] text-foreground ring-white/10">
        <DialogHeader>
          <DialogTitle>Share {kind === "video" ? "clip" : "generation"}</DialogTitle>
          <DialogDescription className="text-muted-foreground">
            Creates a link on athar.yazmedia.com that anyone can open — no
            sign-in needed. Revoke it any time.
          </DialogDescription>
        </DialogHeader>

        {shareUrl && (
          <div className="rounded-xl bg-white/4 px-3 py-2.5 ring-1 ring-white/8">
            <p className="mb-1 text-[10px] tracking-[0.14em] text-muted-foreground uppercase">
              Live link
            </p>
            <p className="truncate font-mono text-[11px] text-foreground/90">
              {shareUrl}
            </p>
            <button
              type="button"
              disabled={pending}
              onClick={() => void revoke()}
              className="mt-2 text-[11px] text-muted-foreground underline-offset-2 transition hover:text-destructive hover:underline disabled:opacity-50"
            >
              Revoke this link
            </button>
          </div>
        )}

        <div className="grid gap-1.5">
          <ShareOption
            icon={<Share2 className="size-4" />}
            label="Share via device"
            hint="System share sheet"
            onClick={() => void shareNative()}
          />
          <ShareOption
            icon={<Link2 className="size-4" />}
            label={`Copy ${noun} link`}
            hint="athar.yazmedia.com/s/…"
            onClick={() => void copyLink()}
          />
          {onCopyPrompt && (
            <ShareOption
              icon={<Copy className="size-4" />}
              label="Copy prompt"
              onClick={() => {
                onCopyPrompt();
                onOpenChange(false);
              }}
            />
          )}
          {downloads}
          <ShareOption
            icon={<ExternalLink className="size-4" />}
            label="Open in new tab"
            onClick={() => openExternal(mediaUrl)}
          />
          <ShareOption
            icon={<Mail className="size-4" />}
            label="Email"
            onClick={() => void shareEmail()}
          />
          <ShareOption
            icon={<MessageCircle className="size-4" />}
            label="WhatsApp"
            onClick={() => void shareWhatsApp()}
          />
          <ShareOption icon={<XLogo />} label="Share on X" onClick={() => void shareX()} />
          <ShareOption
            icon={<LinkedInLogo />}
            label="Share on LinkedIn"
            onClick={() => void shareLinkedIn()}
          />
        </div>
      </DialogContent>
    </Dialog>
  );
}

export function ShareOption({
  icon,
  label,
  hint,
  onClick,
}: {
  icon: React.ReactNode;
  label: string;
  hint?: string;
  onClick: () => void;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      className="flex w-full items-center gap-3 rounded-xl px-3 py-2.5 text-left transition hover:bg-white/8"
    >
      <span className="flex size-9 items-center justify-center rounded-lg bg-white/6 text-foreground ring-1 ring-white/8">
        {icon}
      </span>
      <span className="min-w-0 flex-1">
        <span className="block text-sm text-foreground">{label}</span>
        {hint && (
          <span className="block text-[11px] text-muted-foreground">{hint}</span>
        )}
      </span>
    </button>
  );
}

function XLogo() {
  return (
    <svg viewBox="0 0 24 24" aria-hidden className="size-4 fill-current">
      <path d="M18.244 2.25h3.308l-7.227 8.26 8.502 11.24H16.17l-5.214-6.817L4.99 21.75H1.68l7.73-8.835L1.254 2.25H8.08l4.713 6.231zm-1.161 17.52h1.833L7.084 4.126H5.117z" />
    </svg>
  );
}

function LinkedInLogo() {
  return (
    <svg viewBox="0 0 24 24" aria-hidden className="size-4 fill-current">
      <path d="M20.45 20.45h-3.56v-5.57c0-1.33-.02-3.04-1.85-3.04-1.85 0-2.13 1.45-2.13 2.94v5.67H9.35V9h3.42v1.56h.05c.48-.9 1.64-1.85 3.37-1.85 3.6 0 4.27 2.37 4.27 5.46zM5.34 7.43a2.06 2.06 0 1 1 0-4.13 2.06 2.06 0 0 1 0 4.13M7.12 20.45H3.56V9h3.56zM22.22 0H1.77C.79 0 0 .77 0 1.72v20.56C0 23.23.79 24 1.77 24h20.45c.98 0 1.78-.77 1.78-1.72V1.72C24 .77 23.2 0 22.22 0" />
    </svg>
  );
}
