import { NextRequest, NextResponse } from "next/server";
import { requireCreator } from "@/lib/authz";
import { getSessionUser } from "@/lib/auth-session";
import { db } from "@/lib/db";
import { logAudit } from "@/lib/audit";
import {
  assetsConfigured,
  createAsset,
  ensureDefaultAssetGroup,
  listAssets,
} from "@/lib/byteplus-assets";
import type { GenerationRecord } from "@/lib/types";

const UUID_RE =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

/** List the BytePlus private portrait library (for the video dock picker). */
export async function GET() {
  const sessionUser = await getSessionUser();
  if (!sessionUser) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }
  if (!assetsConfigured()) {
    return NextResponse.json(
      {
        error:
          "Assets API not configured — set BYTEPLUS_ACCESS_KEY and BYTEPLUS_SECRET_KEY",
        assets: [],
      },
      { status: 200 }
    );
  }
  try {
    const items = await listAssets();
    const assets = items.map((a) => ({
      id: a.Id,
      name: a.Name ?? "",
      status: a.Status ?? "Processing",
      url: a.URL ?? null,
      groupId: a.GroupId ?? null,
      createdAt: a.CreateTime ?? null,
    }));
    return NextResponse.json({ assets });
  } catch (err) {
    const message =
      err instanceof Error ? err.message : "Could not list assets";
    return NextResponse.json({ error: message }, { status: 502 });
  }
}

/**
 * Register an image as a trusted asset in the BytePlus portrait library.
 * Accepts a library generation (generationId) or a direct image URL.
 */
export async function POST(req: NextRequest) {
  const auth = await requireCreator();
  if (auth.response) return auth.response;
  const sessionUser = auth.user;

  if (!assetsConfigured()) {
    return NextResponse.json(
      {
        error:
          "Assets API not configured — set BYTEPLUS_ACCESS_KEY and BYTEPLUS_SECRET_KEY",
      },
      { status: 400 }
    );
  }

  let body: { generationId?: string; imageUrl?: string; name?: string };
  try {
    body = (await req.json()) as typeof body;
  } catch {
    return NextResponse.json({ error: "Invalid JSON body" }, { status: 400 });
  }

  let imageUrl = body.imageUrl?.trim() || null;
  let name = body.name?.trim() || undefined;

  if (!imageUrl && body.generationId) {
    if (!UUID_RE.test(body.generationId)) {
      return NextResponse.json(
        { error: "Invalid generationId" },
        { status: 400 }
      );
    }
    const { rows } = await db().query(
      `select * from generations where id = $1`,
      [body.generationId]
    );
    const source = rows[0] as GenerationRecord | undefined;
    if (!source?.output_url) {
      return NextResponse.json(
        { error: "Generation not found" },
        { status: 404 }
      );
    }
    imageUrl = source.output_url;
    name = name ?? source.final_prompt.slice(0, 60);
  }

  if (!imageUrl) {
    return NextResponse.json(
      { error: "Provide generationId or imageUrl" },
      { status: 400 }
    );
  }

  try {
    const groupId = await ensureDefaultAssetGroup();
    const asset = await createAsset({ groupId, url: imageUrl, name });

    await logAudit({
      userId: sessionUser.id,
      userEmail: sessionUser.email,
      action: "asset_create",
      subjectType: "asset",
      subjectId: asset.Id,
      meta: { group_id: groupId, source_generation_id: body.generationId },
    });

    return NextResponse.json({
      asset: {
        id: asset.Id,
        status: asset.Status ?? "Processing",
        groupId,
      },
    });
  } catch (err) {
    const message =
      err instanceof Error ? err.message : "Asset upload failed";
    return NextResponse.json({ error: message }, { status: 502 });
  }
}
