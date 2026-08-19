"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { useSession } from "next-auth/react";
import { toast } from "sonner";
import {
  ArrowLeft,
  ChevronLeft,
  ChevronRight,
  Clapperboard,
  Copy,
  Film,
  ImageIcon,
  Loader2,
  Paperclip,
  Plus,
  Printer,
  Sparkles,
  Trash2,
  Wand2,
  X,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import {
  Dialog,
  DialogContent,
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
import { ReferenceLibrary } from "@/components/reference-library";
import {
  composeFrameNegative,
  composeFramePrompt,
  stripLegacyContinuity,
} from "@/lib/shot-plan";
import {
  resolveStoryboardStyle,
  STORYBOARD_STYLES,
} from "@/config/storyboard-styles";
import { cn } from "@/lib/utils";
import type {
  ClientRecord,
  StoryboardCastMember,
  StoryboardFrameRecord,
  StoryboardRecord,
} from "@/lib/types";

const ASPECTS = ["16:9", "9:16", "1:1", "4:5"];
/** Select can't hold an empty value, so "no client" needs a sentinel. */
const NO_CLIENT = "__none__";

const SHOT_SIZES = [
  "Wide",
  "Medium",
  "Close-up",
  "Extreme close-up",
  "Over-the-shoulder",
];

/** Per-frame work in flight, keyed by frame id. */
type FrameStatus = "idle" | "rendering" | "animating" | "error";

type Props = {
  clients: ClientRecord[];
  /**
   * Pre-selected in the New storyboard dialog. Deliberately NOT a filter on
   * the board list: a board belongs to whichever client it was filed under,
   * and hiding everything else because some unrelated client happens to be
   * active in the generate dock reads as "my boards vanished".
   */
  defaultClientId?: string | null;
  defaultProjectId?: string | null;
  defaultBrandKitId?: string | null;
  /** Called after anything lands in the Library, so the gallery refreshes. */
  onGenerated?: () => void;
};

/** "16:9" → a CSS aspect-ratio value. */
function aspectStyle(aspect: string | null | undefined, fallback: string) {
  const [w, h] = (aspect || fallback).split(":");
  return Number(w) && Number(h) ? `${w} / ${h}` : "16 / 9";
}

function isVideoUrl(url: string | null | undefined) {
  return Boolean(url && /\.(mp4|webm|mov)(\?|$)/i.test(url));
}

/**
 * Storyboards — the planning surface in front of generation.
 *
 * A board holds an ordered set of frames. Each frame keeps its still prompt
 * and its camera move apart (an image model renders "camera pushes in" as a
 * sentence, not a movement), and frames render against a shared key frame so
 * the board reads as one piece rather than a set of unrelated pictures.
 */
export function Storyboards({
  clients,
  defaultClientId,
  defaultProjectId,
  defaultBrandKitId,
  onGenerated,
}: Props) {
  const { data: session } = useSession();
  const canGenerate =
    session?.user?.role === "admin" || session?.user?.role === "creator";

  const [boards, setBoards] = useState<StoryboardRecord[] | null>(null);
  const [board, setBoard] = useState<StoryboardRecord | null>(null);
  const [frames, setFrames] = useState<StoryboardFrameRecord[]>([]);
  const [loadingBoard, setLoadingBoard] = useState(false);
  const [planning, setPlanning] = useState(false);
  const [renderingAll, setRenderingAll] = useState(false);
  const [status, setStatus] = useState<Record<string, FrameStatus>>({});
  const [errors, setErrors] = useState<Record<string, string>>({});
  const [createOpen, setCreateOpen] = useState(false);
  const [newTitle, setNewTitle] = useState("");
  const [newBrief, setNewBrief] = useState("");
  const [newAspect, setNewAspect] = useState("16:9");
  const [newShotCount, setNewShotCount] = useState(6);
  const [newClientId, setNewClientId] = useState<string | null>(
    defaultClientId ?? null
  );
  const [newRefs, setNewRefs] = useState<string[]>([]);
  const [creating, setCreating] = useState(false);
  /** Board-list filter. Empty means every board, which is the default. */
  const [filterClientId, setFilterClientId] = useState<string>("all");
  const [planCount, setPlanCount] = useState(6);
  const [confirmDelete, setConfirmDelete] = useState(false);
  const [refsOpen, setRefsOpen] = useState(false);

  const setFrameStatus = useCallback((id: string, next: FrameStatus) => {
    setStatus((prev) => ({ ...prev, [id]: next }));
  }, []);

  /* ---------------------------------------------------------------- loading */

  const loadBoards = useCallback(async () => {
    try {
      const qs =
        filterClientId === "all"
          ? ""
          : `?clientId=${encodeURIComponent(filterClientId)}`;
      const res = await fetch(`/api/storyboards${qs}`, { cache: "no-store" });
      const json = await res.json();
      if (!res.ok) throw new Error(json.error);
      setBoards(json.storyboards as StoryboardRecord[]);
    } catch (err) {
      setBoards([]);
      toast.error(
        err instanceof Error ? err.message : "Could not load storyboards"
      );
    }
  }, [filterClientId]);

  useEffect(() => {
    void loadBoards();
  }, [loadBoards]);

  const openBoard = useCallback(async (id: string) => {
    setLoadingBoard(true);
    try {
      const res = await fetch(`/api/storyboards/${id}`, { cache: "no-store" });
      const json = await res.json();
      if (!res.ok) throw new Error(json.error);
      const next = json.storyboard as StoryboardRecord;
      setBoard(next);
      setFrames(next.frames ?? []);
      setPlanCount(Math.max(next.frames?.length || 6, 3));
      setStatus({});
      setErrors({});
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Could not open board");
    } finally {
      setLoadingBoard(false);
    }
  }, []);

  /* ------------------------------------------------------- debounced saving */

  // Text edits type-ahead locally and settle to the server together, so a
  // long prompt isn't one PATCH per keystroke.
  const pending = useRef(new Map<string, Partial<StoryboardFrameRecord>>());
  const flushTimer = useRef<number | null>(null);
  const boardIdRef = useRef<string | null>(null);
  boardIdRef.current = board?.id ?? null;

  const flushFrames = useCallback(async () => {
    const boardId = boardIdRef.current;
    if (!boardId || pending.current.size === 0) return;
    const batch = Array.from(pending.current.entries());
    pending.current.clear();
    await Promise.all(
      batch.map(([frameId, patch]) =>
        fetch(`/api/storyboards/${boardId}/frames/${frameId}`, {
          method: "PATCH",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify(patch),
        }).catch(() => null)
      )
    );
  }, []);

  const patchFrame = useCallback(
    (frameId: string, patch: Partial<StoryboardFrameRecord>) => {
      setFrames((prev) =>
        prev.map((f) => (f.id === frameId ? { ...f, ...patch } : f))
      );
      pending.current.set(frameId, {
        ...(pending.current.get(frameId) ?? {}),
        ...patch,
      });
      if (flushTimer.current) window.clearTimeout(flushTimer.current);
      flushTimer.current = window.setTimeout(() => void flushFrames(), 700);
    },
    [flushFrames]
  );

  // Never lose the last few keystrokes on navigating away.
  useEffect(() => {
    return () => {
      if (flushTimer.current) window.clearTimeout(flushTimer.current);
      void flushFrames();
    };
  }, [flushFrames]);

  /**
   * Update the board optimistically. The wire format is camelCase while the
   * record is snake_case, so the local patch is passed separately rather than
   * hoping one shape satisfies both.
   */
  const patchBoard = useCallback(
    async (wire: Record<string, unknown>, local?: Partial<StoryboardRecord>) => {
      if (!board) return;
      setBoard({ ...board, ...((local ?? wire) as Partial<StoryboardRecord>) });
      await fetch(`/api/storyboards/${board.id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(wire),
      }).catch(() => null);
    },
    [board]
  );

  /* --------------------------------------------------------------- creating */

  /**
   * Create and immediately plan. There is no "empty board" path: a storyboard
   * with no brief has nothing to break into frames, so the brief is the thing
   * being asked for, not an optional extra.
   */
  async function createBoard() {
    const brief = newBrief.trim();
    if (!brief) return;
    const title = newTitle.trim() || "Untitled storyboard";
    setCreating(true);
    try {
      const res = await fetch("/api/storyboards", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          title,
          brief,
          clientId: newClientId,
          // Project and brand kit still come from the dock — they are only
          // meaningful alongside the client that was chosen with them.
          projectId: newClientId === defaultClientId ? defaultProjectId ?? null : null,
          brandKitId: newClientId === defaultClientId ? defaultBrandKitId ?? null : null,
          aspect: newAspect,
          referenceUrls: newRefs,
        }),
      });
      const json = await res.json();
      if (!res.ok) throw new Error(json.error);
      const created = json.storyboard as StoryboardRecord;

      setCreateOpen(false);
      setNewTitle("");
      setNewBrief("");
      setNewRefs([]);
      setBoard(created);
      setFrames([]);
      void loadBoards();

      await runPlan(created.id, "replace", newShotCount, brief);
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Could not create board");
    } finally {
      setCreating(false);
    }
  }

  /* --------------------------------------------------------------- planning */

  const runPlan = useCallback(
    async (
      boardId: string,
      mode: "replace" | "append",
      shotCount: number,
      brief?: string
    ) => {
      setPlanning(true);
      try {
        const res = await fetch(`/api/storyboards/${boardId}/plan`, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ mode, shotCount, brief }),
        });
        const json = await res.json();
        if (!res.ok) throw new Error(json.error);
        const next = json.storyboard as StoryboardRecord;
        setBoard(next);
        setFrames(next.frames ?? []);
        void loadBoards();
        toast.success(
          mode === "append"
            ? `Added ${shotCount} frame${shotCount === 1 ? "" : "s"}`
            : `Broken into ${next.frames?.length ?? 0} frames`
        );
      } catch (err) {
        toast.error(err instanceof Error ? err.message : "Planning failed");
      } finally {
        setPlanning(false);
      }
    },
    [loadBoards]
  );

  /* --------------------------------------------------------------- frame ops */

  async function addBlankFrame() {
    if (!board) return;
    const res = await fetch(`/api/storyboards/${board.id}/frames`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        title: `Frame ${frames.length + 1}`,
        aspect: board.aspect,
        duration_s: 5,
      }),
    });
    const json = await res.json();
    if (!res.ok) {
      toast.error(json.error ?? "Could not add a frame");
      return;
    }
    setFrames((prev) => [...prev, json.frame as StoryboardFrameRecord]);
  }

  async function removeFrame(frameId: string) {
    if (!board) return;
    // Drop any queued edit for a frame that's about to stop existing.
    pending.current.delete(frameId);
    setFrames((prev) => prev.filter((f) => f.id !== frameId));
    const res = await fetch(
      `/api/storyboards/${board.id}/frames/${frameId}`,
      { method: "DELETE" }
    );
    if (!res.ok) {
      toast.error("Could not delete that frame");
      void openBoard(board.id);
    }
  }

  async function moveFrame(frameId: string, delta: -1 | 1) {
    if (!board) return;
    const index = frames.findIndex((f) => f.id === frameId);
    const target = index + delta;
    if (index < 0 || target < 0 || target >= frames.length) return;

    const next = [...frames];
    [next[index], next[target]] = [next[target], next[index]];
    setFrames(next);

    // Order is persisted whole, so a dropped request can't half-apply.
    await fetch(`/api/storyboards/${board.id}/frames`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ order: next.map((f) => f.id) }),
    }).catch(() => toast.error("Could not save the new order"));
  }

  /* ------------------------------------------------------------- generating */

  /**
   * The first rendered frame is the board's anchor: every later frame is
   * generated against it as a visual reference. Describing the subject
   * identically isn't enough on its own — the model still redraws the face and
   * wardrobe each time. Anchoring to real pixels is what holds a person across
   * frames.
   */
  /**
   * The image this frame can actually inherit identity from: the first
   * rendered frame that shares a character with it.
   *
   * Sharing matters. Anchoring a frame containing the boy to a landscape that
   * contains no one carries nothing — and it used to also suppress the written
   * identity, so the character arrived described by neither picture nor text.
   * `extra` holds frames rendered earlier in this same run.
   */
  const identityAnchor = useCallback(
    (frame: StoryboardFrameRecord, extra?: Map<string, string>) => {
      const ids = frame.cast_ids ?? [];
      if (ids.length === 0) return null;
      for (const other of frames) {
        if (other.id === frame.id || other.is_blank) continue;
        if (!(other.cast_ids ?? []).some((c) => ids.includes(c))) continue;
        const url = extra?.get(other.id) ?? other.image_url;
        if (url) return url;
      }
      return null;
    },
    [frames]
  );

  /**
   * Edit one cast member. Changes land on every frame that names them and
   * nowhere else, and take effect on the next render without a re-plan.
   */
  const patchCast = useCallback(
    (index: number, patch: Partial<StoryboardCastMember>) => {
      if (!board) return;
      const next = (board.cast_members ?? []).map((m, i) =>
        i === index ? { ...m, ...patch } : m
      );
      void patchBoard({ cast: next }, { cast_members: next });
    },
    [board, patchBoard]
  );

  /** Toggle a reference on the open board and persist it. */
  const toggleBoardRef = useCallback(
    (url: string) => {
      if (!board) return;
      const current = board.reference_urls ?? [];
      const next = current.includes(url)
        ? current.filter((u) => u !== url)
        : [...current, url];
      void patchBoard({ referenceUrls: next }, { reference_urls: next });
    },
    [board, patchBoard]
  );

  const renderFrame = useCallback(
    async (frame: StoryboardFrameRecord, anchor: string | null) => {
      if (!board) return null;
      // A black frame is a real beat, not an unfinished one — nothing to make.
      if (frame.is_blank) return null;
      if (!frame.prompt.trim()) {
        setErrors((e) => ({ ...e, [frame.id]: "Describe the frame first" }));
        setFrameStatus(frame.id, "error");
        return null;
      }

      const refs = board.reference_urls ?? [];
      const style = resolveStoryboardStyle(board.style_id);
      /**
       * The anchor holds identity but also drags composition — it is a whole
       * picture, and the model treats it as one. Two rules keep it useful:
       * attached references do the identity job better, so the anchor stands
       * down when they exist; and any frame can opt out, which is what an
       * insert or a macro needs.
       */
      // The caller has already checked that the anchor shares a character.
      const useAnchor = Boolean(anchor) && frame.lock_to_anchor && refs.length === 0;
      const referenceUrls = [...refs, useAnchor ? anchor : null].filter(
        (u): u is string => Boolean(u)
      );
      /**
       * Written identity is dropped only when an image genuinely carrying this
       * character is attached — board references, or a cast-sharing anchor.
       */
      const identityInPictures = refs.length > 0 || useAnchor;

      setFrameStatus(frame.id, "rendering");
      setErrors((e) => ({ ...e, [frame.id]: "" }));
      try {
        const res = await fetch("/api/generate", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            mode: "t2i",
            // Whatever the rest of the board inherits from is worth paying
            // more for: the reference-less anchor frame, or nothing.
            tier: referenceUrls.length === 0 ? "hero" : "standard",
            prompt: {
              subject: composeFramePrompt({
                prompt: frame.prompt,
                shotSize: frame.shot_size,
                // Only the people actually in THIS frame. A landscape beat
                // gets nobody, which is the point.
                cast: board.cast_members ?? [],
                castIds: frame.cast_ids ?? [],
                stylePositive: style.positive,
                hasReferences: identityInPictures,
              }),
              negativeAdditions: composeFrameNegative(
                board.banned_elements ?? [],
                style.negative
              ),
            },
            aspect: frame.aspect || board.aspect,
            numOutputs: 1,
            resolution: "2K",
            referenceUrls,
            projectId: board.project_id ?? undefined,
            brandKitId: board.brand_kit_id ?? undefined,
          }),
        });
        const json: {
          error?: string;
          generation?: { id?: string; output_url?: string | null };
        } = await res.json();
        if (!res.ok) throw new Error(json.error ?? "Generation failed");

        const url = json.generation?.output_url ?? null;
        patchFrame(frame.id, {
          image_url: url,
          generation_id: json.generation?.id ?? null,
          // A re-render invalidates the clip that was made from the old still.
          video_url: null,
        });
        setFrameStatus(frame.id, "idle");
        onGenerated?.();
        return url;
      } catch (err) {
        const message = err instanceof Error ? err.message : "Failed";
        setErrors((e) => ({ ...e, [frame.id]: message }));
        setFrameStatus(frame.id, "error");
        return null;
      }
    },
    [board, onGenerated, patchFrame, setFrameStatus]
  );

  async function renderAll(onlyMissing: boolean) {
    if (!board) return;
    setRenderingAll(true);
    // Sequential so cost and rate stay predictable, the board renders in
    // order, and the anchor exists before anything references it.
    //
    // Until this run produces one, the anchor is looked up per frame with that
    // frame excluded: anchoring a frame to its OWN previous render guarantees
    // it comes back unchanged, which is indistinguishable from the re-render
    // having done nothing.
    const justRendered = new Map<string, string>();
    for (const frame of frames) {
      if (frame.is_blank) continue;
      if (onlyMissing && frame.image_url) continue;
      if (!frame.prompt.trim()) continue;
      const url = await renderFrame(frame, identityAnchor(frame, justRendered));
      if (url) justRendered.set(frame.id, url);
    }
    setRenderingAll(false);
    await flushFrames();
    toast.success("Board rendered — every frame is in the Library too");
  }

  /* ---------------------------------------------------------------- animate */

  /**
   * Turn a rendered still into a clip (image → video). Video renders are
   * async: the API hands back a job, and the board polls it until the clip
   * lands, so the frame fills itself in without a refresh.
   */
  const pollJob = useCallback(
    async (frameId: string, jobId: string) => {
      const deadline = Date.now() + 12 * 60 * 1000;
      while (Date.now() < deadline) {
        await new Promise((r) => setTimeout(r, 6000));
        try {
          const res = await fetch(`/api/jobs/${jobId}`, { cache: "no-store" });
          const json = await res.json();
          if (!res.ok) throw new Error(json.error);
          const jobStatus = json.job?.status as string | undefined;
          if (jobStatus === "completed") {
            const url = json.generation?.output_url ?? null;
            patchFrame(frameId, { video_url: url, video_job_id: null });
            setFrameStatus(frameId, "idle");
            onGenerated?.();
            toast.success("Clip ready");
            return;
          }
          if (jobStatus === "failed" || jobStatus === "cancelled") {
            throw new Error(json.job?.error ?? "Render failed");
          }
        } catch (err) {
          setErrors((e) => ({
            ...e,
            [frameId]: err instanceof Error ? err.message : "Render failed",
          }));
          setFrameStatus(frameId, "error");
          return;
        }
      }
      // Timed out here, not at the provider — the job keeps going and the
      // notification bell still reports it.
      setFrameStatus(frameId, "idle");
      toast.message("Still rendering — it'll appear in your notifications");
    },
    [onGenerated, patchFrame, setFrameStatus]
  );

  const animateFrame = useCallback(
    async (frame: StoryboardFrameRecord) => {
      if (!board || !frame.image_url) return;
      setFrameStatus(frame.id, "animating");
      setErrors((e) => ({ ...e, [frame.id]: "" }));
      try {
        const res = await fetch("/api/generate", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            mode: "t2v",
            tier: "standard",
            // The still is the first frame; the prompt is the movement. This
            // is the one place camera language belongs.
            prompt: {
              subject: [frame.prompt, frame.motion].filter(Boolean).join(" "),
            },
            aspect: frame.aspect || board.aspect,
            durationS: frame.duration_s ?? 5,
            sourceImageUrls: [frame.image_url],
            sourceGenerationId: frame.generation_id ?? undefined,
            projectId: board.project_id ?? undefined,
            brandKitId: board.brand_kit_id ?? undefined,
          }),
        });
        const json = await res.json();
        if (!res.ok) throw new Error(json.error ?? "Could not start the render");

        const jobId = json.job?.id as string | undefined;
        if (!jobId) throw new Error("No render job came back");
        patchFrame(frame.id, { video_job_id: jobId });
        void pollJob(frame.id, jobId);
      } catch (err) {
        setErrors((e) => ({
          ...e,
          [frame.id]: err instanceof Error ? err.message : "Failed",
        }));
        setFrameStatus(frame.id, "error");
      }
    },
    [board, patchFrame, pollJob, setFrameStatus]
  );

  /* ----------------------------------------------------------------- export */

  const shotListText = useMemo(() => {
    if (!board) return "";
    return [
      board.title,
      board.brief ? `\n${board.brief}` : "",
      "",
      ...frames.map((f, i) =>
        [
          `${i + 1}. ${f.title || "Untitled frame"}${f.is_blank ? " — BLACK FRAME" : ""}`,
          f.shot_size ? `   Shot: ${f.shot_size}` : "",
          `   ${stripLegacyContinuity(f.prompt)}`,
          f.motion ? `   Camera: ${f.motion}` : "",
          f.dialogue ? `   VO/Dialogue: ${f.dialogue}` : "",
          f.duration_s ? `   Duration: ${f.duration_s}s` : "",
          f.notes ? `   Notes: ${f.notes}` : "",
        ]
          .filter(Boolean)
          .join("\n")
      ),
    ].join("\n");
  }, [board, frames]);

  async function copyShotList() {
    try {
      await navigator.clipboard.writeText(shotListText);
      toast.success("Shot list copied");
    } catch {
      toast.error("Clipboard blocked — select and copy manually");
    }
  }

  /**
   * Export as a printable board sheet. Written into a new window rather than
   * printing this page: the studio is a fixed, scroll-locked layout that
   * prints as a single clipped page, and a standalone document also gives a
   * clean PDF to send to a client.
   */
  function printBoard() {
    if (!board) return;
    const win = window.open("", "_blank", "width=1024,height=768");
    if (!win) {
      toast.error("Allow pop-ups to export the board");
      return;
    }
    const esc = (s: string) =>
      s.replace(/[&<>"]/g, (c) =>
        ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;" })[c] as string
      );
    const ratio = aspectStyle(board.aspect, "16:9");

    win.document.write(`<!doctype html><html><head><meta charset="utf-8">
<title>${esc(board.title)}</title>
<style>
  * { box-sizing: border-box; }
  body { margin: 0; padding: 32px; font: 13px/1.5 ui-sans-serif, system-ui, sans-serif; color: #111; }
  h1 { font-size: 22px; margin: 0 0 4px; }
  .meta { color: #666; font-size: 12px; margin-bottom: 4px; }
  .brief { color: #333; max-width: 60ch; margin: 12px 0 24px; }
  .grid { display: grid; grid-template-columns: repeat(2, 1fr); gap: 20px; }
  .frame { break-inside: avoid; border: 1px solid #ddd; border-radius: 8px; padding: 12px; }
  .thumb { width: 100%; aspect-ratio: ${ratio}; background: #f2f2f2; border-radius: 4px; object-fit: cover; display: block; }
  .no-thumb { display: flex; align-items: center; justify-content: center; color: #aaa; font-size: 11px; }
  .black { display: flex; align-items: center; justify-content: center; background: #111; color: #777; font-size: 11px; letter-spacing: .12em; text-transform: uppercase; }
  .n { font-weight: 700; }
  .label { color: #888; font-size: 10px; letter-spacing: .12em; text-transform: uppercase; margin-top: 8px; }
  p { margin: 2px 0 0; }
  @page { margin: 14mm; }
  @media print { body { padding: 0; } }
</style></head><body>
<h1>${esc(board.title)}</h1>
<div class="meta">${esc(
      [board.client_name, board.project_name].filter(Boolean).join(" ▸ ") ||
        "Athar storyboard"
    )} · ${frames.length} frame${frames.length === 1 ? "" : "s"} · ${esc(board.aspect)}</div>
${board.brief ? `<div class="brief">${esc(board.brief)}</div>` : ""}
<div class="grid">
${frames
  .map(
    (f, i) => `<div class="frame">
  ${
    f.is_blank
      ? `<div class="thumb black">Black frame</div>`
      : f.image_url && !isVideoUrl(f.image_url)
        ? `<img class="thumb" src="${esc(f.image_url)}" alt="">`
        : `<div class="thumb no-thumb">Not rendered</div>`
  }
  <p style="margin-top:10px"><span class="n">${i + 1}.</span> ${esc(f.title || "Untitled frame")}${
    f.shot_size ? ` — ${esc(f.shot_size)}` : ""
  }${f.duration_s ? ` · ${f.duration_s}s` : ""}</p>
  <div class="label">Frame</div><p>${esc(stripLegacyContinuity(f.prompt))}</p>
  ${f.motion ? `<div class="label">Camera</div><p>${esc(f.motion)}</p>` : ""}
  ${f.dialogue ? `<div class="label">VO / Dialogue</div><p>${esc(f.dialogue)}</p>` : ""}
  ${f.notes ? `<div class="label">Notes</div><p>${esc(f.notes)}</p>` : ""}
</div>`
  )
  .join("\n")}
</div>
</body></html>`);
    win.document.close();
    // Driven from here rather than an inline <script> in the written markup:
    // a literal closing script tag inside a JS string is a footgun, and the
    // window is same-origin so calling print on it directly works. The delay
    // gives the thumbnails a chance to decode — print too early and the sheet
    // comes out with empty boxes.
    win.setTimeout(() => win.print(), 600);
  }

  /* -------------------------------------------------------------- rendering */

  if (!board) {
    return (
      <>
        <BoardList
          boards={boards}
          canGenerate={canGenerate}
          clients={clients}
          filterClientId={filterClientId}
          onFilterClientChange={setFilterClientId}
          onOpen={openBoard}
          onNew={() => setCreateOpen(true)}
        />
        <CreateDialog
          open={createOpen}
          onOpenChange={setCreateOpen}
          clients={clients}
          clientId={newClientId}
          setClientId={setNewClientId}
          title={newTitle}
          setTitle={setNewTitle}
          brief={newBrief}
          setBrief={setNewBrief}
          aspect={newAspect}
          setAspect={setNewAspect}
          shotCount={newShotCount}
          setShotCount={setNewShotCount}
          refs={newRefs}
          setRefs={setNewRefs}
          busy={creating || planning}
          onCreate={createBoard}
        />
      </>
    );
  }

  const renderable = frames.filter((f) => !f.is_blank);
  const rendered = renderable.filter((f) => f.image_url).length;
  const busy = renderingAll || planning;

  return (
    <div className="mx-auto max-w-6xl space-y-5">
      {/* Board header */}
      <div className="flex flex-wrap items-start gap-3">
        <Button
          variant="outline"
          size="sm"
          className="mt-1 gap-1.5"
          onClick={() => {
            void flushFrames();
            setBoard(null);
            void loadBoards();
          }}
        >
          <ArrowLeft className="size-3.5" />
          All boards
        </Button>

        <div className="min-w-[14rem] flex-1">
          <Input
            value={board.title}
            onChange={(e) => setBoard({ ...board, title: e.target.value })}
            onBlur={(e) => void patchBoard({ title: e.target.value })}
            className="h-9 border-0 bg-transparent px-1 text-base font-medium"
            aria-label="Storyboard title"
          />
          <p className="mt-0.5 px-1 text-[11px] text-muted-foreground">
            {board.project_name ? `${board.project_name} · ` : ""}
            {rendered}/{renderable.length} rendered
            {board.brand_kit_id ? " · brand kit applied" : ""}
          </p>
        </div>

        <div className="flex flex-wrap items-center gap-2">
          <Select
            value={board.client_id ?? NO_CLIENT}
            onValueChange={(v) => {
              const id = v === NO_CLIENT ? null : v;
              void patchBoard(
                { clientId: id },
                {
                  client_id: id,
                  client_name:
                    clients.find((c) => c.id === id)?.name ?? null,
                }
              );
            }}
          >
            <SelectTrigger className="h-8 w-auto min-w-[8rem] text-xs">
              <SelectValue placeholder="Client" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value={NO_CLIENT}>No client</SelectItem>
              {clients.map((c) => (
                <SelectItem key={c.id} value={c.id}>
                  {c.name}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
          <Select
            value={board.aspect}
            onValueChange={(v) => void patchBoard({ aspect: v })}
          >
            <SelectTrigger className="h-8 w-auto min-w-[5rem] text-xs">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              {ASPECTS.map((a) => (
                <SelectItem key={a} value={a}>
                  {a}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
          {/* Style is board-level and safe to change after planning: the frame
              text is untouched, so switching and re-rendering is cheap. */}
          <Select
            value={board.style_id || "raw"}
            onValueChange={(v) =>
              void patchBoard({ styleId: v }, { style_id: v })
            }
          >
            <SelectTrigger className="h-8 w-auto min-w-[10rem] text-xs">
              <SelectValue placeholder="Visual style" />
            </SelectTrigger>
            <SelectContent className="max-w-sm">
              {STORYBOARD_STYLES.map((st) => (
                <SelectItem key={st.id} value={st.id}>
                  <span className="block">{st.label}</span>
                  <span className="block text-[11px] text-muted-foreground">
                    {st.description}
                  </span>
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
          <Button variant="outline" size="sm" className="gap-1.5" onClick={copyShotList}>
            <Copy className="size-3.5" />
            Copy
          </Button>
          <Button variant="outline" size="sm" className="gap-1.5" onClick={printBoard}>
            <Printer className="size-3.5" />
            Export
          </Button>
          <Button
            variant="outline"
            size="sm"
            aria-label="Delete storyboard"
            onClick={() => setConfirmDelete(true)}
          >
            <Trash2 className="size-3.5" />
          </Button>
        </div>
      </div>

      {/* Brief + planner */}
      <div className="rounded-2xl bg-card p-5 ring-1 ring-border">
        <label className="text-[11px] font-medium tracking-[0.16em] text-muted-foreground uppercase">
          Brief
        </label>
        <Textarea
          value={board.brief}
          onChange={(e) => setBoard({ ...board, brief: e.target.value })}
          onBlur={(e) => void patchBoard({ brief: e.target.value })}
          placeholder="e.g. 30-sec brand film — a family arriving for Eid, warm and unhurried, landing on the product in the final frame."
          className="mt-2 min-h-20 bg-background"
        />
        <div className="mt-3 flex flex-wrap items-center gap-2">
          <Select
            value={String(planCount)}
            onValueChange={(v) => setPlanCount(Number(v))}
          >
            <SelectTrigger className="h-9 w-auto min-w-[6.5rem]">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              {[3, 4, 5, 6, 8, 10, 12].map((n) => (
                <SelectItem key={n} value={String(n)}>
                  {n} frames
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
          <div className="flex-1" />
          {frames.length > 0 && (
            <Button
              variant="outline"
              className="gap-2"
              disabled={busy || !canGenerate}
              onClick={() => void runPlan(board.id, "append", planCount)}
            >
              <Plus className="size-4" />
              Add {planCount} more
            </Button>
          )}
          <Button
            className="gap-2 bg-gold text-primary-foreground hover:bg-gold/90"
            disabled={busy || !board.brief.trim() || !canGenerate}
            onClick={() => void runPlan(board.id, "replace", planCount)}
          >
            {planning ? (
              <Loader2 className="size-4 animate-spin" />
            ) : (
              <Wand2 className="size-4" />
            )}
            {frames.length > 0 ? "Re-plan board" : "Break into frames"}
          </Button>
        </div>
        {frames.length > 0 && (
          <p className="mt-2 text-[11px] text-muted-foreground">
            Re-planning replaces every frame, including the ones already
            rendered. Use “Add more” to extend the board instead.
          </p>
        )}
      </div>

      {/* References — the thing that actually holds continuity. Every frame is
          rendered against these, and the planner is told what they are. */}
      <div className="rounded-2xl bg-card p-5 ring-1 ring-border">
        <div className="flex flex-wrap items-center gap-2">
          <label className="text-[11px] font-medium tracking-[0.16em] text-muted-foreground uppercase">
            References
          </label>
          <span className="text-[11px] text-muted-foreground">
            {(board.reference_urls ?? []).length === 0
              ? "None — every frame will invent its own subject"
              : `${board.reference_urls.length} attached to every frame`}
          </span>
          <div className="flex-1" />
          <Button
            variant="outline"
            size="sm"
            className="gap-1.5"
            onClick={() => setRefsOpen((o) => !o)}
          >
            <Paperclip className="size-3.5" />
            {refsOpen ? "Done" : "Attach references"}
          </Button>
        </div>

        {(board.reference_urls ?? []).length > 0 && (
          <div className="mt-3 flex flex-wrap gap-2">
            {board.reference_urls.map((url) => (
              <span key={url} className="group relative">
                {/* eslint-disable-next-line @next/next/no-img-element */}
                <img
                  src={url}
                  alt=""
                  className="size-16 rounded-lg object-cover ring-1 ring-border"
                />
                <button
                  type="button"
                  aria-label="Remove reference"
                  onClick={() => toggleBoardRef(url)}
                  className="absolute -top-1.5 -right-1.5 flex size-5 items-center justify-center rounded-full bg-foreground text-background opacity-0 transition group-hover:opacity-100"
                >
                  <X className="size-3" />
                </button>
              </span>
            ))}
          </div>
        )}

        {refsOpen && (
          <div className="mt-4 border-t border-border pt-4">
            <ReferenceLibrary
              mode="picker"
              clientId={board.client_id}
              selectedUrls={board.reference_urls ?? []}
              onPick={(url) => toggleBoardRef(url)}
            />
          </div>
        )}

        <p className="mt-3 text-[11px] text-muted-foreground">
          A character, a product, a look — whatever has to stay the same. The
          first rendered frame is used as an anchor on top of these.
        </p>
      </div>

      {/* Cast. Each entry is the fixed identity string reused wherever that
          character appears — and nowhere else. */}
      {(board.cast_members ?? []).length > 0 && (
        <div className="rounded-2xl bg-card p-5 ring-1 ring-border">
          <div className="flex flex-wrap items-center gap-2">
            <label className="text-[11px] font-medium tracking-[0.16em] text-muted-foreground uppercase">
              Cast
            </label>
            <span className="text-[11px] text-muted-foreground">
              Only added to the frames that name them
            </span>
            <div className="flex-1" />
            <label className="flex items-center gap-1.5 text-[11px] text-muted-foreground">
              <input
                type="checkbox"
                checked={board.look_locked}
                onChange={(e) =>
                  void patchBoard(
                    { lookLocked: e.target.checked },
                    { look_locked: e.target.checked }
                  )
                }
                className="size-3.5 accent-current"
              />
              Keep on re-plan
            </label>
          </div>

          <div className="mt-3 space-y-2">
            {(board.cast_members ?? []).map((member, i) => (
              <div
                key={member.id}
                className="rounded-xl bg-background p-2.5 ring-1 ring-border"
              >
                <div className="flex items-center gap-2">
                  <span className="rounded-md bg-secondary px-1.5 py-0.5 font-mono text-[10px] text-muted-foreground">
                    {member.id}
                  </span>
                  <Input
                    value={member.name}
                    onChange={(e) => patchCast(i, { name: e.target.value })}
                    className="h-7 flex-1 border-0 bg-transparent px-1 text-sm font-medium"
                  />
                </div>
                <Textarea
                  value={member.description}
                  onChange={(e) =>
                    patchCast(i, { description: e.target.value })
                  }
                  placeholder="Age, build, hair, distinguishing features, exact wardrobe."
                  className="mt-1.5 max-h-32 min-h-14 overflow-y-auto bg-card text-xs"
                />
              </div>
            ))}
          </div>

          <p className="mt-3 text-[11px] text-muted-foreground">
            Fix a description once here and every frame that character appears
            in picks it up — no re-plan needed. Tick “Keep on re-plan” so a new
            plan can’t re-dress them.
          </p>
        </div>
      )}

      {(board.banned_elements ?? []).length > 0 && (
        <div className="rounded-2xl bg-card p-5 ring-1 ring-border">
          <label className="text-[11px] font-medium tracking-[0.16em] text-muted-foreground uppercase">
            Never in frame
          </label>
          <div className="mt-2 flex flex-wrap gap-1.5">
            {board.banned_elements.map((b) => (
              <span
                key={b}
                className="rounded-full bg-secondary px-2.5 py-1 text-[11px] text-muted-foreground"
              >
                {b}
              </span>
            ))}
          </div>
          <p className="mt-3 text-[11px] text-muted-foreground">
            Sent as a negative prompt on every frame, alongside a standing ban
            on invented text, signage, logos and Arabic script — those are
            composited in post.
          </p>
        </div>
      )}

      {/* Frames */}
      {loadingBoard ? (
        <div className="flex justify-center py-16">
          <Loader2 className="size-5 animate-spin text-muted-foreground" />
        </div>
      ) : frames.length === 0 ? (
        <div className="rounded-2xl border border-dashed border-border py-16 text-center">
          <Film className="mx-auto size-6 text-muted-foreground" />
          <p className="mt-3 text-sm text-muted-foreground">
            No frames yet — write a brief and break it into frames, or add one
            by hand.
          </p>
          <Button variant="outline" className="mt-4 gap-1.5" onClick={addBlankFrame}>
            <Plus className="size-3.5" />
            Add a frame
          </Button>
        </div>
      ) : (
        <>
          <div className="flex flex-wrap items-center justify-between gap-2">
            <p className="text-sm font-medium">
              Frames <span className="text-muted-foreground">({frames.length})</span>
            </p>
            <div className="flex items-center gap-2">
              {rendered > 0 && rendered < renderable.length && (
                <Button
                  variant="outline"
                  className="gap-2"
                  disabled={busy || !canGenerate}
                  onClick={() => void renderAll(true)}
                >
                  <ImageIcon className="size-4" />
                  Render the {renderable.length - rendered} missing
                </Button>
              )}
              <Button
                className="gap-2 bg-gold text-primary-foreground hover:bg-gold/90"
                disabled={busy || !canGenerate}
                onClick={() => void renderAll(false)}
              >
                {renderingAll ? (
                  <Loader2 className="size-4 animate-spin" />
                ) : (
                  <Sparkles className="size-4" />
                )}
                Render all {renderable.length}
              </Button>
            </div>
          </div>

          <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-3">
            {frames.map((frame, i) => (
              <FrameCard
                key={frame.id}
                frame={frame}
                index={i}
                total={frames.length}
                boardAspect={board.aspect}
                cast={board.cast_members ?? []}
                anchorInUse={(board.reference_urls ?? []).length === 0}
                status={status[frame.id] ?? "idle"}
                error={errors[frame.id]}
                canGenerate={canGenerate}
                busy={busy}
                onChange={(patch) => patchFrame(frame.id, patch)}
                onRender={() => void renderFrame(frame, identityAnchor(frame))}
                onAnimate={() => void animateFrame(frame)}
                onMove={(delta) => void moveFrame(frame.id, delta)}
                onRemove={() => void removeFrame(frame.id)}
              />
            ))}
          </div>

          <button
            type="button"
            onClick={addBlankFrame}
            className="flex w-full items-center justify-center gap-1.5 rounded-xl border border-dashed border-border py-3 text-xs text-muted-foreground transition hover:text-foreground"
          >
            <Plus className="size-3.5" />
            Add a frame
          </button>
        </>
      )}

      <Dialog open={confirmDelete} onOpenChange={setConfirmDelete}>
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle>Delete this storyboard?</DialogTitle>
          </DialogHeader>
          <p className="text-sm text-muted-foreground">
            The board and its frames go away. Anything you already rendered
            stays in the Library.
          </p>
          <div className="mt-4 flex justify-end gap-2">
            <Button variant="outline" onClick={() => setConfirmDelete(false)}>
              Cancel
            </Button>
            <Button
              onClick={async () => {
                const res = await fetch(`/api/storyboards/${board.id}`, {
                  method: "DELETE",
                });
                if (!res.ok) {
                  toast.error("Could not delete the board");
                  return;
                }
                setConfirmDelete(false);
                setBoard(null);
                void loadBoards();
                toast.success("Storyboard deleted");
              }}
            >
              Delete
            </Button>
          </div>
        </DialogContent>
      </Dialog>
    </div>
  );
}

/* ------------------------------------------------------------------ pieces */

function BoardList({
  boards,
  canGenerate,
  clients,
  filterClientId,
  onFilterClientChange,
  onOpen,
  onNew,
}: {
  boards: StoryboardRecord[] | null;
  canGenerate: boolean;
  clients: ClientRecord[];
  filterClientId: string;
  onFilterClientChange: (id: string) => void;
  onOpen: (id: string) => void;
  onNew: () => void;
}) {
  if (boards === null) {
    return (
      <div className="flex justify-center py-20">
        <Loader2 className="size-5 animate-spin text-muted-foreground" />
      </div>
    );
  }

  const filtered = filterClientId !== "all";

  return (
    <div className="mx-auto max-w-6xl">
      <div className="mb-5 flex flex-wrap items-center gap-2">
        <p className="text-sm text-muted-foreground">
          {boards.length === 0
            ? "No storyboards yet"
            : `${boards.length} board${boards.length === 1 ? "" : "s"}`}
        </p>
        {/* An explicit filter, defaulting to everything — the board list is
            never silently narrowed by whatever client the dock has active. */}
        <Select value={filterClientId} onValueChange={onFilterClientChange}>
          <SelectTrigger className="h-8 w-auto min-w-[9rem] text-xs">
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="all">All clients</SelectItem>
            {clients.map((c) => (
              <SelectItem key={c.id} value={c.id}>
                {c.name}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
        <div className="flex-1" />
        <Button
          className="gap-2 bg-gold text-primary-foreground hover:bg-gold/90"
          disabled={!canGenerate}
          onClick={onNew}
        >
          <Plus className="size-4" />
          New storyboard
        </Button>
      </div>

      {boards.length === 0 ? (
        <div className="rounded-2xl border border-dashed border-border py-20 text-center">
          <Film className="mx-auto size-7 text-muted-foreground" />
          <p className="mt-4 text-sm font-medium">
            {filtered ? "Nothing for this client yet" : "Plan the whole piece first"}
          </p>
          <p className="mx-auto mt-1 max-w-sm text-xs text-muted-foreground">
            {filtered
              ? "Switch the filter back to all clients to see the rest."
              : "Write the brief once, break it into frames, then render the board as one continuous piece — every frame anchored to the same look."}
          </p>
        </div>
      ) : (
        <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
          {boards.map((b) => (
            <button
              key={b.id}
              type="button"
              onClick={() => onOpen(b.id)}
              className="group overflow-hidden rounded-2xl bg-card text-left ring-1 ring-border transition hover:ring-gold/40"
            >
              <div
                className="flex items-center justify-center bg-secondary"
                style={{ aspectRatio: aspectStyle(b.aspect, "16:9") }}
              >
                {b.cover_url ? (
                  // eslint-disable-next-line @next/next/no-img-element
                  <img
                    src={b.cover_url}
                    alt=""
                    className="size-full object-cover transition group-hover:scale-[1.02]"
                  />
                ) : (
                  <Film className="size-6 text-muted-foreground" />
                )}
              </div>
              <div className="p-3">
                <p className="truncate text-sm font-medium">{b.title}</p>
                <p className="mt-0.5 truncate text-[11px] text-muted-foreground">
                  {[b.client_name, b.project_name].filter(Boolean).join(" ▸ ") ||
                    "No client"}
                </p>
                <p className="mt-1 text-[11px] text-muted-foreground">
                  {b.frame_count ?? 0} frame
                  {(b.frame_count ?? 0) === 1 ? "" : "s"} ·{" "}
                  {b.rendered_count ?? 0} rendered
                </p>
              </div>
            </button>
          ))}
        </div>
      )}
    </div>
  );
}

function CreateDialog({
  open,
  onOpenChange,
  clients,
  clientId,
  setClientId,
  title,
  setTitle,
  brief,
  setBrief,
  aspect,
  setAspect,
  shotCount,
  setShotCount,
  refs,
  setRefs,
  busy,
  onCreate,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  clients: ClientRecord[];
  clientId: string | null;
  setClientId: (id: string | null) => void;
  title: string;
  setTitle: (v: string) => void;
  brief: string;
  setBrief: (v: string) => void;
  aspect: string;
  setAspect: (v: string) => void;
  shotCount: number;
  setShotCount: (v: number) => void;
  refs: string[];
  setRefs: (urls: string[]) => void;
  busy: boolean;
  onCreate: () => void;
}) {
  const [pickerOpen, setPickerOpen] = useState(false);

  const toggle = (url: string) =>
    setRefs(
      refs.includes(url) ? refs.filter((u) => u !== url) : [...refs, url]
    );

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-xl">
        <DialogHeader>
          <DialogTitle>New storyboard</DialogTitle>
        </DialogHeader>

        <div className="space-y-3">
          <div className="flex flex-wrap gap-3">
            <div className="min-w-[10rem] flex-1">
              <label className="text-[11px] font-medium tracking-[0.16em] text-muted-foreground uppercase">
                Title
              </label>
              <Input
                value={title}
                onChange={(e) => setTitle(e.target.value)}
                placeholder="Eid brand film"
                className="mt-1.5"
                autoFocus
              />
            </div>
            <div className="min-w-[9rem]">
              <label className="text-[11px] font-medium tracking-[0.16em] text-muted-foreground uppercase">
                Client
              </label>
              <Select
                value={clientId ?? NO_CLIENT}
                onValueChange={(v) => setClientId(v === NO_CLIENT ? null : v)}
              >
                <SelectTrigger className="mt-1.5 w-full">
                  <SelectValue placeholder="Client" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value={NO_CLIENT}>No client</SelectItem>
                  {clients.map((c) => (
                    <SelectItem key={c.id} value={c.id}>
                      {c.name}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
          </div>

          <div>
            <label className="text-[11px] font-medium tracking-[0.16em] text-muted-foreground uppercase">
              Brief
            </label>
            {/* Capped rather than free-growing: `field-sizing-content` makes a
                long brief push the dialog past the viewport. */}
            <Textarea
              value={brief}
              onChange={(e) => setBrief(e.target.value)}
              placeholder="What is the piece, who is in it, what happens, and how should it feel? This is what gets broken into frames."
              className="mt-1.5 max-h-64 min-h-28 overflow-y-auto"
            />
          </div>

          <div className="flex flex-wrap items-center gap-2">
            <Select value={aspect} onValueChange={setAspect}>
              <SelectTrigger className="h-9 w-auto min-w-[6rem]">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                {ASPECTS.map((a) => (
                  <SelectItem key={a} value={a}>
                    {a}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
            <Select
              value={String(shotCount)}
              onValueChange={(v) => setShotCount(Number(v))}
            >
              <SelectTrigger className="h-9 w-auto min-w-[6.5rem]">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                {[3, 4, 5, 6, 8, 10, 12].map((n) => (
                  <SelectItem key={n} value={String(n)}>
                    {n} frames
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
            <div className="flex-1" />
            <Button
              variant="outline"
              size="sm"
              className="gap-1.5"
              onClick={() => setPickerOpen((o) => !o)}
            >
              <Paperclip className="size-3.5" />
              References
              {refs.length > 0 ? ` (${refs.length})` : ""}
            </Button>
          </div>

          {refs.length > 0 && (
            <div className="flex flex-wrap gap-2">
              {refs.map((url) => (
                <span key={url} className="group relative">
                  {/* eslint-disable-next-line @next/next/no-img-element */}
                  <img
                    src={url}
                    alt=""
                    className="size-14 rounded-lg object-cover ring-1 ring-border"
                  />
                  <button
                    type="button"
                    aria-label="Remove reference"
                    onClick={() => toggle(url)}
                    className="absolute -top-1.5 -right-1.5 flex size-5 items-center justify-center rounded-full bg-foreground text-background opacity-0 transition group-hover:opacity-100"
                  >
                    <X className="size-3" />
                  </button>
                </span>
              ))}
            </div>
          )}

          {pickerOpen && (
            <div className="rounded-xl border border-border p-3">
              <ReferenceLibrary
                mode="picker"
                clientId={clientId}
                selectedUrls={refs}
                onPick={(url) => toggle(url)}
              />
            </div>
          )}
        </div>

        <div className="mt-2 flex flex-wrap items-center justify-end gap-2">
          <p className="mr-auto text-[11px] text-muted-foreground">
            The brief is what gets broken into frames.
          </p>
          <Button variant="outline" disabled={busy} onClick={() => onOpenChange(false)}>
            Cancel
          </Button>
          <Button
            className="gap-2 bg-gold text-primary-foreground hover:bg-gold/90"
            disabled={busy || !brief.trim()}
            onClick={onCreate}
          >
            {busy ? (
              <Loader2 className="size-4 animate-spin" />
            ) : (
              <Wand2 className="size-4" />
            )}
            Create &amp; plan
          </Button>
        </div>
      </DialogContent>
    </Dialog>
  );
}

function FrameCard({
  frame,
  index,
  total,
  boardAspect,
  cast,
  anchorInUse,
  status,
  error,
  canGenerate,
  busy,
  onChange,
  onRender,
  onAnimate,
  onMove,
  onRemove,
}: {
  frame: StoryboardFrameRecord;
  index: number;
  total: number;
  boardAspect: string;
  /** The board's cast, so a frame can say which of them it contains. */
  cast: StoryboardCastMember[];
  /** False when the board's own references have replaced the key frame. */
  anchorInUse: boolean;
  status: FrameStatus;
  error?: string;
  canGenerate: boolean;
  busy: boolean;
  onChange: (patch: Partial<StoryboardFrameRecord>) => void;
  onRender: () => void;
  onAnimate: () => void;
  onMove: (delta: -1 | 1) => void;
  onRemove: () => void;
}) {
  const working = status === "rendering" || status === "animating";

  return (
    <div
      className={cn(
        "flex flex-col overflow-hidden rounded-2xl bg-card ring-1 transition",
        status === "error"
          ? "ring-red-500/40"
          : frame.image_url
            ? "ring-gold/30"
            : "ring-border"
      )}
    >
      {/* Thumbnail */}
      <div
        className="relative flex items-center justify-center bg-secondary"
        style={{ aspectRatio: aspectStyle(frame.aspect, boardAspect) }}
      >
        {frame.is_blank ? (
          <span className="flex size-full items-center justify-center bg-black text-[11px] tracking-[0.2em] text-white/40 uppercase">
            Black
          </span>
        ) : frame.video_url ? (
          <video
            src={frame.video_url}
            className="size-full object-cover"
            controls
            playsInline
            preload="metadata"
          />
        ) : frame.image_url ? (
          // eslint-disable-next-line @next/next/no-img-element
          <img src={frame.image_url} alt="" className="size-full object-cover" />
        ) : (
          <span className="font-mono text-2xl text-muted-foreground">
            {index + 1}
          </span>
        )}

        {working && (
          <div className="absolute inset-0 flex flex-col items-center justify-center gap-1.5 bg-black/60 text-white">
            <Loader2 className="size-5 animate-spin" />
            <span className="text-[11px]">
              {status === "animating" ? "Animating…" : "Rendering…"}
            </span>
          </div>
        )}

        <span className="absolute left-2 top-2 rounded-md bg-black/60 px-1.5 py-0.5 font-mono text-[11px] text-white">
          {index + 1}
        </span>

        <div className="absolute right-2 top-2 flex gap-1">
          <IconBtn
            label="Move earlier"
            disabled={index === 0 || busy}
            onClick={() => onMove(-1)}
          >
            <ChevronLeft className="size-3.5" />
          </IconBtn>
          <IconBtn
            label="Move later"
            disabled={index === total - 1 || busy}
            onClick={() => onMove(1)}
          >
            <ChevronRight className="size-3.5" />
          </IconBtn>
          <IconBtn label="Delete frame" disabled={busy} onClick={onRemove}>
            <X className="size-3.5" />
          </IconBtn>
        </div>
      </div>

      {/* Fields */}
      <div className="flex min-h-0 flex-1 flex-col gap-2 p-3">
        <div className="flex items-center gap-2">
          <Input
            value={frame.title}
            onChange={(e) => onChange({ title: e.target.value })}
            placeholder="Frame title"
            className="h-7 flex-1 border-0 bg-transparent px-1 text-sm font-medium"
          />
          <Select
            value={frame.shot_size || "none"}
            onValueChange={(v) => onChange({ shot_size: v === "none" ? "" : v })}
          >
            <SelectTrigger className="h-7 w-auto min-w-[5.5rem] text-[11px]">
              <SelectValue placeholder="Shot" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="none">Any shot</SelectItem>
              {SHOT_SIZES.map((s) => (
                <SelectItem key={s} value={s}>
                  {s}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>

        <Textarea
          value={stripLegacyContinuity(frame.prompt)}
          onChange={(e) => onChange({ prompt: e.target.value })}
          placeholder="Describe the still frame — subject, setting, light."
          className="min-h-20 bg-background text-xs"
        />

        {/* Motion is stored apart from the prompt on purpose: it is the only
            thing sent when the still is animated, and putting it in the image
            prompt makes the model draw the instruction. */}
        <Textarea
          value={frame.motion}
          onChange={(e) => onChange({ motion: e.target.value })}
          placeholder="Camera move — used when this frame is animated."
          className="min-h-12 bg-background text-xs"
        />

        <Input
          value={frame.dialogue}
          onChange={(e) => onChange({ dialogue: e.target.value })}
          placeholder="VO / dialogue — optional"
          className="h-8 bg-background text-xs"
        />

        <div className="flex items-center gap-2">
          <Select
            value={String(frame.duration_s ?? 5)}
            onValueChange={(v) => onChange({ duration_s: Number(v) })}
          >
            <SelectTrigger className="h-8 w-auto min-w-[4.5rem] text-[11px]">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              {[3, 4, 5, 6, 8, 10, 12].map((n) => (
                <SelectItem key={n} value={String(n)}>
                  {n}s
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
          <Select
            value={frame.aspect || boardAspect}
            onValueChange={(v) => onChange({ aspect: v })}
          >
            <SelectTrigger className="h-8 w-auto min-w-[4.5rem] text-[11px]">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              {ASPECTS.map((a) => (
                <SelectItem key={a} value={a}>
                  {a}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>

        {error && <p className="text-[11px] text-red-400">{error}</p>}

        {/* Who is in this frame. An empty row is normal — a landscape or an
            insert has nobody in it, and adding one flattens the sequence. */}
        {!frame.is_blank && cast.length > 0 && (
          <div className="flex flex-wrap items-center gap-1.5">
            <span className="text-[10px] tracking-[0.14em] text-muted-foreground uppercase">
              In frame
            </span>
            {cast.map((member) => {
              const on = (frame.cast_ids ?? []).includes(member.id);
              return (
                <button
                  key={member.id}
                  type="button"
                  title={member.description}
                  onClick={() =>
                    onChange({
                      cast_ids: on
                        ? (frame.cast_ids ?? []).filter((c) => c !== member.id)
                        : [...(frame.cast_ids ?? []), member.id],
                    })
                  }
                  className={cn(
                    "rounded-full px-2 py-0.5 text-[11px] ring-1 transition",
                    on
                      ? "bg-gold text-primary-foreground ring-transparent"
                      : "text-muted-foreground ring-border hover:text-foreground"
                  )}
                >
                  {member.name}
                </button>
              );
            })}
            {(frame.cast_ids ?? []).length === 0 && (
              <span className="text-[11px] text-muted-foreground">
                nobody — landscape or insert
              </span>
            )}
          </div>
        )}

        {/* Consistency controls. Matching the anchor holds the subject but
            also copies its framing, so an insert or a macro wants it off. */}
        <div className="flex flex-wrap gap-x-4 gap-y-1.5 pt-0.5">
          <label className="flex items-center gap-1.5 text-[11px] text-muted-foreground">
            <input
              type="checkbox"
              checked={frame.is_blank}
              onChange={(e) => onChange({ is_blank: e.target.checked })}
              className="size-3.5 accent-current"
            />
            Black frame
          </label>
          {!frame.is_blank && (
            <label
              className="flex items-center gap-1.5 text-[11px] text-muted-foreground"
              title={
                anchorInUse
                  ? "Render this frame against the board's first frame"
                  : "Not in use — the board's own references are holding the look"
              }
            >
              <input
                type="checkbox"
                checked={frame.lock_to_anchor}
                disabled={!anchorInUse}
                onChange={(e) => onChange({ lock_to_anchor: e.target.checked })}
                className="size-3.5 accent-current disabled:opacity-40"
              />
              <span className={cn(!anchorInUse && "opacity-40")}>
                Match frame 1
              </span>
            </label>
          )}
        </div>

        {frame.is_blank ? (
          <p className="mt-auto pt-1 text-[11px] text-muted-foreground">
            Nothing is generated for this beat.
          </p>
        ) : (
          <div className="mt-auto flex flex-wrap gap-1.5 pt-1">
            <Button
              size="sm"
              variant={frame.image_url ? "outline" : "default"}
              className={cn(
                "h-8 flex-1 gap-1.5",
                !frame.image_url &&
                  "bg-gold text-primary-foreground hover:bg-gold/90"
              )}
              disabled={working || busy || !canGenerate || !frame.prompt.trim()}
              onClick={onRender}
            >
              <ImageIcon className="size-3.5" />
              {frame.image_url ? "Re-render" : "Render"}
            </Button>
            <Button
              size="sm"
              variant="outline"
              className="h-8 gap-1.5"
              title={
                frame.image_url
                  ? "Animate this still into a clip"
                  : "Render the still first"
              }
              disabled={!frame.image_url || working || busy || !canGenerate}
              onClick={onAnimate}
            >
              <Clapperboard className="size-3.5" />
              Animate
            </Button>
          </div>
        )}
      </div>
    </div>
  );
}

function IconBtn({
  label,
  disabled,
  onClick,
  children,
}: {
  label: string;
  disabled?: boolean;
  onClick: () => void;
  children: React.ReactNode;
}) {
  return (
    <button
      type="button"
      aria-label={label}
      title={label}
      disabled={disabled}
      onClick={onClick}
      className="rounded-md bg-black/55 p-1 text-white transition hover:bg-black/75 disabled:opacity-30"
    >
      {children}
    </button>
  );
}
