import { NextRequest, NextResponse, after } from "next/server";
import { requireCreator } from "@/lib/authz";
import { getSessionUser } from "@/lib/auth-session";
import { db } from "@/lib/db";
import { logAudit } from "@/lib/audit";
import {
  assetsConfigured,
  cachedAssets,
  deleteAsset,
  ensureDefaultAssetGroup,
  listAssets,
} from "@/lib/byteplus-assets";
import {
  claimDueRegistrations,
  completeRegistrationsMatching,
  deleteAssetRegistration,
  listOpenAssetRegistrations,
  processAssetRegistration,
  queueAssetRegistration,
  registrationAsLibraryAsset,
} from "@/lib/asset-registrations";
import type { GenerationRecord } from "@/lib/types";

export const maxDuration = 300;

const UUID_RE =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

/**
 * Category lives in the BytePlus asset Name as a trailing "[tag]" — the
 * Assets API has no category concept of its own, and a suffix keeps the
 * single source of truth there instead of in a side table.
 */
const CATEGORY_TAG_RE = /\s*\[(character|location|prop)\]\s*$/i;
const ASSET_CATEGORIES = new Set(["character", "location", "prop"]);

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
    let items;
    let warning: string | null = null;
    try {
      // Keep this comfortably below the platform gateway. Newly submitted
      // faces live in our registration table, so a slow provider must not
      // make them disappear from the library.
      items = await listAssets(undefined, { timeoutMs: 12_000 });
    } catch (err) {
      items = cachedAssets();
      warning = err instanceof Error ? err.message : "BytePlus is temporarily unavailable";
    }
    const assets = items.map((a) => {
      const rawName = a.Name ?? "";
      const tag = CATEGORY_TAG_RE.exec(rawName);
      return {
        id: a.Id,
        name: rawName.replace(CATEGORY_TAG_RE, ""),
        category: tag ? tag[1].toLowerCase() : null,
        status: a.Status ?? "Processing",
        // TOS signed URLs 403 in the browser (Referer / hotlink). Serve
        // them same-origin so the library actually shows the face.
        url: a.URL ? `/api/assets/${encodeURIComponent(a.Id)}/image` : null,
        groupId: a.GroupId ?? null,
        createdAt: a.CreateTime ?? null,
      };
    });
    if (!warning) {
      await completeRegistrationsMatching(new Set(assets.map((a) => a.name)));
    }
    const due = await claimDueRegistrations();
    for (const row of due) {
      after(() => processAssetRegistration(row));
    }
    const pending = (await listOpenAssetRegistrations()).map(
      registrationAsLibraryAsset
    );
    return NextResponse.json({ assets: [...pending, ...assets], warning });
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

  let body: {
    generationId?: string;
    imageUrl?: string;
    name?: string;
    category?: string;
  };
  try {
    body = (await req.json()) as typeof body;
  } catch {
    return NextResponse.json({ error: "Invalid JSON body" }, { status: 400 });
  }

  let imageUrl = body.imageUrl?.trim() || null;
  let name = body.name?.trim() || undefined;
  const category = body.category?.trim().toLowerCase();

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
    // Fast, and worth doing before answering: a missing asset group is a
    // configuration error the person should see immediately.
    const groupId = await ensureDefaultAssetGroup();

    /**
     * CreateAsset makes BytePlus fetch and moderate the photo before it
     * answers, which routinely outlives the platform gateway (~60s) and
     * surfaced in the browser as a bare 504. Persist the upload first so a
     * refresh still shows the face, then register after the response.
     */
    const url = imageUrl;
    // Strip any tag someone typed by hand, then append the chosen one.
    const taggedName =
      category && ASSET_CATEGORIES.has(category)
        ? `${(name ?? "Asset").replace(CATEGORY_TAG_RE, "")} [${category}]`
        : name;
    const displayName = (name ?? "Asset").replace(CATEGORY_TAG_RE, "").trim() || "Asset";
    const row = await queueAssetRegistration({
      imageUrl: url,
      name: displayName,
      category: category && ASSET_CATEGORIES.has(category) ? category : null,
      taggedName: taggedName ?? displayName,
      groupId,
      createdBy: sessionUser.id ?? null,
    });
    after(() =>
      processAssetRegistration(row, {
        userId: sessionUser.id,
        userEmail: sessionUser.email ?? null,
      })
    );

    return NextResponse.json(
      {
        queued: true,
        groupId,
        asset: registrationAsLibraryAsset(row),
      },
      { status: 202 }
    );
  } catch (err) {
    const message =
      err instanceof Error ? err.message : "Asset upload failed";
    return NextResponse.json({ error: message }, { status: 502 });
  }
}

/** Remove a registered portrait so it no longer counts against BytePlus quota. */
export async function DELETE(req: NextRequest) {
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

  let body: { id?: string };
  try {
    body = (await req.json()) as typeof body;
  } catch {
    return NextResponse.json({ error: "Invalid JSON body" }, { status: 400 });
  }

  const id = body.id?.trim();
  if (!id) {
    return NextResponse.json({ error: "Provide an asset id" }, { status: 400 });
  }

  try {
    if (UUID_RE.test(id)) {
      const removed = await deleteAssetRegistration(id);
      if (!removed) {
        return NextResponse.json({ error: "Asset not found" }, { status: 404 });
      }
      await logAudit({
        userId: sessionUser.id,
        userEmail: sessionUser.email,
        action: "asset_delete",
        subjectType: "asset",
        subjectId: id,
        meta: { pending: true },
      });
      return NextResponse.json({ ok: true });
    }
    await deleteAsset(id);
    await logAudit({
      userId: sessionUser.id,
      userEmail: sessionUser.email,
      action: "asset_delete",
      subjectType: "asset",
      subjectId: id,
    });
    return NextResponse.json({ ok: true });
  } catch (err) {
    const message =
      err instanceof Error ? err.message : "Could not delete asset";
    return NextResponse.json({ error: message }, { status: 502 });
  }
}
