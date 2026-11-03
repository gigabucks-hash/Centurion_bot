/**
 * Per-strategy mode (Boss 3 Nov 2026: ONE app, each strategy runs in Paper or Real; contracts 1.1.6).
 * There is no global workspace mode any more (the old `centurion_mode` cookie + top-bar toggle are retired).
 * The wire still scopes READS by `?mode=practice|real` (API_ENDPOINTS §2/§3, default practice) and balances stay per
 * mode, so screens read every mode that has strategies and merge the lists, each item badged with its own mode.
 * Real reads are only made when a strategy actually runs in Real (never today: Real is gated, `real_locked: true`).
 */
import { connection } from "next/server";
import type { DashboardApi } from "@/lib/api";
import { ApiError } from "@/lib/errors";
import type { Strategy, TradingMode } from "@/lib/types";

/** Retired global-mode cookie: deleted at sign-in, never read. */
export const LEGACY_MODE_COOKIE = "centurion_mode";

/** Real reads answer 403 REAL_SOL_DISABLED / FORBIDDEN_SCOPE / MODE_NOT_ALLOWED until Real ships: treat as empty. */
export const realReadRefused = (e: unknown) => e instanceof ApiError && (e.code === "REAL_SOL_DISABLED" || e.code === "FORBIDDEN_SCOPE" || e.code === "MODE_NOT_ALLOWED");

/** Every strategy in the workspace, both modes (Paper first; Real only when the server allows Real reads). */
export async function listAllStrategies(api: DashboardApi): Promise<Strategy[]> {
  await connection(); // live data (mock clock, countdowns): always render at request time
  const [paper, real] = await Promise.all([
    api.listStrategies("practice"),
    api.listStrategies("real").catch((e) => (realReadRefused(e) ? [] : Promise.reject(e))),
  ]);
  return [...paper, ...real];
}

/** Modes to read for merged lists: Paper always, Real only when at least one strategy runs in Real. */
export const modesOf = (strategies: Pick<Strategy, "mode">[]): TradingMode[] => (strategies.some((s) => s.mode === "real") ? ["practice", "real"] : ["practice"]);

/** Read one list per mode and concatenate (Paper first). A refused Real read yields nothing. */
export async function acrossModes<T>(modes: TradingMode[], read: (m: TradingMode) => Promise<T[]>): Promise<T[]> {
  const parts = await Promise.all(modes.map((m) => read(m).catch((e) => (m === "real" && realReadRefused(e) ? [] : Promise.reject(e)))));
  return parts.flat();
}

/** `?mode=` for per-mode money screens (portfolio overview, exit stats): Paper unless Real is readable and asked for. */
export function portfolioMode(v: unknown, modes: TradingMode[]): TradingMode {
  const s = Array.isArray(v) ? v[0] : v;
  return s === "real" && modes.includes("real") ? "real" : "practice";
}
