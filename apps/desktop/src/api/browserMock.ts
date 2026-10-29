/**
 * Pure-browser fallback so designers can run `npm run dev` without Rust. Produces the same
 * view-model as the Rust reducer (contract.ts / view.rs, wire v1.1 value rules) at a much smaller
 * scale. Never used inside Tauri; the real mock backend (seq, resync, skew, If-Match/409) lives
 * in src-tauri/src/backend/mock.rs. Each browser window gets its own engine instance.
 */
import type {
  ActivityView,
  Actor,
  CandleView,
  CoreApi,
  Lamports,
  Mode,
  PickView,
  PositionView,
  SellQuote,
  Settings,
  Snapshot,
  StrategyView,
  TickView,
  Tone,
} from "./contract";
import { CONTRACTS_VERSION, EVT } from "./contract";

type Cb = (p: unknown) => void;
/** Browser preview of REAL chrome + gating: add ?mode=real to the URL (still mock). */
const MOCK_MODE: Mode = new URLSearchParams(location.search).get("mode") === "real" ? "real" : "practice";
const subs = new Map<string, Set<Cb>>();
const emit = (ev: string, p: unknown) => subs.get(ev)?.forEach((cb) => cb(p));

const SYMS = ["ORCA", "MOTH", "KITE", "BRRR", "ZAP", "FERN", "LUMA", "DUSK"];
const BUY: bigint = 250_000_000n;
const START: bigint = 30_000_000_000n;
/** Decimal string without exponent (wire rule for prices). */
const dec = (n: number) => n.toFixed(12).replace(/0+$/, "").replace(/\.$/, "");
const lam = (n: bigint): Lamports => n.toString();

const prices = new Map<string, number>();
const history = new Map<string, TickView[]>();
const signals: PickView[] = [];
const positions = new Map<string, PositionView>();
const activity: ActivityView[] = [];
let strategies: StrategyView[] = [
  { id: "20000000-0000-0000-0000-00000000000a", name: "Mock · Curve", rev: 1, status: "active" },
  { id: "20000000-0000-0000-0000-00000000000b", name: "Mock · AMM", rev: 1, status: "active" },
];
let settings: Settings = {
  theme: "dark",
  density: "compact",
  approval_popup: false,
  shortcuts: { focus_terminal: "CommandOrControl+Shift+H", open_approvals: "CommandOrControl+Shift+A" },
};
let seq = 18_000;
let cash = START;
let epoch = 1;
const quotes = new Map<string, SellQuote>();

const fakeMint = () =>
  Array.from({ length: 44 }, () => "123456789ABCDEFGHJKLMNPQRSTUVWXYZabcdefghijkmnopqrstuvwxyz"[Math.floor(Math.random() * 58)]).join("");

function account() {
  let value = 0n;
  let cost = 0n;
  for (const p of positions.values()) {
    value += BigInt(p.value_lamports);
    cost += BigInt(p.cost_lamports);
  }
  return {
    cash_lamports: lam(cash),
    equity_lamports: lam(cash + value),
    unrealized_pnl_lamports: lam(value - cost),
    drawdown_pct: 0,
    as_of_seq: seq,
    epoch,
    workspace_rev: epoch,
    notice: null,
    deleted: false,
  };
}

function log(actor: Actor, kind: string, tone: Tone, mint: string | null, symbol: string | null, message: string) {
  const ts = Date.now();
  seq += 1;
  const ev: ActivityView = { id: `${mint ?? "sys"}:${ts}:${kind}:${seq}`, seq, ts_ms: ts, actor, kind, tone, mint, symbol, message };
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
  const st = strategies[seq % strategies.length];
  const s: PickView = {
    id: `30000000-0000-4000-8000-${String(seq).padStart(12, "0")}`,
    version: 1,
    ck: mint.slice(0, 8),
    mint,
    strategy_id: st.id,
    strategy: st.name,
    symbol,
    name: `${symbol} (mock)`,
    summary: "Beli 0.25 SOL (paper)",
    score: 60 + Math.floor(Math.random() * 50),
    score_threshold: 70,
    reasons: ["liquidity ok", "top holders < 30%", "lp burned"],
    guard_verdict: "PASS",
    amount_lamports: lam(BUY),
    first_buy: true,
    price_sol: dec(price),
    price_usd: dec(price * 150),
    liquidity_usd: 5000 + Math.random() * 40000,
    created_at: new Date(now).toISOString(),
    expires_at: new Date(now + 90_000).toISOString(),
    created_at_ms: now,
    expires_at_ms: now + 90_000,
    status: "pending",
    expired_reason: null,
  };
  signals.unshift(s);
  log("screener", "proposal.created", "info", mint, symbol, `Fit ${s.score}/${s.score_threshold} — menunggu approval`);
  emit(EVT.signalNew, s);
}

function revalue(p: PositionView, price: number) {
  const entry = Number(p.entry_price_sol);
  const qty = Number(p.qty_raw) / 1e6;
  const value = BigInt(Math.round(qty * price * 1e9));
  p.last_price_sol = dec(price);
  if (price > Number(p.peak_price_sol)) p.peak_price_sol = dec(price);
  p.value_lamports = lam(value);
  p.pnl_lamports = lam(value - BigInt(p.cost_lamports));
  p.pnl_pct = Math.round((Number(value - BigInt(p.cost_lamports)) / Number(p.cost_lamports)) * 10_000) / 100;
  p.ratio = price / entry;
  p.peak_ratio = Number(p.peak_price_sol) / entry;
}

function tickAll() {
  const t = Math.floor(Date.now() / 1000);
  const batch: TickView[] = [];
  for (const [mint, p] of prices) {
    const np = Math.max(1e-9, p * (1 + (Math.random() - 0.48) * 0.04));
    prices.set(mint, np);
    const tick: TickView = { mint, time: t, price_sol: dec(np) };
    const h = history.get(mint)!;
    h.push(tick);
    if (h.length > 2000) h.shift();
    batch.push(tick);
    for (const pos of positions.values()) if (pos.mint === mint) revalue(pos, np);
  }
  emit(EVT.ticks, batch);
  if (positions.size) {
    emit(EVT.positions, [...positions.values()]);
    emit(EVT.account, account());
  }
  const now = Date.now();
  for (const s of signals) {
    if (s.status === "pending" && s.expires_at_ms < now) {
      s.status = "expired";
      s.expired_reason = "timeout";
      s.version += 1;
      emit(EVT.signalUpdate, s);
      log("system", "proposal.expired", "neutral", s.mint, s.symbol, "Expired: timeout");
    }
  }
}

let started = false;
function start() {
  if (started) return;
  started = true;
  log("system", "system.notice", "info", null, null, "Browser mock engine started (no Rust, no network)");
  spawnSignal();
  setInterval(spawnSignal, 9000);
  setInterval(tickAll, 1000);
}

function toCandles(mint: string): CandleView[] {
  const out: CandleView[] = [];
  for (const t of history.get(mint) ?? []) {
    const b = t.time - (t.time % 5);
    const last = out[out.length - 1];
    if (last && last.time === b) {
      if (Number(t.price_sol) > Number(last.high)) last.high = t.price_sol;
      if (Number(t.price_sol) < Number(last.low)) last.low = t.price_sol;
      last.close = t.price_sol;
    } else out.push({ time: b, open: t.price_sol, high: t.price_sol, low: t.price_sol, close: t.price_sol });
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
      account: account(),
      strategies,
      sync: { workspace_id: "browser-mock", watermark: seq, gaps_seen: 0, resyncs: 0, recovered: 0, duplicates: 0, ignored: 0, reconnects: 0, skew_ms: 0 },
      contracts_version: CONTRACTS_VERSION,
    };
  },
  async candles(mint) {
    return toCandles(mint);
  },
  async approveSignal(id) {
    if (MOCK_MODE === "real" && location.hash.startsWith("#/popup")) throw new Error("REAL SOL: approve hanya dari window utama (Buka untuk approve)");
    const s = signals.find((x) => x.id === id && x.status === "pending");
    if (!s) throw new Error("signal not pending");
    s.status = "approved";
    s.version += 1;
    emit(EVT.signalUpdate, s);
    log("user", "proposal.approved", "good", s.mint, s.symbol, "Approved (via desktop)");
    const p = prices.get(s.mint) ?? Number(s.price_sol);
    const key = `${s.ck}.0`;
    const qtyRaw = BigInt(Math.floor((0.25 / p) * 1e6));
    positions.set(key, {
      key, ck: s.ck, mint: s.mint, strategy_id: s.strategy_id, strategy: s.strategy, symbol: s.symbol,
      qty_raw: qtyRaw.toString(), cost_lamports: lam(BUY), value_lamports: lam(BUY), pnl_lamports: "0", realized_lamports: "0",
      pnl_pct: 0, entry_price_sol: dec(p), last_price_sol: dec(p), peak_price_sol: dec(p), ratio: 1, peak_ratio: 1,
      opened_at_ms: Date.now(), plan_state: null, rev: null,
    });
    cash -= BUY;
    log("executor", "position.opened", "good", s.mint, s.symbol, "Posisi dibuka 0.25 SOL");
    emit(EVT.positions, [...positions.values()]);
    emit(EVT.account, account());
  },
  async approveMany(ids) {
    for (const id of ids) await browserMockAdapter.approveSignal(id).catch(() => undefined);
  },
  async skipSignal(id) {
    const s = signals.find((x) => x.id === id && x.status === "pending");
    if (!s) throw new Error("signal not pending");
    s.status = "rejected";
    s.version += 1;
    emit(EVT.signalUpdate, s);
    log("user", "proposal.rejected", "neutral", s.mint, s.symbol, "Skipped (via desktop)");
  },
  async requestSell(positionKey, pct) {
    const pos = positions.get(positionKey);
    if (!pos) throw new Error("no position");
    const out = (BigInt(pos.value_lamports) * BigInt(pct) * 9875n) / 1_000_000n;
    const q: SellQuote = { nonce: `n-${seq++}`, position_key: positionKey, mint: pos.mint, symbol: pos.symbol, pct, est_sol_out_lamports: lam(out), ttl_ms: 15000 };
    quotes.set(q.nonce, q);
    return q;
  },
  async confirmSell(nonce) {
    const q = quotes.get(nonce);
    quotes.delete(nonce);
    if (!q) throw new Error("quote expired");
    positions.delete(q.position_key);
    cash += BigInt(q.est_sol_out_lamports);
    log("user", "position.closed", "info", q.mint, q.symbol, `Jual manual ${q.pct}%`);
    emit(EVT.positions, [...positions.values()]);
    emit(EVT.account, account());
  },
  async setStrategyPaused(id, paused, baseRev) {
    const s = strategies.find((x) => x.id === id);
    if (!s) throw new Error("NOT_FOUND");
    if (s.rev !== baseRev) throw new Error("STRATEGY_REV_CONFLICT");
    const next = { ...s, rev: s.rev + 1, status: paused ? "paused" : "active" };
    strategies = strategies.map((x) => (x.id === id ? next : x));
    emit(EVT.strategies, strategies);
    return next;
  },
  async resetPractice() {
    positions.clear();
    cash = START;
    epoch += 1;
    emit(EVT.positions, []);
    emit(EVT.account, account());
    log("user", "practice.reset", "info", null, null, `Practice direset → epoch ${epoch} · saldo 30 SOL`);
  },
  async coinTimeline(mint) {
    return activity.filter((a) => a.mint === mint).map((a) => ({ seq: a.seq ?? 0, ts: new Date(a.ts_ms).toISOString(), kind: a.kind, actor: a.actor }));
  },
  async exitReasonStats() {
    return [];
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
