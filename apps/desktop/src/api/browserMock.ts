/**
 * Pure-browser fallback so designers can run `npm run dev` without Rust.
 * Mirrors the Rust mock engine at a much smaller scale. Never used inside Tauri.
 * Note: each browser window gets its own engine instance (Tauri shares one in Rust).
 */
import type { ActivityEvent, Candle, CoreApi, Mode, Position, SellQuote, Settings, Signal, Snapshot, Tick } from "./contract";
import { EVT } from "./contract";

type Cb = (p: unknown) => void;
/** Browser preview of REAL chrome + gating: add ?mode=real to the URL (still mock). */
const MOCK_MODE: Mode = new URLSearchParams(location.search).get("mode") === "real" ? "real" : "practice";
const subs = new Map<string, Set<Cb>>();
const emit = (ev: string, p: unknown) => subs.get(ev)?.forEach((cb) => cb(p));

const SYMS = ["ORCA", "MOTH", "KITE", "BRRR", "ZAP", "FERN", "LUMA", "DUSK"];
const prices = new Map<string, number>();
const history = new Map<string, Tick[]>();
const signals: Signal[] = [];
const positions = new Map<string, Position>();
const activity: ActivityEvent[] = [];
let settings: Settings = {
  theme: "dark",
  density: "compact",
  approvalPopup: false,
  shortcuts: { focusTerminal: "CommandOrControl+Shift+H", openApprovals: "CommandOrControl+Shift+A" },
};
let seq = 0;
let cash = 30;
const quotes = new Map<string, SellQuote>();

const fakeMint = () =>
  Array.from({ length: 44 }, () => "123456789ABCDEFGHJKLMNPQRSTUVWXYZabcdefghijkmnopqrstuvwxyz"[Math.floor(Math.random() * 58)]).join("");

function log(actor: ActivityEvent["actor"], kind: ActivityEvent["kind"], mint: string | null, symbol: string | null, message: string) {
  const ts = Date.now();
  const ev: ActivityEvent = { id: `${mint ?? "sys"}:${ts}:${kind}:${seq++}`, ts, actor, kind, mint, symbol, message };
  activity.unshift(ev);
  activity.length = Math.min(activity.length, 300);
  emit(EVT.activity, ev);
}

function spawnSignal() {
  const mint = fakeMint();
  const symbol = SYMS[Math.floor(Math.random() * SYMS.length)];
  const price = 0.00001 + Math.random() * 0.001;
  prices.set(mint, price);
  history.set(mint, []);
  const now = Date.now();
  const s: Signal = {
    id: `sig-${seq++}`,
    mint,
    symbol,
    name: `${symbol} (mock)`,
    strategy: "Mock · New Pairs",
    score: 60 + Math.floor(Math.random() * 50),
    passMark: 70,
    priceUsd: price,
    marketCapUsd: price * 1e9,
    liquidityUsd: 5000 + Math.random() * 40000,
    ageMinutes: Math.floor(Math.random() * 90),
    reasons: ["liquidity ok", "top10 < 30%", "lp burned"],
    createdAt: now,
    expiresAt: now + 90_000,
    stage: "pending",
    expiredReason: null,
  };
  signals.unshift(s);
  log("screener", "passed", mint, symbol, `Fit ${s.score}/${s.passMark}`);
  emit(EVT.signalNew, s);
}

function tickAll() {
  const t = Math.floor(Date.now() / 1000);
  const batch: Tick[] = [];
  for (const [mint, p] of prices) {
    const np = Math.max(1e-9, p * (1 + (Math.random() - 0.48) * 0.04));
    prices.set(mint, np);
    const tick: Tick = { mint, time: t, price: np, volume: Math.random() * 10 };
    const h = history.get(mint)!;
    h.push(tick);
    if (h.length > 2000) h.shift();
    batch.push(tick);
    const pos = positions.get(mint);
    if (pos) {
      pos.lastPriceUsd = np;
      pos.peakPriceUsd = Math.max(pos.peakPriceUsd, np);
      pos.pnlPct = (np / pos.entryPriceUsd - 1) * 100;
    }
  }
  emit(EVT.ticks, batch);
  if (positions.size) emit(EVT.positions, [...positions.values()]);
  const now = Date.now();
  for (const s of signals) {
    if (s.stage === "pending" && s.expiresAt < now) {
      s.stage = "expired";
      s.expiredReason = "timed_out";
      emit(EVT.signalUpdate, s);
      log("entry", "expired", s.mint, s.symbol, "Expired: timed_out");
    }
  }
}

let started = false;
function start() {
  if (started) return;
  started = true;
  log("system", "info", null, null, "Browser mock engine started (no Rust, no network)");
  spawnSignal();
  setInterval(spawnSignal, 9000);
  setInterval(tickAll, 1000);
}

function toCandles(mint: string): Candle[] {
  const out: Candle[] = [];
  for (const t of history.get(mint) ?? []) {
    const b = t.time - (t.time % 5);
    const last = out[out.length - 1];
    if (last && last.time === b) {
      last.high = Math.max(last.high, t.price);
      last.low = Math.min(last.low, t.price);
      last.close = t.price;
    } else out.push({ time: b, open: t.price, high: t.price, low: t.price, close: t.price });
  }
  return out;
}

export const browserMockAdapter: CoreApi = {
  async snapshot(): Promise<Snapshot> {
    start();
    return {
      mode: MOCK_MODE,
      connected: true,
      source: "mock",
      signals: [...signals],
      positions: [...positions.values()],
      activity: [...activity],
      settings,
      paperCashSol: cash,
    };
  },
  async candles(mint) {
    return toCandles(mint);
  },
  async approveSignal(id) {
    if (MOCK_MODE === "real" && location.hash.startsWith("#/popup")) throw new Error("REAL SOL: approve hanya dari window utama (Buka untuk approve)");
    const s = signals.find((x) => x.id === id && x.stage === "pending");
    if (!s) throw new Error("signal not pending");
    s.stage = "approved";
    emit(EVT.signalUpdate, s);
    log("you", "approved", s.mint, s.symbol, "Approved");
    const p = prices.get(s.mint) ?? s.priceUsd;
    positions.set(s.mint, { mint: s.mint, symbol: s.symbol, strategy: s.strategy, qty: 0.25 / p, entryPriceUsd: p, lastPriceUsd: p, peakPriceUsd: p, solIn: 0.25, pnlPct: 0, openedAt: Date.now() });
    cash -= 0.25;
    emit(EVT.account, cash);
    log("executor", "bought", s.mint, s.symbol, "Paper buy 0.25 SOL");
    emit(EVT.positions, [...positions.values()]);
  },
  async approveMany(ids) {
    for (const id of ids) await browserMockAdapter.approveSignal(id).catch(() => undefined);
  },
  async skipSignal(id) {
    const s = signals.find((x) => x.id === id && x.stage === "pending");
    if (!s) throw new Error("signal not pending");
    s.stage = "skipped";
    emit(EVT.signalUpdate, s);
    log("you", "skipped", s.mint, s.symbol, "Skipped");
  },
  async requestSell(mint, pct) {
    const pos = positions.get(mint);
    if (!pos) throw new Error("no position");
    const q: SellQuote = { nonce: `n-${seq++}`, mint, symbol: pos.symbol, pct, estSolOut: pos.solIn * (1 + pos.pnlPct / 100) * (pct / 100), ttlMs: 15000 };
    quotes.set(q.nonce, q);
    return q;
  },
  async confirmSell(nonce) {
    const q = quotes.get(nonce);
    quotes.delete(nonce);
    if (!q) throw new Error("quote expired");
    positions.delete(q.mint);
    cash += q.estSolOut;
    emit(EVT.account, cash);
    log("you", "sold", q.mint, q.symbol, `Paper sell ${q.pct}% ≈ ${q.estSolOut.toFixed(4)} SOL`);
    emit(EVT.positions, [...positions.values()]);
  },
  async openChartWindow(mint) {
    window.open(`${location.pathname}#/chart?mint=${mint}`, "_blank", "width=900,height=560");
  },
  async openActivityWindow() {
    window.open(`${location.pathname}#/activity`, "_blank", "width=480,height=720");
  },
  async openApprovalWindow() {
    window.open(`${location.pathname}#/popup`, "_blank", "width=360,height=232");
  },
  async focusMainForSignal(id) {
    // Browser preview: popup and main are separate tabs with separate mock state; just signal it.
    emit(EVT.focusSignal, id);
  },
  async hideApprovalPopup() {
    if (location.hash.startsWith("#/popup")) window.close();
  },
  async setSettings(next) {
    settings = next;
    emit(EVT.settings, next);
    return next;
  },
  async on(event, cb) {
    if (!subs.has(event)) subs.set(event, new Set());
    subs.get(event)!.add(cb as Cb);
    return () => subs.get(event)!.delete(cb as Cb);
  },
};
