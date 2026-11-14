import { Activity, BarChart3, CheckSquare, Coins, Compass, LayoutDashboard, Settings, Wallet, Workflow } from "lucide-react";

/** Order per WF-17/11: Dashboard, Strategies, Approvals, Positions, Activity, Coins, Stats, then Settings last. */
export const NAV = [
  { href: "/", label: "nav.dashboard", short: "nav.homeShort", icon: LayoutDashboard, mobile: true },
  { href: "/strategies", label: "nav.strategies", short: "nav.strategies", icon: Workflow, mobile: true },
  { href: "/approvals", label: "nav.approvals", short: "nav.approvals", icon: CheckSquare, mobile: true },
  { href: "/positions", label: "nav.positions", short: "nav.positions", icon: Wallet, mobile: false },
  { href: "/activity", label: "nav.activity", short: "nav.activity", icon: Activity, mobile: true },
  { href: "/explore", label: "nav.explore", short: "nav.exploreShort", icon: Compass, mobile: false },
  { href: "/coins", label: "nav.coins", short: "nav.coins", icon: Coins, mobile: false },
  { href: "/stats", label: "nav.stats", short: "nav.statsShort", icon: BarChart3, mobile: false },
  { href: "/settings", label: "nav.settings", short: "nav.settings", icon: Settings, mobile: false },
] as const;
