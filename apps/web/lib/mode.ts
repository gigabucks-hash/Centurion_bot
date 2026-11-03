/**
 * Server-side workspace mode. The mode comes from server state (here: a mock
 * cookie set by POST /api/mode after the switch dialog), never localStorage.
 */
import { cookies } from "next/headers";
import { connection } from "next/server";
import type { TradingMode } from "@/lib/types";

export const MODE_COOKIE = "centurion_mode";

export async function getMode(): Promise<TradingMode> {
  const c = await cookies();
  // Workspace data is live (mock clock, countdowns): always render at request time.
  await connection();
  return c.get(MODE_COOKIE)?.value === "real" ? "real" : "practice";
}
