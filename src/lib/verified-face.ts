/** How long Create video waits for BytePlus to mark a dropped photo ready. */
export const VERIFIED_FACE_TIMEOUT_MS = 180_000;
export const VERIFIED_FACE_POLL_MS = 4_000;

export const VERIFIED_FACE_STILL_CHECKING =
  "BytePlus is still verifying this photo. It will show in the asset library when it is ready.";

export type VerifiedFaceSnapshot = {
  status?: string | null;
  byteplusId?: string | null;
  assetStatus?: string | null;
  error?: string | null;
};

export type VerifiedFaceDecision =
  | { status: "processing" }
  | { status: "ready"; assetId: string }
  | { status: "failed"; error: string }
  | { status: "cancelled" };

/** A photo is usable in video only after BytePlus returns an active asset id. */
export function interpretVerifiedFace(
  body: VerifiedFaceSnapshot
): Exclude<VerifiedFaceDecision, { status: "cancelled" }> {
  const assetStatus = body.assetStatus?.toLowerCase() ?? "";
  const assetId = body.byteplusId?.trim() ?? "";
  if (body.status === "failed" || assetStatus === "failed") {
    return {
      status: "failed",
      error: body.error?.trim() || "BytePlus could not verify this photo",
    };
  }
  if (
    body.status === "completed" &&
    assetId.startsWith("asset-") &&
    assetStatus === "active"
  ) {
    return { status: "ready", assetId };
  }
  return { status: "processing" };
}

function sleep(ms: number, signal?: AbortSignal) {
  if (signal?.aborted) {
    return Promise.reject(new DOMException("Aborted", "AbortError"));
  }
  return new Promise<void>((resolve, reject) => {
    const timer = setTimeout(() => {
      signal?.removeEventListener("abort", onAbort);
      resolve();
    }, ms);
    const onAbort = () => {
      clearTimeout(timer);
      reject(new DOMException("Aborted", "AbortError"));
    };
    signal?.addEventListener("abort", onAbort, { once: true });
  });
}

/**
 * Poll one registration until BytePlus marks it active, it fails, or the wait
 * runs out. Cancellation is silent so a newer upload can take over.
 */
export async function pollVerifiedFace(
  id: string,
  opts?: {
    fetchImpl?: typeof fetch;
    signal?: AbortSignal;
    timeoutMs?: number;
    pollMs?: number;
  }
): Promise<VerifiedFaceDecision> {
  const fetchImpl = opts?.fetchImpl ?? fetch;
  const timeoutMs = opts?.timeoutMs ?? VERIFIED_FACE_TIMEOUT_MS;
  const pollMs = opts?.pollMs ?? VERIFIED_FACE_POLL_MS;
  const started = Date.now();
  for (;;) {
    if (opts?.signal?.aborted) return { status: "cancelled" };
    let decision: VerifiedFaceDecision;
    try {
      const res = await fetchImpl(`/api/assets/registrations/${id}`, {
        signal: opts?.signal,
      });
      const json = (await res.json()) as VerifiedFaceSnapshot & {
        error?: string;
      };
      if (!res.ok) {
        return {
          status: "failed",
          error: json.error?.trim() || "Could not check photo verification",
        };
      }
      decision = interpretVerifiedFace(json);
    } catch (err) {
      if (err instanceof DOMException && err.name === "AbortError") {
        return { status: "cancelled" };
      }
      return {
        status: "failed",
        error: "Could not check photo verification. Try the photo again.",
      };
    }
    if (decision.status !== "processing") return decision;
    if (Date.now() - started >= timeoutMs) {
      return { status: "failed", error: VERIFIED_FACE_STILL_CHECKING };
    }
    try {
      await sleep(pollMs, opts?.signal);
    } catch (err) {
      if (err instanceof DOMException && err.name === "AbortError") {
        return { status: "cancelled" };
      }
      throw err;
    }
  }
}
