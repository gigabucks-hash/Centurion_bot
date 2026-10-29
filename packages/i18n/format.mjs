// Sentra reference formatters (Web: import as-is; Flutter: mirror with package:intl NumberFormat/DateFormat).
// Rule: the locale used for numbers == the UI language. Never mix (EN UI + id-ID numbers = bug QA-01).
// Domain values are formatted here and passed to ICU messages as string args ({sol}, {pnl}, {pct}, {price}, {time}).
export const LOCALES = { en: 'en-US', id: 'id-ID' };
const nf = (loc, o) => new Intl.NumberFormat(LOCALES[loc] ?? loc, o);
/** SOL amount. Rule "no 3-decimal ambiguity": when |v| ≥ 1 show exactly 2 dp (27.53), because "27.533" vs "27,533"
 *  reads as a thousands group in the other locale. |v| < 1 → 2–4 dp (0.24; pnl 3–4 dp: −0.066); |v| < 0.01 → up to 6 dp.
 *  kind 'pnl' adds a sign (+/−, zero unsigned). paper=true → "paper SOL" (Practice; never a bare "SOL"). */
export function formatSol(v, loc, { kind = 'amount', paper = false } = {}) {
  const unit = `\u00A0${paper ? 'paper SOL' : 'SOL'}`;     // NBSP: number never wraps away from its unit
  if (kind === 'pnl') return pnlSol(v, loc, { paper }).text;
  const a = Math.abs(v);
  const o = a >= 1 ? { minimumFractionDigits: 2, maximumFractionDigits: 2 }
          : { minimumFractionDigits: 2, maximumFractionDigits: a < 0.01 && a > 0 ? 6 : 4 };
  return nf(loc, o).format(v).replace('-', '\u2212') + unit;  // true minus, same width as +
}
/** T-15 PnL display rule (SPEC §1 "PnL"):
 *  - EXACT zero (0, −0, "0" lamports) → "0.00", tone neutral, no arrow, no sign.
 *  - non-zero → sign (+ / U+2212) + arrow (▲/▼) + profit/loss tone; never rendered as "0"/"±0":
 *    |v| ≥ 1 → 2 dp; < 1 → 3–4 dp; < 0.01 → up to 6 dp; < 0.000001 → "<0.000001" (still signed + toned).
 *  Tone is decided on the exact value, so color, arrow and text can never disagree.
 *  Returns { text, tone: 'profit'|'loss'|'neutral', arrow: '▲'|'▼'|'', sign: '+'|'−'|'' }. */
export function pnlSol(v, loc, { paper = false } = {}) {
  const unit = `\u00A0${paper ? 'paper SOL' : 'SOL'}`;
  if (typeof v === 'string' || typeof v === 'bigint') v = lamportsToSol(v);   // lamports wire value
  if (v === 0 || Object.is(v, -0) || !Number.isFinite(v)) return { text: nf(loc, { minimumFractionDigits: 2, maximumFractionDigits: 2 }).format(0) + unit, tone: 'neutral', arrow: '', sign: '' };
  const a = Math.abs(v), pos = v > 0, sign = pos ? '+' : '\u2212';
  let body;
  if (a < 0.000001) body = '<' + nf(loc, { minimumFractionDigits: 6, maximumFractionDigits: 6 }).format(0.000001);
  else body = nf(loc, a >= 1 ? { minimumFractionDigits: 2, maximumFractionDigits: 2 } : { minimumFractionDigits: 3, maximumFractionDigits: a < 0.01 ? 6 : 4 }).format(a);
  return { text: sign + body + unit, tone: pos ? 'profit' : 'loss', arrow: pos ? '\u25B2' : '\u25BC', sign };
}
/** Same rule for PnL percent (ratio in): exact 0 → "0.0%" neutral; non-zero that rounds to 0 at dp → "<0.1%" signed. */
export function pnlPct(r, loc, { dp = 1 } = {}) {
  if (r === 0 || Object.is(r, -0) || !Number.isFinite(r)) return { text: nf(loc, { style: 'percent', minimumFractionDigits: dp, maximumFractionDigits: dp }).format(0), tone: 'neutral', arrow: '', sign: '' };
  const pos = r > 0, sign = pos ? '+' : '\u2212', min = 10 ** -dp / 100, a = Math.abs(r);
  const f = nf(loc, { style: 'percent', minimumFractionDigits: dp, maximumFractionDigits: dp });
  const body = a < min / 2 ? '<' + f.format(min) : f.format(a);
  return { text: sign + body, tone: pos ? 'profit' : 'loss', arrow: pos ? '\u25B2' : '\u25BC', sign };
}
/** Percent from a ratio (0.084 → 8.4%). signed for PnL. */
export const formatPct = (r, loc, { signed = false, dp = 1 } = {}) => signed ? pnlPct(r, loc, { dp }).text :
  nf(loc, { style: 'percent', minimumFractionDigits: dp, maximumFractionDigits: dp }).format(r).replace('-', '−');
/** Token price in USD: 4 significant digits, tiny prices keep zeros visible. narrowSymbol → "$" in both locales; separators follow the locale. */
export const formatUsd = (v, loc) => nf(loc, { style: 'currency', currency: 'USD', maximumSignificantDigits: 4, currencyDisplay: 'narrowSymbol' }).format(v);
export const formatCompact = (v, loc) => nf(loc, { notation: 'compact', maximumFractionDigits: 1 }).format(v); // market cap, volume
export const formatInt = (v, loc) => nf(loc, {}).format(v);
/** Countdown mm:ss from expires_at − server_now (never device clock). Not localized: digits + colon. */
export const formatCountdown = (ms) => { const s = Math.max(0, Math.round(ms / 1000)); return `${String(Math.floor(s / 60)).padStart(2, '0')}:${String(s % 60).padStart(2, '0')}`; };
/** Absolute time: WIB/user TZ, 24h in id, 12h in en. */
export const formatTime = (d, loc, tz) => new Intl.DateTimeFormat(LOCALES[loc], { hour: loc === 'en' ? 'numeric' : '2-digit', minute: '2-digit', timeZone: tz }).format(d);
export const formatDateTime = (d, loc, tz) => new Intl.DateTimeFormat(LOCALES[loc], { day: 'numeric', month: 'short', hour: loc === 'en' ? 'numeric' : '2-digit', minute: '2-digit', timeZone: tz, timeZoneName: 'short' }).format(d);
export const formatRelative = (sec, loc) => new Intl.RelativeTimeFormat(LOCALES[loc], { numeric: 'auto', style: 'short' }).format(sec >= -59 ? sec : Math.round(sec / 60), sec >= -59 ? 'second' : 'minute');

// ---- Wire helpers (contracts v1.1: lamports = integer strings, prices = decimal strings, server_now everywhere)
const LAMPORTS_PER_SOL = 1_000_000_000n;
/** "250000000" → 0.25 (display only; exact BigInt split, never parse lamports as a float first). */
export function lamportsToSol(lamports) {
  const n = BigInt(lamports); const neg = n < 0n; const a = neg ? -n : n;
  const v = Number(a / LAMPORTS_PER_SOL) + Number(a % LAMPORTS_PER_SOL) / 1e9;
  return neg ? -v : v;
}
export const formatLamports = (lamports, loc, opts) => formatSol(lamportsToSol(lamports), loc, opts);
/** Push vars carry decimal strings ("0.25"); format on device in the UI locale. */
export const formatSolVar = (s, loc, opts) => formatSol(Number(s), loc, opts);
/** Clock skew from any REST body / stream message / clock heartbeat: skew = server_now − local_now. */
export const skewFrom = (serverNowIso, localNowMs = Date.now()) => Date.parse(serverNowIso) - localNowMs;
/** Remaining ms for expires_at / cooldown_until / auto_revert_at. Never compute TTLs client-side. */
export const remainingMs = (untilIso, skewMs, localNowMs = Date.now()) => Date.parse(untilIso) - (localNowMs + skewMs);
/** Manual sell (contracts 1.1.2 POST …/positions/{id}/close): wire `fraction_bps` integer 1..10000 (default 10000 = 100%).
 *  UI works in percent (25 · 50 · 100, or a slider 0.01–100); copy always shows %, never bps.
 *  Out of range / non-integer result → RangeError (server answers INVALID_FRACTION). */
export function pctToFractionBps(pct) {
  const bps = Math.round(Number(pct) * 100);
  if (!Number.isFinite(bps) || bps < 1 || bps > 10000) throw new RangeError('INVALID_FRACTION');
  return bps;
}
export const fractionBpsToPct = (bps) => Number(bps) / 100;
/** `fraction_bps` → display text: 5000 → "50%", 3333 → "33.33%" ("33,33%" id). */
export const formatFractionBps = (bps, loc) => formatPct(Number(bps) / 10000, loc, { dp: Number(bps) % 100 === 0 ? 0 : 2 });

// ---- contracts 1.1.4 (Rev 4.6): proposal quote fields, market cap. Every helper is null-safe: missing → DASH,
//      and the UI pairs DASH with common.value.unavailable (tooltip + aria-label). Never show "0" for a missing value.
export const DASH = '\u2014';
const missing = (v) => v === null || v === undefined || v === '';
/** Lamports integer string (or null) → SOL text, or DASH. For est_network_fee_lamports, priority_fee_lamports,
 *  total_max_lamports. Exact BigInt split via lamportsToSol (never parseFloat a lamports string). */
export const formatLamportsOrDash = (lamports, loc, opts) =>
  missing(lamports) ? DASH : formatLamports(lamports, loc, opts);
/** Basis points (JSON number) → percent: 25 → "0.25%", 50 → "0.5%", 100 → "1%" ("0,25%" id). null → DASH.
 *  For swap_fee_bps, max_slippage_bps. Copy always shows %, never bps. */
export const formatBps = (bps, loc) => missing(bps) || !Number.isFinite(Number(bps)) ? DASH :
  nf(loc, { style: 'percent', minimumFractionDigits: 0, maximumFractionDigits: 2 }).format(Number(bps) / 10000);
/** Raw token units (integer string) + mint decimals → token quantity text, or DASH when either is missing.
 *  min_out_raw: |v| ≥ 1 → 2 dp max; < 1 → up to 6 dp. BigInt split, decimals never assumed (no default 6). */
export function formatRawQty(raw, decimals, loc) {
  if (missing(raw) || missing(decimals) || !Number.isInteger(Number(decimals))) return DASH;
  const n = BigInt(raw), d = 10n ** BigInt(decimals), neg = n < 0n, a = neg ? -n : n;
  const v = Number(a / d) + Number(a % d) / Number(d);
  const s = nf(loc, { minimumFractionDigits: 0, maximumFractionDigits: v >= 1 ? 2 : 6 }).format(v);
  return neg ? '\u2212' + s : s;
}
/** Fields a Real quote needs before the hold can start (contracts 1.1.5). est_ata_rent_lamports is "0" when no new
 *  token account is needed, so "0" counts as present. */
export const REQUIRED_QUOTE_FIELDS = ['quote_id', 'est_network_fee_lamports', 'est_ata_rent_lamports', 'min_out_raw',
  'total_max_lamports', 'quote_expires_at'];
/** 1.1.5 sell quotes (kind sell_position) carry expected_out_lamports / min_out_lamports
 *  instead of min_out_raw + ATA rent.
 *  ClosePreview (POST …/close/preview) has no quote_id. */
export const REQUIRED_SELL_QUOTE_FIELDS = ['quote_id', 'est_network_fee_lamports', 'expected_out_lamports',
  'min_out_lamports', 'total_max_lamports', 'quote_expires_at'];
export const REQUIRED_CLOSE_PREVIEW_FIELDS = REQUIRED_SELL_QUOTE_FIELDS.filter((f) => f !== 'quote_id');
const requiredFor = (kind) => kind === 'sell' ? REQUIRED_SELL_QUOTE_FIELDS
  : kind === 'close_preview' ? REQUIRED_CLOSE_PREVIEW_FIELDS : REQUIRED_QUOTE_FIELDS;
/** Quote freshness from server time (skew), never the device clock alone.
 *  state: 'missing' (no quote_expires_at) | 'fresh' (server now < quote_expires_at) | 'stale'.
 *  complete: every required field for `kind` (buy | sell | close_preview) present
 *  (Real only; review.quote.loading while false).
 *  blocksApprove: Real only (409 QUOTE_MISSING_OR_STALE); Practice is never blocked and ignores quote_id.
 *  ageS → review.quote.updated_ago {seconds}; expiresInS → review.quote.expires_in {seconds}. */
export function quoteState(q, skewMs = 0, { mode = 'practice', kind = 'buy', localNowMs = Date.now() } = {}) {
  const serverNow = localNowMs + skewMs;
  const ts = missing(q?.quote_ts) ? null : Date.parse(q.quote_ts);
  const exp = missing(q?.quote_expires_at) ? null : Date.parse(q.quote_expires_at);
  const ageS = ts === null ? null : Math.max(0, Math.floor((serverNow - ts) / 1000));
  const complete = requiredFor(kind).every((f) => !missing(q?.[f]));
  const real = mode === 'real';
  if (exp === null) return { state: 'missing', ageS, expiresInS: null, complete, blocksApprove: real };
  const fresh = serverNow < exp;
  return { state: fresh ? 'fresh' : 'stale', ageS, expiresInS: fresh ? Math.ceil((exp - serverNow) / 1000) : 0,
    complete, blocksApprove: real && (!fresh || !complete) };
}
/** 1.1.5: a quote refresh sets a new quote_id and does NOT bump rev. Reset a Real hold and show
 *  review.quote.updated_inline / changed_during_hold only when this returns true. Approve sends expected_quote_id. */
export const quoteChanged = (prev, next) => !missing(next?.quote_id) && prev?.quote_id !== next.quote_id;
/** Network fee breakdown: est_network_fee_lamports already includes priority (base + priority). Returns lamport
 *  strings {base, priority} for review.network_fee_breakdown, or null when either is missing or inconsistent. */
export function networkFeeParts(estNetworkFee, priorityFee) {
  if (missing(estNetworkFee) || missing(priorityFee)) return null;
  const t = BigInt(estNetworkFee), pr = BigInt(priorityFee);
  if (pr < 0n || pr > t) return null;
  return { base: (t - pr).toString(), priority: pr.toString() };
}
/** review.ata_rent row is shown only for a non-zero est_ata_rent_lamports. */
export const showAtaRent = (v) => !missing(v) && BigInt(v) > 0n;
/** total_max_lamports = amount_lamports + est_network_fee_lamports + est_ata_rent_lamports
 *  (swap fee is taken from SOL in; priority fee is inside the network fee, never added twice).
 *  matches=false → log + still show the server total. */
export function totalMaxCheck(q, amountLamports, { side = 'buy' } = {}) {
  // 1.1.5: sell total_max_lamports = est_network_fee_lamports only (swap fee comes out of SOL out)
  const parts = side === 'sell' ? [q?.est_network_fee_lamports]
    : [amountLamports, q?.est_network_fee_lamports, q?.est_ata_rent_lamports ?? '0'];
  if (parts.some(missing) || missing(q?.total_max_lamports)) return null;
  const expected = parts.reduce((a, v) => a + BigInt(v), 0n);
  return { expected: expected.toString(), matches: expected === BigInt(q.total_max_lamports) };
}
/** Token-2022 program id → show token.program.token_2022 chip. */
export const TOKEN_2022_PROGRAM = 'TokenzQdBNbLqP5VEhdkAS6EPFLC1PHnBqCXEpPxuEb';
export const isToken2022 = (tokenProgram) => tokenProgram === TOKEN_2022_PROGRAM;
/** Short display form of an id (quote_id, withdraw_id): first 6 chars. */
export const formatIdShort = (id) => missing(id) ? DASH : String(id).slice(0, 6);
/** Wallet address → "9wQe…k2Lm" (first 4 … last 4). Client-derived `address_short`;
 *  the wire always sends the full address. Users match these 4+4 characters against Phantom. */
export const formatAddressShort = (address) => missing(address) ? DASH :
  (String(address).length <= 10 ? String(address) : `${String(address).slice(0, 4)}\u2026${String(address).slice(-4)}`);
/** hh:mm:ss countdown (48 h owner-wallet delay). Digits + colons, not localized. */
export const formatCountdownHms = (ms) => {
  const s = Math.max(0, Math.round(ms / 1000)); const p = (n) => String(n).padStart(2, '0');
  return `${p(Math.floor(s / 3600))}:${p(Math.floor((s % 3600) / 60))}:${p(s % 60)}`;
};
/** real.limit.* from/to: *_lamports → SOL, *_bps → %, other (counts) → integer. */
export function formatLimitValue(setting, v, loc) {
  if (missing(v)) return DASH;
  if (String(setting).endsWith('_lamports')) return formatLamports(String(v), loc);
  if (String(setting).endsWith('_bps')) return formatBps(Number(v), loc);
  return formatInt(Number(v), loc);
}
/** Web-only alternative to the ICU plural keys: Intl.RelativeTimeFormat ("5 sec. ago" / "5 dtk. yang lalu",
 *  "in 9 sec." / "dalam 9 dtk."). Flutter has no RelativeTimeFormat → use review.quote.* ICU keys (ARB). */
export const formatRelativeSeconds = (sec, loc) =>
  new Intl.RelativeTimeFormat(LOCALES[loc] ?? loc, { numeric: 'auto', style: 'short' })
    .format(Math.round(sec), 'second');
/** Market cap (USD decimal string, indicative) → compact USD: "$1.2M" (en) / "$1,2 jt" (id). null → DASH. */
export const formatMcapUsd = (usd, loc) => missing(usd) || !Number.isFinite(Number(usd)) ? DASH :
  nf(loc, { style: 'currency', currency: 'USD', currencyDisplay: 'narrowSymbol', notation: 'compact',
    maximumFractionDigits: 1 }).format(Number(usd));
/** Market cap (lamports integer string) → compact SOL: "8.4K SOL" (en) / "8,4 rb SOL" (id). null → DASH. */
export const formatMcapSol = (lamports, loc) => missing(lamports) ? DASH :
  formatCompact(lamportsToSol(lamports), loc) + '\u00A0SOL';
/** Mcap cell + tooltip keys (1.1.5 mcap_source = curve | pool | unavailable). The "indicative USD" note only shows when
 *  the value was computed by us (curve/pool) and mcap_usd is set. */
export function mcapView(c, loc) {
  const src = c?.mcap_source ?? (missing(c?.market_cap_lamports) ? 'unavailable' : null);
  if (src === 'unavailable' || (missing(c?.mcap_usd) && missing(c?.market_cap_lamports))) {
    return { primary: DASH, secondary: null, sourceKey: 'coin.mcap_source.unavailable',
      tooltipKeys: ['common.value.unavailable'] };
  }
  const tooltipKeys = ['mcap.as_of'];
  if ((src === 'curve' || src === 'pool') && !missing(c?.mcap_usd)) tooltipKeys.push('mcap.usd_indicative');
  return { primary: missing(c?.mcap_usd) ? formatMcapSol(c.market_cap_lamports, loc) : formatMcapUsd(c.mcap_usd, loc),
    secondary: missing(c?.mcap_usd) || missing(c?.market_cap_lamports) ? null
      : formatMcapSol(c.market_cap_lamports, loc),
    sourceKey: src ? `coin.mcap_source.${src}` : null, tooltipKeys };
}
// ---- Phase 7 enum → key helpers (contracts 1.1.5 reserved types). Unknown or null values fall back, never raw text.
export const WITHDRAW_FAIL_REASONS = ['withdraw_simulation_failed', 'insufficient_balance', 'destination_not_owned',
  'tx_expired', 'provider_error', 'user_rejected', 'other'];
export const withdrawFailReasonKey = (code) =>
  `wallet.withdraw.fail_reason.${WITHDRAW_FAIL_REASONS.includes(code) ? code : 'unknown'}`;
export const KILL_SWITCH_REASONS = ['policy_mismatch', 'loss_velocity', 'provider_error', 'other'];
/** Value for the N-29 {reason} select (reason is nullable on the wire). */
export const killSwitchReasonSelect = (reason) => KILL_SWITCH_REASONS.includes(reason) ? reason : 'other';

