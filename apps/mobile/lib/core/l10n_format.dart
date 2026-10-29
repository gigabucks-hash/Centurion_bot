/// Dart mirror of the UX reference formatters (`ux-solbot/locales/format.mjs`).
/// Rule: number locale == UI language (never EN copy with id-ID numbers).
/// Domain values are formatted here and passed to ARB messages as strings.
/// Amounts are [Lamports] (BigInt) and prices [Decimal]: no double for money.
library;


import '../data/money.dart';

const _nbsp = '\u00A0';
const _minus = '\u2212';

/// SOL amount. |v| ≥ 1 → exactly 2 dp; |v| < 1 → 2–4 dp (pnl 3–4); 0 < |v| < 0.01 → up to 6 dp.
/// [pnl] adds +/− (zero unsigned). [paper] → "paper SOL" (Practice; never bare "SOL").
String formatSol(Lamports v, String loc, {bool pnl = false, bool paper = false}) {
  final d = v.toSol();
  final a = d.abs();
  int minDp, maxDp;
  if (a >= Decimal.one) {
    minDp = maxDp = 2;
  } else {
    minDp = pnl ? 3 : 2;
    maxDp = a < Decimal.parse('0.01') && a > Decimal.zero ? 6 : 4;
  }
  var s = formatDecimalAbs(a, loc, minDp: minDp, maxDp: maxDp);
  if (pnl && !v.isZero) s = '${v.isNegative ? _minus : '+'}$s';
  if (!pnl && v.isNegative) s = '$_minus$s';
  return '$s$_nbsp${paper ? 'paper SOL' : 'SOL'}';
}

/// Percent from a PERCENT number (12.5 → "12,5%" / "12.5%"); [signed] adds +.
String formatPct(num pct, String loc, {bool signed = false, int dp = 1}) {
  final d = Decimal.parse(pct.toStringAsFixed(dp));
  final s = '${formatDecimalAbs(d, loc, minDp: 0, maxDp: dp)}%';
  if (d < Decimal.zero) return '$_minus$s';
  return signed && d > Decimal.zero ? '+$s' : s;
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
