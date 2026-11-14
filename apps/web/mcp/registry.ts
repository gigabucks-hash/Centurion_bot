/** Tool names the local MCP server exposes. Kept free of the SDK so tests can import it. */
export const MCP_TOOLS = [
  { name: "centurion_status", description: "Health of this PC: MCP switch, buys paused, Real on or off, open paper and real counts." },
  { name: "centurion_engine_stop", description: "Pause new buys. Open positions stay. Exits keep running." },
  { name: "centurion_engine_start", description: "Resume new buys." },
  { name: "centurion_list_positions", description: "Open positions. mode is practice (paper) or real." },
  { name: "centurion_pnl", description: "Paper realized and unrealized PnL, plus recent closed rows." },
  { name: "centurion_team_scores", description: "Scout, Guard, Smart Money, Momentum, Narrative and Risk for one mint. A module with no local reading is unavailable, not a fake score." },
  { name: "centurion_paper_buy", description: "Open a paper buy on this PC. Refused while buys are paused." },
  { name: "centurion_paper_sell", description: "Sell part or all of one open paper position." },
  { name: "centurion_sell_all", description: "Sell every open position in paper or, if Real is already on, in the local real book. Jual semua." },
  { name: "centurion_real_buy", description: "Buy in the local real book. Works only after Real was enabled in the app. No transfer to another wallet." },
  { name: "centurion_real_sell", description: "Sell one open real position in the local real book. Real must already be on." },
  { name: "centurion_get_settings", description: "MCP switch, pause, Real flag, wallet public key, RPC, and limits." },
  { name: "centurion_update_settings", description: "Change limits, exit knobs, or RPC directly. Real must already be on. Tightening and loosening both apply now." },
] as const;
