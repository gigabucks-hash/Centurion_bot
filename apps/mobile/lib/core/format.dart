import 'package:intl/intl.dart';

import '../data/money.dart';

// SPEC §1: id-ID number format (comma decimal), mono tabular in UI.
final _pct = NumberFormat('#,##0.0', 'id');
final _time = DateFormat('HH:mm');

/// |v| below this formats as `±0` (and is colored neutral): 0,0005 SOL.
final Lamports pnlZeroEpsilon = Lamports.fromInt(500000);

String _sol3(Lamports v) => formatDecimalAbs(v.toSol(), 'id', minDp: 3, maxDp: 3);

/// Unsigned amount, e.g. `27,494`. Negative values get a real minus sign. Exact (BigInt).
String fmtSol(Lamports v, {bool unit = false}) {
  final s = _sol3(v) + (unit ? ' SOL' : '');
  return v.isNegative ? '−$s' : s;
}

/// SPEC §1: PnL never by color alone: ▲/▼ + sign + number; zero = `±0`.
String fmtPnl(Lamports v, {bool unit = false}) {
  if (v.abs() < pnlZeroEpsilon) return '±0${unit ? ' SOL' : ''}';
  final s = _sol3(v) + (unit ? ' SOL' : '');
  return v.isNegative ? '▼ −$s' : '▲ +$s';
}

/// USD price with 4 significant digits, id-ID separators.
String fmtUsd(Decimal v) => '\$${formatDecimalAbs(v, 'id', minDp: 0, maxDp: decimalsForSignificant(v, 4))}';

String fmtPct(double v, {bool arrow = true}) {
  if (v.abs() < 0.05) return '±0%';
  final s = '${_pct.format(v.abs())}%';
  if (!arrow) return v > 0 ? '+$s' : '−$s';
  return v > 0 ? '▲ +$s' : '▼ −$s';
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
