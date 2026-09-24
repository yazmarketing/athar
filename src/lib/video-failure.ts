/** Shared by the retry endpoint and UI; keep the original error for support. */
export function videoFailure(error?: string | null) {
  if (!error || !/input video\b/i.test(error) || !/\breal[ -]person\b/i.test(error)) return null;
  return {
    title: "Video reference needs changing",
    message: "Seedance flagged a person in the attached video. Replace the clip with an eligible reference before rendering again. Your prompt and settings are saved.",
  };
}

export const VIDEO_REFERENCE_NOTICE = "When you generate, this clip is registered with BytePlus. The edit uses that asset id, not the raw file.";
