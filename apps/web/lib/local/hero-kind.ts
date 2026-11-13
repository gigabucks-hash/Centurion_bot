export type HeroKind = "desk" | "positions" | "strategies" | "approvals" | "activity" | "coins" | "stats" | "settings";

export function heroKind(pathname: string): HeroKind {
  if (pathname.startsWith("/positions")) return "positions";
  if (pathname.startsWith("/strategies")) return "strategies";
  if (pathname.startsWith("/approvals")) return "approvals";
  if (pathname.startsWith("/activity")) return "activity";
  if (pathname.startsWith("/coins")) return "coins";
  if (pathname.startsWith("/stats") || pathname.startsWith("/pnl")) return "stats";
  if (pathname.startsWith("/settings")) return "settings";
  return "desk";
}
