/**
 * Server-side HTTP adapter for the real backend (DATA_SOURCE=http, contracts v1.1, API_ENDPOINTS.md).
 *
 * Paths follow the backend router (services/backend/api/src/routes*.ts):
 *   /portfolio/overview, /positions, /approvals, /strategies, /events, /coins, /stats/pnl, /stats/exit-reasons.
 * The web app keeps its own view model (lib/types.ts), which carries display extras the mock produced; anything the
 * API does not report yet stays null/empty here rather than being invented (no 0 PnL for an unknown mark).
 *
 * Auth: the session JWT lives in the httpOnly `centurion_at` cookie; every call forwards it. The workspace id is the
 * one the backend created at first sign-in (`centurion_ws`).
 */
import { randomUUID } from "node:crypto";
import type { AnyEvent, EventPage, ExitStatsRow, PnlSummary as PnlSummaryWire, PositionWire, StrategyRealGateFields } from "@centurion/contracts/wire";
import type { DashboardApi } from "./api";
import { approvalFromWire, closedTradeFromWire, coinSummaryFromWire, pnlSummaryFromWire, realGateFromWire, envelopeToTradeEvent, exitStatFromWire, type CoinWire, settingsFromWire, settingsPatch, settingsToWire, type ApprovalItemWire as ApprovalWire, rejectReasonFor, type WireSettings, lamportsToSolNumber } from "./contracts";
import { ACCESS_COOKIE, WORKSPACE_COOKIE } from "./auth/cookies";
import { ApiError, toApiError } from "./errors";
import { blankSettings } from "./strategy-schema";
import type { CoinSummary, EquityPoint, OpenPosition, Strategy, TradeEvent, TradingMode, WorkspaceOverview } from "./types";

const base = () => (process.env.API_BASE_URL ?? "http://localhost:8080").replace(/\/$/, "");

/**
 * The backend creates an owner workspace on first SIWS login and returns its id. That id is stored in a cookie
 * by the verify route, so one deployment serves any owner without hard-coding API_WORKSPACE_ID per user.
 */
async function currentWs(): Promise<string> {
  try {
    const { cookies } = await import("next/headers");
    const fromCookie = (await cookies()).get(WORKSPACE_COOKIE)?.value;
    if (fromCookie) return fromCookie;
  } catch {
    /* outside a request scope: fall back to config */
  }
  return process.env.API_WORKSPACE_ID ?? "ws_mock";
}
const wsPath = async (p: string) => `/v1/workspaces/${encodeURIComponent(await currentWs())}${p}`;

/** The backend authenticates every workspace read/write with the session JWT (httpOnly cookie, never browser JS). */
async function authHeaders(): Promise<Record<string, string>> {
  try {
    const { cookies } = await import("next/headers");
    const token = (await cookies()).get(ACCESS_COOKIE)?.value;
    return token ? { authorization: `Bearer ${token}` } : {};
  } catch {
    return {};
  }
}

async function req<T>(path: string, init: RequestInit & { idempotent?: boolean } = {}): Promise<{ data: T; raw: Record<string, unknown> }> {
  const write = init.method && init.method !== "GET";
  const res = await fetch(`${base()}${path}`, {
    ...init,
    cache: "no-store",
    headers: { accept: "application/json", "content-type": "application/json", ...(await authHeaders()), ...(write ? { "Idempotency-Key": randomUUID() } : {}), ...init.headers },
  });
  const json = (await res.json().catch(() => ({}))) as Record<string, unknown>;
  if (!res.ok) throw toApiError(res.status, json);
  return { data: (json.data ?? json) as T, raw: json };
}

/**
 * 1.1.4 keyset paging: follow `next_cursor` (limit=100) up to MAX_PAGES; a 400 CURSOR_INVALID mid-walk (list changed
 * under a cursor) restarts once from the first page.
 */
const MAX_PAGES = 20;
async function items<T>(path: string, restarted = false): Promise<T[]> {
  const out: T[] = [];
  let cursor: string | null = null;
  for (let i = 0; i < MAX_PAGES; i++) {
    const sep = path.includes("?") ? "&" : "?";
    try {
      const res: { raw: Record<string, unknown> } = await req<unknown>(`${path}${sep}limit=100${cursor ? `&cursor=${encodeURIComponent(cursor)}` : ""}`);
      const raw = res.raw;
      out.push(...((raw.items ?? []) as T[]));
      cursor = (raw.next_cursor as string | null | undefined) ?? null;
      if (!cursor) break;
    } catch (e) {
      if (!restarted && e instanceof ApiError && e.code === "CURSOR_INVALID") return items<T>(path, true);
      throw e;
    }
  }
  return out;
}

async function page<T>(path: string, o: { cursor?: string | null; limit?: number } = {}): Promise<{ items: T[]; nextCursor: string | null }> {
  const sep = path.includes("?") ? "&" : "?";
  const { raw } = await req<unknown>(`${path}${sep}limit=${o.limit ?? 50}${o.cursor ? `&cursor=${encodeURIComponent(o.cursor)}` : ""}`);
  return { items: (raw.items ?? []) as T[], nextCursor: (raw.next_cursor as string | null | undefined) ?? null };
}

interface StrategyWire extends Partial<StrategyRealGateFields> {
  id: string; rev: number; name: string; status: Strategy["status"]; mode: TradingMode; settings: WireSettings;
  updated_at?: string; created_at?: string; stats?: Record<string, number>;
}

function strategyFromWire(w: StrategyWire): Strategy {
  const fb = { ...blankSettings(), mode: w.mode };
  const ts = (s?: string) => (s ? Date.parse(s) : 0);
  return {
    id: w.id, name: w.name, mode: w.mode, ...realGateFromWire(w), status: w.status, rev: w.rev, settings: { ...settingsFromWire(w.settings, fb), mode: w.mode },
    openPositions: w.stats?.open_positions ?? 0, realizedPnlSol: 0, unrealizedPnlSol: 0, trades: w.stats?.trades ?? 0, wins: w.stats?.wins ?? 0,
    maxDrawdownPct: w.stats?.max_drawdown_pct ?? 0, avgHoldSeconds: w.stats?.avg_hold_seconds ?? 0, pnlSpark: [],
    funnel: { scanned: 0, filtered: 0, signaled: 0, entered: 0, exited: 0, rejections: [] }, createdAt: ts(w.created_at), updatedAt: ts(w.updated_at),
  };
}

/* ------------------------------------------------------------------------------------------------ */
/* Raw backend shapes (only the fields we read)                                                     */
/* ------------------------------------------------------------------------------------------------ */

interface PortfolioRow {
  ts: string | null;
  cash_lamports: string | null;
  positions_cost_lamports: string | null;
  equity_lamports: string | null;
  realized_pnl_lamports: string | null;
  unrealized_pnl_lamports: string | null;
  open_positions: number | null;
  drawdown_bps: number | null;
}

interface WorkspaceRow { id: string; name: string; practice_start_lamports: string | null }

interface PickRow { mint: string; strategy_id: string; stage: string; created_at: string | null }

interface RawCoin {
  mint: string; venue: CoinWire["venue"]; launchpad: string | null; decimals: number | null; token_program: CoinWire["token_program"];
  quote_mint: string | null; untrusted?: { symbol?: string; name?: string }; logo_hash?: string | null;
  market_cap_lamports?: string | null; mcap_usd?: string | null; mcap_as_of?: string | null; mcap_source?: string | null;
  last_seen?: string | null;
}

interface RawPosition {
  id: string; position_key: string; strategy_id: string | null; mint: string; mode: TradingMode; status: string; rev: number;
  practice_epoch: number; decimals: number | null; token_program: OpenPosition["tokenProgram"]; sol_in_lamports: string | null;
  avg_entry_price_sol: string | null; opened_at: string; pnl_lamports?: string | null; pnl_pct?: number | null;
}

/** Only realtime/portfolio-derived display fields are missing from the API today; they stay unset (em dash), not 0. */
function positionView(r: RawPosition, strategyName: string, symbol: string): OpenPosition {
  const solIn = lamportsToSolNumber(r.sol_in_lamports) ?? 0;
  return {
    key: r.position_key, strategyId: r.strategy_id ?? "", strategyName, mode: r.mode, mint: r.mint, symbol,
    solIn, entryPriceUsd: 0,
    nowPriceUsd: 0, pnlSol: 0, pnlPct: 0, openedAt: Date.parse(r.opened_at), soldPct: 0,
    rev: r.rev, decimals: r.decimals, tokenProgram: r.token_program, practiceEpoch: r.practice_epoch,
    stopLossPct: 0, trailingPct: 0, markUnknown: true,
  };
}

export const httpApi: DashboardApi = {
  /**
   * `portfolio_latest` is the snapshot; the rest of the dashboard chrome (strategy caps, pending approvals, workspace
   * name/start cash) comes from the reads the same page already needs. Before the first executor snapshot the
   * portfolio row is null: the account is flat at its starting cash, not "0 SOL".
   */
  getOverview: async (mode) => {
    const [p, strategies, approvals, ws] = await Promise.all([
      req<PortfolioRow | null>(await wsPath(`/portfolio/overview?mode=${mode}`)),
      items<StrategyWire>(await wsPath(`/strategies?mode=${mode}`)),
      items<Record<string, unknown>>(await wsPath(`/approvals?mode=${mode}&status=pending`)).catch(() => []),
      req<WorkspaceRow>(await wsPath("")),
    ]);
    const row = p.data;
    const list = strategies.map(strategyFromWire);
    const start = Number(BigInt(ws.data.practice_start_lamports ?? "30000000000") / 1_000_000_000n);
    const cash = lamportsToSolNumber(row?.cash_lamports) ?? start;
    const inPositions = lamportsToSolNumber(row?.positions_cost_lamports) ?? 0;
    const realized = lamportsToSolNumber(row?.realized_pnl_lamports) ?? 0;
    const unrealized = lamportsToSolNumber(row?.unrealized_pnl_lamports) ?? 0;
    const ts = row?.ts ? Date.parse(row.ts) : Date.now();
    const equity = lamportsToSolNumber(row?.equity_lamports);
    const running = list.filter((s) => s.status === "running");
    const now = Date.now();
    const equityCurve: EquityPoint[] = equity != null ? [{ t: ts, equitySol: equity }] : [];
    return {
      id: ws.data.id, name: ws.data.name, mode, walletConnected: false,
      startingCashSol: start, cashSol: cash, inPositionsSol: inPositions, realizedPnlSol: realized, unrealizedPnlSol: unrealized,
      openPositions: row?.open_positions ?? 0,
      openPositionsCap: running.reduce((n, s) => n + s.settings.sizing.maxOpen, 0),
      runningStrategies: running.length, pausedStrategies: list.filter((s) => s.status === "paused").length,
      lossStopPct: running.reduce((n, s) => Math.max(n, s.settings.sizing.lossStopPct), 0),
      drawdownPct: (row?.drawdown_bps ?? 0) / 100,
      pendingApprovals: approvals.length,
      expiringSoon: approvals.filter((a) => {
        const at = typeof a.expires_at === "string" ? Date.parse(a.expires_at) : NaN;
        return Number.isFinite(at) && at - now < 2 * 60_000;
      }).length,
      engine: { online: row != null && now - ts < 5 * 60_000, lastHeartbeatAt: ts, version: "api" },
      equityCurve, alerts: [], updatedAt: ts,
    } satisfies WorkspaceOverview;
  },

  listStrategies: async (mode) => (await items<StrategyWire>(await wsPath(`/strategies?mode=${mode}`))).map(strategyFromWire),
  getStrategy: async (id) => strategyFromWire((await req<StrategyWire>(await wsPath(`/strategies/${encodeURIComponent(id)}`))).data),
  publishStrategy: async (id, settings) => {
    if (!id) {
      const { data } = await req<StrategyWire>(await wsPath(`/strategies`), { method: "POST", body: JSON.stringify({ mode: settings.mode, name: settings.name, settings: settingsToWire(settings) }) });
      return { strategyId: data.id, outcome: "published", rev: data.rev };
    }
    const cur = (await req<StrategyWire>(await wsPath(`/strategies/${encodeURIComponent(id)}`))).data;
    const patch = settingsPatch(cur.settings, settingsToWire(settings));
    const { data } = await req<StrategyWire | { proposal: ApprovalWire; strategy: StrategyWire }>(await wsPath(`/strategies/${encodeURIComponent(id)}`), {
      method: "PATCH", headers: { "If-Match": `"${cur.rev}"` }, body: JSON.stringify({ settings_patch: patch }),
    });
    return "proposal" in data ? { strategyId: id, outcome: "needs_approval", rev: data.strategy.rev, approvalId: data.proposal.id } : { strategyId: id, outcome: "published", rev: data.rev };
  },

  listRecentEvents: async (mode, limit = 50) => {
    const got = (await req<unknown>(await wsPath(`/events?mode=${mode}&limit=${limit}`))).raw as unknown as EventPage;
    return (got.items as AnyEvent[]).map(envelopeToTradeEvent).filter((e): e is TradeEvent => e != null);
  },

  /**
   * `/coins` is coin metadata; the screener row (strategy, status) comes from `/picks`, the same source the mock joined.
   * A coin with no pick yet is "watching" and has no strategy, which the UI already handles.
   */
  listCoins: async (mode) => {
    const [rows, picks, strategies] = await Promise.all([
      items<RawCoin>(await wsPath(`/coins?mode=${mode}`)),
      items<PickRow>(await wsPath(`/picks?mode=${mode}`)).catch(() => []),
      items<StrategyWire>(await wsPath(`/strategies?mode=${mode}`)).catch(() => []),
    ]);
    return coinRows(rows, picks, strategies, mode);
  },
  listCoinsPage: async (mode, o) => {
    const [p, picks, strategies] = await Promise.all([
      page<RawCoin>(await wsPath(`/coins?mode=${mode}`), o),
      items<PickRow>(await wsPath(`/picks?mode=${mode}`)).catch(() => []),
      items<StrategyWire>(await wsPath(`/strategies?mode=${mode}`)).catch(() => []),
    ]);
    return { items: coinRows(p.items, picks, strategies, mode), nextCursor: p.nextCursor };
  },
  /** Coin detail trail needs the backend's `/coins/:mint/timeline` decoder; not wired yet (returns no trail). */
  getCoinTrail: async () => null,

  getExitStats: async (f) => {
    const q = new URLSearchParams({ mode: f.mode, ...(f.strategyId ? { strategy_id: f.strategyId } : {}), ...(f.windowHours ? { window: `${f.windowHours}h` } : {}) });
    return (await items<ExitStatsRow>(await wsPath(`/stats/exit-reasons?${q}`))).map(exitStatFromWire);
  },
  /** 0022: the server computes realized/unrealized/total and the range's closed-trade stats in one call. */
  getPnlSummary: async (f) => {
    const q = new URLSearchParams({ mode: f.mode, window: f.window ?? "7d", ...(f.strategyId ? { strategy_id: f.strategyId } : {}) });
    return pnlSummaryFromWire((await req<PnlSummaryWire>(await wsPath(`/stats/pnl?${q}`))).data);
  },
  /** 0022 `GET /positions?state=closed` now carries pnl_lamports / pnl_pct / hold_seconds per close. */
  listClosedTrades: async (f) => {
    const q = new URLSearchParams({ mode: f.mode, state: "closed", ...(f.strategyId ? { strategy_id: f.strategyId } : {}), ...(f.window ? { window: f.window } : {}) });
    const p = await page<PositionWire>(await wsPath(`/positions?${q}`), { limit: f.limit ?? 100 });
    return p.items.map(closedTradeFromWire);
  },
  listClosedTradesPage: async (f) => {
    const q = new URLSearchParams({ mode: f.mode, state: "closed", ...(f.strategyId ? { strategy_id: f.strategyId } : {}), ...(f.window ? { window: f.window } : {}) });
    const p = await page<PositionWire>(await wsPath(`/positions?${q}`), { limit: f.limit ?? 50, cursor: f.cursor ?? null });
    return { items: p.items.map(closedTradeFromWire), nextCursor: p.nextCursor };
  },

  /** Open rows: the API reports size/entry/rev; per-row mark price and unrealized PnL come from the executor feed, not REST. */
  listOpenPositions: async (mode) => {
    const [rows, strategies, coins] = await Promise.all([
      items<RawPosition>(await wsPath(`/positions?mode=${mode}&state=open`)),
      items<StrategyWire>(await wsPath(`/strategies?mode=${mode}`)).catch(() => []),
      items<RawCoin>(await wsPath(`/coins?mode=${mode}`)).catch(() => []),
    ]);
    const names = new Map(strategies.map((s) => [s.id, s.name]));
    const symbols = new Map(coins.map((c) => [c.mint, c.untrusted?.symbol ?? ""]));
    return rows.map((r) => positionView(r, names.get(r.strategy_id ?? "") ?? "", symbols.get(r.mint) ?? `${r.mint.slice(0, 4)}…${r.mint.slice(-4)}`));
  },

  listApprovals: async (mode) => (await items<ApprovalWire>(await wsPath(`/approvals?mode=${mode}`))).map(approvalFromWire),
  decideApproval: async (id, d) => {
    if (d.action === "cancel_cooldown") {
      await req(await wsPath(`/guard-changes/${encodeURIComponent(id)}/cancel`), { method: "POST", body: "{}" });
    } else if (d.action !== "undo_skip") {
      const fresh = approvalFromWire((await req<ApprovalWire>(await wsPath(`/approvals/${encodeURIComponent(id)}`))).data);
      await req(await wsPath(`/approvals/${encodeURIComponent(id)}/decision`), {
        method: "POST",
        headers: { "If-Match": `"${fresh.rev}"` },
        body: JSON.stringify({ decision: d.action === "approve" ? "approve" : "reject", token: fresh.decisionToken, expected_rev: fresh.rev, reason: d.action === "skip" ? (d.reason ?? null) : null, ...(d.action === "skip" ? { reject_reason: d.rejectReason ?? rejectReasonFor({ skipReason: d.reason }) } : {}) }),
      });
    }
    return approvalFromWire((await req<ApprovalWire>(await wsPath(`/approvals/${encodeURIComponent(id)}`))).data);
  },
};

function coinRows(rows: RawCoin[], picks: PickRow[], strategies: StrategyWire[], mode: TradingMode): CoinSummary[] {
  const latest = new Map<string, PickRow>();
  for (const p of picks) if (!latest.has(p.mint)) latest.set(p.mint, p);
  const names = new Map(strategies.map((s) => [s.id, s.name]));
  return rows.map((r) => {
    const pick = latest.get(r.mint);
    const w = {
      mint: r.mint, venue: r.venue, launchpad: r.launchpad, decimals: r.decimals, token_program: r.token_program, quote_mint: r.quote_mint,
      // The API does not flag tradeability on the screener row yet; a missing flag must not look untradeable.
      tradeable: true, skip_reason: null,
      untrusted: r.untrusted ?? {},
      strategy_id: pick?.strategy_id ?? "", strategy_name: names.get(pick?.strategy_id ?? "") ?? "",
      mode, status: pick?.stage === "rejected" ? "rejected" : "watching",
      last_event_at: r.last_seen ?? pick?.created_at ?? new Date().toISOString(), pnl_lamports: null,
      logo_hash: r.logo_hash ?? null, market_cap_lamports: r.market_cap_lamports ?? null,
      mcap_usd: r.mcap_usd ?? null, mcap_as_of: r.mcap_as_of ?? null, mcap_source: r.mcap_source ?? null,
    } as unknown as CoinWire;
    return coinSummaryFromWire(w);
  });
}