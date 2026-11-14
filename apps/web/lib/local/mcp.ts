/**
 * Local autotrader bridge. Paper trades run in the in-app paper book.
 * Real trades and setting changes run only after Real was enabled in the app.
 * This module never reads a private key and has no transfer-out action.
 */
import { createHash, randomBytes } from "node:crypto";
import { chmodSync, existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import path from "node:path";
import { trails } from "@/lib/mock/data";
import { getTradingState, pauseBuys, resumeBuys } from "@/lib/mock/trading";
import { closePosition, listClosedLedger, listOpenPositions, openLocalPaperBuy, sellAllPractice, snapshot } from "@/lib/mock/store";
import { safeSymbol } from "@/lib/untrusted";
import { localDir } from "./paths";
import { applyKnobsDirect, readBook, scopeKnobs, setRpc, writeBook, type RealBook } from "./real-book";
import { admitBuy, lamportsToSolInput, solToLamports, type RealKnobs } from "./real-limits";

const FORBIDDEN = /private|secret|seed|mnemonic|keypair|recipient|destination|withdraw|export/i;
const MODULES = ["scout", "guard", "smart_money", "momentum", "narrative", "risk"] as const;

export interface AuditRow {
  at: string;
  tool: string;
  ok: boolean;
  code: string;
  prev?: string;
  hash?: string;
}

interface RealPos {
  key: string;
  mint: string;
  symbol: string;
  lamportsIn: string;
  openedAt: number;
  soldBps: number;
}

interface RealLedger {
  positions: RealPos[];
  buys: { mint: string; lamports: string; at: number }[];
}

function ledgerFile(): string | null {
  const dir = localDir();
  return dir ? path.join(dir, "real-ledger.json") : null;
}

function posFrom(raw: unknown): RealPos | null {
  if (!raw || typeof raw !== "object") return null;
  const p = raw as Record<string, unknown>;
  if (typeof p.mint !== "string") return null;
  let lamportsIn = typeof p.lamportsIn === "string" && /^\d+$/.test(p.lamportsIn) ? p.lamportsIn : null;
  if (!lamportsIn && typeof p.solIn === "number" && Number.isFinite(p.solIn)) {
    lamportsIn = solToLamports(p.solIn.toFixed(9).replace(/0+$/, "").replace(/\.$/, ""));
  }
  if (!lamportsIn) return null;
  const soldBps = Number.isInteger(p.soldBps) ? Number(p.soldBps) : Math.round(Number(p.soldPct ?? 0) * 100);
  if (soldBps < 0 || soldBps > 10_000) return null;
  return {
    key: typeof p.key === "string" ? p.key : "",
    mint: p.mint,
    symbol: safeSymbol(p.symbol),
    lamportsIn,
    openedAt: typeof p.openedAt === "number" ? p.openedAt : 0,
    soldBps,
  };
}

function readLedger(): RealLedger {
  const file = ledgerFile();
  if (!file || !existsSync(file)) return { positions: [], buys: [] };
  try {
    const raw = JSON.parse(readFileSync(file, "utf8")) as { positions?: unknown; buys?: unknown };
    const positions = Array.isArray(raw.positions) ? raw.positions.map(posFrom).filter((p): p is RealPos => p != null) : [];
    const buys = Array.isArray(raw.buys)
      ? raw.buys.flatMap((b) => {
          if (!b || typeof b !== "object") return [];
          const row = b as Record<string, unknown>;
          const lamports = typeof row.lamports === "string" && /^\d+$/.test(row.lamports)
            ? row.lamports
            : typeof row.sol === "number" && Number.isFinite(row.sol)
              ? solToLamports(row.sol.toFixed(9).replace(/0+$/, "").replace(/\.$/, ""))
              : null;
          if (!lamports || typeof row.at !== "number") return [];
          return [{ mint: typeof row.mint === "string" ? row.mint : "", lamports, at: row.at }];
        })
      : [];
    return { positions, buys };
  } catch {
    return { positions: [], buys: [] };
  }
}

function writeLedger(book: RealLedger) {
  const dir = localDir();
  const file = ledgerFile();
  if (!dir || !file) return;
  mkdirSync(dir, { recursive: true });
  writeFileSync(file, `${JSON.stringify(book)}\n`, { mode: 0o600 });
}

export function ensureMcpToken(): string | null {
  const dir = localDir();
  if (!dir) return null;
  const file = path.join(dir, "mcp.token");
  if (existsSync(file)) {
    const token = readFileSync(file, "utf8").trim();
    return token.length >= 32 ? token : null;
  }
  mkdirSync(dir, { recursive: true, mode: 0o700 });
  const token = randomBytes(32).toString("hex");
  writeFileSync(file, `${token}\n`, { mode: 0o600 });
  try { chmodSync(dir, 0o700); chmodSync(file, 0o600); } catch { /* windows */ }
  return token;
}

export function readMcpToken(): string | null {
  const dir = localDir();
  if (!dir) return null;
  const file = path.join(dir, "mcp.token");
  if (!existsSync(file)) return null;
  const token = readFileSync(file, "utf8").trim();
  return token.length >= 32 ? token : null;
}

function switchFile(): string | null {
  const dir = localDir();
  return dir ? path.join(dir, "mcp.json") : null;
}

export function mcpEnabled(): boolean {
  const file = switchFile();
  if (!file || !existsSync(file)) return true;
  try {
    const raw = JSON.parse(readFileSync(file, "utf8")) as { enabled?: unknown };
    return raw.enabled !== false;
  } catch {
    return true;
  }
}

export function setMcpEnabled(enabled: boolean) {
  const dir = localDir();
  const file = switchFile();
  if (!dir || !file) return;
  mkdirSync(dir, { recursive: true });
  writeFileSync(file, `${JSON.stringify({ enabled })}\n`, { mode: 0o600 });
}

function auditFile(): string | null {
  const dir = localDir();
  return dir ? path.join(dir, "mcp-audit.json") : null;
}

export function readAudit(limit = 40): AuditRow[] {
  const file = auditFile();
  if (!file || !existsSync(file)) return [];
  try {
    const rows = JSON.parse(readFileSync(file, "utf8")) as AuditRow[];
    return Array.isArray(rows) ? rows.slice(-limit).reverse() : [];
  } catch {
    return [];
  }
}

function chainHash(prev: string, row: Pick<AuditRow, "at" | "tool" | "ok" | "code">): string {
  return createHash("sha256").update(`${prev}\n${row.at}\n${row.tool}\n${row.ok ? 1 : 0}\n${row.code}`).digest("hex");
}

export function auditOk(): boolean {
  const file = auditFile();
  if (!file || !existsSync(file)) return true;
  try {
    const rows = JSON.parse(readFileSync(file, "utf8")) as AuditRow[];
    if (!Array.isArray(rows)) return false;
    let prev = "";
    for (const row of rows) {
      if (!row || typeof row.hash !== "string") {
        prev = "";
        continue;
      }
      if (row.prev !== prev || row.hash !== chainHash(prev, row)) return false;
      prev = row.hash;
    }
    return true;
  } catch {
    return false;
  }
}

function appendAudit(row: Pick<AuditRow, "at" | "tool" | "ok" | "code">) {
  const dir = localDir();
  const file = auditFile();
  if (!dir || !file) return;
  const kept = readAudit(199).reverse().map(({ at, tool, ok, code }) => ({ at, tool, ok, code }));
  const rows = [...kept, row].slice(-200);
  let prev = "";
  const sealed: AuditRow[] = rows.map((item) => {
    const full: AuditRow = { ...item, prev, hash: chainHash(prev, item) };
    prev = full.hash ?? "";
    return full;
  });
  mkdirSync(dir, { recursive: true, mode: 0o700 });
  writeFileSync(file, `${JSON.stringify(sealed)}\n`, { mode: 0o600 });
}

export function forbiddenKey(value: unknown): boolean {
  if (!value || typeof value !== "object") return false;
  for (const [key, child] of Object.entries(value as Record<string, unknown>)) {
    if (FORBIDDEN.test(key)) return true;
    if (forbiddenKey(child)) return true;
  }
  return false;
}

function lamportsOf(sol: number): string | null {
  if (typeof sol !== "number" || !Number.isFinite(sol) || sol <= 0) return null;
  return solToLamports(sol.toFixed(9).replace(/0+$/, "").replace(/\.$/, ""));
}

function teamScores(mint: string) {
  const trail = trails.find((t) => t.coin.mint === mint);
  const guardEvent = trail?.events.find((e) => e.actor === "guard" || e.kind === "blocked");
  const modules = MODULES.map((id) => {
    if (!trail) return { id, available: false, score: null as number | null, veto: false, note: "not_in_local_book" };
    if (id === "scout" && trail.score) {
      return { id, available: true, score: Math.max(0, Math.min(100, trail.score.value)), veto: trail.score.value < trail.score.passMark, note: `pass ${trail.score.passMark}` };
    }
    if (id === "guard" && guardEvent) {
      const veto = guardEvent.kind === "blocked";
      return { id, available: true, score: veto ? 0 : 100, veto, note: guardEvent.reason ?? guardEvent.message };
    }
    return { id, available: false, score: null as number | null, veto: false, note: "not_computed_locally" };
  });
  return { mint, found: Boolean(trail), symbol: trail?.coin.untrusted.symbol ?? null, modules };
}

function realOpen(mint: string): RealPos[] {
  return readLedger().positions.filter((p) => p.soldBps < 10_000 && (!mint || p.mint === mint));
}

function spentToday(now: number): bigint {
  const start = new Date(now);
  start.setUTCHours(0, 0, 0, 0);
  return readLedger().buys.filter((b) => b.at >= start.getTime()).reduce((sum, b) => sum + BigInt(b.lamports), 0n);
}

function capitalUsed(): bigint {
  return readLedger().positions.filter((p) => p.soldBps < 10_000).reduce((sum, p) => {
    return sum + BigInt(p.lamportsIn) * BigInt(10_000 - p.soldBps) / 10_000n;
  }, 0n);
}

export function mcpStatus(now = Date.now()): Record<string, unknown> {
  return dispatch("centurion_status", {}, now);
}

export function mcpCall(tool: string, args: Record<string, unknown>, now = Date.now()): Record<string, unknown> {
  if (forbiddenKey(args)) {
    appendAudit({ at: new Date(now).toISOString(), tool, ok: false, code: "forbidden_field" });
    return { error: "forbidden_field" };
  }
  if (!mcpEnabled() && tool !== "centurion_status") {
    appendAudit({ at: new Date(now).toISOString(), tool, ok: false, code: "mcp_disabled" });
    return { error: "mcp_disabled" };
  }
  try {
    const data = dispatch(tool, args, now);
    appendAudit({ at: new Date(now).toISOString(), tool, ok: !("error" in data), code: String(data.error ?? "ok") });
    return data;
  } catch (error) {
    const code = error instanceof Error ? error.message : "error";
    appendAudit({ at: new Date(now).toISOString(), tool, ok: false, code });
    return { error: code };
  }
}

function num(args: Record<string, unknown>, key: string): number | undefined {
  const value = args[key];
  if (value === undefined) return undefined;
  if (typeof value !== "number" || !Number.isFinite(value)) throw new Error("invalid");
  return value;
}

function dispatch(tool: string, args: Record<string, unknown>, now: number): Record<string, unknown> {
  const trading = getTradingState();
  if (tool === "centurion_status") {
    const book = readBook();
    const paper = snapshot("practice");
    return {
      ok: true,
      mcp_enabled: mcpEnabled(),
      buys_paused: trading.buysPaused,
      trading_rev: trading.rev,
      real_enabled: book.enabled,
      paper_open: paper.positions.length,
      real_open: realOpen("").length,
      audit_ok: auditOk(),
    };
  }
  if (tool === "centurion_engine_stop") {
    const next = pauseBuys(trading.rev);
    return { ok: true, buys_paused: next.buysPaused, rev: next.rev };
  }
  if (tool === "centurion_engine_start") {
    const next = resumeBuys(trading.rev);
    return { ok: true, buys_paused: next.buysPaused, rev: next.rev };
  }
  if (tool === "centurion_list_positions") {
    const mode = args.mode === "real" ? "real" : "practice";
    if (mode === "real") {
      return {
        ok: true,
        mode,
        items: realOpen("").map((p) => ({ key: p.key, mint: p.mint, symbol: p.symbol, lamports_in: p.lamportsIn, sol_in: lamportsToSolInput(p.lamportsIn), sold_bps: p.soldBps })),
      };
    }
    return { ok: true, mode, items: listOpenPositions("practice").map((p) => ({ key: p.key, mint: p.mint, symbol: p.symbol, sol_in: p.solIn, sold_pct: p.soldPct, rev: p.rev })) };
  }
  if (tool === "centurion_pnl") {
    const paper = snapshot("practice");
    const closed = listClosedLedger().filter((row) => row.mode === "practice").slice(0, 30);
    return {
      ok: true,
      realized_sol: paper.realizedSol,
      unrealized_sol: paper.unrealizedSol,
      in_positions_sol: paper.inPositionsSol,
      open: paper.positions.length,
      recent: closed.map((row) => ({ symbol: row.symbol, pnl_sol: row.pnlSol, reason: row.reason, closed_at: row.closedAt })),
    };
  }
  if (tool === "centurion_team_scores") {
    const mint = String(args.mint ?? "");
    if (!/^[1-9A-HJ-NP-Za-km-z]{32,44}$/.test(mint)) return { error: "invalid" };
    return { ok: true, ...teamScores(mint) };
  }
  if (tool === "centurion_paper_buy") {
    if (trading.buysPaused) return { error: "buys_paused" };
    const sol = num(args, "sol");
    const mint = String(args.mint ?? "");
    const symbol = safeSymbol(args.symbol) || "TOKEN";
    if (sol === undefined || !Number.isFinite(sol) || sol <= 0) return { error: "invalid" };
    const pos = openLocalPaperBuy({ mint, symbol, sol }, now);
    return { ok: true, key: pos.key, mint: pos.mint, sol: pos.solIn };
  }
  if (tool === "centurion_paper_sell") {
    const key = String(args.key ?? "");
    const pos = listOpenPositions("practice").find((p) => p.key === key);
    if (!pos) return { error: "not_found" };
    const fraction = num(args, "fraction_bps") ?? 10_000;
    if (!Number.isInteger(fraction) || fraction < 1 || fraction > 10_000) return { error: "invalid" };
    closePosition(key, pos.rev, fraction, "practice", now);
    return { ok: true, key };
  }
  if (tool === "centurion_sell_all") {
    const mode = args.mode === "real" ? "real" : "practice";
    if (mode === "practice") return { ok: true, ...sellAllPractice(now) };
    if (!readBook().enabled) return { error: "real_off" };
    const ledger = readLedger();
    const sold = ledger.positions.filter((p) => p.soldBps < 10_000).map((p) => p.key);
    ledger.positions = ledger.positions.map((p) => ({ ...p, soldBps: 10_000 }));
    writeLedger(ledger);
    return { ok: true, sold };
  }
  if (tool === "centurion_real_buy" || tool === "centurion_real_sell") {
    const book = readBook();
    if (!book.enabled) return { error: "real_off" };
    const mint = String(args.mint ?? "");
    const symbol = safeSymbol(args.symbol) || "TOKEN";
    if (tool === "centurion_real_sell") {
      const ledger = readLedger();
      const key = typeof args.key === "string" ? args.key : "";
      if (mint && !/^[1-9A-HJ-NP-Za-km-z]{32,44}$/.test(mint)) return { error: "invalid" };
      if (!key && !mint) return { error: "invalid" };
      const pos = ledger.positions.find((p) => p.soldBps < 10_000 && (key ? p.key === key : p.mint === mint));
      if (!pos) return { error: "not_found" };
      pos.soldBps = 10_000;
      writeLedger(ledger);
      return { ok: true, key: pos.key };
    }
    if (!/^[1-9A-HJ-NP-Za-km-z]{32,44}$/.test(mint)) return { error: "invalid" };
    if (tool === "centurion_real_buy") {
      if (trading.buysPaused) return { error: "buys_paused" };
      const sol = num(args, "sol");
      const size = sol === undefined ? null : lamportsOf(sol);
      if (!size) return { error: "invalid" };
      const scores = teamScores(mint);
      const guard = scores.modules.find((m) => m.id === "guard");
      const scout = scores.modules.find((m) => m.id === "scout");
      if (guard?.available && guard.veto) return { error: "guard" };
      if (scout?.available && scout.veto) return { error: "scout" };
      const open = realOpen("");
      const refuse = admitBuy(book.global, {
        enabled: true,
        buysPaused: false,
        guardVerdict: guard?.available && guard.veto ? "fail" : "pass",
        riskVeto: null,
        openPositions: open.length,
        spentTodayLamports: spentToday(now).toString(),
        capitalUsedLamports: capitalUsed().toString(),
        tradeLamports: size,
        slippageBps: book.global.slippageBps,
        mcapUsd: null, liquidityUsd: null, volume24hUsd: null, top10Pct: null, holders: null, ageMinutes: null, lpBurnPct: null,
      });
      if (refuse) return { error: refuse };
      const ledger = readLedger();
      const key = `real:${now.toString(36)}:${mint.slice(0, 4)}`;
      ledger.positions.push({ key, mint, symbol, lamportsIn: size, openedAt: now, soldBps: 0 });
      ledger.buys.push({ mint, lamports: size, at: now });
      writeLedger(ledger);
      return { ok: true, key, mint, sol, lamports: size };
    }
  }
  if (tool === "centurion_get_settings") {
    const book = readBook();
    return {
      ok: true,
      mcp_enabled: mcpEnabled(),
      buys_paused: trading.buysPaused,
      real_enabled: book.enabled,
      wallet: book.wallet,
      rpc_url: book.rpcUrl,
      limits: book.global,
    };
  }
  if (tool === "centurion_update_settings") {
    const book = readBook();
    if (!book.enabled) return { error: "real_off" };
    let next: RealKnobs = scopeKnobs(book, "global") ?? book.global;
    const trade = num(args, "trade_sol");
    const daily = num(args, "daily_sol");
    const cap = num(args, "cap_sol");
    if (trade !== undefined) {
      const v = solToLamports(String(trade));
      if (!v) return { error: "invalid" };
      next = { ...next, tradeLamports: v };
    }
    if (daily !== undefined) {
      const v = solToLamports(String(daily));
      if (!v) return { error: "invalid" };
      next = { ...next, dailyLamports: v };
    }
    if (cap !== undefined) {
      const v = solToLamports(String(cap));
      if (!v) return { error: "invalid" };
      next = { ...next, capLamports: v };
    }
    const positions = num(args, "max_positions");
    const slippage = num(args, "slippage_pct");
    const stop = num(args, "stop_loss_pct");
    const trail = num(args, "trail_pct");
    const hold = num(args, "max_hold_minutes");
    if (positions !== undefined) next = { ...next, maxPositions: positions };
    if (slippage !== undefined) next = { ...next, slippageBps: Math.round(slippage * 100) };
    if (stop !== undefined) next = { ...next, stopLossPct: stop };
    if (trail !== undefined) next = { ...next, trailPct: trail };
    if (hold !== undefined) next = { ...next, maxHoldMinutes: hold };
    const applied = applyKnobsDirect(book, "global", next);
    if ("error" in applied) return { error: applied.error };
    let saved: RealBook = applied.book;
    if (typeof args.rpc_url === "string") {
      const rpc = setRpc(saved, args.rpc_url);
      if ("error" in rpc) return { error: rpc.error };
      saved = rpc.book;
    }
    writeBook(saved);
    return { ok: true, kind: applied.kind, limits: saved.global, rpc_url: saved.rpcUrl };
  }
  return { error: "unknown_tool" };
}

export const MCP_TOOL_NAMES = [
  "centurion_status",
  "centurion_engine_stop",
  "centurion_engine_start",
  "centurion_list_positions",
  "centurion_pnl",
  "centurion_team_scores",
  "centurion_paper_buy",
  "centurion_paper_sell",
  "centurion_sell_all",
  "centurion_real_buy",
  "centurion_real_sell",
  "centurion_get_settings",
  "centurion_update_settings",
] as const;
