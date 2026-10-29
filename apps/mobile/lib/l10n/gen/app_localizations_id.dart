// ignore: unused_import
import 'package:intl/intl.dart' as intl;
import 'app_localizations.dart';

// ignore_for_file: type=lint

/// The translations for Indonesian (`id`).
class AppLocalizationsId extends AppLocalizations {
  AppLocalizationsId([String locale = 'id']) : super(locale);

  @override
  String get builderApprovalModeRealNote =>
      'Real SOL: “Off” tidak tersedia di MVP.';

  @override
  String get builderDiffTagNeutral => 'netral';

  @override
  String get builderDiffTagNew => 'baru';

  @override
  String get builderDiffTagStrengthens => 'mengetatkan';

  @override
  String get builderDiffTagWeakens => 'melonggarkan';

  @override
  String builderDiffTitle(String rev) {
    return 'Perubahan vs rev $rev';
  }

  @override
  String get builderExitColGain => 'Gain %';

  @override
  String get builderExitColPullback => 'Pullback %';

  @override
  String get builderExitColSell => 'Jual % posisi';

  @override
  String get builderExitDrain => 'Drain: turun';

  @override
  String get builderExitHardSl => 'Hard stop loss dari entry';

  @override
  String get builderExitLadderAdd => 'Tambah rung';

  @override
  String get builderExitLadderTitle => 'Tangga take-profit (maks 8 rung)';

  @override
  String builderExitLadderTotal(String pct) {
    return 'Total terjual: $pct';
  }

  @override
  String get builderExitNoTrade => 'Exit tanpa trade';

  @override
  String get builderExitTimeStop => 'Time stop';

  @override
  String get builderExitTrailing => 'Trailing stop dari high';

  @override
  String get builderGuardsPresetBalanced => 'Seimbang';

  @override
  String get builderGuardsPresetLoose => 'Longgar';

  @override
  String get builderGuardsPresetStrict => 'Ketat';

  @override
  String builderGuardsWeakeningInline(String from) {
    return 'Melonggarkan guard (sebelumnya $from). Butuh approval.';
  }

  @override
  String get builderPublish => 'Tinjau & publish';

  @override
  String get builderStepEntry => 'Entry';

  @override
  String get builderStepExit => 'Exit plan';

  @override
  String get builderStepGuards => 'Guards';

  @override
  String builderStepProgress(String current, String name, String total) {
    return 'Langkah $current dari $total · $name';
  }

  @override
  String get builderStepReview => 'Review & sim';

  @override
  String get builderStepScreener => 'Screener';

  @override
  String get builderStepValid => 'Valid';

  @override
  String builderStepWeakened(int count) {
    String _temp0 = intl.Intl.pluralLogic(
      count,
      locale: localeName,
      other: '# setting dilonggarkan',
    );
    return '$_temp0';
  }

  @override
  String builderTitleEdit(String name) {
    return 'Edit strategi · $name';
  }

  @override
  String get builderTitleNew => 'Strategi baru';

  @override
  String builderValidationRange(String max, String min) {
    return 'Harus antara $min dan $max';
  }

  @override
  String coinTrailSnapshotNote(String rev) {
    return 'Nilai dan threshold saat itu (rev $rev).';
  }

  @override
  String get coinTrailStepBuy => 'Buy';

  @override
  String get coinTrailStepClosed => 'Ditutup';

  @override
  String get coinTrailStepEntry => 'Entry';

  @override
  String get coinTrailStepGuard => 'Guard';

  @override
  String get coinTrailStepScreen => 'Screen';

  @override
  String get coinTrailStepTp => 'Take profit';

  @override
  String get coinTrailStepTrail => 'Trailing stop';

  @override
  String coinTrailTitle(String coin, String strategy) {
    return 'Jejak koin · $coin ($strategy)';
  }

  @override
  String get commonActionApprove => 'Setujui';

  @override
  String get commonActionBack => 'Kembali';

  @override
  String get commonActionCancel => 'Batal';

  @override
  String get commonActionNext => 'Lanjut';

  @override
  String get commonActionRetry => 'Coba lagi';

  @override
  String get commonActionReview => 'Tinjau';

  @override
  String get commonActionSaveDraft => 'Simpan draf';

  @override
  String get commonActionSkip => 'Lewati';

  @override
  String get commonActionUndo => 'Urungkan';

  @override
  String get commonActionView => 'Lihat';

  @override
  String commonDurationHours(int count) {
    String _temp0 = intl.Intl.pluralLogic(
      count,
      locale: localeName,
      other: '# jam',
    );
    return '$_temp0';
  }

  @override
  String commonDurationMinutes(int count) {
    String _temp0 = intl.Intl.pluralLogic(
      count,
      locale: localeName,
      other: '# mnt',
    );
    return '$_temp0';
  }

  @override
  String commonDurationSeconds(int count) {
    String _temp0 = intl.Intl.pluralLogic(
      count,
      locale: localeName,
      other: '# dtk',
    );
    return '$_temp0';
  }

  @override
  String commonPnlDown(String amount) {
    return 'Turun $amount';
  }

  @override
  String get commonPnlFlat => 'Tidak berubah';

  @override
  String commonPnlUp(String amount) {
    return 'Naik $amount';
  }

  @override
  String commonStateSavedAt(String time) {
    return 'Draf tersimpan · $time';
  }

  @override
  String get commonStateSaving => 'Menyimpan…';

  @override
  String commonTimerLeft(String time) {
    return 'Sisa $time';
  }

  @override
  String get conflictActionDiscard => 'Buang editanku';

  @override
  String get conflictActionMerge => 'Muat ulang & simpan editanku';

  @override
  String get conflictActionReview => 'Tinjau perubahan';

  @override
  String conflictBannerBody(
      String actor, String base, String theirs, String time) {
    return '$actor menyimpan rev $theirs pukul $time. Editanmu berbasis rev $base dan belum disimpan.';
  }

  @override
  String conflictBannerConflicts(int count) {
    String _temp0 = intl.Intl.pluralLogic(
      count,
      locale: localeName,
      other: '# field berubah di kedua sisi.',
      zero: 'Tidak ada field yang bentrok — editanmu bisa digabung.',
    );
    return '$_temp0';
  }

  @override
  String get conflictBannerTitle => 'Strategi ini berubah saat kamu mengedit';

  @override
  String conflictDiffColBase(String rev) {
    return 'Basismu (rev $rev)';
  }

  @override
  String get conflictDiffColMine => 'Editanmu';

  @override
  String conflictDiffColTheirs(String rev) {
    return 'Tersimpan (rev $rev)';
  }

  @override
  String conflictDiffPick(String side) {
    String _temp0 = intl.Intl.selectLogic(
      side,
      {
        'mine': 'punyaku',
        'theirs': 'tersimpan',
        'other': 'basis',
      },
    );
    return 'Pakai $_temp0';
  }

  @override
  String conflictDiscardConfirm(int count) {
    String _temp0 = intl.Intl.pluralLogic(
      count,
      locale: localeName,
      other: '# editan',
    );
    return 'Buang $_temp0? Tidak bisa diurungkan.';
  }

  @override
  String get conflictRealGuardReconfirm =>
      'Perubahan guard di strategi Real SOL wajib dikonfirmasi ulang setelah digabung.';

  @override
  String conflictStateMerged(String rev) {
    return 'Digabung ke rev $rev. Tinjau, lalu publish.';
  }

  @override
  String get conflictStateOffline =>
      'Tidak bisa cek versi terbaru saat offline. Drafmu disimpan lokal.';

  @override
  String get dashboardFeedFilterAll => 'Semua';

  @override
  String get dashboardFeedFilterBuys => 'Buy';

  @override
  String get dashboardFeedFilterGuard => 'Guard';

  @override
  String get dashboardFeedFilterProposals => 'Proposal';

  @override
  String get dashboardFeedFilterSells => 'Sell';

  @override
  String get dashboardFeedTitle => 'Feed aktivitas';

  @override
  String get dashboardKpiAwaiting => 'Menunggu approval';

  @override
  String get dashboardKpiCash => 'Kas';

  @override
  String dashboardKpiExpiringSoon(int count) {
    String _temp0 = intl.Intl.pluralLogic(
      count,
      locale: localeName,
      other: '# kedaluwarsa < 2 mnt',
    );
    return '$_temp0';
  }

  @override
  String get dashboardKpiOpenPositions => 'Posisi terbuka';

  @override
  String get dashboardKpiRealizedPnl => 'PnL terealisasi';

  @override
  String get dashboardStrategiesColApproval => 'Approval';

  @override
  String get dashboardStrategiesColAvgHold => 'Rata-rata hold';

  @override
  String get dashboardStrategiesColMaxDd => 'Max DD';

  @override
  String get dashboardStrategiesColName => 'Nama';

  @override
  String get dashboardStrategiesColPnl => 'PnL';

  @override
  String get dashboardStrategiesColStatus => 'Status';

  @override
  String get dashboardStrategiesColWinRate => 'Win rate';

  @override
  String get dashboardStrategiesNew => 'Strategi baru';

  @override
  String get dashboardStrategiesTitle => 'Strategi';

  @override
  String dashboardSubtitlePractice(String start) {
    return 'Workspace Practice · mulai $start · update realtime';
  }

  @override
  String get dashboardTitle => 'Ringkasan tim';

  @override
  String get feedActorEntry => 'Entry';

  @override
  String get feedActorExecutor => 'Executor';

  @override
  String get feedActorExit => 'Exit';

  @override
  String get feedActorGuard => 'Guard';

  @override
  String get feedActorScreener => 'Screener';

  @override
  String get feedActorSystem => 'Sistem';

  @override
  String get feedActorYou => 'Kamu';

  @override
  String feedEventBlocked(String coin) {
    return 'Memblokir $coin';
  }

  @override
  String feedEventBought(String coin, String sol) {
    return 'Membeli $coin · $sol';
  }

  @override
  String feedEventExpired(String coin) {
    return 'Proposal $coin kedaluwarsa';
  }

  @override
  String feedEventPassed(String coin, String pass, String score) {
    return 'Lolos $coin · fit $score/$pass';
  }

  @override
  String feedEventSkipped(String coin) {
    return 'Melewati pick $coin';
  }

  @override
  String feedEventSold(String coin, String pnl) {
    return 'Menjual $coin · $pnl';
  }

  @override
  String get guardWeakenAfterAudit =>
      'Tercatat di audit log (siapa, kapan, device, diff)';

  @override
  String get guardWeakenAfterAutoRevert =>
      'Auto-revert wajib setelah 24 jam kecuali dikonfirmasi ulang';

  @override
  String get guardWeakenAfterCooldown =>
      'Cooldown wajib 10 menit sebelum berlaku (bisa dibatalkan)';

  @override
  String get guardWeakenAfterNotify =>
      'Semua device dan email diberi notifikasi';

  @override
  String get guardWeakenCancel => 'Batal (Esc)';

  @override
  String get guardWeakenChanges => 'Perubahan (sebelum → sesudah)';

  @override
  String get guardWeakenDirectionLooser => 'lebih longgar';

  @override
  String get guardWeakenDirectionOff => 'dimatikan';

  @override
  String get guardWeakenHoldPractice => 'Tahan 1,2 dtk untuk melonggarkan';

  @override
  String get guardWeakenHoldReal => 'Tahan 2,5 dtk untuk melonggarkan';

  @override
  String guardWeakenMatch(String matched, String total) {
    return '$matched dari $total karakter cocok';
  }

  @override
  String guardWeakenRiskLevel(String level) {
    String _temp0 = intl.Intl.selectLogic(
      level,
      {
        'low': 'Rendah',
        'medium': 'Sedang',
        'high': 'Tinggi',
        'other': 'Kritis',
      },
    );
    return 'Level risiko: $_temp0';
  }

  @override
  String get guardWeakenRiskTitle =>
      'Dampak risiko (replay 7 hari data paper kita)';

  @override
  String get guardWeakenTitlePractice => 'Kamu akan melonggarkan guard';

  @override
  String get guardWeakenTitleReal =>
      'Kamu akan MELONGGARKAN guard di strategi Real SOL';

  @override
  String get guardWeakenTypeName => 'Ketik nama strategi untuk konfirmasi';

  @override
  String get loginButtonApple => 'Lanjutkan dengan Apple';

  @override
  String get loginButtonEmail => 'Kirim kode 6 digit';

  @override
  String get loginButtonGoogle => 'Lanjutkan dengan Google';

  @override
  String get loginButtonTelegram => 'Masuk dengan Telegram';

  @override
  String get loginButtonWallet => 'Hubungkan wallet Solana';

  @override
  String get loginEmailLabel => 'Email';

  @override
  String get loginOr => 'atau';

  @override
  String loginOtpLocked(String minutes) {
    return 'Terlalu banyak percobaan. Coba lagi dalam $minutes mnt.';
  }

  @override
  String loginOtpResendIn(String time) {
    return 'Kirim ulang dalam $time';
  }

  @override
  String loginOtpSentTo(String email) {
    return 'Dikirim ke $email';
  }

  @override
  String get loginOtpTitle => 'Masukkan kode';

  @override
  String loginOtpWrong(int remaining) {
    String _temp0 = intl.Intl.pluralLogic(
      remaining,
      locale: localeName,
      other: 'Kode salah. Sisa # percobaan.',
    );
    return '$_temp0';
  }

  @override
  String get loginPracticeDefault => 'Akun baru selalu mulai di mode PRACTICE.';

  @override
  String get loginSubtitle =>
      'Satu akun, banyak metode masuk. Bisa ditambah nanti.';

  @override
  String get loginTelegramExpired => 'Link ini kedaluwarsa. Minta link baru.';

  @override
  String get loginTelegramReopen => 'Buka Telegram lagi';

  @override
  String get loginTelegramTitle => 'Lanjut di Telegram';

  @override
  String get loginTelegramWaiting => 'Menunggu konfirmasi…';

  @override
  String get loginTerms =>
      'Dengan melanjutkan kamu setuju dengan Ketentuan dan Kebijakan Privasi.';

  @override
  String get loginTitle => 'Masuk atau buat akun';

  @override
  String get loginWalletRejected =>
      'Tanda tangan ditolak. Tidak ada yang ditandatangani.';

  @override
  String get loginWalletSignNote =>
      'Kamu menandatangani pesan, bukan transaksi. Tanpa biaya.';

  @override
  String get loginWalletSignTitle => 'Tanda tangani untuk masuk';

  @override
  String get modePracticeBanner =>
      'Practice · paper SOL, tidak ada SOL nyata yang bergerak';

  @override
  String get modePracticeBannerShort => 'Practice · paper SOL';

  @override
  String get modePracticeLabel => 'PRACTICE';

  @override
  String get modeRealBanner =>
      'Real SOL · wallet terhubung, order memakai SOL nyata';

  @override
  String get modeRealBannerShort => 'Real SOL · uang nyata';

  @override
  String get modeRealLabel => 'REAL SOL';

  @override
  String get modeSwitchToRealHold => 'Tahan untuk pindah ke Real SOL';

  @override
  String get modeSwitchToRealRequirements =>
      'Butuh trading wallet terhubung dan 2FA.';

  @override
  String get modeSwitchToRealTitle => 'Pindah ke Real SOL?';

  @override
  String get modeSwitchToastPractice => 'Kembali ke Practice';

  @override
  String get navActivity => 'Aktivitas';

  @override
  String get navApprovals => 'Approvals';

  @override
  String get navCoins => 'Koin';

  @override
  String get navDashboard => 'Dashboard';

  @override
  String get navHome => 'Beranda';

  @override
  String get navMore => 'Lainnya';

  @override
  String get navPositions => 'Posisi';

  @override
  String get navSearchPlaceholder => 'Cari koin atau strategi';

  @override
  String get navSettings => 'Pengaturan';

  @override
  String get navStrategies => 'Strategi';

  @override
  String get notifActionApprove => 'Setujui';

  @override
  String get notifActionCancelChange => 'Batalkan perubahan';

  @override
  String get notifActionOpenPick => 'Buka pick';

  @override
  String get notifActionSkip => 'Lewati';

  @override
  String get notifApprovedBody => 'Order sedang diproses';

  @override
  String notifApprovedTitle(String coin) {
    return 'Disetujui: $coin';
  }

  @override
  String notifExpiredBody(String reason) {
    return '$reason';
  }

  @override
  String notifExpiredTitle(String coin, String mode) {
    String _temp0 = intl.Intl.selectLogic(
      mode,
      {
        'real': 'REAL SOL',
        'other': 'PRACTICE',
      },
    );
    return '[$_temp0] $coin kedaluwarsa';
  }

  @override
  String notifFailedBody(String mode, String reason) {
    String _temp0 = intl.Intl.selectLogic(
      mode,
      {
        'real': 'Biaya jaringan mungkin terpakai.',
        'other': 'Tidak ada SOL terpakai.',
      },
    );
    return '$reason. $_temp0';
  }

  @override
  String notifFailedTitle(String coin, String mode) {
    String _temp0 = intl.Intl.selectLogic(
      mode,
      {
        'real': 'REAL SOL',
        'other': 'PRACTICE',
      },
    );
    return '[$_temp0] Buy $coin gagal';
  }

  @override
  String notifFilledBody(String price, String sol) {
    return '$sol di $price · exit plan aktif';
  }

  @override
  String notifFilledTitle(String coin, String mode) {
    String _temp0 = intl.Intl.selectLogic(
      mode,
      {
        'real': 'REAL SOL',
        'other': 'PRACTICE',
      },
    );
    return '[$_temp0] Terbeli $coin';
  }

  @override
  String notifFirstBuyBody(String sol) {
    return 'Strategi ini belum pernah beli. Cek sebelum mulai · $sol';
  }

  @override
  String notifFirstBuyTitle(String coin, String mode, String strategy) {
    String _temp0 = intl.Intl.selectLogic(
      mode,
      {
        'real': 'REAL SOL',
        'other': 'PRACTICE',
      },
    );
    return '[$_temp0] Buy pertama $strategy: $coin';
  }

  @override
  String get notifGroupedBody => 'Buka antrean untuk meninjau';

  @override
  String notifGroupedTitle(int count, String mode) {
    String _temp0 = intl.Intl.selectLogic(
      mode,
      {
        'real': 'REAL SOL',
        'other': 'PRACTICE',
      },
    );
    String _temp1 = intl.Intl.pluralLogic(
      count,
      locale: localeName,
      other: '# pick menunggu approval',
    );
    return '[$_temp0] $_temp1';
  }

  @override
  String notifGuardActiveBody(String time) {
    return 'Auto-revert $time';
  }

  @override
  String notifGuardActiveTitle(String mode, String strategy) {
    String _temp0 = intl.Intl.selectLogic(
      mode,
      {
        'real': 'REAL SOL',
        'other': 'PRACTICE',
      },
    );
    return '[$_temp0] Guard $strategy kini lebih longgar';
  }

  @override
  String notifGuardCooldownBody(String strategy, String time) {
    return '$strategy: berlaku $time. Batalkan jika bukan kamu.';
  }

  @override
  String get notifGuardCooldownTitle =>
      '[REAL SOL] Guard dilonggarkan dalam 10 mnt';

  @override
  String notifGuardRequestedBody(
      String from, String setting, String strategy, String to) {
    return '$strategy: $setting $from → $to melonggarkan guard';
  }

  @override
  String notifGuardRequestedTitle(String mode) {
    String _temp0 = intl.Intl.selectLogic(
      mode,
      {
        'real': 'REAL SOL',
        'other': 'PRACTICE',
      },
    );
    return '[$_temp0] Perubahan guard menunggu';
  }

  @override
  String notifGuardRevertedBody(String from, String setting) {
    return '$setting kembali ke $from';
  }

  @override
  String notifGuardRevertedTitle(String strategy) {
    return '[REAL SOL] Guard $strategy dikembalikan';
  }

  @override
  String notifLossStopBody(String pct) {
    return 'Turun $pct dari puncak. Re-arm butuh approval.';
  }

  @override
  String notifLossStopTitle(String mode, String strategy) {
    String _temp0 = intl.Intl.selectLogic(
      mode,
      {
        'real': 'REAL SOL',
        'other': 'PRACTICE',
      },
    );
    return '[$_temp0] $strategy dijeda';
  }

  @override
  String get notifModePracticeBody => 'Order memakai paper SOL';

  @override
  String get notifModePracticeTitle => 'Kembali ke PRACTICE';

  @override
  String get notifModeRealBody => 'Order berikutnya memakai SOL nyata';

  @override
  String get notifModeRealTitle => 'Sekarang di REAL SOL';

  @override
  String get notifOfflineBody => 'Data mungkin tertunda. Mencoba lagi…';

  @override
  String get notifOfflineTitle => 'Koneksi ke server terputus';

  @override
  String notifPickPendingBody(String sol, String strategy, String time) {
    return '$strategy · $sol · sisa $time';
  }

  @override
  String notifPickPendingTitle(String coin, String mode) {
    String _temp0 = intl.Intl.selectLogic(
      mode,
      {
        'real': 'REAL SOL',
        'other': 'PRACTICE',
      },
    );
    return '[$_temp0] $coin menunggu approval';
  }

  @override
  String notifSkippedBody(String reason) {
    return 'Alasan: $reason';
  }

  @override
  String notifSkippedTitle(String coin) {
    return 'Dilewati: $coin';
  }

  @override
  String notifSlHitBody(String pct, String pnl, String stop_type) {
    return '$stop_type · $pnl ($pct)';
  }

  @override
  String notifSlHitTitle(String coin, String mode) {
    String _temp0 = intl.Intl.selectLogic(
      mode,
      {
        'real': 'REAL SOL',
        'other': 'PRACTICE',
      },
    );
    return '[$_temp0] Stop $coin';
  }

  @override
  String get notifTokenInvalidBody => 'Buka app untuk melanjutkan';

  @override
  String get notifTokenInvalidTitle => 'Aksi notifikasi kedaluwarsa';

  @override
  String notifTpHitBody(String pct, String pct_sold, String pnl) {
    return 'Terjual $pct_sold di +$pct · $pnl';
  }

  @override
  String notifTpHitTitle(String coin, String mode) {
    String _temp0 = intl.Intl.selectLogic(
      mode,
      {
        'real': 'REAL SOL',
        'other': 'PRACTICE',
      },
    );
    return '[$_temp0] Take profit $coin';
  }

  @override
  String get positionsEquityHwm => 'High-water mark';

  @override
  String positionsEquityTitle(String range) {
    return 'Ekuitas · $range';
  }

  @override
  String positionsNextAction(String gain, String pct, String rung) {
    return 'Berikutnya: $rung di $gain (jual $pct)';
  }

  @override
  String positionsOpenCount(int count) {
    String _temp0 = intl.Intl.pluralLogic(
      count,
      locale: localeName,
      other: '# terbuka',
    );
    return '$_temp0';
  }

  @override
  String get positionsSellEstimate => 'Perkiraan diterima';

  @override
  String positionsSellHoldPractice(String pct) {
    return 'Tahan 1,2 dtk untuk jual $pct';
  }

  @override
  String positionsSellHoldReal(String pct) {
    return 'Tahan 2,5 dtk untuk jual $pct';
  }

  @override
  String get positionsSellHoldReleased =>
      'Dilepas terlalu cepat — tidak ada yang dijual';

  @override
  String get positionsSellNeverFromNotification =>
      'Jual tidak pernah tersedia dari notifikasi atau popup.';

  @override
  String get positionsSellPlanCancelled => 'Exit plan dibatalkan (100%)';

  @override
  String get positionsSellRemainingPlan =>
      'Sisa posisi tetap memakai exit plan';

  @override
  String positionsSellTitle(String coin) {
    return 'Jual $coin';
  }

  @override
  String get positionsTitle => 'Posisi';

  @override
  String queueBatchApprove(int count) {
    String _temp0 = intl.Intl.pluralLogic(
      count,
      locale: localeName,
      other: 'Setujui # pick',
    );
    return '$_temp0';
  }

  @override
  String queueBatchSelected(int count) {
    String _temp0 = intl.Intl.pluralLogic(
      count,
      locale: localeName,
      other: '# dipilih',
    );
    return '$_temp0';
  }

  @override
  String queueBatchTotal(String sol) {
    return 'Total $sol';
  }

  @override
  String queueExpiredReasonGuardFailed(String reason) {
    return 'Guard gagal saat menunggu: $reason';
  }

  @override
  String queueExpiredReasonPriceRan(String pct) {
    return 'Harga naik $pct melewati batas entry';
  }

  @override
  String get queueExpiredReasonStrategyArchived => 'Strategi diarsipkan';

  @override
  String get queueExpiredReasonStrategyDeleted => 'Strategi dihapus';

  @override
  String get queueExpiredReasonTimedOut => 'Waktu approval habis';

  @override
  String get queueGuardReject => 'Tolak perubahan';

  @override
  String get queuePickApprove => 'Setujui';

  @override
  String get queuePickCannotApprove => 'Tidak bisa disetujui';

  @override
  String queuePickExpiresIn(String time) {
    return 'Kedaluwarsa dalam $time';
  }

  @override
  String get queuePickKindBuy => 'Buy';

  @override
  String get queuePickKindFirstBuy => 'Buy pertama';

  @override
  String get queuePickKindGuardChange => 'Melonggarkan guard';

  @override
  String get queuePickReviewChange => 'Tinjau perubahan';

  @override
  String get queuePickSkip => 'Lewati';

  @override
  String get queueRealApproveButton => 'Setujui dengan Real SOL';

  @override
  String queueRealBatchConfirmTitle(int count) {
    String _temp0 = intl.Intl.pluralLogic(
      count,
      locale: localeName,
      other: 'Setujui # buy dengan REAL SOL?',
    );
    return '$_temp0';
  }

  @override
  String queueRealHold(String sol) {
    return 'Tahan untuk setujui $sol';
  }

  @override
  String get queueSkipReasonAlreadyPumped => 'Sudah pump';

  @override
  String get queueSkipReasonOther => 'Lainnya…';

  @override
  String get queueSkipReasonSuspiciousDev => 'Dev mencurigakan';

  @override
  String get queueSkipReasonThinLiquidity => 'Likuiditas tipis';

  @override
  String get queueSwipeDisabledReal =>
      'Geser nonaktif di Real SOL. Pakai tombol.';

  @override
  String get queueSwipeHint => 'Geser kanan untuk setujui · kiri untuk lewati';

  @override
  String get queueTabApproved => 'Disetujui';

  @override
  String get queueTabExpired => 'Kedaluwarsa';

  @override
  String get queueTabPending => 'Pending';

  @override
  String get queueTabSkipped => 'Dilewati';

  @override
  String queueTabWithCount(String count, String label) {
    return '$label · $count';
  }

  @override
  String get queueTitle => 'Antrean approval';

  @override
  String get queueWhyFirstBuy =>
      'Mode approval “Tanya: buy pertama”. Ini buy pertama strategi ini.';

  @override
  String get queueWhyTitle => 'Kenapa butuh approval?';

  @override
  String get settingsAppearanceDensityComfortable => 'Comfortable';

  @override
  String get settingsAppearanceDensityCompact => 'Compact';

  @override
  String get settingsAppearanceDensityLabel => 'Kepadatan';

  @override
  String get settingsAppearanceThemeDark => 'Gelap';

  @override
  String get settingsAppearanceThemeLabel => 'Tema';

  @override
  String get settingsAppearanceThemeLight => 'Terang';

  @override
  String get settingsAppearanceThemeSystem => 'Ikuti sistem';

  @override
  String get settingsLanguageLabel => 'Bahasa';

  @override
  String settingsLanguageNumberFormat(String example) {
    return 'Angka mengikuti bahasa: $example';
  }

  @override
  String get settingsLoginLastMethodLock =>
      'Ini satu-satunya metode masuk. Hubungkan metode lain sebelum memutus.';

  @override
  String get settingsLoginLink => 'Hubungkan';

  @override
  String get settingsLoginLinked => 'Terhubung';

  @override
  String get settingsLoginReauth =>
      'Konfirmasi bahwa ini kamu untuk melanjutkan';

  @override
  String get settingsLoginUnlink => 'Putuskan';

  @override
  String get settingsLoginWalletNote =>
      'Wallet login hanya untuk identitas. Tidak bisa trading.';

  @override
  String get settingsModeDefaultApproval => 'Mode approval default';

  @override
  String get settingsModeDefaultNewStrategy => 'Strategi baru mulai di';

  @override
  String get settingsNotifDesktopPopup => 'Popup desktop selalu di atas';

  @override
  String get settingsNotifEmail => 'Email';

  @override
  String get settingsNotifPracticeActions =>
      'Izinkan Setujui dari notifikasi (khusus Practice)';

  @override
  String get settingsNotifPush => 'Notifikasi push';

  @override
  String get settingsSectionAppearance => 'Tampilan';

  @override
  String get settingsSectionLanguage => 'Bahasa';

  @override
  String get settingsSectionLoginMethods => 'Metode masuk';

  @override
  String get settingsSectionModeDefaults => 'Mode & default';

  @override
  String get settingsSectionNotifications => 'Notifikasi';

  @override
  String get settingsSectionProfile => 'Profil';

  @override
  String get settingsSectionSecurity => 'Keamanan';

  @override
  String get settingsSectionTradingWallet => 'Trading wallet';

  @override
  String get settingsSecurity2fa => 'Autentikasi dua faktor';

  @override
  String get settingsSecurityAudit => 'Audit log';

  @override
  String get settingsSecuritySessions => 'Sesi & device';

  @override
  String get settingsSecuritySignOutDevice => 'Keluar';

  @override
  String get settingsSecurityThisDevice => 'Device ini';

  @override
  String get settingsWalletNotConnected =>
      'Belum terhubung. Real SOL tetap nonaktif.';

  @override
  String get settingsWalletSeparateNote =>
      'Terpisah dari wallet login. Withdraw butuh 2FA, approval email, dan alamat allow-list.';

  @override
  String get settingsWalletTitle => 'Trading wallet (Real SOL)';

  @override
  String get shortcutA => 'Setujui item fokus';

  @override
  String get shortcutEnter => 'Pop-out chart';

  @override
  String get shortcutEsc => 'Tutup / batal';

  @override
  String get shortcutJk => 'Berikut / sebelum';

  @override
  String get shortcutS => 'Lewati (dengan alasan)';

  @override
  String get shortcutShiftA => 'Setujui yang dipilih';

  @override
  String get shortcutShiftX => 'Jual posisi fokus';

  @override
  String get shortcutSpace => 'Detail / quick-look';

  @override
  String get shortcutX => 'Pilih / batal pilih';

  @override
  String get strategyApprovalModeAskEveryBuy => 'Tanya: setiap buy';

  @override
  String get strategyApprovalModeAskFirstBuy => 'Tanya: buy pertama';

  @override
  String get strategyApprovalModeOff => 'Off (otomatis)';

  @override
  String get strategyStatusDraft => 'Draf';

  @override
  String get strategyStatusPaused => 'Dijeda';

  @override
  String get strategyStatusRunning => 'Berjalan';

  @override
  String get tableMobileCollapse => 'Sembunyikan detail';

  @override
  String get tableMobileExpand => 'Tampilkan detail';

  @override
  String get tableMobileScrollHint => 'Geser untuk kolom lain';
}
