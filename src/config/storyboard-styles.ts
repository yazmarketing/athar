/**
 * Athar — Storyboard visual styles.
 *
 * Separate from `config/styles.ts` (which is about the look of a single
 * generation) because a storyboard picks a *finish level* for the whole deck,
 * and the right level depends on how settled the work is. Photoreal frames
 * generated before the shot list is approved are the single biggest source of
 * wasted spend — you end up re-rendering because the story changed, not the
 * picture. So the cheap tiers come first and are the honest default for early
 * rounds.
 *
 * The style is a board-level setting and can be changed after planning: the
 * frame text is untouched, so switching style and re-rendering is cheap.
 */

export type StoryboardStyle = {
  id: string;
  label: string;
  /** One line shown under the label in the picker. */
  description: string;
  /** When this finish is the right call. */
  useWhen: string;
  /** Appended to every frame's positive prompt. Empty = nothing added. */
  positive: string;
  /** Appended to every frame's negative prompt. */
  negative?: string;
};

export const STORYBOARD_STYLES: StoryboardStyle[] = [
  {
    id: "raw",
    label: "Raw as prompted",
    description: "Nothing added. The frame text alone decides the look.",
    useWhen: "You have written the look into the frames yourself.",
    positive: "",
  },
  {
    id: "painterly_minimal",
    label: "Minimal painterly concept",
    description:
      "Loose gouache-style illustration — soft edges, lots of air, tiny figures.",
    useWhen: "Mood and staging matter more than detail. Reads as designed, not generated.",
    positive:
      "minimal gouache-style concept illustration, loose visible brushwork, soft undefined edges, "
      + "large areas of negative space, simplified flat shapes, tiny simplified figures, "
      + "atmospheric rather than character-focused, muted harmonious palette, hand-painted "
      + "animation background feel, poetic visual development art",
    negative:
      "photorealistic, photograph, 3d render, sharp fine detail, busy composition, "
      + "heavy texture, harsh contrast, glossy",
  },
  {
    id: "thumbnail",
    label: "Thumbnail / rough",
    description: "Loose blocking shapes and staging. Internal only.",
    useWhen: "Locking beats and pacing fast, before any real time goes into art.",
    positive:
      "rough storyboard thumbnail sketch, loose graphite blocking, simple shapes, "
      + "flat staging, minimal detail, quick gestural lines, monochrome",
    negative: "photorealistic, photograph, colour, fine detail, rendered lighting",
  },
  {
    id: "line_grayscale",
    label: "Clean line / grayscale",
    description: "Clear silhouettes and accurate proportions, no colour.",
    useWhen:
      "Internal review and early client alignment, where content will still change.",
    positive:
      "clean black and white storyboard panel, confident line art, clear silhouettes, "
      + "accurate proportions, simple grayscale shading for depth, no colour",
    negative: "colour, photorealistic, photograph, film grain, heavy texture",
  },
  {
    id: "illustrated",
    label: "Full-colour illustrated",
    description: "Flat or lightly rendered colour. Mood-accurate, not photoreal.",
    useWhen: "Standard client decks and brand pitches — sells the idea and the mood.",
    positive:
      "full colour storyboard illustration, clean shapes, lightly rendered colour, "
      + "clear readable staging, consistent palette, mood-accurate lighting",
    negative: "photorealistic, photograph, film grain",
  },
  {
    id: "photoreal",
    label: "Photoreal",
    description: "Near-final image quality — lighting, texture and detail resolved.",
    useWhen:
      "Hero pitches and tenders, once the shot list is locked. The most expensive tier.",
    positive:
      "photorealistic cinematic film still, natural light, resolved texture and detail, "
      + "sharp focus, subtle film grain, colour graded",
  },
];

export const DEFAULT_STORYBOARD_STYLE = "raw";

export function resolveStoryboardStyle(id?: string | null): StoryboardStyle {
  return (
    STORYBOARD_STYLES.find((s) => s.id === id) ??
    STORYBOARD_STYLES.find((s) => s.id === DEFAULT_STORYBOARD_STYLE)!
  );
}
