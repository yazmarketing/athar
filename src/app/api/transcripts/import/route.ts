import { spawn, spawnSync } from "node:child_process";
import path from "node:path";
import { Readable } from "node:stream";
import { NextRequest, NextResponse } from "next/server";
import { Innertube } from "youtubei.js";
import { requireCreator } from "@/lib/authz";

/**
 * Import-from-link for Transcribe: the server fetches a public media URL
 * (direct link, Dropbox, or Google Drive share) and streams it back to the
 * browser, which then runs the normal extract-audio-and-transcribe flow.
 *
 * Streaming matters — the file never sits in this instance's memory, so a
 * large video cannot take the app down the way a buffered upload would.
 */
export const maxDuration = 300;

const MAX_BYTES = 500 * 1024 * 1024; // 500 MB

/** Turn share-page links into direct-download links where we know how. */
function normalizeLink(raw: string): URL {
  const url = new URL(raw);
  if (url.protocol !== "http:" && url.protocol !== "https:") {
    throw new Error("Only http(s) links can be imported");
  }

  // Dropbox share links serve an HTML page unless dl=1.
  if (url.hostname === "dropbox.com" || url.hostname.endsWith(".dropbox.com")) {
    url.searchParams.set("dl", "1");
    return url;
  }

  // Google Drive: /file/d/<id>/view or open?id=<id> → the download endpoint.
  if (url.hostname === "drive.google.com") {
    const id =
      url.pathname.match(/\/file\/d\/([^/]+)/)?.[1] ?? url.searchParams.get("id");
    if (id) {
      return new URL(
        `https://drive.google.com/uc?export=download&id=${encodeURIComponent(id)}`
      );
    }
  }

  return url;
}

function isYouTube(url: URL): boolean {
  const host = url.hostname.replace(/^(www|m|music)\./, "");
  return host === "youtube.com" || host === "youtu.be";
}

/** The 11-character video id, from any of the link shapes YouTube uses. */
function youTubeVideoId(url: URL): string | null {
  const id =
    url.hostname.replace(/^www\./, "") === "youtu.be"
      ? url.pathname.slice(1).split("/")[0]
      : (url.searchParams.get("v") ??
        url.pathname.match(/\/(shorts|live|embed)\/([^/?]+)/)?.[2]);
  return id && /^[A-Za-z0-9_-]{11}$/.test(id) ? id : null;
}

/** One Innertube session for the process — creating it costs a round-trip. */
let innertube: Promise<Innertube> | null = null;

/**
 * YouTube pages hide the media behind a player, so a plain fetch gets HTML.
 * youtubei.js unwraps the real stream — audio-only, since transcription
 * needs nothing else and it is a fraction of the download. Clients break
 * independently as YouTube changes things (as of writing, IOS works and
 * WEB does not), so each one gets a try.
 *
 * Best effort by nature: YouTube fights automated downloads, so this can
 * stop working until the library updates, especially from datacenter IPs.
 */
async function importYouTube(url: URL): Promise<Response> {
  const id = youTubeVideoId(url);
  if (!id) {
    return NextResponse.json(
      { error: "That does not look like a YouTube video link" },
      { status: 400 }
    );
  }

  innertube ??= Innertube.create();
  const yt = await innertube;

  let title = "youtube-audio";
  try {
    const info = await yt.getBasicInfo(id);
    title =
      info.basic_info.title?.replace(/[\\/:*?"<>|]/g, "").trim() || title;
  } catch {
    /* the download attempt below gives the real error */
  }

  let stream: ReadableStream<Uint8Array> | null = null;
  let lastError = "";
  for (const client of ["IOS", "ANDROID", "TV", "WEB"] as const) {
    try {
      stream = await yt.download(id, { type: "audio", quality: "best", client });
      break;
    } catch (err) {
      lastError = err instanceof Error ? err.message : String(err);
    }
  }
  if (!stream) {
    return NextResponse.json(
      {
        error:
          "YouTube would not hand over that video. It may be private, " +
          "age-restricted, or YouTube is blocking automated access right now." +
          (lastError ? ` (${lastError.slice(0, 120)})` : ""),
      },
      { status: 502 }
    );
  }

  let relayed = 0;
  const counted = stream.pipeThrough(
    new TransformStream<Uint8Array, Uint8Array>({
      transform(chunk, controller) {
        relayed += chunk.byteLength;
        if (relayed > MAX_BYTES) {
          controller.error(new Error("Import passed the 500MB limit"));
        } else {
          controller.enqueue(chunk);
        }
      },
    })
  );

  return new Response(counted, {
    headers: {
      "content-type": "audio/mp4",
      "x-filename": encodeURIComponent(`${title}.m4a`),
      "cache-control": "no-store",
    },
  });
}

/** Platforms handled by yt-dlp rather than a plain fetch. */
const SOCIAL_HOSTS =
  /(^|\.)(facebook\.com|fb\.watch|instagram\.com|twitter\.com|x\.com|tiktok\.com|vimeo\.com)$/;

function isSocial(url: URL): boolean {
  return SOCIAL_HOSTS.test(url.hostname.toLowerCase());
}

/**
 * yt-dlp ships as a Python program, and the OS default can be too old for it
 * (macOS still points python3 at 3.9). Find the newest one that qualifies.
 */
let pythonBin: string | null | undefined;
function findPython(): string | null {
  if (pythonBin !== undefined) return pythonBin;
  for (const candidate of ["python3.13", "python3.12", "python3.11", "python3.10", "python3"]) {
    const probe = spawnSync(candidate, ["--version"], { encoding: "utf8" });
    const minor = probe.stdout?.match(/^Python 3\.(\d+)/)?.[1];
    if (minor && Number(minor) >= 10) {
      pythonBin = candidate;
      return candidate;
    }
  }
  pythonBin = null;
  return null;
}

const YT_DLP = path.join(
  process.cwd(),
  "node_modules",
  "youtube-dl-exec",
  "bin",
  "yt-dlp"
);

/** Run yt-dlp once and collect its output — used for the metadata check. */
function runYtDlp(
  python: string,
  args: string[]
): Promise<{ code: number; stdout: string; stderr: string }> {
  return new Promise((resolve, reject) => {
    const child = spawn(python, [YT_DLP, ...args], { timeout: 90_000 });
    let stdout = "";
    let stderr = "";
    child.stdout.on("data", (d) => (stdout += d));
    child.stderr.on("data", (d) => (stderr += d));
    child.on("error", reject);
    child.on("close", (code) => resolve({ code: code ?? 1, stdout, stderr }));
  });
}

/**
 * Facebook / Instagram / X / TikTok / Vimeo via yt-dlp — audio only, same as
 * YouTube. Support genuinely varies by platform and moves under our feet:
 * some demand a login for content that looks public (Vimeo does as of
 * writing), so the honest thing is to surface yt-dlp's reason when it fails.
 */
async function importSocial(url: URL): Promise<Response> {
  const python = findPython();
  if (!python) {
    return NextResponse.json(
      { error: "Social imports need Python 3.10+ on the server, which is missing" },
      { status: 501 }
    );
  }

  // Metadata first: it fails fast with the real reason (private, login-only,
  // removed) before any bytes move.
  const meta = await runYtDlp(python, [
    "--no-playlist",
    "--skip-download",
    "--print",
    "title",
    url.href,
  ]);
  if (meta.code !== 0) {
    const reason = meta.stderr.match(/ERROR:\s*(?:\[[^\]]*\]\s*)?(.+)/)?.[1] ?? "";
    const needsLogin = /login|logged-in|cookies|private|authentication/i.test(reason);
    return NextResponse.json(
      {
        error: needsLogin
          ? "That platform will not hand this file to us without a login, so it cannot be imported. Download it yourself and upload the file instead."
          : `Could not import from that link${reason ? `: ${reason.slice(0, 160)}` : ""}`,
      },
      { status: 502 }
    );
  }
  const title =
    meta.stdout.trim().split("\n")[0]?.replace(/[\\/:*?"<>|]/g, "").trim() ||
    "imported-media";

  const child = spawn(python, [
    YT_DLP,
    "--no-playlist",
    "-f",
    "bestaudio/best",
    "-o",
    "-",
    "--quiet",
    "--no-warnings",
    url.href,
  ]);

  let relayed = 0;
  const counted = (
    Readable.toWeb(child.stdout) as ReadableStream<Uint8Array>
  ).pipeThrough(
    new TransformStream<Uint8Array, Uint8Array>({
      transform(chunk, controller) {
        relayed += chunk.byteLength;
        if (relayed > MAX_BYTES) {
          child.kill();
          controller.error(new Error("Import passed the 500MB limit"));
        } else {
          controller.enqueue(chunk);
        }
      },
    })
  );

  return new Response(counted, {
    headers: {
      "content-type": "audio/mp4",
      "x-filename": encodeURIComponent(`${title}.m4a`),
      "cache-control": "no-store",
    },
  });
}

/** The server must not be talked into fetching itself or the private network. */
function isPrivateHost(hostname: string): boolean {
  const host = hostname.toLowerCase();
  if (host === "localhost" || host.endsWith(".local") || host.endsWith(".internal")) {
    return true;
  }
  if (host.startsWith("[")) return true; // IPv6 literals — not worth allowing
  const ipv4 = host.match(/^(\d{1,3})\.(\d{1,3})\.(\d{1,3})\.(\d{1,3})$/);
  if (!ipv4) return false;
  const [a, b] = [Number(ipv4[1]), Number(ipv4[2])];
  return (
    a === 0 ||
    a === 10 ||
    a === 127 ||
    (a === 172 && b >= 16 && b <= 31) ||
    (a === 192 && b === 168) ||
    (a === 169 && b === 254)
  );
}

/** A readable filename for the imported file, best-effort. */
function filenameFor(upstream: Response, url: URL): string {
  const disposition = upstream.headers.get("content-disposition") ?? "";
  const fromHeader =
    disposition.match(/filename\*=UTF-8''([^;]+)/i)?.[1] ??
    disposition.match(/filename="?([^";]+)"?/i)?.[1];
  if (fromHeader) {
    try {
      return decodeURIComponent(fromHeader);
    } catch {
      return fromHeader;
    }
  }
  const last = url.pathname.split("/").filter(Boolean).pop();
  return last ? decodeURIComponent(last) : "imported-media";
}

export async function POST(req: NextRequest) {
  try {
    const auth = await requireCreator();
    if (auth.response) return auth.response;

    const { url: raw } = (await req.json().catch(() => ({}))) as {
      url?: string;
    };
    if (!raw || typeof raw !== "string") {
      return NextResponse.json({ error: "url is required" }, { status: 400 });
    }

    let target: URL;
    try {
      target = normalizeLink(raw.trim());
    } catch (err) {
      return NextResponse.json(
        { error: err instanceof Error ? err.message : "That is not a valid link" },
        { status: 400 }
      );
    }
    if (isPrivateHost(target.hostname)) {
      return NextResponse.json(
        { error: "That address cannot be imported" },
        { status: 400 }
      );
    }

    if (isYouTube(target)) {
      return await importYouTube(target);
    }
    if (isSocial(target)) {
      return await importSocial(target);
    }

    const upstream = await fetch(target, { redirect: "follow" }).catch(() => null);
    if (!upstream || !upstream.ok || !upstream.body) {
      return NextResponse.json(
        {
          error:
            "Could not fetch that link. Make sure it is public — a login-only " +
            "or expired link cannot be imported.",
        },
        { status: 502 }
      );
    }

    const contentType =
      upstream.headers.get("content-type") ?? "application/octet-stream";
    // An HTML answer means a webpage came back, not a file — a Drive
    // permission page, a YouTube watch page, or a share page we cannot unwrap.
    if (/text\/html|application\/xhtml/i.test(contentType)) {
      return NextResponse.json(
        {
          error:
            "That link opens a webpage, not a media file. Use a link from " +
            "YouTube, TikTok, Instagram, Facebook, X, or Vimeo, a public " +
            "Dropbox / Google Drive share link, or a direct link to the file.",
        },
        { status: 415 }
      );
    }

    const declared = Number(upstream.headers.get("content-length")) || 0;
    if (declared > MAX_BYTES) {
      return NextResponse.json(
        { error: "That file is over the 500MB import limit" },
        { status: 413 }
      );
    }

    // Count as we relay so an unlabelled oversized download still stops.
    let relayed = 0;
    const counted = upstream.body.pipeThrough(
      new TransformStream<Uint8Array, Uint8Array>({
        transform(chunk, controller) {
          relayed += chunk.byteLength;
          if (relayed > MAX_BYTES) {
            controller.error(new Error("Import passed the 500MB limit"));
          } else {
            controller.enqueue(chunk);
          }
        },
      })
    );

    const headers = new Headers({
      "content-type": contentType,
      "x-filename": encodeURIComponent(filenameFor(upstream, target)),
      "cache-control": "no-store",
    });
    if (declared > 0) headers.set("content-length", String(declared));

    return new Response(counted, { headers });
  } catch (err) {
    const message = err instanceof Error ? err.message : "Import failed";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
