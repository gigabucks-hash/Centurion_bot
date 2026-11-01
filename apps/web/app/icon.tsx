import { ImageResponse } from "next/og";
import { BrandMark } from "@/lib/brand/mark";

/** App icons: /icon/32 (favicon), /icon/192, /icon/512, /icon/maskable (extra safe-zone padding). */
export function generateImageMetadata() {
  return [
    { id: "32", size: { width: 32, height: 32 }, contentType: "image/png" },
    { id: "192", size: { width: 192, height: 192 }, contentType: "image/png" },
    { id: "512", size: { width: 512, height: 512 }, contentType: "image/png" },
    { id: "maskable", size: { width: 512, height: 512 }, contentType: "image/png" },
  ];
}

export default async function Icon({ id }: { id: Promise<string | number> }) {
  const v = String(await id);
  const size = v === "maskable" ? 512 : Number(v) || 32;
  return new ImageResponse(<BrandMark size={size} pad={v === "maskable" ? 0.28 : 0.14} />, { width: size, height: size });
}
