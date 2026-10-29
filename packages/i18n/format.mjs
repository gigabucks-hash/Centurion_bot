// Sentra reference formatters (Web: import as-is; Flutter: mirror with package:intl NumberFormat/DateFormat).
// Rule: the locale used for numbers == the UI language. Never mix (EN UI + id-ID numbers = bug QA-01).
// Domain values are formatted here and passed to ICU messages as string args ({sol}, {pnl}, {pct}, {price}, {time}).
export const LOCALES = { en: 'en-US', id: 'id-ID' };
const nf = (loc, o) => new Intl.NumberFormat(LOCALES[loc] ?? loc, o);
/** SOL amount. Rule "no 3-decimal ambiguity": when |v| ≥ 1 show exactly 2 dp (27.53), because "27.533" vs "27,533"
 *  reads as a thousands group in the other locale. |v| < 1 → 2–4 dp (0.24; pnl 3–4 dp: −0.066); |v| < 0.01 → up to 6 dp.
 *  kind 'pnl' adds a sign (+/−, zero unsigned). paper=true → "paper SOL" (Practice; never a bare "SOL"). */
export function formatSol(v, loc, { kind = 'amount', paper = false } = {}) {
  const a = Math.abs(v);
  const o = a >= 1 ? { minimumFractionDigits: 2, maximumFractionDigits: 2 }
          : { minimumFractionDigits: kind === 'pnl' ? 3 : 2, maximumFractionDigits: a < 0.01 && a > 0 ? 6 : 4 };
  if (kind === 'pnl') o.signDisplay = 'exceptZero';
  const s = nf(loc, o).format(v).replace('-', '\u2212');      // true minus, same width as +
  return `${s}\u00A0${paper ? 'paper SOL' : 'SOL'}`;          // NBSP: number never wraps away from its unit
}
/** Percent from a ratio (0.084 → 8.4%). signed for PnL. */
export const formatPct = (r, loc, { signed = false, dp = 1 } = {}) =>
  nf(loc, { style: 'percent', minimumFractionDigits: dp, maximumFractionDigits: dp, signDisplay: signed ? 'exceptZero' : 'auto' }).format(r).replace('-', '−');
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
