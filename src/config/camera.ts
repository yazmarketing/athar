/**
 * Athar — Camera-move presets (Layer 6, video).
 *
 * Seedance responds well to explicit cinematography language, so each preset is
 * a tuned motion fragment appended to the video prompt — the same idea as
 * Higgsfield's camera presets ("Crash Zoom", "Orbit"), but as curated text the
 * model reliably reads. "Raw" adds nothing — the prompt (or the model) decides
 * the camera.
 */

export type CameraPreset = {
  id: string;
  label: string;
  description: string;
  /** Motion fragment appended to the prompt. Empty = no camera direction. */
  fragment: string;
};

export type CameraSetupPreset = {
  id: string;
  label: string;
  description: string;
  fragment: string;
  preview?: string;
};

const AUTO_SETUP: CameraSetupPreset = {
  id: "raw",
  label: "Auto",
  description: "Let the shot decide.",
  fragment: "",
};

export const CAMERA_BODY_PRESETS: CameraSetupPreset[] = [
  AUTO_SETUP,
  { id: "digital_cinema", label: "Digital cinema", description: "Clean, controlled, premium.", fragment: "captured on a modern digital cinema camera, clean highlight roll-off, premium commercial image", preview: "/cinema/camera/digital-cinema.webp" },
  { id: "dv_camcorder", label: "DV camcorder", description: "Early-digital texture and immediacy.", fragment: "early-2000s DV camcorder image, direct handheld video texture, clipped highlights and authentic digital character", preview: "/cinema/camera/dv-camcorder.webp" },
  { id: "super8", label: "8mm film", description: "Tactile, nostalgic film texture.", fragment: "captured on Super 8 film, tactile grain, gentle gate weave, nostalgic home-movie character", preview: "/cinema/camera/super8.webp" },
];

export const LENS_PRESETS: CameraSetupPreset[] = [
  AUTO_SETUP,
  { id: "clean_prime", label: "Clean prime", description: "Neutral geometry and crisp detail.", fragment: "clean modern cinema prime lens, natural perspective, controlled flare and crisp detail", preview: "/cinema/camera/clean-prime.webp" },
  { id: "vintage_anamorphic", label: "Vintage anamorphic", description: "Oval bokeh and horizontal flare.", fragment: "vintage anamorphic lens character, oval bokeh, gentle horizontal flare, softened edges", preview: "/cinema/camera/vintage-anamorphic.webp" },
  { id: "macro", label: "Macro", description: "Close focus and tactile detail.", fragment: "macro cinema lens, very close focus, tactile material detail, compressed shallow depth", preview: "/cinema/camera/macro.webp" },
];

export const APERTURE_PRESETS: CameraSetupPreset[] = [
  AUTO_SETUP,
  { id: "wide_open", label: "f/1.4 wide open", description: "Very shallow focus, soft falloff.", fragment: "shot wide open at f/1.4, very shallow depth of field, soft rapid focus falloff", preview: "/cinema/camera/aperture-wide.webp" },
  { id: "balanced", label: "f/2.8 balanced", description: "Subject separation with context.", fragment: "shot at f/2.8, balanced depth of field, clear subject separation with readable context", preview: "/cinema/camera/aperture-balanced.webp" },
  { id: "deep_focus", label: "f/8 deep focus", description: "More of the scene stays sharp.", fragment: "shot at f/8, deep focus, foreground and background remain clearly resolved", preview: "/cinema/camera/aperture-deep.webp" },
];

export const CAMERA_PRESETS: CameraPreset[] = [
  {
    id: "raw",
    label: "Raw (as prompted)",
    description:
      "No camera direction added — whatever the prompt says, or the model's own choice.",
    fragment: "",
  },
  {
    id: "locked",
    label: "Locked off",
    description: "A deliberately static, tripod-locked frame.",
    fragment:
      "static locked-off tripod shot, fixed frame, no camera movement whatsoever",
  },
  {
    id: "push_in",
    label: "Slow push-in",
    description: "Gentle dolly toward the subject. Intimate, building.",
    fragment:
      "slow cinematic dolly push-in toward the subject, smooth steady motion, subtle parallax",
  },
  {
    id: "pull_out",
    label: "Pull-out reveal",
    description: "Dolly back to reveal the scene. Establishing.",
    fragment:
      "slow dolly pull-out revealing the wider scene, smooth steady camera, gradual reveal",
  },
  {
    id: "crash_zoom",
    label: "Crash zoom",
    description: "Fast snap zoom in. Punchy, high-energy.",
    fragment:
      "fast crash zoom into the subject, sudden punchy snap zoom, high energy",
  },
  {
    id: "orbit",
    label: "Orbit",
    description: "Camera arcs around the subject. Hero, product.",
    fragment:
      "smooth 180-degree orbit arcing around the subject, steady circular tracking, cinematic",
  },
  {
    id: "tracking",
    label: "Tracking shot",
    description: "Camera follows the subject's movement.",
    fragment:
      "smooth lateral tracking shot following the subject, steadicam motion, matched pace",
  },
  {
    id: "crane_up",
    label: "Crane up",
    description: "Camera rises for scale. Epic, establishing.",
    fragment:
      "cinematic crane shot rising upward, revealing scale, smooth vertical boom move",
  },
  {
    id: "handheld",
    label: "Handheld",
    description: "Subtle organic shake. Documentary, raw.",
    fragment:
      "handheld camera with subtle organic shake, documentary feel, natural micro-movement",
  },
  {
    id: "aerial",
    label: "Aerial / drone",
    description: "High sweeping overhead move.",
    fragment:
      "sweeping aerial drone shot from high above, smooth gliding overhead motion, expansive",
  },
  {
    id: "fpv",
    label: "FPV fly-through",
    description: "Fast first-person flight through the scene.",
    fragment:
      "fast FPV drone fly-through, dynamic first-person flight weaving through the scene, immersive",
  },
];

/**
 * Raw by default — the same rule as the style presets. A camera move is a
 * creative decision to opt into, not something the studio should impose on
 * every prompt. "Locked off" now genuinely pins the camera, so it can no
 * longer double as the neutral choice.
 */
export const DEFAULT_CAMERA_ID = "raw";

export function resolveCamera(id?: string | null): CameraPreset {
  return (
    CAMERA_PRESETS.find((c) => c.id === id) ??
    CAMERA_PRESETS.find((c) => c.id === DEFAULT_CAMERA_ID)!
  );
}

function resolveSetup(presets: CameraSetupPreset[], id?: string | null) {
  return presets.find((preset) => preset.id === id) ?? presets[0];
}

export function cameraSetupFragments(inputs: { cameraBodyId?: string | null; lensId?: string | null; apertureId?: string | null }) {
  return [
    resolveSetup(CAMERA_BODY_PRESETS, inputs.cameraBodyId),
    resolveSetup(LENS_PRESETS, inputs.lensId),
    resolveSetup(APERTURE_PRESETS, inputs.apertureId),
  ].map((preset) => preset.fragment).filter(Boolean);
}
