/// Dart mirror of the UX reference formatters (`ux-solbot/locales/format.mjs`).
/// Rule: number locale == UI language (never EN copy with id-ID numbers).
/// Domain values are formatted here and passed to ARB messages as strings.
/// Amounts are [Lamports] (BigInt) and prices [Decimal]: no double for money.
library;

import '../data/money.dart';
import 'theme/app_tokens.dart' show TradeColors;

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

/// PnL display parts, 1:1 port of `pnlSol()` / `pnlPct()` in @sentra/i18n 0.4.2 `format.mjs`.
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

/// Absolute time: id 24 h "16.10", en 12 h "4:10 PM"; zone label appended.
/// Manual formatting: no intl date-locale init needed (background isolate).
String formatTime(DateTime t, String loc, {String zone = 'WIB'}) {
  String two(int v) => v.toString().padLeft(2, '0');
  if (loc == 'id') return '${two(t.hour)}.${two(t.minute)} $zone';
  final h = t.hour % 12 == 0 ? 12 : t.hour % 12;
  return '$h:${two(t.minute)}$_nbsp${t.hour < 12 ? 'AM' : 'PM'} $zone';
}
