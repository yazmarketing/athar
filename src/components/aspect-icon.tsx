/**
 * A small rectangle proportioned to an aspect ratio ("16:9", "9:16", …),
 * fit into a fixed bounding box so a row of them lines up cleanly — the
 * "☐ 16:9" chip icon pattern.
 */
export function AspectIcon({
  ratio,
  className,
}: {
  ratio: string;
  className?: string;
}) {
  const [wStr, hStr] = ratio.split(":");
  const w = Number(wStr) || 1;
  const h = Number(hStr) || 1;
  const box = 14;
  const rectW = w >= h ? box : (box * w) / h;
  const rectH = h >= w ? box : (box * h) / w;
  const x = (box - rectW) / 2;
  const y = (box - rectH) / 2;

  return (
    <svg
      viewBox={`0 0 ${box} ${box}`}
      width="14"
      height="14"
      className={className}
      aria-hidden
    >
      <rect
        x={x}
        y={y}
        width={rectW}
        height={rectH}
        rx="2"
        fill="none"
        stroke="currentColor"
        strokeWidth="1.4"
      />
    </svg>
  );
}
