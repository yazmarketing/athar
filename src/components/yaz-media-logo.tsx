import { cn } from "@/lib/utils";

/**
 * YAZ Media endorsement lockup (Arabic يازميديا over "YAZ MEDIA").
 *
 * The brand asset is pure black on transparent, so we ship a single PNG and
 * invert it for dark surfaces (→ white) while leaving it black under `.light`.
 * This mirrors the AtharLogo theme-swap without needing a second asset.
 */
const SRC = "/logos/yaz-media-lockup-black.png";
const ASPECT = 3125 / 1875; // native artwork ratio

type Props = {
  height?: number;
  className?: string;
  alt?: string;
};

export function YazMediaLogo({
  height = 40,
  className,
  alt = "YAZ Media",
}: Props) {
  const width = height * ASPECT;
  return (
    <img
      src={SRC}
      alt={alt}
      width={width}
      height={height}
      style={{ width, height }}
      decoding="async"
      className={cn(
        "block max-w-none select-none invert [.light_&]:invert-0",
        className
      )}
    />
  );
}
