import { BRAND_COLORS } from "./index";

/** Original brand mark for generated images: a faceted diamond on the canvas colour (ImageResponse JSX, inline styles). */
export function BrandMark({ size, pad = 0.18 }: { size: number; pad?: number }) {
  const inner = Math.round(size * (1 - pad * 2));
  return (
    <div style={{ width: size, height: size, display: "flex", alignItems: "center", justifyContent: "center", background: BRAND_COLORS.canvas, borderRadius: Math.round(size * 0.22) }}>
      <svg width={inner} height={inner} viewBox="0 0 100 100">
        <polygon points="50,4 96,50 50,96 4,50" fill={BRAND_COLORS.primary} />
        <polygon points="50,4 96,50 50,50" fill="#B7BFFF" />
        <polygon points="4,50 50,96 50,50" fill="#5D6BE0" />
      </svg>
    </div>
  );
}
