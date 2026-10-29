// Vendored verbatim from @sentra/i18n 0.4.2 test/flutter/l10n_plural_test.dart (YOUR_APP → solbot_mobile).
import 'package:flutter_test/flutter_test.dart';
import 'package:solbot_mobile/l10n/gen/app_localizations_en.dart';
import 'package:solbot_mobile/l10n/gen/app_localizations_id.dart';
import 'package:solbot_mobile/core/theme/app_tokens.dart';

void main() {
  final en = AppLocalizationsEn();
  final id = AppLocalizationsId();
  test('plural branches substitute the count (no literal #)', () {
    expect(en.queueBatchApprove(1), 'Approve 1 pick');
    expect(en.queueBatchApprove(3), 'Approve 3 picks');
    expect(id.queueBatchApprove(3), 'Setujui 3 pick');
    expect(en.commonDurationHours(1), '1 hour');
    expect(id.commonDurationMinutes(12), '12 mnt');
    expect(en.conflictBannerConflicts(0), startsWith('No overlapping fields'));
    expect(en.conflictBannerConflicts(2), '2 fields changed on both sides.');
    expect(id.conflictDiscardConfirm(4), 'Buang 4 editan? Tidak bisa diurungkan.');
    expect(en.loginOtpWrong(1), 'Wrong code. 1 attempt left.');
    expect(id.errorCodeRateLimited(30), 'Terlalu banyak permintaan. Coba lagi dalam 30 detik.');
    expect(en.notifGroupedTitle(5, 'real'), '[REAL SOL] 5 picks await approval');
    expect(id.notifGroupedTitle(1200, 'practice'), '[PRACTICE] 1.200 pick menunggu approval'); // locale grouping
    expect(id.settingsDeleteGrace(7), 'Masa tenggang: 7 hari');
    for (final s in [
      en.positionsOpenCount(2),
      id.queueBatchSelected(2),
      en.builderStepWeakened(1),
      id.dashboardKpiExpiringSoon(3),
      en.queueRealBatchConfirmTitle(2),
      en.commonDurationSeconds(9),
    ]) {
      expect(s.contains('#'), isFalse, reason: s);
    }
  });
  test('expire_reason practice_reset / account_deleted exported', () {
    expect(en.expireReasonPracticeResetBadge, 'Practice reset');
    expect(id.expireReasonAccountDeletedDetail, 'Akun telah dihapus');
  });
  test('T-15 PnL helpers: exact zero neutral, no arrow/sign', () {
    const t = TradeColors.dark;
    expect(t.pnl(0), t.neutral);
    expect(TradeColors.pnlArrow(0), '');
    expect(TradeColors.pnlSign(0), '');
    expect(TradeColors.pnlArrow(0.0002), '\u25B2');
    expect(TradeColors.pnlSign(-1e-9), '\u2212');
    expect(t.pnl(-1e-9), t.loss);
  });
}
