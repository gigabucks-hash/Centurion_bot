import { Activity, BarChart3, CheckSquare, Coins, LayoutDashboard, Workflow } from "lucide-react";

export const NAV = [
  { href: "/", label: "nav.dashboard", short: "nav.homeShort", icon: LayoutDashboard, mobile: true },
  { href: "/strategies", label: "nav.strategies", short: "nav.strategies", icon: Workflow, mobile: true },
  { href: "/approvals", label: "nav.approvals", short: "nav.approvals", icon: CheckSquare, mobile: true },
  { href: "/activity", label: "nav.activity", short: "nav.activity", icon: Activity, mobile: true },
  { href: "/coins", label: "nav.coins", short: "nav.coins", icon: Coins, mobile: false },
  { href: "/stats", label: "nav.stats", short: "nav.statsShort", icon: BarChart3, mobile: false },
] as const;
