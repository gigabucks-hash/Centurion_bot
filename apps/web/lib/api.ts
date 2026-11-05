/**
 * Data-access interface for the dashboard.
 *
 * UI code calls `getApi()` (server) or the helpers in lib/client.ts — never
 * the mock modules directly. Every read is scoped to ONE workspace mode so
 * Real SOL numbers never appear on a Practice screen (UX SPEC §4).
 * Switch to the backend with DATA_SOURCE=http + API_BASE_URL.
 */
import type {
  Approval,
  ApprovalDecision,
  ClosedTrade,
  CoinSummary,
  CoinTrail,
  ExitReasonStat,
  Mint,
  PnlFilter,
  PnlSummary,
  PublishResult,
  StatsFilter,
  Strategy,
  StrategySettings,
  TradeEvent,
  TradingMode,
  WorkspaceOverview,
} from "@/lib/types";
import { httpApi } from "./http-api";
import { mockApi } from "./mock";

export interface DashboardApi {
  getOverview(mode: TradingMode): Promise<WorkspaceOverview>;
  listStrategies(mode: TradingMode): Promise<Strategy[]>;
  getStrategy(id: string): Promise<Strategy | null>;
  /** Create (id = null) or publish a new revision. Weakening guards → approval item instead. */
  publishStrategy(id: string | null, settings: StrategySettings): Promise<PublishResult>;
  listRecentEvents(mode: TradingMode, limit?: number): Promise<TradeEvent[]>;
  /** Whole list (follows next_cursor; used when the page filters locally). */
  listCoins(mode: TradingMode): Promise<CoinSummary[]>;
  /** One keyset page (1.1.4): newest first, `nextCursor` null on the last page. */
  listCoinsPage(mode: TradingMode, o?: { cursor?: string | null; limit?: number }): Promise<{ items: CoinSummary[]; nextCursor: string | null }>;
  getCoinTrail(mint: Mint): Promise<CoinTrail | null>;
  getExitStats(filter: StatsFilter): Promise<ExitReasonStat[]>;
  /** 0022 PnL report strip: realized (all-time + range), unrealized, total, closed counts. */
  getPnlSummary(filter: PnlFilter): Promise<PnlSummary>;
  /** 0022 realized per-trade ledger: closed positions newest first, each with pnl/pnl_pct/hold. */
  listClosedTrades(filter: PnlFilter): Promise<ClosedTrade[]>;
  /** Same ledger, one keyset page (50/page): newest close first, opaque `nextCursor` null on the last page. */
  listClosedTradesPage(filter: PnlFilter): Promise<{ items: ClosedTrade[]; nextCursor: string | null }>;
  listApprovals(mode: TradingMode): Promise<Approval[]>;
  decideApproval(id: string, decision: ApprovalDecision): Promise<Approval>;
}

export type DataSource = "mock" | "http";

export function getDataSource(): DataSource {
  return process.env.DATA_SOURCE === "http" ? "http" : "mock";
}

export function getApi(): DashboardApi {
  return getDataSource() === "http" ? httpApi : mockApi;
}
