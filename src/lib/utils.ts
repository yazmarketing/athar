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
