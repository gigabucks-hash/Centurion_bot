import { readFile } from "node:fs/promises";
import path from "node:path";

/** Helmet mark rendered from brand/icon.svg. /icon/32 is the small favicon PNG. */
const FILES: Record<string, string> = {
  "32": "mark-32.png",
  "192": "mark-192.png",
  "512": "mark-512.png",
  maskable: "mark-maskable-512.png",
};

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
  const name = FILES[v] ?? FILES["32"];
  const buf = await readFile(path.join(process.cwd(), "public", "brand", name));
  return new Response(buf, {
    headers: {
      "content-type": "image/png",
      "cache-control": "public, max-age=86400",
    },
  });
}
