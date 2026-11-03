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
  ScreenedCoin,
  SellQuote,
  Settings,
  Snapshot,
  StrategyView,
  TickView,
  Tone,
} from "./contract";
import { CONTRACTS_VERSION, EVT, type ApprovalRejectReason } from "./contract";
let lastResetMs: number | null = null;

type Cb = (p: unknown) => void;
/** Browser preview of REAL chrome + gating: add ?mode=real to the URL (still mock). */
const MOCK_MODE: Mode = new URLSearchParams(location.search).get("mode") === "real" ? "real" : "practice";
/** WF-20 trigger (same values as CENTURION_MOCK_NOT_TRADEABLE): ?nt=screener (default) | race | off. */
const NT = (new URLSearchParams(location.search).get("nt") ?? "screener") as "screener" | "race" | "off";
const USDC = "EPjFWdd5AufqSSqeM2qN1xzybapC8G4wEGGkZwyTDt1v";
const TRADEABLE = { tradeable: true, reason_code: null, quote_mint: null, quote_symbol: null } as const;
const NOT_TRADEABLE = { tradeable: false, reason_code: "UNSUPPORTED_QUOTE_MINT", quote_mint: USDC, quote_symbol: "USDC" } as const;
const screened: ScreenedCoin[] = [];
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
  { id: "20000000-0000-0000-0000-00000000000a", name: "Mock · Curve", rev: 1, status: "active", time_stop_s: 600, stall_exit: { window_s: 90, min_move_pct: "1" } },
  { id: "20000000-0000-0000-0000-00000000000b", name: "Mock · AMM", rev: 1, status: "active", time_stop_s: null, stall_exit: null },
];
let settings: Settings = {
  theme: "dark",
  density: "compact",
  approval_popup: false,
  locale: "id",
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
    as_of_seq: String(seq),
    epoch,
    workspace_rev: epoch,
    notice: null,
    deleted: false,
    entries_paused: null,
  };
}

function log(actor: Actor, kind: string, tone: Tone, mint: string | null, symbol: string | null, message: string) {
  const ts = Date.now();
  seq += 1;
  const ev: ActivityView = { id: `${mint ?? "sys"}:${ts}:${kind}:${seq}`, seq: String(seq), ts_ms: ts, actor, kind, tone, mint, symbol, message };
  activity.unshift(ev);
  activity.length = Math.min(activity.length, 300);
  emit(EVT.activity, ev);
}

/** 1.1.6 shape (mock): ~70 % bundled logos, ~10 % a hash with no file (→ identicon), rest none. */
function mockLogoHash(mint: string): string | null {
  let h = 0x811c9dc5;
  for (const b of new TextEncoder().encode(mint)) h = Math.imul(h ^ b, 0x01000193) >>> 0;
  const r = h % 10;
  return r <= 6 ? `mocklogo${h % 5}` : r === 7 ? "mocklogo-missing" : null;
}

function spawnSignal() {
  const mint = fakeMint();
  const symbol = SYMS[Math.floor(Math.random() * SYMS.length)];
  const price = 0.00001 + Math.random() * 0.001;
  prices.set(mint, price);
  history.set(mint, []);
  const now = Date.now();
  const st = strategies[seq % strategies.length];
  const score = 60 + Math.floor(Math.random() * 40);
  const nonSol = NT !== "off" && Math.random() < 0.25;
  const row: ScreenedCoin = {
    logo_hash: mockLogoHash(mint),
    ck: mint.slice(0, 8), mint, symbol, name: `${symbol} (mock)`, venue: Math.random() < 0.5 ? "curve" : "amm", strategy: st.name,
    score, score_threshold: 70, max_score: 100, passed: score >= 70, guard_verdict: nonSol || score < 70 ? null : "PASS",
    status: nonSol ? "not_tradeable" : score >= 70 ? "pick" : "rejected_score", liquidity_usd: 5000 + Math.random() * 40000,
    decimals: 6, token_program: "TokenkegQfeZyiNwAJbNbGKPFXCWuBvf9Ss623VQ5DA", ts_ms: now, ...(nonSol ? NOT_TRADEABLE : TRADEABLE),
    // 1.1.4 MarketCapFields: price (SOL/token) × 1e9 supply; ~10 % unknown → null.
    ...(Math.random() < 0.1
      ? { market_cap_lamports: null, mcap_usd: null, mcap_as_of: null }
      : { market_cap_lamports: String(Math.round(price * 1e9 * 1e9)), mcap_usd: (price * 1e9 * 150).toFixed(2), mcap_as_of: new Date(now).toISOString() }),
  };
  screened.unshift(row);
  screened.length = Math.min(screened.length, 150);
  emit(EVT.screened, row);
  // not tradeable → screener row only: never queued, never pushed (WF-20)
  if (nonSol || score < 70) return log("screener", "screener.scored", "neutral", mint, symbol, nonSol ? "Tidak bisa ditradingkan (UNSUPPORTED_QUOTE_MINT)" : `Fit ${score}/70`);
  const s: PickView = {
    logo_hash: mockLogoHash(mint),
    id: `30000000-0000-4000-8000-${String(seq).padStart(12, "0")}`,
    rev: 1,
    ...TRADEABLE,
    ck: mint.slice(0, 8),
    mint,
    strategy_id: st.id,
    strategy: st.name,
    symbol,
    name: `${symbol} (mock)`,
    summary: "Beli 0.25 SOL (paper)",
    score,
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
    ...mockQuote(now),
    quote_stale: false,
  };
  signals.unshift(s);
  log("screener", "proposal.created", "info", mint, symbol, `Fit ${s.score}/${s.score_threshold} — menunggu approval`);
  emit(EVT.signalNew, s);
  // race: the pool "migrates" to a non-SOL quote ~8 s later → card + position become not tradeable
  if (NT === "race" && Math.random() < 0.5) setTimeout(() => flip(mint), 8000);
}

/** 1.1.4 ProposalQuoteFields (mock): 30 s quote, re-quoted every 15 s while pending (silent rev bump). */
const QUOTE_TTL_MS = 30_000;
function mockQuote(now: number) {
  const fee = 5000n + 20000n;
  return {
    est_network_fee_lamports: lam(fee), priority_fee_lamports: lam(20000n), swap_fee_bps: 25, max_slippage_bps: 300,
    min_out_raw: String(Math.round(Number(BUY) * 0.97 * 1000)), total_max_lamports: lam(BUY + fee),
    quote_ts: new Date(now).toISOString(), quote_expires_at: new Date(now + QUOTE_TTL_MS).toISOString(),
    quote_id: String(now), est_ata_rent_lamports: "0", // 1.1.5 (re-quote = new quote_id, same rev)
  };
}
setInterval(() => {
  const now = Date.now();
  for (const s of signals) {
    // ~1 in 4 cards is left un-refreshed so the stale state is reachable in the browser preview
    if (s.status !== "pending" || s.quote_stale || s.id.endsWith("3") ) continue;
    Object.assign(s, mockQuote(now)); // 1.1.5: no rev bump
    emit(EVT.signalUpdate, s);
  }
}, 15_000);

function flip(mint: string) {
  for (const s of signals) if (s.mint === mint) Object.assign(s, NOT_TRADEABLE), emit(EVT.signalUpdate, s);
  for (const p of positions.values()) if (p.mint === mint) Object.assign(p, NOT_TRADEABLE);
  const r = screened.find((x) => x.mint === mint);
  if (r) Object.assign(r, NOT_TRADEABLE, { status: "not_tradeable" }), emit(EVT.screened, r);
  emit(EVT.positions, [...positions.values()]);
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
      s.rev += 1;
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
      logo_origin: "https://logo.mock.invalid",
      mode: MOCK_MODE,
      connected: true,
      source: "mock",
      signals: [...signals],
      positions: [...positions.values()],
      activity: [...activity],
      screened: [...screened],
      settings,
      account: account(),
      strategies,
      sync: { workspace_id: "browser-mock", watermark: String(seq), gaps_seen: 0, resyncs: 0, recovered: 0, duplicates: 0, ignored: 0, reconnects: 0, skew_ms: 0 },
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
    if (!s.tradeable) throw new Error("UNSUPPORTED_QUOTE_MINT: coin tidak bisa ditradingkan");
    s.status = "approved";
    s.rev += 1;
    emit(EVT.signalUpdate, s);
    log("user", "proposal.approved", "good", s.mint, s.symbol, "Approved (via desktop)");
    const p = prices.get(s.mint) ?? Number(s.price_sol);
    const key = `${s.ck}.0`;
    const qtyRaw = BigInt(Math.floor((0.25 / p) * 1e6));
    positions.set(key, {
      key, ck: s.ck, mint: s.mint, logo_hash: s.logo_hash ?? null, strategy_id: s.strategy_id, strategy: s.strategy, symbol: s.symbol,
      qty_raw: qtyRaw.toString(), cost_lamports: lam(BUY), value_lamports: lam(BUY), pnl_lamports: "0", realized_lamports: "0",
      pnl_pct: 0, entry_price_sol: dec(p), last_price_sol: dec(p), peak_price_sol: dec(p), ratio: 1, peak_ratio: 1,
      opened_at_ms: Date.now(), plan_state: null, rev: 1, position_id: `50000000-0000-4000-8000-${String(seq).padStart(12, "0")}`, decimals: 6, ...TRADEABLE,
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
    s.rev += 1;
    emit(EVT.signalUpdate, s);
    // contracts 1.1.3 reject_reason: not_tradeable for a not-tradeable card, else user_declined.
    const rejectReason: ApprovalRejectReason = !s.tradeable ? "not_tradeable" : "user_declined";
    log("user", "proposal.rejected", "neutral", s.mint, s.symbol, `Skipped · ${rejectReason} (via desktop)`);
  },
  async requestSell(positionKey, pct) {
    const pos = positions.get(positionKey);
    if (!pos) throw new Error("no position");
    if (!pos.tradeable) throw new Error("UNSUPPORTED_QUOTE_MINT: coin tidak bisa ditradingkan");
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
  async refreshQuote(id) {
    const s = signals.find((x) => x.id === id && x.status === "pending");
    if (!s) throw new Error("NOT_FOUND");
    Object.assign(s, mockQuote(Date.now()), { quote_stale: false });
    emit(EVT.signalUpdate, s);
  },
  async patchStrategy(id, patch) {
    const s = strategies.find((x) => x.id === id);
    if (!s) throw new Error("NOT_FOUND");
    // loosening a guard (mock rule: any lower threshold or guard_checks=false) → 202 waiting for approval
    const weak = Object.keys(patch).filter((k) => (k === "guard_checks" && patch[k] === false) || (k === "score_threshold" && Number(patch[k]) < 70));
    if (weak.length) return { status: "pending_approval", proposal_id: crypto.randomUUID(), expires_at: new Date(Date.now() + 600_000).toISOString(), fields: weak };
    const next = { ...s, rev: s.rev + 1 };
    strategies = strategies.map((x) => (x.id === id ? next : x));
    emit(EVT.strategies, strategies);
    return { status: "applied", rev: next.rev };
  },
  async authStatus() {
    return { mode: "mock", state: "signed_in", address: null, workspace_id: null };
  },
  async authLogin() {},
  async authLogout() {},
  async stopTrading(_mode, _source, confirm) {
    if (confirm !== "STOP") throw new Error("VALIDATION_FAILED: stop confirm");
    const paused: string[] = [], already: string[] = [];
    strategies = strategies.map((x) => (x.status === "paused" ? (already.push(x.id), x) : (paused.push(x.id), { ...x, rev: x.rev + 1, status: "paused" })));
    emit(EVT.strategies, strategies);
    return { paused, already_paused: already, failed: [] };
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
    // 429 RESET_COOLDOWN + Retry-After (once per 24 h), same "[k=v]" shape the Rust transport surfaces.
    const now = Date.now();
    if (lastResetMs != null && now - lastResetMs < 86_400_000) {
      const next = lastResetMs + 86_400_000;
      throw new Error(`RESET_COOLDOWN: Practice can be reset once per 24 h [next_allowed_at=${new Date(next).toISOString()}] [retry_after_s=${Math.ceil((next - now) / 1000)}]`);
    }
    lastResetMs = now;
    positions.clear();
    cash = START;
    epoch += 1;
    emit(EVT.positions, []);
    emit(EVT.account, account());
    log("user", "practice.reset", "info", null, null, `Practice direset → epoch ${epoch} · saldo 30 SOL`);
  },
  async coinTimeline(mint) {
    return activity.filter((a) => a.mint === mint).map((a) => ({ seq: a.seq ?? "0", ts: new Date(a.ts_ms).toISOString(), kind: a.kind, actor: a.actor }));
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
