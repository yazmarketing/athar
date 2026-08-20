import "server-only";
import { S3Client, PutObjectCommand } from "@aws-sdk/client-s3";

/**
 * DigitalOcean Spaces (S3-compatible) client. Server-only.
 *
 * Required env: DO_SPACES_REGION, DO_SPACES_BUCKET, DO_SPACES_KEY,
 * DO_SPACES_SECRET. Optional: DO_SPACES_CDN_URL (Spaces CDN endpoint).
 */

let client: S3Client | null = null;

function env(name: string): string {
  const value = process.env[name];
  if (!value) throw new Error(`Missing ${name} env var`);
  return value;
}

function spaces(): S3Client {
  if (!client) {
    const region = env("DO_SPACES_REGION");
    client = new S3Client({
      region,
      endpoint: `https://${region}.digitaloceanspaces.com`,
      credentials: {
        accessKeyId: env("DO_SPACES_KEY"),
        secretAccessKey: env("DO_SPACES_SECRET"),
      },
    });
  }
  return client;
}

/** Uploads a publicly readable object and returns its public URL. */
export async function uploadPublicObject(
  path: string,
  body: ArrayBuffer,
  contentType: string
): Promise<string> {
  const bucket = env("DO_SPACES_BUCKET");
  await spaces().send(
    new PutObjectCommand({
      Bucket: bucket,
      Key: path,
      Body: new Uint8Array(body),
      ContentType: contentType,
      ACL: "public-read",
    })
  );
  const cdn = process.env.DO_SPACES_CDN_URL;
  const base =
    cdn?.replace(/\/$/, "") ??
    `https://${bucket}.${env("DO_SPACES_REGION")}.digitaloceanspaces.com`;
  return `${base}/${path}`;
}

/** Public URL an object at `path` will have once uploaded. */
export function publicObjectUrl(path: string): string {
  const bucket = env("DO_SPACES_BUCKET");
  const cdn = process.env.DO_SPACES_CDN_URL;
  const base =
    cdn?.replace(/\/$/, "") ??
    `https://${bucket}.${env("DO_SPACES_REGION")}.digitaloceanspaces.com`;
  return `${base}/${path}`;
}

/**
 * Presigned PUT so the browser uploads media straight to the Space.
 *
 * Media files are the one thing here that can be gigabytes — an hour of
 * ProRes, a two-hour interview — and routing those through the app server
 * would buffer the whole file in memory to no purpose. The browser PUTs to
 * storage and only the resulting URL comes back to us.
 *
 * Requires CORS on the Space allowing PUT from the app origin (see
 * the README); `/api/transcripts/upload` is the fallback when it isn't set.
 */
export async function presignUpload(opts: {
  path: string;
  contentType: string;
  expiresIn?: number;
}): Promise<{ uploadUrl: string; publicUrl: string }> {
  const { getSignedUrl } = await import("@aws-sdk/s3-request-presigner");
  const command = new PutObjectCommand({
    Bucket: env("DO_SPACES_BUCKET"),
    Key: opts.path,
    ContentType: opts.contentType,
    ACL: "public-read",
  });
  const uploadUrl = await getSignedUrl(spaces(), command, {
    expiresIn: opts.expiresIn ?? 900,
  });
  return { uploadUrl, publicUrl: publicObjectUrl(opts.path) };
}
