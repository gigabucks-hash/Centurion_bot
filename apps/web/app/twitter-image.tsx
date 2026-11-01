import { ImageResponse } from "next/og";
import { APP_NAME, BRAND_COLORS } from "@/lib/brand";
import { BrandMark } from "@/lib/brand/mark";

export const alt = APP_NAME;
export const size = { width: 1200, height: 630 };
export const contentType = "image/png";

/** OG / Twitter card: original layout (mark + name + tagline), token colours. No data, no user content. */
export default function OgImage() {
  return new ImageResponse(
    (
      <div style={{ width: "100%", height: "100%", display: "flex", flexDirection: "column", justifyContent: "center", padding: 88, background: BRAND_COLORS.canvas, color: "#E8ECF4", fontSize: 40 }}>
        <BrandMark size={140} pad={0.12} />
        <div style={{ marginTop: 40, fontSize: 84, fontWeight: 700, letterSpacing: -2 }}>{APP_NAME}</div>
        <div style={{ marginTop: 12, color: "#9AA4B8" }}>Solana trading bot · picks, approvals, exits</div>
      </div>
    ),
    size,
  );
}
