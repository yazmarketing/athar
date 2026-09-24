import { NextResponse, after } from "next/server";
import { getSessionUser } from "@/lib/auth-session";
import { loadAssetPreview, persistAssetPreview } from "@/lib/asset-preview";

type Params = { params: Promise<{ id: string }> };
const ASSET_ID_RE = /^asset-[a-z0-9-]+$/i;
export const maxDuration = 60;

/** Serve a durable preview, falling back to bounded provider requests on first use. */
export async function GET(_req: Request, { params }: Params) {
  const sessionUser = await getSessionUser();
  if (!sessionUser?.id) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  const { id } = await params;
  if (!ASSET_ID_RE.test(id)) return NextResponse.json({ error: "Invalid asset id" }, { status: 400 });
  try {
    const preview = await loadAssetPreview(id);
    if (preview.needsPersist) {
      after(() => persistAssetPreview(id, preview).catch((err) => {
        console.error("Could not cache asset preview", id, err);
      }));
    }
    return new NextResponse(preview.bytes, {
      headers: {
        "Content-Type": preview.contentType,
        "Cache-Control": "private, max-age=86400",
        "X-Content-Type-Options": "nosniff",
      },
    });
  } catch (err) {
    console.error("Could not load asset preview", id, err);
    // A short-lived fallback keeps the library usable during provider outages.
    // It is deliberately not cached, so a later visit can recover the real photo.
    return new NextResponse('<svg xmlns="http://www.w3.org/2000/svg" width="160" height="160" viewBox="0 0 160 160"><rect width="160" height="160" fill="#242424"/><circle cx="80" cy="56" r="22" fill="#737373"/><path d="M35 130a45 45 0 0 1 90 0" fill="#737373"/><title>Preview temporarily unavailable</title></svg>', {
      headers: { "Content-Type": "image/svg+xml", "Cache-Control": "private, no-store", "X-Content-Type-Options": "nosniff" },
    });
  }
}
