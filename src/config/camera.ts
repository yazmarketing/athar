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
