/// Dart mirror of the UX reference formatters (`packages/i18n/format.mjs`).
/// Rule: number locale == UI language (never EN copy with id-ID numbers).
/// Domain values are formatted here and passed to ARB messages as strings.
/// Amounts are [Lamports] (BigInt) and prices [Decimal]: no double for money.
library;

import 'package:decimal/decimal.dart';

import '../data/money.dart';
import 'theme/app_tokens.dart' show TradeColors;
import '../l10n/gen/app_localizations.dart';

const _nbsp = '\u00A0';
const _minus = '\u2212';

/// SOL amount. |v| ≥ 1 → exactly 2 dp; |v| < 1 → 2–4 dp; 0 < |v| < 0.01 → up to 6 dp.
/// [pnl] → [pnlSol] (T-15 rule). [paper] → "paper SOL" (Practice; never bare "SOL").
String formatSol(Lamports v, String loc, {bool pnl = false, bool paper = false}) {
  if (pnl) return pnlSol(v, loc, paper: paper).text;
  final a = v.toSol().abs();
  final maxDp = a >= Decimal.one ? 2 : (a < Decimal.parse('0.01') && a > Decimal.zero ? 6 : 4);
  final s = formatDecimalAbs(a, loc, minDp: 2, maxDp: maxDp);
  return '${v.isNegative ? _minus : ''}$s$_nbsp${paper ? 'paper SOL' : 'SOL'}';
}

/// PnL display parts, 1:1 port of `pnlSol()` / `pnlPct()` in @centurion/i18n 0.4.2 `format.mjs`.
/// [text] carries the sign but not the arrow; [arrow]/[sign] come from the design-tokens
/// 0.2.2 helpers `TradeColors.pnlArrow` / `pnlSign`; [signum] picks the color via
/// `TradeColors.pnl` (neutral only for exact 0).
typedef PnlDisplay = ({String text, String arrow, String sign, int signum});

final _floor = Decimal.parse('0.000001');

/// T-15 (Apex decision 29 Okt 2026, UX codifies in SPEC §1):
/// - EXACT zero (0 lamports) → "0.00"/"0,00", neutral, no arrow, no sign.
/// - non-zero → sign + arrow + profit/loss tone, never shown as 0: |v| ≥ 1 → 2 dp;
///   < 1 → 3–4 dp; < 0.01 → up to 6 dp; < 0.000001 → "<0.000001" (still signed).
/// [unit] false drops " SOL" (UI tables that print the unit elsewhere).
PnlDisplay pnlSol(Lamports v, String loc, {bool paper = false, bool unit = true}) {
  final u = unit ? '$_nbsp${paper ? 'paper SOL' : 'SOL'}' : '';
  final n = v.sign;
  final sign = TradeColors.pnlSign(n), arrow = TradeColors.pnlArrow(n);
  if (n == 0) {
    // pnlArrow(0) / pnlSign(0) are '' by the token contract.
    return (text: '${formatDecimalAbs(Decimal.zero, loc, minDp: 2, maxDp: 2)}$u', arrow: arrow, sign: sign, signum: 0);
  }
  final a = v.toSol().abs();
  final body = a < _floor
      ? '<${formatDecimalAbs(_floor, loc, minDp: 6, maxDp: 6)}'
      : a >= Decimal.one
      ? formatDecimalAbs(a, loc, minDp: 2, maxDp: 2)
      : formatDecimalAbs(a, loc, minDp: 3, maxDp: a < Decimal.parse('0.01') ? 6 : 4);
  return (text: '$sign$body$u', arrow: arrow, sign: sign, signum: n);
}

/// Same rule for a PnL PERCENT number (12.5 = 12,5%): exact 0 → "0,0%" neutral; a
/// non-zero value that rounds to 0 at [dp] → "<0,1%" signed. Fixed [dp] like format.mjs.
PnlDisplay pnlPct(num pct, String loc, {int dp = 1}) {
  final n = pct.sign.toInt();
  final sign = TradeColors.pnlSign(n), arrow = TradeColors.pnlArrow(n);
  String f(Decimal d) => '${formatDecimalAbs(d, loc, minDp: dp, maxDp: dp)}%';
  if (n == 0) return (text: f(Decimal.zero), arrow: arrow, sign: sign, signum: 0);
  final min = Decimal.parse((1 / _pow10(dp)).toStringAsFixed(dp));
  final a = Decimal.parse(pct.abs().toStringAsFixed(dp + 2));
  final body = a.round(scale: dp) == Decimal.zero ? '<${f(min)}' : f(a.round(scale: dp));
  return (text: '$sign$body', arrow: arrow, sign: sign, signum: n);
}

int _pow10(int n) => n <= 0 ? 1 : 10 * _pow10(n - 1);

/// Percent from a PERCENT number (12.5 → "12,5%" / "12.5%"); [signed] → [pnlPct] (T-15).
String formatPct(num pct, String loc, {bool signed = false, int dp = 1}) {
  if (signed) return pnlPct(pct, loc, dp: dp).text;
  final d = Decimal.parse(pct.toStringAsFixed(dp));
  final s = '${formatDecimalAbs(d, loc, minDp: 0, maxDp: dp)}%';
  return d < Decimal.zero ? '$_minus$s' : s;
}

/// USD token price, 4 significant digits, tiny prices keep their zeros.
String formatUsd(Decimal v, String loc) {
  if (v == Decimal.zero) return '\$0';
  final dp = decimalsForSignificant(v, 4);
  return '${v < Decimal.zero ? _minus : ''}\$${formatDecimalAbs(v, loc, minDp: 0, maxDp: dp)}';
}

/// mm:ss from `expires_at − (now + skew)`. Not localized.
String formatCountdown(Duration left) {
  final s = left.isNegative ? 0 : (left.inMilliseconds / 1000).round();
  return '${(s ~/ 60).toString().padLeft(2, '0')}:${(s % 60).toString().padLeft(2, '0')}';
}

/// Absolute time in **WIB** (Asia/Jakarta, fixed UTC+7, no DST): id 24 h
/// "16.10", en 12 h "4:10 PM"; zone label appended. The instant is converted to
/// UTC+7 first, so a wire `03:00Z` renders `10:00` and the device's own zone is
/// never labelled WIB. Manual formatting: no intl date-locale init needed
/// (background isolate).
String formatTime(DateTime t, String loc, {String zone = 'WIB'}) {
  String two(int v) => v.toString().padLeft(2, '0');
  final w = toWib(t);
  if (loc == 'id') return '${two(w.hour)}.${two(w.minute)} $zone';
  final h = w.hour % 12 == 0 ? 12 : w.hour % 12;
  return '$h:${two(w.minute)}$_nbsp${w.hour < 12 ? 'AM' : 'PM'} $zone';
}

/// The instant as wall-clock time in Asia/Jakarta (UTC+7, no DST). Use this for
/// every WIB label; never format a device-local DateTime and call it WIB.
DateTime toWib(DateTime t) => t.toUtc().add(const Duration(hours: 7));

/// `format.mjs` DASH: every null-safe formatter renders a missing value as this.
const dash = '—';

/// Hold duration in words: "45s" / "19m" / "2h 5m" (id: "45 dtk" / "19 mnt" / "2 j 5 mnt").
/// Units come from the ARB, so an EN screen never shows Indonesian units.
String formatHold(AppLocalizations l, num seconds) {
  final total = seconds.isFinite && seconds > 0 ? seconds.toInt() : 0;
  if (total < 60) return l.pnlHoldSeconds(total);
  final minutes = total ~/ 60;
  if (minutes < 60) return l.pnlHoldMinutes(minutes);
  return l.pnlHoldHours(minutes ~/ 60, minutes % 60);
}

/// Compact number (Intl compact, max 1 dp): en "8.4K" / "1.2M"; id "8,4 rb" / "1,2 jt".
String formatCompact(Decimal v, String loc) {
  final neg = v < Decimal.zero;
  final a = v.abs();
  const en = ['', 'K', 'M', 'B', 'T'];
  const id = ['', 'rb', 'jt', 'M', 'T'];
  var i = 0;
  var x = a;
  final k = Decimal.fromInt(1000);
  while (x >= k && i < 4) {
    x = (x / k).toDecimal(scaleOnInfinitePrecision: 12);
    i++;
  }
  final body = formatDecimalAbs(x, loc, minDp: 0, maxDp: i == 0 && x < Decimal.one ? 2 : 1);
  final suffix = (loc == 'id' ? id : en)[i];
  final sep = loc == 'id' && suffix.isNotEmpty ? _nbsp : '';
  return '${neg ? _minus : ''}$body$sep$suffix';
}

/// Market cap USD (indicative): "$1.2M" / "$1,2 jt"; null → [dash].
String formatMcapUsd(Decimal? usd, String loc) => usd == null ? dash : '\$${formatCompact(usd, loc)}';

/// Market cap from lamports: "8.4K SOL"; null → [dash].
String formatMcapSol(Lamports? v, String loc) {
  if (v == null) return dash;
  final sol = (Decimal.fromBigInt(v.raw) / Decimal.fromInt(1000000000)).toDecimal(scaleOnInfinitePrecision: 9);
  return '${formatCompact(sol, loc)}${_nbsp}SOL';
}

/// Basis points → percent, max 2 dp: 25 → "0.25%" / "0,25%"; null → [dash].
String formatBps(int? bps, String loc) {
  if (bps == null) return dash;
  final pct = (Decimal.fromInt(bps.abs()) / Decimal.fromInt(100)).toDecimal(scaleOnInfinitePrecision: 4);
  return '${bps < 0 ? _minus : ''}${formatDecimalAbs(pct, loc, minDp: 0, maxDp: 2)}%';
}
