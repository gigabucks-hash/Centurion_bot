import type { Metadata } from "next";
import { ExploreBoard } from "@/components/explore/ExploreBoard";
import { loadExplore } from "@explore/load";
import { isSection, isWindow } from "@explore/types";

export const metadata: Metadata = { title: "Explore" };

export default async function ExplorePage({ searchParams }: { searchParams: Promise<{ section?: string; window?: string }> }) {
  const sp = await searchParams;
  const section = isSection(sp.section) ? sp.section : "trending";
  const span = isWindow(sp.window) ? sp.window : "1h";
  const initial = await loadExplore(section, span);
  return <ExploreBoard initial={initial} />;
}
