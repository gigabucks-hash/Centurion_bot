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
import { tradingFromWire, type TradingWire } from "./trading";
import { blankSettings } from "./strategy-schema";
import type { CoinSummary, CoinMeta, CoinTrail, EquityPoint, OpenPosition, Position, Strategy, TradeEvent, TradingMode, WorkspaceOverview } from "./types";

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
  // The reads wire carries no per-strategy stats yet. Unknown stays null (em dash); never a fabricated 0.
  const stat = (k: string): number | null => (w.stats && typeof w.stats[k] === "number" ? (w.stats[k] as number) : null);
  return {
    id: w.id, name: w.name, mode: w.mode, ...realGateFromWire(w), status: w.status, rev: w.rev, settings: { ...settingsFromWire(w.settings, fb), mode: w.mode },
    openPositions: stat("open_positions"), realizedPnlSol: stat("realized_pnl_sol"), unrealizedPnlSol: stat("unrealized_pnl_sol"), trades: stat("trades") ?? 0, wins: stat("wins") ?? 0,
    maxDrawdownPct: stat("max_drawdown_pct") ?? 0, avgHoldSeconds: stat("avg_hold_seconds") ?? 0, pnlSpark: [],
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
  first_seen_at?: string | null;
  market_cap_lamports?: string | null; mcap_usd?: string | null; mcap_as_of?: string | null; mcap_source?: string | null;
  last_seen?: string | null;
  /** 1.1.6 additive on ScreenerResult: absent on today's `/coins` wire; pass through when the server adds it. */
  tradeable?: boolean; skip_reason?: string | null;
}

/** GET /coins/:mint/timeline item (contract envelope + the fields the trail decoder reads). */
interface TimelinePage {
  items?: AnyEvent[];
  next_after_seq?: string | null;
  safe_seq?: string | null;
}

interface RawPosition {
  id: string; position_key: string; strategy_id: string | null; mint: string; mode: TradingMode; status: string; rev: number;
  practice_epoch: number; decimals: number | null; token_program: OpenPosition["tokenProgram"]; sol_in_lamports: string | null;
  avg_entry_price_sol: string | null; opened_at: string; pnl_lamports?: string | null; pnl_pct?: number | null;
  /** 0025 additive fields: SQL `position_wire` for open rows; absent on older servers. */
  mark_price_sol?: string | null; unrealized_pnl_lamports?: string | null; as_of?: string | null; sold_bps?: number | null;
}

/**
 * 0025: per-row marks drive price + unrealized PnL when present. A missing mark (or PnL) stays `markUnknown`
 * so the row renders an em dash; it is never coerced to 0. Exit-plan values are not on this wire yet.
 */
function positionView(r: RawPosition, strategyName: string, symbol: string): OpenPosition {
  const solIn = lamportsToSolNumber(r.sol_in_lamports) ?? 0;
  const mark = r.mark_price_sol != null ? Number(r.mark_price_sol) : null;
  const unreal = lamportsToSolNumber(r.unrealized_pnl_lamports);
  const known = mark != null && Number.isFinite(mark) && unreal != null;
  return {
    key: r.position_key, strategyId: r.strategy_id ?? "", strategyName, mode: r.mode, mint: r.mint, symbol,
    solIn,
    // The REST wire carries no SOL/USD rate, so no USD price is invented here; the UI shows an em dash.
    // Realtime scaling uses nowPriceSol (0025 mark), not a USD rate.
    entryPriceUsd: NaN,
    nowPriceUsd: NaN,
    nowPriceSol: mark != null && Number.isFinite(mark) ? mark : null,
    pnlSol: unreal ?? 0,
    pnlPct: r.pnl_pct ?? (known && solIn > 0 ? (unreal! / solIn) * 100 : 0),
    openedAt: Date.parse(r.opened_at), soldPct: (r.sold_bps ?? 0) / 100,
    rev: r.rev, decimals: r.decimals, tokenProgram: r.token_program, practiceEpoch: r.practice_epoch,
    stopLossPct: 0, trailingPct: 0, priceUnknown: true,
    ...(known ? {} : { markUnknown: true }),
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
    // Before the first snapshot the tile is unknown, not zero: the PnL card must not read "flat 0.00".
    const inPositions = lamportsToSolNumber(row?.positions_cost_lamports);
    const realized = lamportsToSolNumber(row?.realized_pnl_lamports);
    const unrealized = lamportsToSolNumber(row?.unrealized_pnl_lamports);
    const ts = row?.ts ? Date.parse(row.ts) : Date.now();
    const equity = lamportsToSolNumber(row?.equity_lamports);
    const running = list.filter((s) => s.status === "running");
    const now = Date.now();
    const equityCurve: EquityPoint[] = equity != null ? [{ t: ts, equitySol: equity }] : [];
    return {
      id: ws.data.id, name: ws.data.name, mode, walletConnected: false,
      startingCashSol: start, cashSol: cash, inPositionsSol: inPositions ?? null, realizedPnlSol: realized ?? null, unrealizedPnlSol: unrealized ?? null,
      openPositions: row?.open_positions ?? null,
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
  /**
   * Coin detail (contracts 1.1.6): `/coins/:mint` for metadata, `/coins/:mint/timeline?mode=` for the decoded events,
   * `/strategies` for the name and `/positions/:id` for the fills referenced by those events. Both modes are probed
   * because a coin's strategy decides its mode and `/coins/:mint` carries no mode.
   * There is no price series endpoint: `prices` stays empty so the chart shows its honest "no price" state.
   */
  getCoinTrail: async (mint) => {
    let coin: RawCoin;
    try {
      coin = (await req<RawCoin>(await wsPath(`/coins/${encodeURIComponent(mint)}`))).data;
    } catch (e) {
      if (e instanceof ApiError && e.code === "NOT_FOUND") return null;
      throw e;
    }
    const timeline = async (mode: TradingMode): Promise<AnyEvent[]> => {
      try {
        const { data } = await req<TimelinePage>(await wsPath(`/coins/${encodeURIComponent(mint)}/timeline?mode=${mode}&limit=500`));
        return Array.isArray(data.items) ? data.items : [];
      } catch (e) {
        if (e instanceof ApiError && (e.code === "NOT_FOUND" || e.code === "VALIDATION_FAILED")) return [];
        // Paper-only deployments refuse Real reads (403 REAL_SOL_DISABLED / MODE_NOT_ALLOWED): that is an empty
        // probe, not a page error. A failure on the practice probe still surfaces.
        if (mode === "real" && e instanceof ApiError) return [];
        throw e;
      }
    };
    const [practiceEvents, realEvents] = await Promise.all([timeline("practice"), timeline("real")]);
    const newest = (rows: AnyEvent[]) => rows.reduce((m, e) => Math.max(m, Date.parse(e.ts) || 0), 0);
    const mode: TradingMode = realEvents.length > 0 && newest(realEvents) > newest(practiceEvents) ? "real" : practiceEvents.length ? "practice" : realEvents.length ? "real" : "practice";
    const envelopes = mode === "real" ? realEvents : practiceEvents;

    const strategyId = [...envelopes].reverse().find((e) => typeof e.strategy_id === "string")?.strategy_id ?? "";
    const [strategies, positions] = await Promise.all([
      strategyId ? items<StrategyWire>(await wsPath(`/strategies?mode=${mode}`)).catch(() => []) : Promise.resolve([] as StrategyWire[]),
      trailPositions(envelopes),
    ]);

    // Score + screener state from the contract payloads; never inferred from a pick status.
    let score: CoinTrail["score"];
    let screenerState: CoinTrail["screenerState"];
    let quoteMint: string | null = coin.quote_mint;
    let coinTradeable: boolean | undefined = coin.tradeable;
    let coinSkipReason: string | null = coin.skip_reason ?? null;
    for (const e of envelopes) {
      const p = (e.payload ?? {}) as {
        score?: number | { score?: number; score_threshold?: number; tradeable?: boolean; skip_reason?: string | null };
        score_threshold?: number;
        tradeable?: boolean;
        skip_reason?: string | null;
        quote_mint?: string | null;
        summary?: string;
      };
      if (e.type === "screener.scored") {
        const s = typeof p.score === "number" ? p.score : p.score?.score;
        const mark = typeof p.score === "number" ? p.score_threshold : p.score?.score_threshold;
        if (typeof s === "number" && typeof mark === "number") score = { value: s, passMark: mark };
        const t = typeof p.tradeable === "boolean" ? p.tradeable : p.score && typeof p.score === "object" ? p.score.tradeable : undefined;
        const skip = p.skip_reason ?? (p.score && typeof p.score === "object" ? p.score.skip_reason : null);
        if (typeof t === "boolean") coinTradeable = t;
        if (skip) coinSkipReason = skip;
        if (typeof p.quote_mint === "string") quoteMint = p.quote_mint;
      }
      if (e.type === "pick.created") {
        const s = p.score && typeof p.score === "object" ? p.score : undefined;
        if (s && typeof s.score === "number" && typeof s.score_threshold === "number") score = { value: s.score, passMark: s.score_threshold };
      }
    }
    if (coinTradeable === false && coinSkipReason === "UNSUPPORTED_QUOTE_MINT") screenerState = "UNSUPPORTED_QUOTE_MINT";
    if (!screenerState && envelopes.some((e) => {
      const p = (e.payload ?? {}) as { tradeable?: boolean; skip_reason?: string | null };
      return e.type === "screener.scored" && p.tradeable === false && p.skip_reason === "UNSUPPORTED_QUOTE_MINT";
    })) screenerState = "UNSUPPORTED_QUOTE_MINT";

    const name = strategies.find((s) => s.id === strategyId)?.name ?? "";
    return {
      coin: coinMetaFromRaw(coin),
      strategyId,
      strategyName: name,
      mode,
      ...(score ? { score } : {}),
      ...(screenerState ? { screenerState } : {}),
      ...(quoteMint && quoteMint !== "So11111111111111111111111111111111111111112" ? { quoteSymbol: `${quoteMint.slice(0, 4)}…${quoteMint.slice(-4)}` } : {}),
      positions,
      events: envelopes.map((e) => envelopeToTradeEvent(e)).filter((e): e is TradeEvent => e != null),
      prices: [],
    };
  },

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
  getTrading: async () => tradingFromWire((await req<TradingWire>(await wsPath("/trading"))).data),
};

function coinRows(rows: RawCoin[], picks: PickRow[], strategies: StrategyWire[], mode: TradingMode): CoinSummary[] {
  const latest = new Map<string, PickRow>();
  for (const p of picks) if (!latest.has(p.mint)) latest.set(p.mint, p);
  const names = new Map(strategies.map((s) => [s.id, s.name]));
  return rows.map((r) => {
    const pick = latest.get(r.mint);
    const w = {
      mint: r.mint, venue: r.venue, launchpad: r.launchpad, decimals: r.decimals, token_program: r.token_program, quote_mint: r.quote_mint,
      // 1.1.6 `ScreenerResult.tradeable/skip_reason`: pass the wire flag through when the server sends it. Today's
      // `/coins` has no such field, so a missing flag stays tradeable (never inferred from pick status or quote mint).
      tradeable: r.tradeable ?? true, skip_reason: r.skip_reason ?? null,
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

/** Coins/positions carry u64/u128 values as decimal strings; display numbers come only from `lamportsToSolNumber`. */
const decOrNull = (v: string | null | undefined): number | null => {
  if (v == null || v === "") return null;
  const n = Number(v);
  return Number.isFinite(n) ? n : null;
};

function coinMetaFromRaw(r: RawCoin): CoinMeta {
  const symbol = r.untrusted?.symbol ?? "";
  return {
    mint: r.mint,
    untrusted: { symbol, name: r.untrusted?.name ?? symbol },
    logoHash: typeof r.logo_hash === "string" ? r.logo_hash : null,
    launchpad: r.launchpad ?? "",
    venue: r.venue as CoinMeta["venue"],
    createdAt: r.first_seen_at ? Date.parse(r.first_seen_at) : 0,
    decimals: r.decimals,
    tokenProgram: r.token_program,
    quoteMint: r.quote_mint,
    tradeable: r.tradeable ?? true,
    skipReason: (r.skip_reason as CoinMeta["skipReason"]) ?? null,
  };
}

function trailPositionFromWire(w: PositionWire): Position {
  const solIn = lamportsToSolNumber(w.sol_in_lamports) ?? 0;
  const fees = lamportsToSolNumber(w.fees_lamports) ?? 0;
  const entry = decOrNull(w.avg_entry_price_sol);
  const peak = decOrNull(w.peak_price_sol);
  return {
    key: w.position_key,
    strategyId: w.strategy_id ?? "",
    mint: w.mint,
    status: w.status,
    entryPriceSol: entry,
    exitPriceSol: decOrNull(w.exit_price_sol),
    entryPriceUsd: NaN,
    solIn: lamportsToSolNumber(w.sol_in_lamports) ?? NaN,
    solOut: lamportsToSolNumber(w.sol_out_lamports) ?? NaN,
    peakGainPct: entry != null && entry > 0 && peak != null ? (peak / entry - 1) * 100 : NaN,
    feeBps: solIn > 0 ? (fees / solIn) * 10_000 : NaN,
    openedAt: Date.parse(w.opened_at),
    ...(w.closed_at ? { closedAt: Date.parse(w.closed_at) } : {}),
    ...(w.exit_reason ? { exitReason: w.exit_reason } : {}),
    pnlSol: lamportsToSolNumber(w.pnl_lamports) ?? null,
    pnlPct: w.pnl_pct ?? null,
    markUnknown: w.status === "open",
  };
}

/** The trail's events reference positions by id; fetch exactly those rows (no workspace-wide scan). */
async function trailPositions(envelopes: AnyEvent[]): Promise<Position[]> {
  const ids = new Set<string>();
  for (const e of envelopes) {
    const p = (e.payload ?? {}) as { position_id?: unknown };
    if (typeof p.position_id === "string") ids.add(p.position_id);
  }
  const rows = await Promise.all(
    [...ids].slice(0, 20).map(async (id) => {
      try {
        return (await req<PositionWire>(await wsPath(`/positions/${encodeURIComponent(id)}`))).data;
      } catch {
        return null;
      }
    }),
  );
  return rows.filter((r): r is PositionWire => r != null).map(trailPositionFromWire);
}