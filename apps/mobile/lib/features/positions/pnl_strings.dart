/// PnL copy that @centurion/i18n 0.4.11 does not have yet. The vendored ARB is a
/// byte-identical copy gated by `tool/ci_check_vendored.sh`, so these strings live
/// here until UX adds the keys (same pattern as `LoginStrings`); then switch to
/// `AppLocalizations` and delete this file.
///
/// Requested ARB keys: pnl.back, pnl.report.title, pnl.unrealized.hint, pnl.realized.hint,
/// pnl.total.hint, pnl.view_report, pnl.open_count, pnl.closed_trades,
/// pnl.closed_at, pnl.realized_short, pnl.empty.*, pnl.by_exit_reason,
/// pnl.win_rate, pnl.avg_hold, pnl.stats_unavailable, pnl.partial_note.
library;

import '../../data/models/models.dart';

class PnlStrings {
  const PnlStrings._(this._id);
  factory PnlStrings.of(String languageCode) => PnlStrings._(languageCode == 'id');
  final bool _id;

  String get cardTitle => 'PnL';
  String get back => _id ? 'Kembali' : 'Back';
  String get unrealized => _id ? 'PnL belum terealisasi' : 'Unrealized PnL';
  String get realized => _id ? 'PnL terealisasi' : 'Realized PnL';
  String get total => 'Total PnL';
  String get unrealizedHint => _id ? 'Mark-to-market posisi terbuka' : 'Mark-to-market of open positions';
  String get realizedHint => _id ? 'Dari TP dan trade yang sudah ditutup' : 'From take-profits and closed trades';
  String get totalHint => _id ? 'Terealisasi + belum terealisasi' : 'Realized + unrealized';
  String get viewReport => _id ? 'Lihat laporan' : 'View report';
  String openCount(int n) => _id ? '$n terbuka' : '$n open';
  String get reportTitle => _id ? 'Laporan PnL' : 'PnL report';
  String get reportEyebrow => _id ? 'PNL REPORT' : 'PNL REPORT';

  /// 1D/7D/30D/All chips (the server window is `24h|7d|30d|all`).
  String windowLabel(PnlWindow w) => switch (w) {
    PnlWindow.d1 => '1D',
    PnlWindow.d7 => '7D',
    PnlWindow.d30 => '30D',
    PnlWindow.all => _id ? 'Semua' : 'All',
  };

  String realizedFor(String range) => _id ? 'Terealisasi · $range' : 'Realized · $range';
  String get closedLabel => _id ? 'Ditutup' : 'Closed';
  String get totalAllTime => _id ? 'Total semua waktu' : 'Total all-time';
  String get realizedAllTime => _id ? 'Terealisasi semua waktu' : 'All-time realized';
  String get reportUnavailable => _id ? 'Laporan PnL belum bisa dimuat.' : 'The PnL report could not be loaded.';
  String get retry => _id ? 'Coba lagi' : 'Retry';
  String get realizedHeroHint =>
      _id ? 'Terkunci saat trade ditutup, tidak ikut harga live' : 'Locked at close, does not follow the live price';
  String get closedTrades => _id ? 'Trade ditutup' : 'Closed trades';
  String get byExitReason => _id ? 'Per alasan keluar' : 'By exit reason';
  String get winRate => _id ? 'Rasio menang' : 'Win rate';
  String get avgHold => _id ? 'Rata-rata tahan' : 'Avg hold';
  String get statsUnavailable =>
      _id ? 'Rincian per alasan keluar belum bisa dimuat.' : 'The breakdown by exit reason could not be loaded.';
  String get partialNote => _id
      ? 'Terealisasi semua waktu juga menghitung TP sebagian di posisi terbuka dan close di luar '
            'rentang, jadi bisa lebih besar dari terealisasi rentang ini dan jumlah ledger.'
      : 'All-time realized also counts partial take-profits on open positions and closes outside '
            'the range, so it can be larger than this range realized and the ledger sum.';
  String get closedAt => _id ? 'Ditutup' : 'Closed';
  String get realizedShort => _id ? 'terealisasi' : 'realized';

  /// Average hold: `45 dtk` / `19 mnt` / `2 j 5 mnt`.
  String hold(num seconds) {
    final total = seconds.toInt();
    if (total < 60) return _id ? '$total dtk' : '${total}s';
    final minutes = total ~/ 60;
    if (minutes < 60) return _id ? '$minutes mnt' : '${minutes}m';
    final h = minutes ~/ 60, m = minutes % 60;
    return _id ? '$h j $m mnt' : '${h}h ${m}m';
  }

  String trades(int n) => _id ? '$n trade' : '$n trades';
  String get emptyTitle => _id ? 'Belum ada trade ditutup' : 'No closed trades yet';
  String get emptyBody => _id
      ? 'PnL terealisasi muncul di sini setelah posisi ditutup. PnL belum terealisasi tetap terlihat di kartu PnL.'
      : 'Realized PnL appears here once a position closes. Unrealized PnL stays on the PnL card.';
  String get emptyAction => _id ? 'Lihat posisi terbuka' : 'See open positions';
  String get unavailable => '—';
}
