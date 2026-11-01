import type { Metadata } from "next";
import { parseHandoff } from "@/lib/auth/handoff";
import { DesktopHandoff } from "@/components/auth/DesktopHandoff";

export const metadata: Metadata = { title: "Desktop sign-in", robots: { index: false, follow: false }, referrer: "no-referrer" };

/** Desktop SIWS hand-off page (system browser → Phantom → back to centurion://auth). Public: no session needed. */
export default async function DesktopAuthPage({ searchParams }: PageProps<"/auth/desktop">) {
  const h = parseHandoff(await searchParams);
  return <DesktopHandoff handoff={h} />;
}
