import "server-only";

import { createHash, createHmac } from "crypto";

/**
 * BytePlus ModelArk Assets API client (private virtual portrait library).
 *
 * Registered assets (asset://<id>) are the only way to use real or
 * AI-generated faces in Seedance video generation — raw photo URLs are
 * blocked by the anti-deepfake filter.
 *
 * Unlike the generation API (Bearer ARK_API_KEY), the Assets API is a
 * BytePlus OpenAPI: HMAC-SHA256 request signing with an AK/SK pair.
 * Docs: https://docs.byteplus.com/en/docs/ModelArk/2333565
 */

const ASSETS_HOST = "open.byteplusapi.com";
const ASSETS_SERVICE = "ark";
const ASSETS_VERSION = "2024-01-01";

function assetsRegion() {
  return process.env.BYTEPLUS_ASSETS_REGION ?? "ap-southeast-1";
}

export function assetsConfigured(): boolean {
  return Boolean(
    process.env.BYTEPLUS_ACCESS_KEY && process.env.BYTEPLUS_SECRET_KEY
  );
}

function requireKeys() {
  const ak = process.env.BYTEPLUS_ACCESS_KEY;
  const sk = process.env.BYTEPLUS_SECRET_KEY;
  if (!ak || !sk) {
    throw new Error(
      "Missing BYTEPLUS_ACCESS_KEY / BYTEPLUS_SECRET_KEY env vars (Assets API access keys from the BytePlus console → API keys → Access key)"
    );
  }
  return { ak, sk };
}

function hmac(key: Buffer | string, data: string): Buffer {
  return createHmac("sha256", key).update(data, "utf8").digest();
}

function sha256Hex(data: string): string {
  return createHash("sha256").update(data, "utf8").digest("hex");
}

/** Sign and call a BytePlus OpenAPI action (SigV4-style HMAC-SHA256). */
async function assetsCall<T>(
  action: string,
  body: Record<string, unknown>,
  opts?: { timeoutMs?: number }
): Promise<T> {
  const { ak, sk } = requireKeys();
  const region = assetsRegion();

  const payload = JSON.stringify(body);
  const payloadHash = sha256Hex(payload);

  const now = new Date();
  const xDate = now.toISOString().replace(/[-:]/g, "").replace(/\.\d{3}/, "");
  const shortDate = xDate.slice(0, 8);

  const query = `Action=${encodeURIComponent(action)}&Version=${encodeURIComponent(ASSETS_VERSION)}`;
  const contentType = "application/json; charset=utf-8";

  const canonicalHeaders =
    `content-type:${contentType}\n` +
    `host:${ASSETS_HOST}\n` +
    `x-content-sha256:${payloadHash}\n` +
    `x-date:${xDate}\n`;
  const signedHeaders = "content-type;host;x-content-sha256;x-date";

  const canonicalRequest = [
    "POST",
    "/",
    query,
    canonicalHeaders,
    signedHeaders,
    payloadHash,
  ].join("\n");

  const credentialScope = `${shortDate}/${region}/${ASSETS_SERVICE}/request`;
  const stringToSign = [
    "HMAC-SHA256",
    xDate,
    credentialScope,
    sha256Hex(canonicalRequest),
  ].join("\n");

  const kDate = hmac(sk, shortDate);
  const kRegion = hmac(kDate, region);
  const kService = hmac(kRegion, ASSETS_SERVICE);
  const kSigning = hmac(kService, "request");
  const signature = hmac(kSigning, stringToSign).toString("hex");

  /**
   * CreateAsset fetches and moderates the image before it answers, which
   * can be slow for a large photo. Background registration uses a longer
   * cap; inline calls stay under the platform gateway (~60s).
   */
  const timeoutMs = opts?.timeoutMs ?? 45_000;
  let res: Response;
  try {
    res = await fetch(`https://${ASSETS_HOST}/?${query}`, {
      method: "POST",
      headers: {
        "Content-Type": contentType,
        Host: ASSETS_HOST,
        "X-Date": xDate,
        "X-Content-Sha256": payloadHash,
        Authorization: `HMAC-SHA256 Credential=${ak}/${credentialScope}, SignedHeaders=${signedHeaders}, Signature=${signature}`,
      },
      body: payload,
      signal: AbortSignal.timeout(timeoutMs),
    });
  } catch (err) {
    if (err instanceof Error && err.name === "TimeoutError") {
      throw new Error(
        "BytePlus is taking too long to process this image. It may still finish — check the asset list in a minute, or retry with a smaller photo."
      );
    }
    throw err;
  }

  const responseText = await res.text();
  let json: {
    ResponseMetadata?: { Error?: { Code?: string; Message?: string } };
    Result?: T;
  } & Record<string, unknown>;
  try {
    json = JSON.parse(responseText) as typeof json;
  } catch {
    throw new Error(
      `BytePlus Assets API returned ${res.status} instead of JSON. Please retry in a moment.`
    );
  }

  const apiError = json.ResponseMetadata?.Error;
  if (!res.ok || apiError) {
    throw new Error(
      apiError?.Message ??
        `BytePlus Assets API error (${action}, HTTP ${res.status})`
    );
  }

  // Universal API responses put data under Result; fall back to the root.
  return (json.Result ?? json) as T;
}

// ---------------------------------------------------------------------------
// Actions
// ---------------------------------------------------------------------------

export type AssetGroupRecord = {
  Id: string;
  Name?: string;
  Description?: string;
  GroupType?: string;
  CreateTime?: string;
};

export type AssetRecord = {
  Id: string;
  GroupId?: string;
  Name?: string;
  AssetType?: string;
  Status?: "Active" | "Processing" | "Failed" | string;
  URL?: string;
  CreateTime?: string;
};

export const ASSET_LIBRARY_LIMIT = 50;

/**
 * The provider returns newest-first in normal operation. Prefer the earliest
 * valid creation time; if old records have no timestamp, rotate the final
 * verified item in the returned list. Processing assets are never removed.
 */
export function oldestVerifiedAsset(
  items: AssetRecord[]
): AssetRecord | null {
  const active = items.filter((item) => item.Status === "Active");
  if (!active.length) return null;
  const dated = active
    .map((item) => ({ item, time: Date.parse(item.CreateTime ?? "") }))
    .filter((entry) => Number.isFinite(entry.time))
    .sort((a, b) => a.time - b.time);
  return dated[0]?.item ?? active[active.length - 1] ?? null;
}

const assetCache = globalThis as typeof globalThis & {
  atharBytePlusAssets?: AssetRecord[];
};

export function cachedAssets(): AssetRecord[] {
  return assetCache.atharBytePlusAssets ?? [];
}

export async function createAssetGroup(
  name: string,
  description?: string
): Promise<AssetGroupRecord> {
  return assetsCall<AssetGroupRecord>("CreateAssetGroup", {
    Name: name,
    Description: description ?? "Created by Athar studio",
    GroupType: "AIGC",
  });
}

export async function listAssetGroups(): Promise<AssetGroupRecord[]> {
  const result = await assetsCall<{ Items?: AssetGroupRecord[] }>(
    "ListAssetGroups",
    {
      Filter: { GroupType: "AIGC" },
      PageNumber: 1,
      PageSize: 100,
    }
  );
  return result.Items ?? [];
}

export async function createAsset(opts: {
  groupId: string;
  url: string;
  name?: string;
}): Promise<AssetRecord> {
  const asset = await assetsCall<AssetRecord>(
    "CreateAsset",
    {
      GroupId: opts.groupId,
      URL: opts.url,
      AssetType: "Image",
      Name: opts.name,
    },
    { timeoutMs: 120_000 }
  );
  rememberAssetImageUrl(asset);
  return asset;
}

export async function getAsset(id: string): Promise<AssetRecord> {
  const asset = await assetsCall<AssetRecord>(
    "GetAsset",
    { Id: id },
    { timeoutMs: 12_000 }
  );
  rememberAssetImageUrl(asset);
  return asset;
}

const imageUrlById = new Map<string, string>();

function rememberAssetImageUrl(asset: Pick<AssetRecord, "Id" | "URL">) {
  if (asset.Id && asset.URL) imageUrlById.set(asset.Id, asset.URL);
}

/** BytePlus copies the photo onto TOS; only those hosts are fetched for thumbs. */
export function isBytePlusMediaUrl(raw: string): boolean {
  try {
    const u = new URL(raw);
    if (u.protocol !== "https:") return false;
    const host = u.hostname.toLowerCase();
    return (
      host.endsWith(".volces.com") ||
      host.endsWith(".byteplusapi.com") ||
      host.endsWith(".byteimg.com") ||
      host.endsWith(".volcengineapi.com")
    );
  } catch {
    return false;
  }
}

export async function resolveAssetImageUrl(
  id: string
): Promise<string | null> {
  const cached = imageUrlById.get(id);
  if (cached) return cached;
  const asset = await getAsset(id);
  return asset.URL ?? null;
}

export async function listAssets(
  groupId?: string,
  opts?: { timeoutMs?: number }
): Promise<AssetRecord[]> {
  const result = await assetsCall<{ Items?: AssetRecord[] }>("ListAssets", {
    Filter: {
      ...(groupId ? { GroupIds: [groupId] } : {}),
      GroupType: "AIGC",
    },
    PageNumber: 1,
    PageSize: 100,
  }, opts);
  const items = result.Items ?? [];
  for (const item of items) rememberAssetImageUrl(item);
  assetCache.atharBytePlusAssets = items;
  return items;
}

export async function deleteAsset(id: string): Promise<void> {
  await assetsCall<Record<string, never>>("DeleteAsset", { Id: id });
  imageUrlById.delete(id);
  if (assetCache.atharBytePlusAssets) {
    assetCache.atharBytePlusAssets = assetCache.atharBytePlusAssets.filter(
      (item) => item.Id !== id
    );
  }
}

/**
 * Resolve the asset group the studio uploads into: the first existing group
 * (e.g. one created in the console), else a new "yaz-motion" group.
 * Note: the very first group must be created in the console (authorization
 * letter signature required by BytePlus).
 */
let cachedGroupId: string | null = null;

export async function ensureDefaultAssetGroup(): Promise<string> {
  if (cachedGroupId) return cachedGroupId;
  const groups = await listAssetGroups();
  if (groups.length > 0) {
    cachedGroupId = groups[0].Id;
    return cachedGroupId;
  }
  const created = await createAssetGroup("yaz-motion");
  cachedGroupId = created.Id;
  return cachedGroupId;
}
