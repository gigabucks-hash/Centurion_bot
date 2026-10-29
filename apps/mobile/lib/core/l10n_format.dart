/// Dart mirror of the UX reference formatters (`ux-solbot/locales/format.mjs`).
/// Rule: number locale == UI language (never EN copy with id-ID numbers).
/// Domain values are formatted here and passed to ARB messages as strings.
library;

import 'dart:math';

import 'package:intl/intl.dart';

const _nbsp = '\u00A0';
const _minus = '\u2212';

String _tag(String loc) => loc == 'id' ? 'id' : 'en';

/// SOL amount. |v| ≥ 1 → exactly 2 dp; |v| < 1 → 2–4 dp (pnl 3–4); 0 < |v| < 0.01 → up to 6 dp.
/// [pnl] adds +/− (zero unsigned). [paper] → "paper SOL" (Practice; never bare "SOL").
String formatSol(num v, String loc, {bool pnl = false, bool paper = false}) {
  final a = v.abs();
  int minDp, maxDp;
  if (a >= 1) {
    minDp = maxDp = 2;
  } else {
    minDp = pnl ? 3 : 2;
    maxDp = a < 0.01 && a > 0 ? 6 : 4;
  }
  final f = NumberFormat.decimalPattern(_tag(loc))
    ..minimumFractionDigits = minDp
    ..maximumFractionDigits = maxDp;
  var s = f.format(a);
  if (pnl && v != 0) s = '${v > 0 ? '+' : _minus}$s';
  if (!pnl && v < 0) s = '$_minus$s';
  return '$s$_nbsp${paper ? 'paper SOL' : 'SOL'}';
}

/// Percent from a PERCENT value (12.5 → "12,5%" / "12.5%"); [signed] adds +/−.
String formatPct(num pct, String loc, {bool signed = false, int dp = 1}) {
  final f = NumberFormat.decimalPattern(_tag(loc))
    ..minimumFractionDigits = 0
    ..maximumFractionDigits = dp;
  final s = '${f.format(pct.abs())}%';
  if (pct < 0) return '$_minus$s';
  return signed && pct > 0 ? '+$s' : s;
}

/// USD token price, 4 significant digits, tiny prices keep their zeros.
String formatUsd(num v, String loc) {
  if (v == 0) return '\$0';
  final mag = (log(v.abs()) / ln10).floor();
  final dp = max(0, min(12, 3 - mag));
  final f = NumberFormat.decimalPattern(_tag(loc))
    ..minimumFractionDigits = 0
    ..maximumFractionDigits = dp;
  return '${v < 0 ? _minus : ''}\$${f.format(v.abs())}';
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
