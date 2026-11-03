import 'package:decimal/decimal.dart';
import 'package:intl/intl.dart';

import '../data/money.dart';
import 'l10n_format.dart' show pnlSol, pnlPct;

// SPEC §1: id-ID number format (comma decimal), mono tabular in UI.
final _time = DateFormat('HH:mm');

/// Unsigned amount, e.g. `27,494`. Negative values get a real minus sign. Exact (BigInt).
String fmtSol(Lamports v, {bool unit = false}) {
  final s = formatDecimalAbs(v.toSol(), 'id', minDp: 3, maxDp: 3) + (unit ? ' SOL' : '');
  return v.isNegative ? '−$s' : s;
}

/// SPEC §1: PnL never by color alone. T-15 (Apex decision): delegates to [pnlSol]
/// (@centurion/i18n 0.4.2 rule): exact 0 → `0,00` (neutral, no arrow/sign); any
/// non-zero → `▲ +…` / `▼ −…`, never shown as 0.
String fmtPnl(Lamports v, {bool unit = false}) {
  final p = pnlSol(v, 'id', unit: false);
  final s = '${p.text}${unit ? ' SOL' : ''}';
  return p.arrow.isEmpty ? s : '${p.arrow} $s';
}

/// USD price with 4 significant digits, id-ID separators.
String fmtUsd(Decimal v) => '\$${formatDecimalAbs(v, 'id', minDp: 0, maxDp: decimalsForSignificant(v, 4))}';

/// Token amount from the raw integer `qty_raw` and the mint's `decimals`
/// (contracts 1.1.2: integer from the mint account, NEVER assume 6). Exact
/// (BigInt → Decimal). ≥ 1 → 2 dp; below 1 → 2 significant digits. Unknown
/// decimals → `—` (the raw count is meaningless without them).
String fmtTokenQty(BigInt raw, int? decimals) {
  if (decimals == null || decimals < 0) return '—';
  if (raw == BigInt.zero) return '0';
  final v = (Decimal.fromBigInt(raw) / Decimal.ten.pow(decimals).toDecimal()).toDecimal(
    scaleOnInfinitePrecision: decimals,
  );
  final abs = formatDecimalAbs(
    v,
    'id',
    minDp: v.abs() >= Decimal.one ? 2 : 0,
    maxDp: v.abs() >= Decimal.one ? 2 : decimalsForSignificant(v.abs(), 2),
  );
  return raw.isNegative ? '−$abs' : abs;
}

/// Percent PnL via [pnlPct] (T-15): exact 0 → `0,0%`; non-zero → sign (+ arrow).
String fmtPct(double v, {bool arrow = true}) {
  final p = pnlPct(v, 'id');
  return arrow && p.arrow.isNotEmpty ? '${p.arrow} ${p.text}' : p.text;
}

String fmtTime(DateTime t) => _time.format(t);

/// mm:ss for expiry timers; hours shown as `h:mm:ss`.
String fmtCountdown(Duration d) {
  if (d.isNegative) return '00:00';
  final h = d.inHours, m = d.inMinutes % 60, s = d.inSeconds % 60;
  String two(int x) => x.toString().padLeft(2, '0');
  return h > 0 ? '$h:${two(m)}:${two(s)}' : '${two(m)}:${two(s)}';
}

String fmtAgo(DateTime t, DateTime now) {
  final d = now.difference(t);
  if (d.inSeconds < 60) return '${d.inSeconds.clamp(0, 59)} dtk';
  if (d.inMinutes < 60) return '${d.inMinutes} mnt';
  return '${d.inHours} jam';
}

String shortMint(String m) => m.length <= 10 ? m : '${m.substring(0, 4)}…${m.substring(m.length - 4)}';
