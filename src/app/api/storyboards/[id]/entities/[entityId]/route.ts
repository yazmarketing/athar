import { NextRequest, NextResponse } from "next/server";
import { requireCreator } from "@/lib/authz";
import {
  getEntity,
  getStoryboard,
  updateEntity,
} from "@/lib/storyboards";
import { buildEntityPrompt } from "@/lib/storyboard-prompt";
import { renderStoryboardImage } from "@/lib/storyboard-render";

export const maxDuration = 300;

const UUID_RE =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

type Params = { params: Promise<{ id: string; entityId: string }> };

/** Edit a bible entry, or approve it. */
export async function PATCH(req: NextRequest, { params }: Params) {
  const auth = await requireCreator();
  if (auth.response) return auth.response;
  const { entityId } = await params;
  if (!UUID_RE.test(entityId)) {
    return NextResponse.json({ error: "Invalid id" }, { status: 400 });
  }
  const body = (await req.json().catch(() => ({}))) as {
    name?: string;
    description?: string;
    wardrobe?: string;
    approved?: boolean;
  };
  const entity = await updateEntity(entityId, body);
  if (!entity) {
    return NextResponse.json({ error: "Nothing to update" }, { status: 400 });
  }
  return NextResponse.json({ entity });
}

/**
 * Render this entity's reference sheet.
 *
 * The sheet is the thing every panel containing this character is matched
 * against, so it is deliberately plain — one figure, flat light, no staging.
 * Approving it is a human step: nobody should draw forty panels of the wrong
 * face.
 */
export async function POST(_req: NextRequest, { params }: Params) {
  const auth = await requireCreator();
  if (auth.response) return auth.response;
  const sessionUser = auth.user!;

  const { id, entityId } = await params;
  if (!UUID_RE.test(id) || !UUID_RE.test(entityId)) {
    return NextResponse.json({ error: "Invalid id" }, { status: 400 });
  }

  const full = await getStoryboard(id);
  if (!full) {
    return NextResponse.json({ error: "Board not found" }, { status: 404 });
  }
  const entity = await getEntity(entityId);
  if (!entity || entity.storyboard_id !== id) {
    return NextResponse.json({ error: "Entity not found" }, { status: 404 });
  }

  const prompt = buildEntityPrompt({
    entity,
    register: full.board.register,
    look: full.board.look,
  });

  try {
    const rendered = await renderStoryboardImage({
      prompt,
      referenceUrls: [],
      // Sheets are square: a reference is about the subject, not a frame.
      aspect: "1:1",
      seed: entity.seed != null ? Number(entity.seed) : null,
      payload: {
        storyboard_id: id,
        entity_id: entityId,
        entity_slug: entity.slug,
        kind: "reference_sheet",
      },
      userId: sessionUser.id,
      projectId: full.board.project_id,
      brandKitId: full.board.brand_kit_id,
    });

    // A re-rendered sheet is a new proposal, so approval starts over.
    const updated = await updateEntity(entityId, {
      referenceUrl: rendered.outputUrl,
      approved: false,
    });
    return NextResponse.json({ entity: updated });
  } catch (err) {
    const message = err instanceof Error ? err.message : "Render failed";
    return NextResponse.json({ error: message }, { status: 502 });
  }
}
