import { NextResponse } from "next/server";
import { requireCreator } from "@/lib/authz";
import { getAsset } from "@/lib/byteplus-assets";
import { getAssetRegistration } from "@/lib/asset-registrations";

type Params = { params: Promise<{ id: string }> };

const UUID_RE =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

export const maxDuration = 30;

/** Status of one verified-face upload, including whether BytePlus has activated it. */
export async function GET(_req: Request, { params }: Params) {
  const auth = await requireCreator();
  if (auth.response) return auth.response;

  const { id } = await params;
  if (!UUID_RE.test(id)) {
    return NextResponse.json({ error: "Invalid registration id" }, { status: 400 });
  }

  const row = await getAssetRegistration(id);
  if (!row) {
    return NextResponse.json({ error: "Registration not found" }, { status: 404 });
  }

  let assetStatus: string | null = null;
  if (row.byteplus_id) {
    try {
      const asset = await getAsset(row.byteplus_id, { timeoutMs: 8_000 });
      assetStatus = asset.Status ?? null;
    } catch (err) {
      console.error("Could not read BytePlus asset status", row.byteplus_id, err);
    }
  }

  return NextResponse.json({
    id: row.id,
    status: row.status,
    byteplusId: row.byteplus_id,
    assetStatus,
    error: row.error,
    name: row.name,
  });
}
