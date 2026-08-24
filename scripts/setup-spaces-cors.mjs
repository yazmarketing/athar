/**
 * One-time Space setup: allow the browser to PUT uploads directly.
 *
 * Presigned uploads (references, lip-sync audio, transcripts) PUT straight
 * from the browser to the Space; without a CORS rule the browser blocks
 * them and every upload falls back to the 8MB app-server path — or fails
 * outright for larger files.
 *
 * Run: node --env-file=.env.local scripts/setup-spaces-cors.mjs
 * Safe to re-run — it overwrites the bucket's CORS config with this one.
 */
import {
  S3Client,
  PutBucketCorsCommand,
  GetBucketCorsCommand,
} from "@aws-sdk/client-s3";

const ALLOWED_ORIGINS = [
  "https://athar.yazmedia.com",
  "http://localhost:3000",
];

function env(name) {
  const value = process.env[name];
  if (!value) throw new Error(`Missing ${name} env var`);
  return value;
}

const region = env("DO_SPACES_REGION");
const bucket = env("DO_SPACES_BUCKET");

const client = new S3Client({
  region,
  endpoint: `https://${region}.digitaloceanspaces.com`,
  credentials: {
    accessKeyId: env("DO_SPACES_KEY"),
    secretAccessKey: env("DO_SPACES_SECRET"),
  },
});

await client.send(
  new PutBucketCorsCommand({
    Bucket: bucket,
    CORSConfiguration: {
      CORSRules: [
        {
          AllowedOrigins: ALLOWED_ORIGINS,
          AllowedMethods: ["PUT", "GET", "HEAD"],
          // Presigned PUTs send Content-Type and x-amz-acl; '*' keeps this
          // from breaking if the client adds a header later.
          AllowedHeaders: ["*"],
          MaxAgeSeconds: 3600,
        },
      ],
    },
  })
);

const current = await client.send(new GetBucketCorsCommand({ Bucket: bucket }));
console.log(`CORS set on ${bucket} (${region}):`);
console.log(JSON.stringify(current.CORSRules, null, 2));
