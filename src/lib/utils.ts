import { clsx, type ClassValue } from "clsx"
import { twMerge } from "tailwind-merge"

export function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs))
}

/**
 * Read a fetch response that is supposed to be JSON.
 *
 * When a request dies at the gateway rather than in our route handler, the
 * body is an HTML error page. Calling `res.json()` on that throws
 * "Unexpected token '<'", which tells nobody anything. This reports the
 * status the browser actually got, and what it usually means.
 */
type JsonBody = { error?: string; [key: string]: unknown };

export async function readJson<T = JsonBody>(res: Response): Promise<T> {
  const text = await res.text();
  try {
    return JSON.parse(text) as T;
  } catch {
    throw new Error(gatewayMessage(res.status, text));
  }
}

function gatewayMessage(status: number, body: string): string {
  const snippet = body
    .replace(/<[^>]*>/g, " ")
    .replace(/\s+/g, " ")
    .trim()
    .slice(0, 120);
  switch (status) {
    case 408:
    case 504:
      return `The render ran longer than the gateway allows (${status}). Try one image at a time, or a lower resolution.`;
    case 502:
      return "The server dropped the request mid-render (502). It may still have completed — check the Library before retrying.";
    case 413:
      return "The response was too large for the gateway (413).";
    case 429:
      return "Rate limited by the provider (429). Wait a moment and try again.";
    default:
      return `Server returned ${status} instead of JSON${
        snippet ? ` — ${snippet}` : ""
      }`;
  }
}

/**
 * POST JSON and read a JSON reply, with failures that name themselves.
 *
 * A render that outruns the gateway doesn't answer with an error — the
 * connection is cut, and `fetch` rejects with a bare "Failed to fetch". That
 * says nothing about what happened or whether the work was wasted, so it is
 * translated here.
 */
export async function postJson<T = JsonBody>(
  url: string,
  body: unknown
): Promise<{ res: Response; json: T }> {
  const res = await postFetch(url, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
  });
  return { res, json: await readJson<T>(res) };
}

/** `fetch`, with a dropped connection reported as what it is. */
export async function postFetch(
  url: string,
  init: RequestInit
): Promise<Response> {
  try {
    return await fetch(url, init);
  } catch {
    throw new Error(
      "The connection dropped before the render finished. It may still have " +
        "completed — check the Library before running it again."
    );
  }
}
