// Reference test (verified in scratch project with flutter 3.47.8). Replace YOUR_APP with the app package name.
import 'package:flutter/material.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:YOUR_APP/l10n/gen/app_localizations_en.dart';
import 'package:YOUR_APP/l10n/gen/app_localizations_id.dart';
import 'package:YOUR_APP/core/theme/app_tokens.dart';

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
    expect(en.notifGroupedTitle(5, 'real'), '[REAL] Review 5 picks awaiting approval');
    expect(id.notifGroupedTitle(1200, 'practice'), '[PAPER] Tinjau 1.200 pick yang menunggu approval'); // locale grouping
    expect(id.settingsDeleteGrace(7), 'Masa tenggang: 7 hari');
    for (final s in [en.positionsOpenCount(2), id.queueBatchSelected(2), en.builderStepWeakened(1), id.dashboardKpiExpiringSoon(3), en.queueRealBatchConfirmTitle(2), en.commonDurationSeconds(9)]) {
      expect(s.contains('#'), isFalse, reason: s);
    }
  });
  test('expire_reason practice_reset / account_deleted exported', () {
    expect(en.expireReasonPracticeResetBadge, 'Paper reset');
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
  test('Rev 4.3: wire-named vars {symbol}/{amount_lamports}, TP +, new fail reasons, WF-21 labels', () {
    expect(en.notifPickPendingTitle('real', 'EXM'), '[REAL] Review EXM: awaiting approval');
    expect(id.notifPickPendingBody('0,25 SOL', '04:52', 'Yumi'), 'Yumi · 0,25 SOL · sisa 04:52');
    expect(en.notifTpHitBody('40.0%', '50%', '+0.12 SOL'), 'Sold 50% at +40.0% · +0.12 SOL');
    expect(id.notifPracticeResetBody('10 paper SOL'), 'Saldo kembali ke 10 paper SOL. Buy tertunda dihapus.');
    expect(en.orderFailReasonPositionAlreadyClosed, 'This position was already closed');
    expect(id.orderFailReasonModeNotAllowed, contains('belum disetujui untuk Real'));
    expect(en.orderFailReasonValidationFailed, isNotEmpty);
    expect(id.errorCodeInvalidFraction, 'Pilih porsi jual dari 0,01% sampai 100%.');
    expect(id.screenerDetailQuoteNotSol('USDC'), 'USDC · bukan SOL');
    expect(id.screenerStatusRejectedScore('60'), 'Ditolak · skor < 60');
    expect(en.screenerDetailApproveUnavailable, 'Approve — not available');
  });
  test('Rev 4.4: desktop strings migrated + bg.sunken', () {
    expect(id.screenerDetailScoreValueInfo('115', '83'), '83 / 115 (informasi saja)'); // params alphabetical: max_score, score
    expect(en.positionsEmpty('practice'), 'No paper positions');
    expect(id.queueBatchExcludedNotTradeable(2), '2 pick tidak ikut: tidak bisa ditradingkan');
    expect(en.queueBatchExcludedNotTradeable(1), '1 pick left out: not tradeable');
    expect(id.positionsSellQuoteTtl('8'), 'Quote berlaku 8 dtk.');
    expect(en.screenerDetailSkipHint, contains('Skipping'));
    expect(AppColorsDark.bgSunken, const Color(0xFF07080C)); // design-tokens 0.3.0 G1-blue
    // ignore: deprecated_member_use_from_same_package
    expect(AppColorsLight.bgInset, AppColorsLight.bgSunken);
  });
  test('Rev 4.5: review sheet, portfolio, reject_reason, GUARD_WEAKEN, skeleton tokens', () {
    expect(id.reviewTitle('other'), 'Tinjau pembelian');
    expect(en.reviewTitle('sell'), 'Review sell');
    expect(id.reviewMinReceivedValue('59.210', 'EXM'), '≥ 59.210 EXM'); // params alphabetical: min_out, symbol
    expect(id.portfolioBalanceLabel('practice'), 'Saldo paper');
    expect(en.portfolioBalanceLabel('real'), 'Balance');
    expect(id.portfolioSparklineA11y('27,49 paper SOL', '7H', '27,80 paper SOL', 'down'), contains('turun'));
    expect(id.commonValueUnavailable, 'Data belum tersedia');
    expect(id.commonRange7d, '7H');
    expect(en.rejectReasonNotTradeable, 'Not tradeable');
    expect(id.rejectReasonUserDeclined, 'Dilewati olehmu');
    expect(id.errorCodeGuardWeakenRequiresApproval, startsWith('Perubahan menunggu approval')); // 0.4.6: pending tone, not an error
    expect(AppColorsDark.skeletonBase, const Color(0xFF272D3C)); // design-tokens 0.3.0 G1-blue
    expect(AppColorsLight.skeletonHighlight, const Color(0xFFF1F3F7));
  });
  test('Rev 4.6: quote freshness plurals (=0 branch, no #), stall, guard pending, mcap', () {
    expect(en.reviewQuoteUpdatedAgo(0), 'Quote updated just now');
    expect(en.reviewQuoteUpdatedAgo(5), 'Quote updated 5 s ago');
    expect(id.reviewQuoteUpdatedAgo(0), 'Quote baru diperbarui');
    expect(id.reviewQuoteUpdatedAgo(12), 'Quote diperbarui 12 dtk lalu');
    expect(en.reviewQuoteExpiresIn(1), 'Expires in 1 s');
    expect(id.reviewQuoteExpiresIn(9), 'Berakhir dalam 9 dtk');
    expect(id.reviewQuoteStale, 'Quote kedaluwarsa — perbarui untuk lanjut');
    expect(id.reviewQuoteUpdatedInline, 'Quote diperbarui');
    expect(id.exitReasonStall, 'Exit stagnan');
    expect(en.guardWeakenPendingTitle, 'Change waiting for approval');
    expect(id.mcapAsOf('18.42'), 'Per 18.42');
  });
  test('Rev 4.7: brand, Real notif plurals (=0 empty branch), selects, sell preview', () {
    expect(en.appName, 'Centurion Trade');
    expect(id.authSiwsStatement, 'Sign in to Centurion Trade'); // verbatim signed statement (0.4.8)
    expect(en.screenerNotTradeableDetail, contains('Centurion Trade only trades SOL pairs'));
    expect(en.notifRealSellAllCompletedTitle(0), '[REAL] View sell all: done');
    expect(id.notifRealSellAllCompletedTitle(2), '[REAL] Ulangi jual semua: 2 gagal');
    expect(en.notifRealSellAllCompletedBody(0, 3, 3), '3 of 3 sold');
    expect(en.notifRealSellAllCompletedBody(1, 3, 2), '2 of 3 sold · 1 failed: still open, its exit plan keeps running');
    expect(id.notifRealSellAllCompletedBody(2, 3, 1), '1 dari 3 terjual · 2 gagal: tetap terbuka, exit plan tetap jalan');
    expect(id.notifRealKillSwitchTrippedBody('loss_velocity'), startsWith('Dihentikan otomatis: kerugian naik terlalu cepat'));
    expect(en.notifRealKillSwitchTrippedBody('new_reason_x'), contains('a safety rule triggered'));
    expect(id.notifRealBuysPausedTitle, '[REAL] Lanjutkan pembelian saat siap: pembelian baru dihentikan');
    expect(id.notifRealBuysPausedBody('user', 'MacBook'), 'Exit plan posisi tetap jalan · olehmu di MacBook');
    expect(en.notifRealSellAllRequestedBody(1), 'Selling 1 position at market. Guards still apply.');
    expect(id.notifRealLimitLoosenRequestedBody('Maks. per trade', '0,05 SOL', '0,1 SOL', '30 Okt 19.02'), contains('berlaku sampai kamu ubah'));
    expect(id.expireReasonKillSwitchBadge, 'Real dihentikan');
    expect(id.closePreviewValid(9), 'Preview berlaku 9 dtk');
    expect(id.killSwitchOptionSellAll(3), 'Jual juga 3 posisi sekarang');
  });
  test('Rev 4.8: Backend final Phase 7 payloads', () {
    expect(id.notifRealKillSwitchTrippedBody('provider_error'), 'Dihentikan otomatis: masalah provider/signer · hanya exit yang berjalan.');
    expect(en.notifRealKillSwitchTrippedBody('policy_mismatch'), startsWith('Stopped automatically: wallet rules'));
    expect(id.notifRealKillSwitchClearedBody('revoked'), 'Izin trading masih dicabut · berikan izin lagi untuk lanjut');
    expect(en.notifRealKillSwitchClearedBody('active'), isNot(contains('paused')));
    expect(en.notifRealSignerRevokedBody('kill_switch'), startsWith('Revoked.')); // not a reason value any more → other
    expect(id.killSwitchActionEngage, 'Hentikan pembelian');
    expect(en.killSwitchActionEngage, 'Stop buying');
    expect(en.walletOwnerTitle, 'Main wallet');
    expect(id.killSwitchStatusExits, 'Exit plan tetap jalan');
    expect(id.walletAuthorizeRegrant, 'Berikan izin trading lagi');
    expect(id.killSwitchSellAllRateLimited(42), 'Jual semua baru saja diminta. Coba lagi dalam 42 detik.');
    expect(en.killSwitchSellAllInProgress(2), 'Selling 2 positions…');
    expect(id.walletLimitsSettingDailyLamports, 'Maks. per 24 jam bergulir');
    expect(id.walletWithdrawFailReasonTxExpired, 'tidak terkirim tepat waktu');
    expect(id.notifRealDepositDetectedBody('0,5 SOL', '1,2 SOL'), '+0,5 SOL · saldo 1,2 SOL');
    expect(en.notifRealSellAllCompletedTotal('0.90 SOL'), 'Total out: 0.90 SOL');
  });
  test('0.4.9: G1-blue copy keys', () {
    expect(id.settingsAppearanceDensityComfortable, 'Nyaman');
    expect(id.settingsAppearanceDensityCompact, 'Ringkas');
    expect(id.positionsDensityLabel, 'Kepadatan tabel');
    expect(id.killSwitchDialogEffectExitsKeep, 'Exit plan, TP & SL tetap jalan.');
    expect(en.killSwitchStatusResumeHint, startsWith('Bot authority stays active'));
    expect(id.reviewQuoteAgeValid('12', '18'), 'Umur quote 12 dtk · berlaku 18 dtk');
    expect(en.reviewQuoteAgeValid('12', '18'), 'Quote 12 s old · valid 18 s');
    expect(id.queueRealWithinLimits, 'Dalam batas: cukup tahan, tanpa Phantom.');
    expect(id.positionsExitHeldBadge, 'Exit ditahan');
    expect(en.positionsExitHeldDetail, contains('until you grant trading authority again'));
    expect(id.positionsSellManual, 'Jual manual');
    expect(id.positionsSellManualNote, 'Jual manual tetap bisa, ditandatangani di Phantom.');
    expect(id.walletAuthorizeRegrantNote, 'Butuh Phantom + passkey. Setelah izin aktif, exit plan lanjut otomatis.');
    expect(en.dashboardEyebrow, 'Command deck');
    expect(TradeColors.dark.guard, const Color(0xFFE57A12)); // design-tokens 0.3.1 guard amber
    expect(TradeColors.light.guard, const Color(0xFFA85400));
    expect(id.dashboardHeadline, 'Semua posisimu, sekilas.');
    expect(id.killSwitchActionOpen, 'Stop semua trading Real'); // deprecated, kept for apps/desktop
    expect(en.killSwitchDialogEffectBuys, startsWith('New buys are blocked')); // deprecated, kept for apps/desktop
  });
  test('0.4.10: G1-blue v2 copy (Paper in copy, verb-first, strategy mode, real_locked gate, quote, receipt, TP/SL, risk chip)', () {
    expect(en.modePracticeLabel, 'PAPER'); // key name unchanged until 0.5.0
    expect(id.notifPracticeResetTitle, '[PAPER] Cek saldo: Paper di-reset');
    expect(en.notifPickPendingTitle('practice', 'EXM'), '[PAPER] Review EXM: awaiting approval');
    expect(en.errorCodeModeNotAllowed, startsWith('This strategy isn’t approved for Real'));
    expect(en.strategyModePaper, 'Paper');
    expect(id.strategyRealLockedChip, 'Real terkunci');
    expect(id.strategyRealLockedReasonNeedsOwnerApproval, 'Butuh persetujuan Boss');
    expect(id.strategyRealGateProgressDays('4', '7'), '4/7 hari'); // generic: rule is a placeholder until Boss decides
    expect(en.strategyRealGateProgressTrades('23', '30'), '23/30 trades');
    expect(en.strategyRealGateDaysDone(1), '1 day in Paper'); // days_required = null
    expect(id.strategyRealGateTradesDone(23), '23 trade selesai');
    expect(id.strategyRealGateNotSet, 'Aturan belum ditetapkan');
    expect(en.strategyRealLockedExplain.contains(RegExp(r'\d')), isFalse); // no hardcoded gate numbers
    expect(en.strategyListFilterPaper(3), 'Paper · 3');
    expect(id.reviewBuyTitle('EXM'), 'Setujui beli EXM');
    expect(id.receiptTitleBuy('EXM'), 'Terbeli EXM');
    expect(id.positionsTpslTakeProfit('2'), 'Take profit 2');
    expect(en.riskChipA11y('Daily limit', '1', '0.4'), 'Daily limit: 0.4 of 1 SOL used'); // params alphabetical: label, limit, used
    expect(id.alertTpHit('1', '50', 'EXM'), 'Cek EXM: TP1 tercapai, 50% terjual'); // params alphabetical: n, pct, symbol
    expect(en.errorCodeBuysPaused, startsWith('New buys are stopped'));
    for (final s in [en.strategyRealGateDaysDone(3), id.strategyRealGateDaysDone(3), en.strategyRealGateTradesDone(5)]) {
      expect(s.contains('#'), isFalse, reason: s);
    }
  });
}
