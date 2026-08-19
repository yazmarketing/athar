import { NextRequest, NextResponse } from "next/server";
import { requireCreator } from "@/lib/authz";
import {
  getPanel,
  getStoryboard,
  setStoryboardStatus,
  updatePanel,
} from "@/lib/storyboards";
import { buildPanelPrompt } from "@/lib/storyboard-prompt";
import { checkContinuity, renderStoryboardImage } from "@/lib/storyboard-render";
import type { StoryboardEntityRecord } from "@/lib/types";

export const maxDuration = 300;

const UUID_RE =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

/**
 * Below this a panel is re-rendered with the failure fed back; a panel that
 * still can't clear it is flagged rather than quietly shipped.
 */
const CONTINUITY_PASS = 0.7;
const MAX_ATTEMPTS = 2;

type Params = { params: Promise<{ id: string; panelId: string }> };

/** Edit a panel's grammar or content without re-rendering it. */
export async function PATCH(req: NextRequest, { params }: Params) {
  const auth = await requireCreator();
  if (auth.response) return auth.response;
  const { panelId } = await params;
  if (!UUID_RE.test(panelId)) {
    return NextResponse.json({ error: "Invalid id" }, { status: 400 });
  }
  const body = (await req.json().catch(() => ({}))) as Record<string, unknown>;
  const patch: Parameters<typeof updatePanel>[1] = {};
  if (typeof body.shotSize === "string") patch.shotSize = body.shotSize;
  if (typeof body.angle === "string") patch.angle = body.angle;
  if (typeof body.lens === "string") patch.lens = body.lens;
  if (typeof body.screenDirection === "string")
    patch.screenDirection = body.screenDirection;
  if (typeof body.action === "string") patch.action = body.action;
  if (typeof body.dialogue === "string") patch.dialogue = body.dialogue;
  if (typeof body.motion === "string") patch.motion = body.motion;
  if (Array.isArray(body.entitySlugs)) {
    patch.entitySlugs = body.entitySlugs.map(String);
  }
  const panel = await updatePanel(panelId, patch);
  if (!panel) {
    return NextResponse.json({ error: "Nothing to update" }, { status: 400 });
  }
  return NextResponse.json({ panel });
}

/**
 * Render one panel.
 *
 * The panel carries only the sheets for the entities actually in it, which is
 * what lets a board hold several characters and locations at once instead of
 * chaining everything to a single key frame. The result is then checked
 * against those same sheets, and a miss is re-rendered with the reason
 * attached.
 */
export async function POST(_req: NextRequest, { params }: Params) {
  const auth = await requireCreator();
  if (auth.response) return auth.response;
  const sessionUser = auth.user!;

  const { id, panelId } = await params;
  if (!UUID_RE.test(id) || !UUID_RE.test(panelId)) {
    return NextResponse.json({ error: "Invalid id" }, { status: 400 });
  }

  const full = await getStoryboard(id);
  if (!full) {
    return NextResponse.json({ error: "Board not found" }, { status: 404 });
  }
  const panel = await getPanel(panelId);
  if (!panel || panel.storyboard_id !== id) {
    return NextResponse.json({ error: "Panel not found" }, { status: 404 });
  }

  // Only approved sheets are worth matching against — an unapproved one is
  // still a proposal, and anchoring panels to it bakes in a mistake.
  const bible = new Map<string, StoryboardEntityRecord>(
    full.entities.map((e) => [e.slug, e])
  );
  const inPanel = panel.entity_slugs
    .map((slug) => bible.get(slug))
    .filter((e): e is StoryboardEntityRecord => Boolean(e));
  const approved = inPanel.filter(
    (e) => e.approved_at && e.reference_url
  );
  const referenceUrls = approved
    .map((e) => e.reference_url!)
    .filter(Boolean)
    // Nano Banana Pro fuses up to 14; a panel never needs that many, and a
    // long tail of sheets dilutes the ones that matter.
    .slice(0, 8);

  if (approved.length === 0 && inPanel.length > 0) {
    return NextResponse.json(
      {
        error:
          "Approve the reference sheets for this panel first — panels are matched against them",
      },
      { status: 409 }
    );
  }

  await updatePanel(panelId, { status: "rendering", error: null });

  const expectation = [
    panel.action,
    approved.map((e) => `${e.name} (${e.kind})`).join(", "),
  ]
    .filter(Boolean)
    .join(" · ");

  let correction: string | undefined;
  let lastError = "Render failed";

  for (let attempt = 1; attempt <= MAX_ATTEMPTS; attempt += 1) {
    const prompt = buildPanelPrompt({
      panel,
      entities: inPanel,
      register: full.board.register,
      look: full.board.look,
      correction,
    });

    try {
      const rendered = await renderStoryboardImage({
        prompt,
        referenceUrls,
        aspect: full.board.aspect,
        seed: null,
        payload: {
          storyboard_id: id,
          panel_id: panelId,
          panel_number: panel.number,
          shot_size: panel.shot_size,
          attempt,
        },
        userId: sessionUser.id,
        projectId: full.board.project_id,
        brandKitId: full.board.brand_kit_id,
      });

      const verdict = await checkContinuity({
        panelUrl: rendered.outputUrl,
        referenceUrls,
        expectation,
      });

      const passed = !verdict || verdict.score >= CONTINUITY_PASS;
      const isLast = attempt >= MAX_ATTEMPTS;

      if (passed || isLast) {
        const updated = await updatePanel(panelId, {
          status: passed ? "ready" : "flagged",
          prompt,
          imageUrl: rendered.outputUrl,
          generationId: rendered.generationId,
          continuityScore: verdict?.score ?? null,
          continuityNotes: verdict?.notes || null,
          attempts: attempt,
          error: null,
        });

        const remaining = full.panels.filter(
          (p) => p.id !== panelId && p.status !== "ready" && p.status !== "flagged"
        ).length;
        if (remaining === 0) await setStoryboardStatus(id, "ready");
        else await setStoryboardStatus(id, "panels");

        return NextResponse.json({ panel: updated });
      }

      // Missed — say what missed, and draw it again.
      correction = verdict?.notes || "Match the reference sheets exactly.";
    } catch (err) {
      lastError = err instanceof Error ? err.message : "Render failed";
      if (attempt >= MAX_ATTEMPTS) break;
    }
  }

  const failed = await updatePanel(panelId, {
    status: "failed",
    error: lastError,
    attempts: MAX_ATTEMPTS,
  });
  return NextResponse.json({ panel: failed, error: lastError }, { status: 502 });
}
