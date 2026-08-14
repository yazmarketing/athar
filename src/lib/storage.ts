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
