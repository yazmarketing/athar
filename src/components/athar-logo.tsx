import { cn } from "@/lib/utils";

const LOCKUPS = {
  horizontal: {
    dark: "/logos/athar-lockup-horizontal-white.png",
    light: "/logos/athar-lockup-horizontal-black.png",
    srcW: 2800,
    srcH: 880,
    artX: 877,
    artY: 62,
    artW: 1508,
    artH: 577,
    arabicH: 577,
  },
  stacked: {
    dark: "/logos/athar-lockup-stacked-white.png",
    light: "/logos/athar-lockup-stacked-black.png",
    srcW: 1920,
    srcH: 1280,
    artX: 541,
    artY: 162,
    artW: 835,
    artH: 838,
    arabicH: 577,
  },
} as const;

/** Display height that keeps the horizontal wordmark at ~120px wide. */
export const ATHAR_LOCKUP_MIN_HEIGHT = 46;

type Props = {
  variant?: keyof typeof LOCKUPS;
  height?: number;
  /** Padding equal to the Arabic mark height — brand clear-space rule. */
  clearSpace?: boolean;
  className?: string;
  priority?: boolean;
};

export function AtharLogo({
  variant = "horizontal",
  height = ATHAR_LOCKUP_MIN_HEIGHT,
  clearSpace = false,
  className,
  priority,
}: Props) {
  const lockup = LOCKUPS[variant];
  const scale = height / lockup.artH;
  const artW = lockup.artW * scale;
  const clear = clearSpace ? height * (lockup.arabicH / lockup.artH) : 0;

  return (
    <span
      className={cn("relative block box-content", className)}
      style={{
        width: artW,
        height,
        padding: clear || undefined,
      }}
    >
      <span className="relative block overflow-hidden" style={{ width: artW, height }}>
        <img
          src={lockup.dark}
          alt="Athar"
          className="absolute max-w-none [.light_&]:hidden"
          style={{
            width: lockup.srcW * scale,
            height: lockup.srcH * scale,
            left: -lockup.artX * scale,
            top: -lockup.artY * scale,
          }}
          decoding="async"
          fetchPriority={priority ? "high" : "auto"}
        />
        <img
          src={lockup.light}
          alt=""
          className="absolute hidden max-w-none [.light_&]:block"
          style={{
            width: lockup.srcW * scale,
            height: lockup.srcH * scale,
            left: -lockup.artX * scale,
            top: -lockup.artY * scale,
          }}
          decoding="async"
          aria-hidden
        />
      </span>
    </span>
  );
}
