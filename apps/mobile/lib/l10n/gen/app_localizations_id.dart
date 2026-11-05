// ignore: unused_import
import 'package:intl/intl.dart' as intl;
import 'app_localizations.dart';

// ignore_for_file: type=lint

/// The translations for Indonesian (`id`).
class AppLocalizationsId extends AppLocalizations {
  AppLocalizationsId([String locale = 'id']) : super(locale);

  @override
  String alertApproveBefore(String mm_ss, String symbol) {
    return 'Setujui $symbol sebelum $mm_ss';
  }

  @override
  String alertGuardRejected(String symbol) {
    return 'Tinjau $symbol: Guard menolak buy';
  }

  @override
  String alertTpHit(String n, String pct, String symbol) {
    return 'Cek $symbol: TP$n tercapai, $pct% terjual';
  }

  @override
  String get appAboutTitle => 'Tentang Centurion Trade';

  @override
  String appAboutVersion(String build, String version) {
    return 'Versi $version ($build)';
  }

  @override
  String get appName => 'Centurion Trade';

  @override
  String get appSplashLoading => 'Memulai Centurion Trade…';

  @override
  String get appTitle => 'Centurion Trade · bot trading Solana';

  @override
  String get authSiwsStatement => 'Sign in to Centurion Trade';

  @override
  String get builderApprovalModeRealNote => 'Real SOL: “Off” tidak tersedia di MVP.';

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
  String get builderExitStall => 'Exit stagnan';

  @override
  String builderExitStallHint(String min_move_pct, String window) {
    return 'Jual semua bila harga bergerak kurang dari $min_move_pct dalam $window';
  }

  @override
  String get builderExitTimeStop => 'Time stop';

  @override
  String builderExitTimeStopHint(String duration) {
    return 'Jual semua setelah ditahan $duration';
  }

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
    final intl.NumberFormat countNumberFormat = intl.NumberFormat.decimalPattern(localeName);
    final String countString = countNumberFormat.format(count);

    String _temp0 = intl.Intl.pluralLogic(count, locale: localeName, other: '$countString setting dilonggarkan');
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
  String get chartTitle => 'Chart';

  @override
  String get closePreviewExpectedOut => 'Estimasi SOL keluar';

  @override
  String get closePreviewExpired => 'Preview kedaluwarsa — perbarui untuk lanjut';

  @override
  String get closePreviewMinReceived => 'Minimal diterima';

  @override
  String get closePreviewRefresh => 'Perbarui preview';

  @override
  String get closePreviewRefreshing => 'Memperbarui preview…';

  @override
  String get closePreviewSwapFeeFromOutput => 'diambil dari hasil jual';

  @override
  String get closePreviewUnavailable => 'Preview belum tersedia, jadi jual Real tetap nonaktif.';

  @override
  String closePreviewValid(int seconds) {
    final intl.NumberFormat secondsNumberFormat = intl.NumberFormat.decimalPattern(localeName);
    final String secondsString = secondsNumberFormat.format(seconds);

    String _temp0 = intl.Intl.pluralLogic(seconds, locale: localeName, other: 'Preview berlaku $secondsString dtk');
    return '$_temp0';
  }

  @override
  String get closePreviewYouSell => 'Kamu jual';

  @override
  String get coinMcapSourceCurve => '(curve)';

  @override
  String get coinMcapSourcePool => '(pool)';

  @override
  String get coinMcapSourceUnavailable => 'Sumber tidak tersedia';

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
  String coinTrailTitle(String strategy, String symbol) {
    return 'Jejak koin · $symbol ($strategy)';
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
    final intl.NumberFormat countNumberFormat = intl.NumberFormat.decimalPattern(localeName);
    final String countString = countNumberFormat.format(count);

    String _temp0 = intl.Intl.pluralLogic(count, locale: localeName, other: '$countString jam');
    return '$_temp0';
  }

  @override
  String commonDurationMinutes(int count) {
    final intl.NumberFormat countNumberFormat = intl.NumberFormat.decimalPattern(localeName);
    final String countString = countNumberFormat.format(count);

    String _temp0 = intl.Intl.pluralLogic(count, locale: localeName, other: '$countString mnt');
    return '$_temp0';
  }

  @override
  String commonDurationSeconds(int count) {
    final intl.NumberFormat countNumberFormat = intl.NumberFormat.decimalPattern(localeName);
    final String countString = countNumberFormat.format(count);

    String _temp0 = intl.Intl.pluralLogic(count, locale: localeName, other: '$countString dtk');
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
  String get commonRange1d => '1H';

  @override
  String get commonRange30d => '30H';

  @override
  String get commonRange7d => '7H';

  @override
  String get commonRangeAll => 'Semua';

  @override
  String get commonStateLoading => 'Memuat…';

  @override
  String commonStateLoadingSection(String section) {
    return 'Memuat $section…';
  }

  @override
  String commonStateSavedAt(String time) {
    return 'Draf tersimpan · $time';
  }

  @override
  String get commonStateSaving => 'Menyimpan…';

  @override
  String commonTimerLeft(String mm_ss) {
    return 'Sisa $mm_ss';
  }

  @override
  String get commonValueUnavailable => 'Data belum tersedia';

  @override
  String get commonYou => 'Kamu';

  @override
  String get conflictActionDiscard => 'Buang editanku';

  @override
  String get conflictActionMerge => 'Muat ulang & simpan editanku';

  @override
  String get conflictActionReview => 'Tinjau perubahan';

  @override
  String conflictBannerBody(String base_rev, String current_rev) {
    return 'Tersimpan sebagai rev $current_rev. Editanmu berbasis rev $base_rev dan belum disimpan.';
  }

  @override
  String conflictBannerChangedBy(String actor, String changed_at, String device, String via) {
    String _temp0 = intl.Intl.selectLogic(via, {
      'web': 'web',
      'mobile': 'mobile',
      'desktop': 'desktop',
      'mcp': 'agen MCP',
      'push': 'notifikasi',
      'other': 'app',
    });
    return 'Diubah oleh $actor via $_temp0 di $device · $changed_at';
  }

  @override
  String conflictBannerConflicts(int count) {
    final intl.NumberFormat countNumberFormat = intl.NumberFormat.decimalPattern(localeName);
    final String countString = countNumberFormat.format(count);

    String _temp0 = intl.Intl.pluralLogic(
      count,
      locale: localeName,
      zero: 'Tidak ada field yang bentrok — editanmu bisa digabung.',
      other: '$countString field berubah di kedua sisi.',
    );
    return '$_temp0';
  }

  @override
  String conflictBannerFields(String fields) {
    return 'Field yang berubah: $fields';
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
    String _temp0 = intl.Intl.selectLogic(side, {'mine': 'punyaku', 'theirs': 'tersimpan', 'other': 'basis'});
    return 'Pakai $_temp0';
  }

  @override
  String conflictDiscardConfirm(int count) {
    final intl.NumberFormat countNumberFormat = intl.NumberFormat.decimalPattern(localeName);
    final String countString = countNumberFormat.format(count);

    String _temp0 = intl.Intl.pluralLogic(count, locale: localeName, other: '$countString editan');
    return 'Buang $_temp0? Tidak bisa diurungkan.';
  }

  @override
  String get conflictGuardChangeCancelled =>
      'Perubahan guard tertunda dibatalkan karena strategi diedit di tempat lain. Ajukan ulang.';

  @override
  String get conflictRealGuardReconfirm =>
      'Ini melonggarkan guard di strategi Real SOL. Konfirmasi lengkap diulang dari awal; cooldown 10 menit dan auto-revert 24 jam dimulai ulang dari konfirmasi baru.';

  @override
  String conflictStateMerged(String rev) {
    return 'Digabung ke rev $rev. Tinjau, lalu publish.';
  }

  @override
  String get conflictStateOffline => 'Tidak bisa cek versi terbaru saat offline. Drafmu disimpan lokal.';

  @override
  String get dashboardBalanceRealLabel => 'Saldo Real · trading wallet';

  @override
  String get dashboardBalanceToday => 'hari ini';

  @override
  String get dashboardEyebrow => 'Command deck';

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
  String get dashboardHeadline => 'Semua posisimu, sekilas.';

  @override
  String get dashboardKpiAwaiting => 'Menunggu approval';

  @override
  String get dashboardKpiCash => 'Kas';

  @override
  String dashboardKpiExpiringSoon(int count) {
    final intl.NumberFormat countNumberFormat = intl.NumberFormat.decimalPattern(localeName);
    final String countString = countNumberFormat.format(count);

    String _temp0 = intl.Intl.pluralLogic(count, locale: localeName, other: '$countString kedaluwarsa < 2 mnt');
    return '$_temp0';
  }

  @override
  String get dashboardKpiOpenPositions => 'Posisi terbuka';

  @override
  String get dashboardKpiRealizedPnl => 'PnL terealisasi';

  @override
  String dashboardNeedsActionCount(int count) {
    final intl.NumberFormat countNumberFormat = intl.NumberFormat.decimalPattern(localeName);
    final String countString = countNumberFormat.format(count);

    String _temp0 = intl.Intl.pluralLogic(count, locale: localeName, other: '$countString baru');
    return '$_temp0';
  }

  @override
  String get dashboardNeedsActionTitle => 'Perlu tindakan';

  @override
  String get dashboardStatDailyLimitReal => 'Limit harian Real';

  @override
  String get dashboardStatOpenPositions => 'Posisi terbuka';

  @override
  String get dashboardStatPaperStrategies => 'Strategi Paper';

  @override
  String get dashboardStatRealizedToday => 'PnL terealisasi · hari ini';

  @override
  String get dashboardStatWinRate7d => 'Win rate · 7 hari';

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
    return 'Strategi Paper · mulai $start · update realtime';
  }

  @override
  String get dashboardTitle => 'Ringkasan tim';

  @override
  String get errorCodeAccountDeletionBlocked => 'Tutup posisi Real SOL dan tarik saldo trading wallet dulu.';

  @override
  String get errorCodeAccountDeletionPending => 'Penghapusan akun sudah dijadwalkan.';

  @override
  String get errorCodeAgentBudgetExceeded => 'Agen mencapai batas panggilan. Coba lagi nanti.';

  @override
  String get errorCodeAgentRequestExpired => 'Permintaan koneksi agen ini kedaluwarsa. Mulai lagi dari agen.';

  @override
  String get errorCodeAgentTradeDisabled => 'Trading oleh agen nonaktif. Aktifkan di aplikasi Centurion Trade.';

  @override
  String get errorCodeApprovalAlreadyDecided => 'Ini sudah diputuskan di device lain.';

  @override
  String errorCodeApprovalExpired(String reason) {
    return 'Proposal ini kedaluwarsa: $reason';
  }

  @override
  String get errorCodeApprovalRequiresApp => 'Putuskan ini di aplikasi resmi, bukan lewat MCP.';

  @override
  String get errorCodeApprovalTokenInvalid => 'Aksi notifikasi ini kedaluwarsa. Buka app untuk melanjutkan.';

  @override
  String get errorCodeAuthTgInvalid => 'Login Telegram tidak bisa diverifikasi. Coba lagi.';

  @override
  String get errorCodeAuthTgNoProfile => 'Izinkan Telegram membagikan profil untuk masuk.';

  @override
  String get errorCodeAuthTgReplay => 'Login Telegram ini sudah dipakai. Mulai lagi.';

  @override
  String get errorCodeBuysPaused => 'Pembelian baru dihentikan. Lanjutkan pembelian dulu.';

  @override
  String get errorCodeConfirmationInvalid => 'Konfirmasi ini kedaluwarsa atau sudah dipakai. Mulai lagi.';

  @override
  String get errorCodeConfirmationRequired => 'Perubahan ini perlu konfirmasi: passkey, ketik nama, lalu tahan.';

  @override
  String get errorCodeConfirmationRestartRequired => 'Strategi berubah saat konfirmasi. Ulangi konfirmasi dari awal.';

  @override
  String get errorCodeForbiddenRole => 'Peran di workspace tidak mengizinkan tindakan ini.';

  @override
  String get errorCodeForbiddenScope => 'Token ini tidak punya izin untuk tindakan ini.';

  @override
  String get errorCodeGuardCooldownActive => 'Perubahan guard ini sedang cooldown.';

  @override
  String get errorCodeGuardWeakenRequiresApproval =>
      'Perubahan menunggu approval. Ini melonggarkan guard, jadi belum berlaku sampai kamu approve.';

  @override
  String get errorCodeHoldTooShort => 'Dilepas terlalu cepat. Tahan sampai bar penuh.';

  @override
  String get errorCodeInternal => 'Terjadi kesalahan. Coba lagi.';

  @override
  String get errorCodeInvalidFraction => 'Pilih porsi jual dari 0,01% sampai 100%.';

  @override
  String get errorCodeJobDeadLettered =>
      'Tugas latar belakang gagal setelah semua percobaan. Tim support sudah diberi tahu.';

  @override
  String get errorCodeLastLoginMethod => 'Ini satu-satunya metode masuk. Hubungkan metode lain sebelum memutus.';

  @override
  String get errorCodeLogoNotFound => 'Logo koin ini tidak ada. Inisial simbol ditampilkan sebagai gantinya.';

  @override
  String get errorCodeLogoRejected => 'Logo koin ini ditolak. Inisial simbol ditampilkan sebagai gantinya.';

  @override
  String get errorCodeLoosenRequiresApp => 'Buka aplikasi Centurion Trade untuk melonggarkan limit atau guard.';

  @override
  String get errorCodeModeNotAllowed => 'Strategi ini belum disetujui untuk mode Real';

  @override
  String get errorCodeNotFound => 'Data tidak ditemukan atau tidak dapat diakses.';

  @override
  String get errorCodeOtpInvalid => 'Kode salah atau kedaluwarsa.';

  @override
  String get errorCodeOtpLocked => 'Terlalu banyak percobaan. Coba lagi dalam 15 menit.';

  @override
  String get errorCodePositionAlreadyClosed => 'Posisi ini sudah ditutup.';

  @override
  String get errorCodePracticeCashInsufficient =>
      'Saldo paper tidak cukup untuk entry berikutnya. Entry dijeda sampai saldo pulih atau Paper direset.';

  @override
  String get errorCodeQuoteMissingOrStale => 'Quote kedaluwarsa — perbarui lalu cek ulang nilainya sebelum approve.';

  @override
  String errorCodeRateLimited(int retry_after_s) {
    final intl.NumberFormat retry_after_sNumberFormat = intl.NumberFormat.decimalPattern(localeName);
    final String retry_after_sString = retry_after_sNumberFormat.format(retry_after_s);

    String _temp0 = intl.Intl.pluralLogic(retry_after_s, locale: localeName, other: '$retry_after_sString detik');
    return 'Terlalu banyak permintaan. Coba lagi dalam $_temp0.';
  }

  @override
  String get errorCodeRealSolDisabled => 'Real SOL belum tersedia.';

  @override
  String get errorCodeReauthRequired => 'Konfirmasi ulang identitasmu untuk melanjutkan.';

  @override
  String get errorCodeReplayUnavailable => 'Replay sedang tidak tersedia. Menampilkan estimasi.';

  @override
  String errorCodeResetCooldown(String next_allowed_at) {
    return 'Paper bisa di-reset sekali sehari. Berikutnya: $next_allowed_at';
  }

  @override
  String get errorCodeResumeRequiresApp => 'Pembelian dijeda dari aplikasi. Lanjutkan lewat aplikasi Centurion Trade.';

  @override
  String get errorCodeSettingsSchemaInvalid => 'Pengaturan strategi tidak sesuai skema. Cek kolom yang ditandai.';

  @override
  String get errorCodeSiwsNonceInvalid => 'Permintaan masuk kedaluwarsa. Coba lagi.';

  @override
  String get errorCodeSiwsSessionRequired => 'Masuk dengan wallet di aplikasi Centurion Trade.';

  @override
  String get errorCodeSiwsSignatureInvalid => 'Tanda tangan wallet tidak bisa diverifikasi.';

  @override
  String get errorCodeSourceDegraded => 'Sumber data pasar sedang terganggu. Pick baru mungkin tertunda.';

  @override
  String get errorCodeStrategyRetired => 'Strategi ini sudah diarsipkan atau dihapus.';

  @override
  String get errorCodeStrategyRevConflict => 'Strategi ini berubah saat kamu mengedit.';

  @override
  String get errorCodeTwoFactorRequired => 'Masukkan kode 2FA untuk melanjutkan.';

  @override
  String get errorCodeTypedConfirmationMismatch => 'Nama tidak sama persis.';

  @override
  String get errorCodeUnauthenticated => 'Sesi berakhir. Masuk lagi.';

  @override
  String get errorCodeUnavailable => 'Layanan sementara tidak tersedia. Mencoba lagi…';

  @override
  String get errorCodeValidationFailed => 'Ada nilai yang tidak valid. Cek kolom yang ditandai.';

  @override
  String get errorCodeVersionConflict => 'Data sudah berubah. Muat ulang lalu coba lagi.';

  @override
  String get errorCodeWalletRoleConflict => 'Wallet login tidak bisa sekaligus menjadi trading wallet.';

  @override
  String get errorCodeWebauthnInvalid => 'Verifikasi passkey gagal. Coba lagi.';

  @override
  String get exitReasonDrawdownHalt => 'Henti drawdown';

  @override
  String get exitReasonIdle => 'Exit tanpa trade';

  @override
  String get exitReasonLossGuard => 'Stop loss';

  @override
  String get exitReasonManual => 'Jual manual';

  @override
  String get exitReasonMaxHold => 'Time stop';

  @override
  String get exitReasonNoNewHigh => 'Tanpa high baru';

  @override
  String get exitReasonPeakTrail => 'Trailing stop';

  @override
  String get exitReasonPracticeReset => 'Paper di-reset';

  @override
  String get exitReasonProfitTarget => 'Take profit';

  @override
  String get exitReasonRugDetected => 'Rug terdeteksi';

  @override
  String get exitReasonSellFloor => 'Sell floor';

  @override
  String get exitReasonSellPressure => 'Tekanan jual';

  @override
  String get exitReasonStall => 'Exit stagnan';

  @override
  String get exitReasonStrategyRetired => 'Strategi dihentikan';

  @override
  String get expireReasonAccountDeletedBadge => 'Akun dihapus';

  @override
  String get expireReasonAccountDeletedDetail => 'Akun telah dihapus';

  @override
  String get expireReasonGuardFailedBadge => 'Guard gagal';

  @override
  String get expireReasonGuardFailedDetail => 'Cek guard gagal saat menunggu';

  @override
  String get expireReasonKillSwitchBadge => 'Real dihentikan';

  @override
  String get expireReasonKillSwitchDetail => 'Trading Real dihentikan';

  @override
  String get expireReasonPracticeResetBadge => 'Paper di-reset';

  @override
  String get expireReasonPracticeResetDetail => 'Paper di-reset; buy tertunda dihapus';

  @override
  String get expireReasonPriceMovedBadge => 'Harga bergerak';

  @override
  String get expireReasonPriceMovedDetail => 'Harga melewati batas entry';

  @override
  String get expireReasonStrategyArchivedBadge => 'Strategi diarsipkan';

  @override
  String expireReasonStrategyArchivedDetail(String strategy) {
    return '$strategy diarsipkan saat menunggu';
  }

  @override
  String get expireReasonStrategyDeletedBadge => 'Strategi dihapus';

  @override
  String expireReasonStrategyDeletedDetail(String strategy) {
    return '$strategy dihapus saat menunggu';
  }

  @override
  String get expireReasonTimeoutBadge => 'Waktu habis';

  @override
  String get expireReasonTimeoutDetail => 'Waktu approval habis';

  @override
  String get feedActorEntry => 'Entry';

  @override
  String get feedActorExecutor => 'Executor';

  @override
  String get feedActorExit => 'Exit';

  @override
  String get feedActorGuard => 'Guard';

  @override
  String get feedActorIngest => 'Ingest';

  @override
  String get feedActorScreener => 'Screener';

  @override
  String get feedActorSystem => 'Sistem';

  @override
  String get feedActorYou => 'Kamu';

  @override
  String feedEventBlocked(String symbol) {
    return 'Memblokir $symbol';
  }

  @override
  String feedEventBought(String amount_lamports, String symbol) {
    return 'Membeli $symbol · $amount_lamports';
  }

  @override
  String feedEventExpired(String symbol) {
    return 'Proposal $symbol kedaluwarsa';
  }

  @override
  String feedEventPassed(String pass, String score, String symbol) {
    return 'Lolos $symbol · fit $score/$pass';
  }

  @override
  String feedEventSkipped(String symbol) {
    return 'Melewati pick $symbol';
  }

  @override
  String feedEventSold(String pnl, String symbol) {
    return 'Menjual $symbol · $pnl';
  }

  @override
  String get guardChangeStatusExpired => 'Kedaluwarsa, belum di-approve';

  @override
  String get guardChangeStatusRejected => 'Ditolak';

  @override
  String guardImpactEstimateBody(String max_extra_passes, String window) {
    return 'Hingga $max_extra_passes koin tambahan bisa lolos per $window. Berdasarkan aturan, bukan replay.';
  }

  @override
  String get guardImpactEstimateLabel => 'Estimasi';

  @override
  String guardImpactReplayBody(String newly_passing, String newly_passing_rugged, String samples) {
    return '$newly_passing tambahan akan lolos, $newly_passing_rugged di antaranya rug ($samples sampel).';
  }

  @override
  String guardImpactReplayLabel(String window) {
    return 'Replay · $window';
  }

  @override
  String get guardImpactReplayLoading => 'Menjalankan replay… estimasi ditampilkan sementara';

  @override
  String get guardImpactReplayUnavailable => 'Replay sedang tidak tersedia. Menampilkan estimasi.';

  @override
  String get guardWeakenAfterAudit => 'Tercatat di audit log (siapa, kapan, device, diff)';

  @override
  String get guardWeakenAfterAutoRevert => 'Auto-revert wajib setelah 24 jam kecuali dikonfirmasi ulang';

  @override
  String get guardWeakenAfterCooldown => 'Cooldown wajib 10 menit sebelum berlaku (bisa dibatalkan)';

  @override
  String get guardWeakenAfterNotify => 'Semua device dan email diberi notifikasi';

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
  String guardWeakenPendingBody(String expires_at) {
    return 'Perubahan ini melonggarkan guard, jadi belum berlaku sampai kamu approve. Approve sebelum $expires_at atau kedaluwarsa.';
  }

  @override
  String get guardWeakenPendingOpen => 'Tinjau di antrean';

  @override
  String get guardWeakenPendingTitle => 'Perubahan menunggu approval';

  @override
  String guardWeakenRiskLevel(String level) {
    String _temp0 = intl.Intl.selectLogic(level, {
      'low': 'Rendah',
      'medium': 'Sedang',
      'high': 'Tinggi',
      'other': 'Kritis',
    });
    return 'Level risiko: $_temp0';
  }

  @override
  String get guardWeakenRiskTitle => 'Dampak risiko (replay 7 hari data paper kita)';

  @override
  String get guardWeakenTitlePractice => 'Kamu akan melonggarkan guard';

  @override
  String get guardWeakenTitleReal => 'Kamu akan MELONGGARKAN guard di strategi Real SOL';

  @override
  String get guardWeakenTypeName => 'Ketik nama strategi untuk konfirmasi';

  @override
  String get killSwitchActionEngage => 'Hentikan pembelian';

  @override
  String get killSwitchActionResume => 'Lanjutkan pembelian';

  @override
  String get killSwitchDialogEffectExitsKeep => 'Exit plan, TP & SL tetap jalan.';

  @override
  String get killSwitchDialogEffectInflight => 'Order yang sudah terkirim tidak bisa ditarik.';

  @override
  String get killSwitchDialogEffectProposals => 'Proposal Real tertunda kedaluwarsa.';

  @override
  String get killSwitchDialogEffectUnsigned => 'Order belum diteken dibatalkan.';

  @override
  String get killSwitchDialogTitle => 'Hentikan pembelian Real baru?';

  @override
  String get killSwitchOffline => 'Server tidak terjangkau. Stop belum terkonfirmasi. Mencoba lagi…';

  @override
  String get killSwitchOptionExitsRun => 'Exit plan tetap jalan (disarankan)';

  @override
  String killSwitchOptionSellAll(int count) {
    final intl.NumberFormat countNumberFormat = intl.NumberFormat.decimalPattern(localeName);
    final String countString = countNumberFormat.format(count);

    String _temp0 = intl.Intl.pluralLogic(count, locale: localeName, other: 'Jual juga $countString posisi sekarang');
    return '$_temp0';
  }

  @override
  String get killSwitchReasonLossVelocity => 'kerugian naik terlalu cepat';

  @override
  String get killSwitchReasonOther => 'aturan keamanan terpicu';

  @override
  String get killSwitchReasonPolicyMismatch => 'aturan wallet tidak cocok';

  @override
  String get killSwitchReasonProviderError => 'masalah provider/signer · hanya exit yang berjalan';

  @override
  String get killSwitchScopeGlobal => 'Semua trading Real';

  @override
  String get killSwitchScopeStrategy => 'Satu strategi';

  @override
  String get killSwitchScopeWorkspace => 'Workspace ini';

  @override
  String get killSwitchSellAllBody =>
      'Jual di harga pasar sekarang. Cek keamanan tetap berlaku: simulasi dan batas slippage.';

  @override
  String killSwitchSellAllFailureRow(String reason_code, String symbol) {
    return '$symbol: $reason_code. Tetap terbuka; exit plan tetap jalan.';
  }

  @override
  String get killSwitchSellAllHold => 'Tahan 2,5 dtk untuk jual semua';

  @override
  String killSwitchSellAllInProgress(int requested_count) {
    final intl.NumberFormat requested_countNumberFormat = intl.NumberFormat.decimalPattern(localeName);
    final String requested_countString = requested_countNumberFormat.format(requested_count);

    String _temp0 = intl.Intl.pluralLogic(
      requested_count,
      locale: localeName,
      other: 'Menjual $requested_countString posisi…',
    );
    return '$_temp0';
  }

  @override
  String killSwitchSellAllRateLimited(int retry_after_s) {
    final intl.NumberFormat retry_after_sNumberFormat = intl.NumberFormat.decimalPattern(localeName);
    final String retry_after_sString = retry_after_sNumberFormat.format(retry_after_s);

    String _temp0 = intl.Intl.pluralLogic(retry_after_s, locale: localeName, other: '$retry_after_sString detik');
    return 'Jual semua baru saja diminta. Coba lagi dalam $_temp0.';
  }

  @override
  String killSwitchSellAllRetryTitle(String symbol) {
    return 'Jual ulang $symbol';
  }

  @override
  String killSwitchSellAllTitle(int count) {
    final intl.NumberFormat countNumberFormat = intl.NumberFormat.decimalPattern(localeName);
    final String countString = countNumberFormat.format(count);

    String _temp0 = intl.Intl.pluralLogic(count, locale: localeName, other: 'Jual $countString posisi Real sekarang?');
    return '$_temp0';
  }

  @override
  String killSwitchStatusAuthority(String state) {
    String _temp0 = intl.Intl.selectLogic(state, {'revoked': 'Izin bot dicabut', 'other': 'Izin bot masih aktif'});
    return '$_temp0';
  }

  @override
  String killSwitchStatusBy(String actor_type, String at, String device_label) {
    String _temp0 = intl.Intl.selectLogic(actor_type, {
      'user': 'olehmu di $device_label',
      'rule': 'otomatis',
      'other': 'oleh sistem',
    });
    return 'Dihentikan $_temp0 pada $at';
  }

  @override
  String get killSwitchStatusExits => 'Exit plan tetap jalan';

  @override
  String get killSwitchStatusResumeHint => 'Izin bot tetap aktif. Tanpa cooldown: lanjutkan kapan saja dengan 1 klik.';

  @override
  String get killSwitchStatusResumeWhenReady => 'Lanjutkan pembelian Real saat siap';

  @override
  String get killSwitchStatusTitle => 'Pembelian baru dihentikan';

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
    final intl.NumberFormat remainingNumberFormat = intl.NumberFormat.decimalPattern(localeName);
    final String remainingString = remainingNumberFormat.format(remaining);

    String _temp0 = intl.Intl.pluralLogic(
      remaining,
      locale: localeName,
      other: 'Kode salah. Sisa $remainingString percobaan.',
    );
    return '$_temp0';
  }

  @override
  String get loginPracticeDefault => 'Strategi baru selalu mulai di Paper.';

  @override
  String get loginSubtitle => 'Satu akun, banyak metode masuk. Bisa ditambah nanti.';

  @override
  String get loginTelegramCancelled => 'Login Telegram dibatalkan. Tidak ada yang berubah.';

  @override
  String get loginTelegramConsent => 'Telegram membagikan nama, username, dan foto ke Centurion Trade.';

  @override
  String get loginTelegramRetry => 'Coba Telegram lagi';

  @override
  String get loginTelegramTitle => 'Masuk dengan Telegram';

  @override
  String get loginTelegramUnavailable => 'Login Telegram belum tersedia. Pakai metode lain.';

  @override
  String get loginTelegramWaiting => 'Konfirmasi di Telegram…';

  @override
  String get loginTerms => 'Dengan melanjutkan kamu setuju dengan Ketentuan dan Kebijakan Privasi.';

  @override
  String get loginTitle => 'Masuk atau buat akun';

  @override
  String get loginWalletRejected => 'Tanda tangan ditolak. Tidak ada yang ditandatangani.';

  @override
  String get loginWalletSignNote => 'Kamu menandatangani pesan, bukan transaksi. Tanpa biaya.';

  @override
  String get loginWalletSignTitle => 'Tanda tangani untuk masuk';

  @override
  String mcapAsOf(String time) {
    return 'Per $time';
  }

  @override
  String get mcapLabel => 'Kapitalisasi pasar';

  @override
  String mcapSolValue(String amount) {
    return '≈ $amount';
  }

  @override
  String get mcapUsdIndicative => 'USD bersifat indikatif (harga SOL referensi), bukan live.';

  @override
  String get modePracticeBanner => 'Paper · paper SOL, tidak ada SOL nyata yang bergerak';

  @override
  String get modePracticeBannerShort => 'Paper · paper SOL';

  @override
  String get modePracticeLabel => 'PAPER';

  @override
  String get modeRealBanner => 'Real SOL · wallet terhubung, order memakai SOL nyata';

  @override
  String get modeRealBannerShort => 'Real SOL · uang nyata';

  @override
  String get modeRealLabel => 'REAL SOL';

  @override
  String get modeSwitchToRealHold => 'Tahan untuk pindah ke Real SOL';

  @override
  String get modeSwitchToRealRequirements => 'Butuh trading wallet terhubung dan 2FA.';

  @override
  String get modeSwitchToRealTitle => 'Pindah ke Real SOL?';

  @override
  String get modeSwitchToastPractice => 'Strategi kembali ke Paper';

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
  String get notifActionOpen => 'Buka';

  @override
  String get notifActionSkip => 'Lewati';

  @override
  String get notifApprovedBody => 'Order sedang diproses';

  @override
  String notifApprovedTitle(String symbol) {
    return 'Lihat $symbol: disetujui';
  }

  @override
  String get notifDeletionCancelledBody => 'Akunmu tetap aktif.';

  @override
  String get notifDeletionCancelledTitle => 'Cek akun: penghapusan dibatalkan';

  @override
  String notifDeletionScheduledBody(String scheduled_for) {
    return 'Akunmu akan dihapus pada $scheduled_for. Batalkan di Pengaturan jika bukan kamu.';
  }

  @override
  String get notifDeletionScheduledTitle => 'Cek akun: penghapusan dijadwalkan';

  @override
  String notifExpiredBody(String reason) {
    return '$reason';
  }

  @override
  String notifExpiredTitle(String mode, String symbol) {
    String _temp0 = intl.Intl.selectLogic(mode, {'real': 'REAL', 'other': 'PAPER'});
    return '[$_temp0] Cek ulang $symbol: approval kedaluwarsa';
  }

  @override
  String notifFailedBody(String amount_lamports, String mode, String reason_code) {
    String _temp0 = intl.Intl.selectLogic(mode, {
      'real': 'Biaya jaringan mungkin terpakai.',
      'other': 'Tidak ada SOL terpakai.',
    });
    return '$reason_code · $amount_lamports. $_temp0';
  }

  @override
  String notifFailedTitle(String mode, String side, String symbol) {
    String _temp0 = intl.Intl.selectLogic(mode, {'real': 'REAL', 'other': 'PAPER'});
    String _temp1 = intl.Intl.selectLogic(side, {'sell': 'jual', 'other': 'beli'});
    return '[$_temp0] Cek $symbol: $_temp1 gagal';
  }

  @override
  String notifFilledBody(String amount_lamports, String price) {
    return '$amount_lamports di $price · exit plan aktif';
  }

  @override
  String notifFilledTitle(String mode, String symbol) {
    String _temp0 = intl.Intl.selectLogic(mode, {'real': 'REAL', 'other': 'PAPER'});
    return '[$_temp0] Lihat $symbol: terbeli';
  }

  @override
  String notifFirstBuyBody(String amount_lamports, String mm_ss) {
    return 'Strategi ini belum pernah beli. Cek sebelum mulai · $amount_lamports · sisa $mm_ss';
  }

  @override
  String notifFirstBuyTitle(String mode, String strategy, String symbol) {
    String _temp0 = intl.Intl.selectLogic(mode, {'real': 'REAL', 'other': 'PAPER'});
    return '[$_temp0] Tinjau buy pertama $strategy: $symbol';
  }

  @override
  String get notifGroupedBody => 'Buka antrean untuk meninjau';

  @override
  String notifGroupedTitle(int count, String mode) {
    final intl.NumberFormat countNumberFormat = intl.NumberFormat.decimalPattern(localeName);
    final String countString = countNumberFormat.format(count);

    String _temp0 = intl.Intl.selectLogic(mode, {'other': 'PAPER', 'real': 'REAL'});
    String _temp1 = intl.Intl.pluralLogic(count, locale: localeName, other: '$countString pick');
    return '[$_temp0] Tinjau $_temp1 yang menunggu approval';
  }

  @override
  String notifGuardActiveBody(String auto_revert_at) {
    return 'Auto-revert $auto_revert_at';
  }

  @override
  String notifGuardActiveTitle(String mode, String strategy) {
    String _temp0 = intl.Intl.selectLogic(mode, {'real': 'REAL', 'other': 'PAPER'});
    return '[$_temp0] Tinjau $strategy: guard kini lebih longgar';
  }

  @override
  String notifGuardCancelledBody(String strategy) {
    return '$strategy diedit di tempat lain. Ajukan ulang perubahannya.';
  }

  @override
  String notifGuardCancelledTitle(String mode) {
    String _temp0 = intl.Intl.selectLogic(mode, {'real': 'REAL', 'other': 'PAPER'});
    return '[$_temp0] Cek guard: perubahan dibatalkan';
  }

  @override
  String notifGuardCooldownBody(String cooldown_until, String strategy) {
    return '$strategy: berlaku $cooldown_until. Batalkan jika bukan kamu.';
  }

  @override
  String get notifGuardCooldownTitle => '[REAL] Batalkan dalam 10 mnt untuk mempertahankan guard';

  @override
  String notifGuardRequestedBody(String from, String setting, String strategy, String to) {
    return '$strategy: $setting $from → $to melonggarkan guard';
  }

  @override
  String notifGuardRequestedTitle(String mode) {
    String _temp0 = intl.Intl.selectLogic(mode, {'real': 'REAL', 'other': 'PAPER'});
    return '[$_temp0] Konfirmasi perubahan guard yang menunggu';
  }

  @override
  String notifGuardRevertedBody(String from, String setting) {
    return '$setting kembali ke $from';
  }

  @override
  String notifGuardRevertedTitle(String strategy) {
    return '[REAL] Cek $strategy: guard dikembalikan';
  }

  @override
  String notifLossStopBody(String pct) {
    return 'Turun $pct dari puncak. Re-arm butuh approval.';
  }

  @override
  String notifLossStopTitle(String mode, String strategy) {
    String _temp0 = intl.Intl.selectLogic(mode, {'real': 'REAL', 'other': 'PAPER'});
    return '[$_temp0] Tinjau $strategy: dijeda oleh loss stop';
  }

  @override
  String get notifModePracticeBody => 'Order strategi ini memakai paper SOL';

  @override
  String get notifModePracticeTitle => 'Cek mode strategi: kembali ke PAPER';

  @override
  String get notifModeRealBody => 'Order berikutnya strategi ini memakai SOL nyata';

  @override
  String get notifModeRealTitle => 'Cek mode strategi: sekarang di REAL';

  @override
  String get notifOfflineBody => 'Data mungkin tertunda. Mencoba lagi…';

  @override
  String get notifOfflineTitle => 'Sambungkan ulang: koneksi ke server terputus';

  @override
  String notifPickPendingBody(String amount_lamports, String mm_ss, String strategy) {
    return '$strategy · $amount_lamports · sisa $mm_ss';
  }

  @override
  String notifPickPendingTitle(String mode, String symbol) {
    String _temp0 = intl.Intl.selectLogic(mode, {'real': 'REAL', 'other': 'PAPER'});
    return '[$_temp0] Tinjau $symbol: menunggu approval';
  }

  @override
  String notifPracticeResetBody(String amount_lamports) {
    return 'Saldo kembali ke $amount_lamports. Buy tertunda dihapus.';
  }

  @override
  String get notifPracticeResetTitle => '[PAPER] Cek saldo: Paper di-reset';

  @override
  String notifRealBuysPausedBody(String actor_type, String device_label) {
    String _temp0 = intl.Intl.selectLogic(actor_type, {'user': 'olehmu di $device_label', 'other': 'oleh sistem'});
    return 'Exit plan posisi tetap jalan · $_temp0';
  }

  @override
  String get notifRealBuysPausedTitle => '[REAL] Lanjutkan pembelian saat siap: pembelian baru dihentikan';

  @override
  String notifRealBuysResumedBody(String actor_type, String device_label) {
    String _temp0 = intl.Intl.selectLogic(actor_type, {'user': 'olehmu di $device_label', 'other': 'oleh sistem'});
    return 'Pembelian baru jalan lagi sekarang · $_temp0';
  }

  @override
  String get notifRealBuysResumedTitle => '[REAL] Cek pembelian: pembelian baru dilanjutkan';

  @override
  String notifRealDepositDetectedBody(String amount_lamports, String balance_lamports) {
    return '+$amount_lamports · saldo $balance_lamports';
  }

  @override
  String get notifRealDepositDetectedTitle => '[REAL] Lihat deposit: masuk';

  @override
  String notifRealKillSwitchClearedBody(String signer_state) {
    String _temp0 = intl.Intl.selectLogic(signer_state, {
      'revoked': 'Izin trading masih dicabut · berikan izin lagi untuk lanjut',
      'other': 'Pembelian Real baru jalan lagi sekarang',
    });
    return '$_temp0';
  }

  @override
  String get notifRealKillSwitchClearedTitle => '[REAL] Cek Real: henti otomatis dicabut';

  @override
  String notifRealKillSwitchTrippedBody(String reason) {
    String _temp0 = intl.Intl.selectLogic(reason, {
      'policy_mismatch': 'Dihentikan otomatis: aturan wallet tidak cocok. Buy baru diblokir.',
      'loss_velocity': 'Dihentikan otomatis: kerugian naik terlalu cepat. Buy baru diblokir.',
      'provider_error': 'Dihentikan otomatis: masalah provider/signer · hanya exit yang berjalan.',
      'other': 'Dihentikan otomatis: aturan keamanan terpicu. Buy baru diblokir.',
    });
    return '$_temp0';
  }

  @override
  String get notifRealKillSwitchTrippedTitle => '[REAL] Tinjau Real: trading dihentikan otomatis';

  @override
  String notifRealLimitChangedBody(String from, String setting, String to) {
    return '$setting: $from → $to';
  }

  @override
  String get notifRealLimitChangedTitle => '[REAL] Cek batas: diperbarui';

  @override
  String notifRealLimitLoosenRequestedBody(String activates_at, String from, String setting, String to) {
    return '$setting: $from → $to mulai $activates_at dan berlaku sampai kamu ubah. Batalkan jika bukan kamu.';
  }

  @override
  String get notifRealLimitLoosenRequestedTitle => '[REAL] Tinjau perubahan batas: menunggu';

  @override
  String get notifRealPolicyActivatedBody => 'Sesuai yang kamu setujui.';

  @override
  String notifRealPolicyActivatedTitle(String version) {
    return '[REAL] Cek aturan wallet: v$version aktif';
  }

  @override
  String notifRealPolicyMismatchBody(String version) {
    return 'Trading Real dihentikan demi keamanan. Buka app untuk membandingkan v$version.';
  }

  @override
  String get notifRealPolicyMismatchTitle => '[REAL] Bandingkan aturan wallet: tidak cocok';

  @override
  String notifRealSellAllCompletedBody(int failed_count, int requested_count, int sold_count) {
    final intl.NumberFormat failed_countNumberFormat = intl.NumberFormat.decimalPattern(localeName);
    final String failed_countString = failed_countNumberFormat.format(failed_count);
    final intl.NumberFormat requested_countNumberFormat = intl.NumberFormat.decimalPattern(localeName);
    final String requested_countString = requested_countNumberFormat.format(requested_count);
    final intl.NumberFormat sold_countNumberFormat = intl.NumberFormat.decimalPattern(localeName);
    final String sold_countString = sold_countNumberFormat.format(sold_count);

    String _temp0 = intl.Intl.pluralLogic(
      sold_count,
      locale: localeName,
      other: '$sold_countString dari $requested_countString terjual',
    );
    String _temp1 = intl.Intl.pluralLogic(
      failed_count,
      locale: localeName,
      zero: '',
      other: ' · $failed_countString gagal: tetap terbuka, exit plan tetap jalan',
    );
    return '$_temp0$_temp1';
  }

  @override
  String notifRealSellAllCompletedTitle(int failed_count) {
    final intl.NumberFormat failed_countNumberFormat = intl.NumberFormat.decimalPattern(localeName);
    final String failed_countString = failed_countNumberFormat.format(failed_count);

    String _temp0 = intl.Intl.pluralLogic(
      failed_count,
      locale: localeName,
      zero: 'Lihat jual semua: selesai',
      other: 'Ulangi jual semua: $failed_countString gagal',
    );
    return '[REAL] $_temp0';
  }

  @override
  String notifRealSellAllCompletedTotal(String amount_out_lamports) {
    return 'Total keluar: $amount_out_lamports';
  }

  @override
  String notifRealSellAllRequestedBody(int requested_count) {
    final intl.NumberFormat requested_countNumberFormat = intl.NumberFormat.decimalPattern(localeName);
    final String requested_countString = requested_countNumberFormat.format(requested_count);

    String _temp0 = intl.Intl.pluralLogic(
      requested_count,
      locale: localeName,
      other: 'Menjual $requested_countString posisi di harga pasar.',
    );
    return '$_temp0 Guard tetap berlaku.';
  }

  @override
  String get notifRealSellAllRequestedTitle => '[REAL] Pantau jual semua: menjual semua posisi';

  @override
  String notifRealSignerGrantedBody(String expires_at) {
    return 'Bot bisa swap sesuai batasmu sampai $expires_at. Bot tidak bisa transfer atau menarik dana.';
  }

  @override
  String get notifRealSignerGrantedTitle => '[REAL] Cek izin trading: diberikan';

  @override
  String notifRealSignerRevokedBody(String reason) {
    String _temp0 = intl.Intl.selectLogic(reason, {
      'user': 'Kamu mencabutnya.',
      'expiry': 'Izinnya sudah habis.',
      'other': 'Dicabut.',
    });
    return '$_temp0 Trading Real tidak bisa menandatangani sampai kamu otorisasi lagi.';
  }

  @override
  String get notifRealSignerRevokedTitle => '[REAL] Berikan izin lagi: izin bot dicabut';

  @override
  String notifRealWithdrawConfirmedBody(String address_short, String amount_lamports) {
    return '$amount_lamports masuk ke wallet utama $address_short.';
  }

  @override
  String get notifRealWithdrawConfirmedTitle => '[REAL] Lihat penarikan: diterima';

  @override
  String notifRealWithdrawFailedBody(String amount_lamports, String reason_code) {
    return '$amount_lamports tidak terkirim: $reason_code. Saldo tetap.';
  }

  @override
  String get notifRealWithdrawFailedTitle => '[REAL] Cek penarikan: gagal';

  @override
  String notifRealWithdrawRequestedBody(String address_short, String amount_lamports) {
    return '$amount_lamports → wallet utama $address_short';
  }

  @override
  String get notifRealWithdrawRequestedTitle => '[REAL] Pantau penarikan: dikirim';

  @override
  String notifRealWithdrawAddressAddedBody(String address_short, String cancel_until, String usable_at) {
    return '$address_short aktif $usable_at. Batalkan sebelum $cancel_until jika bukan kamu.';
  }

  @override
  String get notifRealWithdrawAddressAddedTitle => '[REAL] Tinjau wallet utama baru: didaftarkan';

  @override
  String notifRealWithdrawAddressCancelledBody(String address_short) {
    return '$address_short tidak akan ditambahkan.';
  }

  @override
  String get notifRealWithdrawAddressCancelledTitle => '[REAL] Cek wallet utama: penggantian dibatalkan';

  @override
  String notifRealWithdrawAddressUsableBody(String address_short) {
    return '$address_short kini wallet utama dan tujuan penarikanmu.';
  }

  @override
  String get notifRealWithdrawAddressUsableTitle => '[REAL] Cek wallet utama: aktif';

  @override
  String notifSkippedBody(String reason) {
    return 'Alasan: $reason';
  }

  @override
  String notifSkippedTitle(String symbol) {
    return 'Lihat $symbol: dilewati';
  }

  @override
  String notifSlHitBody(String pct, String pnl, String stop_type) {
    return '$stop_type · $pnl ($pct)';
  }

  @override
  String notifSlHitTitle(String mode, String symbol) {
    String _temp0 = intl.Intl.selectLogic(mode, {'real': 'REAL', 'other': 'PAPER'});
    return '[$_temp0] Cek $symbol: stop loss kena';
  }

  @override
  String get notifTokenInvalidBody => 'Buka app untuk melanjutkan';

  @override
  String get notifTokenInvalidTitle => 'Buka app: aksi notifikasi kedaluwarsa';

  @override
  String notifTpHitBody(String pct, String pct_sold, String pnl) {
    return 'Terjual $pct_sold di +$pct · $pnl';
  }

  @override
  String notifTpHitTitle(String mode, String symbol) {
    String _temp0 = intl.Intl.selectLogic(mode, {'real': 'REAL', 'other': 'PAPER'});
    return '[$_temp0] Cek $symbol: take profit tercapai';
  }

  @override
  String get orderFailReasonGuardFailed => 'Cek guard gagal tepat sebelum order';

  @override
  String get orderFailReasonInsufficientPracticeBalance => 'Saldo paper SOL tidak cukup';

  @override
  String get orderFailReasonModeNotAllowed => 'Strategi ini belum disetujui untuk mode Real';

  @override
  String get orderFailReasonPoolStale => 'Data pool sudah usang; order tidak dikirim';

  @override
  String get orderFailReasonPositionAlreadyClosed => 'Posisi ini sudah ditutup';

  @override
  String get orderFailReasonSlippageExceeded => 'Harga bergerak melebihi batas slippage';

  @override
  String get orderFailReasonUnknown => 'Order tidak bisa diselesaikan';

  @override
  String get orderFailReasonUnsupportedQuoteMint => 'Koin ini tidak punya pair SOL, jadi tidak bisa ditradingkan';

  @override
  String get orderFailReasonValidationFailed => 'Order tidak lolos validasi';

  @override
  String portfolioBalanceChange(String pct, String pnl, String range) {
    return '$pnl ($pct) · $range';
  }

  @override
  String get portfolioBalanceHidden => 'Saldo disembunyikan';

  @override
  String portfolioBalanceLabel(String mode) {
    String _temp0 = intl.Intl.selectLogic(mode, {'real': 'Saldo', 'other': 'Saldo paper'});
    return '$_temp0';
  }

  @override
  String portfolioBalanceUpdated(String time) {
    return 'Diperbarui $time';
  }

  @override
  String portfolioSparklineA11y(String end, String range, String start, String trend) {
    String _temp0 = intl.Intl.selectLogic(trend, {'up': 'naik', 'down': 'turun', 'other': 'tetap'});
    return 'Saldo $_temp0 selama $range, dari $start ke $end';
  }

  @override
  String get positionsDensityLabel => 'Kepadatan tabel';

  @override
  String positionsEmpty(String mode) {
    String _temp0 = intl.Intl.selectLogic(mode, {
      'real': 'Tidak ada posisi terbuka',
      'other': 'Tidak ada posisi (paper)',
    });
    return '$_temp0';
  }

  @override
  String get positionsEquityHwm => 'High-water mark';

  @override
  String positionsEquityTitle(String range) {
    return 'Ekuitas · $range';
  }

  @override
  String get positionsExitHeldBadge => 'Exit ditahan';

  @override
  String get positionsExitHeldDetail => 'Exit plan, TP & SL ditahan sampai kamu memberi izin trading lagi.';

  @override
  String positionsNextAction(String gain, String pct, String rung) {
    return 'Berikutnya: $rung di $gain (jual $pct)';
  }

  @override
  String positionsOpenCount(int count) {
    final intl.NumberFormat countNumberFormat = intl.NumberFormat.decimalPattern(localeName);
    final String countString = countNumberFormat.format(count);

    String _temp0 = intl.Intl.pluralLogic(count, locale: localeName, other: '$countString terbuka');
    return '$_temp0';
  }

  @override
  String get positionsPnlUnrealized => 'PnL belum terealisasi';

  @override
  String get positionsSellConfirmTitle => 'Konfirmasi jual';

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
  String get positionsSellHoldReleased => 'Dilepas terlalu cepat — tidak ada yang dijual';

  @override
  String get positionsSellManual => 'Jual manual';

  @override
  String get positionsSellManualNote => 'Jual manual tetap bisa, ditandatangani di Phantom.';

  @override
  String get positionsSellNeverFromNotification => 'Jual tidak pernah tersedia dari notifikasi atau popup.';

  @override
  String get positionsSellNotTradeableDetail =>
      'Posisi ini tidak punya pair SOL lagi; jual diblokir sampai pair SOL tersedia.';

  @override
  String get positionsSellPlanCancelled => 'Exit plan dibatalkan (100%)';

  @override
  String positionsSellQuoteTtl(String seconds) {
    return 'Quote berlaku $seconds dtk.';
  }

  @override
  String get positionsSellRemainingPlan => 'Sisa posisi tetap memakai exit plan';

  @override
  String positionsSellTitle(String symbol) {
    return 'Jual $symbol';
  }

  @override
  String get positionsSellUnavailable => 'Jual — tidak tersedia';

  @override
  String get positionsStatsAge => 'Umur posisi';

  @override
  String get positionsStatsEntryPrice => 'Harga masuk';

  @override
  String get positionsStatsMcap => 'Market cap';

  @override
  String get positionsStatsQty => 'Jumlah';

  @override
  String get positionsStatsTitle => 'Statistik';

  @override
  String get positionsStatsValueCost => 'Nilai / modal';

  @override
  String get positionsStatsVolume24h => 'Volume 24j';

  @override
  String get positionsTitle => 'Posisi';

  @override
  String get positionsTitlePaper => 'Posisi (paper)';

  @override
  String get positionsTpslNote => 'Garis tipis = nilai lama. Berlaku untuk sisa posisi; tidak mengirim transaksi.';

  @override
  String get positionsTpslReset => 'Reset';

  @override
  String get positionsTpslSave => 'Simpan exit plan';

  @override
  String positionsTpslSellPct(String pct) {
    return 'jual $pct%';
  }

  @override
  String get positionsTpslStopLoss => 'Stop loss';

  @override
  String positionsTpslTakeProfit(String n) {
    return 'Take profit $n';
  }

  @override
  String get positionsTpslTitle => 'Ubah TP / SL';

  @override
  String positionsTpslWas(String value) {
    return 'semula $value';
  }

  @override
  String queueBatchApprove(int count) {
    final intl.NumberFormat countNumberFormat = intl.NumberFormat.decimalPattern(localeName);
    final String countString = countNumberFormat.format(count);

    String _temp0 = intl.Intl.pluralLogic(count, locale: localeName, other: 'Setujui $countString pick');
    return '$_temp0';
  }

  @override
  String queueBatchExcludedNotTradeable(int count) {
    final intl.NumberFormat countNumberFormat = intl.NumberFormat.decimalPattern(localeName);
    final String countString = countNumberFormat.format(count);

    String _temp0 = intl.Intl.pluralLogic(
      count,
      locale: localeName,
      other: '$countString pick tidak ikut: tidak bisa ditradingkan',
    );
    return '$_temp0';
  }

  @override
  String queueBatchSelected(int count) {
    final intl.NumberFormat countNumberFormat = intl.NumberFormat.decimalPattern(localeName);
    final String countString = countNumberFormat.format(count);

    String _temp0 = intl.Intl.pluralLogic(count, locale: localeName, other: '$countString dipilih');
    return '$_temp0';
  }

  @override
  String queueBatchTotal(String amount_lamports) {
    return 'Total $amount_lamports';
  }

  @override
  String get queueEmpty => 'Tidak ada pick pending';

  @override
  String get queueGuardReject => 'Tolak perubahan';

  @override
  String get queuePickApprove => 'Setujui';

  @override
  String get queuePickCannotApprove => 'Tidak bisa disetujui';

  @override
  String queuePickExpiresIn(String mm_ss) {
    return 'Kedaluwarsa dalam $mm_ss';
  }

  @override
  String get queuePickKindBuy => 'Buy';

  @override
  String get queuePickKindFirstBuy => 'Buy pertama';

  @override
  String get queuePickKindGuardChange => 'Melonggarkan guard';

  @override
  String get queuePickKindSellPosition => 'Jual';

  @override
  String get queuePickReviewChange => 'Tinjau perubahan';

  @override
  String get queuePickSkip => 'Lewati';

  @override
  String get queueRealApproveButton => 'Setujui dengan Real SOL';

  @override
  String queueRealBatchConfirmTitle(int count) {
    final intl.NumberFormat countNumberFormat = intl.NumberFormat.decimalPattern(localeName);
    final String countString = countNumberFormat.format(count);

    String _temp0 = intl.Intl.pluralLogic(
      count,
      locale: localeName,
      other: 'Setujui $countString buy dengan REAL SOL?',
    );
    return '$_temp0';
  }

  @override
  String queueRealHold(String amount_lamports) {
    return 'Tahan untuk setujui $amount_lamports';
  }

  @override
  String get queueRealWithinLimits => 'Dalam batas: cukup tahan, tanpa Phantom.';

  @override
  String get queueSkipReasonAlreadyPumped => 'Sudah pump';

  @override
  String get queueSkipReasonNotTradeable => 'Tidak bisa ditradingkan';

  @override
  String get queueSkipReasonOther => 'Lainnya…';

  @override
  String get queueSkipReasonPriceMoved => 'Harga bergerak';

  @override
  String get queueSkipReasonSuspiciousDev => 'Dev mencurigakan';

  @override
  String get queueSkipReasonThinLiquidity => 'Likuiditas tipis';

  @override
  String get queueSwipeDisabledReal => 'Geser nonaktif di Real SOL. Pakai tombol.';

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
  String queueTabWithCount(int count, String label) {
    final intl.NumberFormat countNumberFormat = intl.NumberFormat.decimalPattern(localeName);
    final String countString = countNumberFormat.format(count);

    return '$label · $countString';
  }

  @override
  String get queueTitle => 'Antrean approval';

  @override
  String get queueTitleShort => 'Antrean';

  @override
  String get queueWhyFirstBuy => 'Mode approval “Tanya: buy pertama”. Ini buy pertama strategi ini.';

  @override
  String get queueWhyTitle => 'Kenapa butuh approval?';

  @override
  String get receiptDone => 'Selesai';

  @override
  String get receiptExitPlanArmed => 'Exit plan aktif';

  @override
  String get receiptFees => 'Biaya';

  @override
  String get receiptPaid => 'Dibayar';

  @override
  String get receiptReceived => 'Diterima';

  @override
  String receiptTitleBuy(String symbol) {
    return 'Terbeli $symbol';
  }

  @override
  String receiptTitleSell(String symbol) {
    return 'Terjual $symbol';
  }

  @override
  String get receiptViewTx => 'Lihat transaksi';

  @override
  String get rejectReasonNotTradeable => 'Tidak bisa ditradingkan';

  @override
  String get rejectReasonOther => 'Lainnya';

  @override
  String get rejectReasonPriceMoved => 'Harga bergerak';

  @override
  String get rejectReasonUserDeclined => 'Dilewati olehmu';

  @override
  String get reviewAtaRent => 'Sewa akun token (baru)';

  @override
  String reviewBuyTitle(String symbol) {
    return 'Setujui beli $symbol';
  }

  @override
  String get reviewDetailsToggle => 'Biaya & slippage';

  @override
  String reviewEstimateNote(String time) {
    return 'Estimasi per $time. Nilai akhir bisa berubah mengikuti harga.';
  }

  @override
  String get reviewMinReceived => 'Minimal diterima';

  @override
  String reviewMinReceivedValue(String min_out, String symbol) {
    return '≥ $min_out $symbol';
  }

  @override
  String get reviewNetworkFee => 'Perkiraan biaya jaringan';

  @override
  String reviewNetworkFeeBreakdown(String base, String priority) {
    return 'dasar $base + prioritas $priority';
  }

  @override
  String get reviewPracticeNote => 'Paper: fill simulasi. Tidak ada SOL nyata yang bergerak.';

  @override
  String get reviewPrice => 'Harga';

  @override
  String reviewPriceMoved(String pct) {
    return 'Harga bergerak $pct sejak pick ini. Tinjau ulang sebelum approve.';
  }

  @override
  String get reviewPriorityFee => 'Priority fee';

  @override
  String reviewQuoteAgeValid(String age_seconds, String valid_seconds) {
    return 'Umur quote $age_seconds dtk · berlaku $valid_seconds dtk';
  }

  @override
  String get reviewQuoteAutoRefreshing => 'Memperbarui otomatis…';

  @override
  String get reviewQuoteChangedDuringHold => 'Quote berubah. Cek nilai baru lalu tahan lagi.';

  @override
  String get reviewQuoteDetails => 'Rincian';

  @override
  String reviewQuoteExpiresCountdown(String mm_ss) {
    return '$mm_ss sampai kedaluwarsa';
  }

  @override
  String reviewQuoteExpiresIn(int seconds) {
    final intl.NumberFormat secondsNumberFormat = intl.NumberFormat.decimalPattern(localeName);
    final String secondsString = secondsNumberFormat.format(seconds);

    String _temp0 = intl.Intl.pluralLogic(seconds, locale: localeName, other: 'Berakhir dalam $secondsString dtk');
    return '$_temp0';
  }

  @override
  String reviewQuoteId(String quote_id) {
    return 'Quote $quote_id';
  }

  @override
  String get reviewQuoteLoading => 'Hold nonaktif sampai quote lengkap.';

  @override
  String get reviewQuoteMissing => 'Quote belum ada — perbarui untuk lanjut';

  @override
  String get reviewQuotePracticeStale => 'Estimasi kedaluwarsa. Paper tetap bisa approve; nilai bisa berbeda.';

  @override
  String reviewQuoteRate(String rate, String symbol) {
    return '1 SOL = $rate $symbol';
  }

  @override
  String get reviewQuoteRefresh => 'Perbarui quote';

  @override
  String get reviewQuoteRefreshing => 'Memperbarui quote…';

  @override
  String get reviewQuoteStale => 'Quote kedaluwarsa — perbarui untuk lanjut';

  @override
  String get reviewQuoteStaleAction => 'Perbarui quote, lalu cek ulang nilainya sebelum setuju.';

  @override
  String reviewQuoteUpdatedAgo(int seconds) {
    final intl.NumberFormat secondsNumberFormat = intl.NumberFormat.decimalPattern(localeName);
    final String secondsString = secondsNumberFormat.format(seconds);

    String _temp0 = intl.Intl.pluralLogic(
      seconds,
      locale: localeName,
      zero: 'Quote baru diperbarui',
      other: 'Quote diperbarui $secondsString dtk lalu',
    );
    return '$_temp0';
  }

  @override
  String get reviewQuoteUpdatedInline => 'Quote diperbarui';

  @override
  String get reviewQuoteYouPay => 'Kamu bayar';

  @override
  String get reviewQuoteYouReceiveEst => 'Kamu terima (perkiraan)';

  @override
  String get reviewRealNote => 'Real SOL: biaya jaringan tetap terpakai walau order gagal.';

  @override
  String get reviewSlippage => 'Slippage maks.';

  @override
  String get reviewSwapFee => 'Biaya swap';

  @override
  String get reviewSwapFeeFromInput => 'dipotong dari SOL masuk';

  @override
  String reviewTitle(String side) {
    String _temp0 = intl.Intl.selectLogic(side, {'sell': 'Tinjau penjualan', 'other': 'Tinjau pembelian'});
    return '$_temp0';
  }

  @override
  String get reviewTotalMax => 'Total (maks.)';

  @override
  String get reviewTotalMaxHint => '= SOL masuk + biaya jaringan + sewa akun token';

  @override
  String get reviewYouPay => 'Kamu bayar';

  @override
  String riskChipA11y(String label, String limit, String used) {
    return '$label: $used dari $limit SOL terpakai';
  }

  @override
  String get riskChipDailyLimit => 'Limit harian';

  @override
  String get riskChipGuard => 'Guard';

  @override
  String riskChipUsage(String limit, String used) {
    return '$used/$limit';
  }

  @override
  String get screenerActionOpenQueue => 'Buka antrean';

  @override
  String screenerCardGuardFailed(String score) {
    return 'Guard gagal · skor $score';
  }

  @override
  String screenerCardNotTradeable(String score) {
    return 'Skor $score · tanpa pair SOL';
  }

  @override
  String screenerCardPassed(String score) {
    return 'Lolos · skor $score';
  }

  @override
  String get screenerColAction => 'Aksi';

  @override
  String get screenerColCoin => 'Koin';

  @override
  String get screenerColGuard => 'Guard';

  @override
  String get screenerColLiquidity => 'Likuiditas';

  @override
  String get screenerColMcap => 'Mcap';

  @override
  String get screenerColScore => 'Skor';

  @override
  String get screenerColStatus => 'Status';

  @override
  String get screenerColVenue => 'Venue';

  @override
  String get screenerDetailApproveUnavailable => 'Approve — tidak tersedia';

  @override
  String get screenerDetailChartNote => 'Chart dan metrik tetap bisa dilihat (read-only).';

  @override
  String get screenerDetailChartReadonly => 'Chart harga (read-only)';

  @override
  String get screenerDetailGuard => 'Guard';

  @override
  String get screenerDetailGuardNotRun => 'tidak dijalankan';

  @override
  String get screenerDetailInfoOnly => '(informasi saja)';

  @override
  String get screenerDetailNone => 'tidak ada';

  @override
  String screenerDetailQuoteNotSol(String quote_symbol) {
    return '$quote_symbol · bukan SOL';
  }

  @override
  String get screenerDetailQuotePair => 'Pair quote';

  @override
  String get screenerDetailReasonCode => 'Kode alasan';

  @override
  String get screenerDetailScore => 'Skor screener';

  @override
  String screenerDetailScoreValue(String max_score, String score) {
    return '$score / $max_score';
  }

  @override
  String screenerDetailScoreValueInfo(String max_score, String score) {
    return '$score / $max_score (informasi saja)';
  }

  @override
  String get screenerDetailSkipHint => 'Tetap bisa dilewati. Melewati bukan trade.';

  @override
  String get screenerDetailSolPair => 'Pair SOL';

  @override
  String get screenerEmpty => 'Belum ada koin yang di-screen';

  @override
  String get screenerFilterAll => 'Semua';

  @override
  String get screenerFilterPassed => 'Lolos';

  @override
  String get screenerFilterRejected => 'Ditolak';

  @override
  String get screenerLegend =>
      'Merah menandai risiko (guard gagal, rug, loss). Koin abu-abu “Tidak bisa ditradingkan” tidak punya pair SOL: tidak bisa di-approve, tapi bisa dilewati.';

  @override
  String get screenerNotTradeableBadge => 'Tidak bisa ditradingkan';

  @override
  String get screenerNotTradeableDetail =>
      'Koin ini tidak punya pair quote SOL. Centurion Trade hanya trading pair SOL, jadi tidak bisa di-approve.';

  @override
  String get screenerStatusPassed => 'Lolos';

  @override
  String get screenerStatusPendingGuard => 'Menunggu guard';

  @override
  String get screenerStatusPickQueued => 'Pick · di antrean';

  @override
  String get screenerStatusPickQueuedShort => 'Pick · antrean';

  @override
  String get screenerStatusRejected => 'Ditolak';

  @override
  String get screenerStatusRejectedGuard => 'Ditolak · guard gagal';

  @override
  String screenerStatusRejectedScore(String score_threshold) {
    return 'Ditolak · skor < $score_threshold';
  }

  @override
  String get screenerTitle => 'Koin · screener';

  @override
  String get settingsAppearanceDensityComfortable => 'Nyaman';

  @override
  String get settingsAppearanceDensityCompact => 'Ringkas';

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
  String get settingsDeleteAuditNote =>
      'Catatan audit tetap disimpan tetapi dianonimkan; nama, device, dan metode masukmu dihapus.';

  @override
  String get settingsDeleteCancel => 'Batalkan penghapusan';

  @override
  String get settingsDeleteCheckRealPositions => 'Tutup semua posisi Real SOL';

  @override
  String get settingsDeleteCheckReauth => 'Konfirmasi identitas (5 menit terakhir)';

  @override
  String get settingsDeleteCheckTwoFactor => 'Kode 2FA (bila aktif)';

  @override
  String get settingsDeleteCheckWalletWithdrawn => 'Tarik saldo trading wallet';

  @override
  String get settingsDeleteConfirm => 'Jadwalkan penghapusan';

  @override
  String settingsDeleteGrace(int count) {
    final intl.NumberFormat countNumberFormat = intl.NumberFormat.decimalPattern(localeName);
    final String countString = countNumberFormat.format(count);

    String _temp0 = intl.Intl.pluralLogic(count, locale: localeName, other: '$countString hari');
    return 'Masa tenggang: $_temp0';
  }

  @override
  String get settingsDeleteIntro => 'Akun dihapus setelah masa tenggang. Kamu bisa membatalkan sebelum itu.';

  @override
  String settingsDeleteScheduled(String scheduled_for) {
    return 'Penghapusan dijadwalkan $scheduled_for. Email konfirmasi sudah dikirim.';
  }

  @override
  String get settingsDeleteTitle => 'Hapus akun';

  @override
  String settingsDevicesLastSeen(String when) {
    return 'Terakhir aktif $when';
  }

  @override
  String get settingsDevicesNote =>
      'Tiap device mendaftarkan token push sendiri. Menghapus device = keluar dan notifikasinya berhenti.';

  @override
  String get settingsDevicesPushOff => 'Push nonaktif';

  @override
  String get settingsDevicesPushOn => 'Push aktif';

  @override
  String get settingsDevicesRevoke => 'Hapus device';

  @override
  String get settingsDevicesTitle => 'Device & push';

  @override
  String get settingsLanguageLabel => 'Bahasa';

  @override
  String settingsLanguageNumberFormat(String example) {
    return 'Angka mengikuti bahasa: $example';
  }

  @override
  String get settingsLoginLastMethodLock => 'Ini satu-satunya metode masuk. Hubungkan metode lain sebelum memutus.';

  @override
  String get settingsLoginLink => 'Hubungkan';

  @override
  String get settingsLoginLinked => 'Terhubung';

  @override
  String get settingsLoginReauth => 'Konfirmasi bahwa ini kamu untuk melanjutkan';

  @override
  String get settingsLoginUnlink => 'Putuskan';

  @override
  String get settingsLoginWalletNote => 'Wallet login hanya untuk identitas. Tidak bisa trading.';

  @override
  String get settingsModeDefaultApproval => 'Mode approval default';

  @override
  String get settingsModeDefaultNewStrategy => 'Strategi baru mulai di';

  @override
  String get settingsNotifDesktopPopup => 'Popup desktop selalu di atas';

  @override
  String get settingsNotifEmail => 'Email';

  @override
  String get settingsNotifPracticeActions => 'Izinkan Setujui dari notifikasi (khusus Paper)';

  @override
  String get settingsNotifPush => 'Notifikasi push';

  @override
  String get settingsSectionAppearance => 'Tampilan';

  @override
  String get settingsSectionDanger => 'Hapus akun';

  @override
  String get settingsSectionDevices => 'Device & push';

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
  String get settingsWalletNotConnected => 'Belum terhubung. Real SOL tetap nonaktif.';

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
  String get stepupBothRequired => 'Dua tanda tangan, keduanya wajib';

  @override
  String get stepupBrowserContinue => 'Lanjutkan di browser';

  @override
  String get stepupBrowserDone => 'Terkonfirmasi. Kamu kembali di app.';

  @override
  String get stepupBrowserExpired => 'Konfirmasi kedaluwarsa. Mulai lagi.';

  @override
  String get stepupBrowserReopen => 'Buka browser lagi';

  @override
  String get stepupBrowserStateMismatch => 'Diblokir: konfirmasi ini bukan dari app ini.';

  @override
  String get stepupBrowserTimeout => 'Tidak ada jawaban dari browser dalam 5 mnt, jadi dibatalkan.';

  @override
  String get stepupBrowserWaiting => 'Selesaikan di browser, lalu kembali.';

  @override
  String get stepupCancelled => 'Tak ada yang berubah.';

  @override
  String get stepupFieldAction => 'Aksi';

  @override
  String get stepupFieldAmount => 'Jumlah';

  @override
  String get stepupFieldExpires => 'Berakhir';

  @override
  String get stepupFieldFrom => 'Dari';

  @override
  String get stepupFieldNonce => 'Nonce';

  @override
  String get stepupFieldPayloadHash => 'Payload hash';

  @override
  String get stepupFieldTo => 'Ke';

  @override
  String get stepupPasskeyStep => '2 · Passkey pemilik';

  @override
  String get stepupPasskeyUse => 'Pakai passkey';

  @override
  String get stepupPasskeyWaiting => 'Menunggu passkey…';

  @override
  String get stepupPhantomOpen => 'Tanda tangani di Phantom';

  @override
  String get stepupPhantomStep => '1 · Tanda tangan Phantom';

  @override
  String stepupPhantomWaiting(String mm_ss) {
    return 'Menunggu Phantom… sisa $mm_ss';
  }

  @override
  String get stepupTitle => 'Konfirmasi aksi uang';

  @override
  String get stepupTotpOptional => 'TOTP opsional dan tidak menggantikan tanda tangan mana pun.';

  @override
  String get strategyApprovalHoldNote => 'Di Paper, tahan 1,2 dtk. Di Real, tahan 2,5 dtk.';

  @override
  String get strategyApprovalModeAskEveryBuy => 'Tanya: setiap buy';

  @override
  String get strategyApprovalModeAskFirstBuy => 'Tanya: buy pertama';

  @override
  String get strategyApprovalModeOff => 'Off (otomatis)';

  @override
  String get strategyEditParams => 'Edit parameter';

  @override
  String get strategyEditorEyebrow => 'Editor strategi';

  @override
  String strategyEditorRevNote(String rev) {
    return 'Tersimpan sebagai rev $rev · berlaku untuk pick berikutnya';
  }

  @override
  String get strategyEditorSectionApproval => 'Approval';

  @override
  String get strategyEditorSectionEntry => 'Entry';

  @override
  String get strategyEditorSectionExit => 'Exit plan';

  @override
  String get strategyListColMode => 'Mode';

  @override
  String get strategyListColStatus => 'Status';

  @override
  String get strategyListColStrategy => 'Strategi';

  @override
  String strategyListFilterAll(int count) {
    final intl.NumberFormat countNumberFormat = intl.NumberFormat.decimalPattern(localeName);
    final String countString = countNumberFormat.format(count);

    return 'Semua · $countString';
  }

  @override
  String strategyListFilterPaper(int count) {
    final intl.NumberFormat countNumberFormat = intl.NumberFormat.decimalPattern(localeName);
    final String countString = countNumberFormat.format(count);

    return 'Paper · $countString';
  }

  @override
  String strategyListFilterReal(int count) {
    final intl.NumberFormat countNumberFormat = intl.NumberFormat.decimalPattern(localeName);
    final String countString = countNumberFormat.format(count);

    return 'Real · $countString';
  }

  @override
  String get strategyListPnl7d => 'PnL 7 hari';

  @override
  String strategyListSummary(int paper_count, int real_count) {
    final intl.NumberFormat paper_countNumberFormat = intl.NumberFormat.decimalPattern(localeName);
    final String paper_countString = paper_countNumberFormat.format(paper_count);
    final intl.NumberFormat real_countNumberFormat = intl.NumberFormat.decimalPattern(localeName);
    final String real_countString = real_countNumberFormat.format(real_count);

    return '$real_countString Real · $paper_countString Paper';
  }

  @override
  String get strategyListTitle => 'Tiap strategi jalan di Paper atau Real.';

  @override
  String get strategyModeLabel => 'Mode strategi';

  @override
  String get strategyModePaper => 'Paper';

  @override
  String get strategyModePaperDesc => 'Jalan dengan paper SOL. Tanpa SOL nyata, tanpa Phantom.';

  @override
  String get strategyModeReal => 'Real';

  @override
  String get strategyModeScopeNote => 'Mode berlaku per strategi. Posisi yang sudah terbuka tetap di mode asalnya.';

  @override
  String get strategyNew => 'Strategi baru';

  @override
  String strategyRealGateDaysDone(int days_done) {
    final intl.NumberFormat days_doneNumberFormat = intl.NumberFormat.decimalPattern(localeName);
    final String days_doneString = days_doneNumberFormat.format(days_done);

    String _temp0 = intl.Intl.pluralLogic(days_done, locale: localeName, other: '$days_doneString hari');
    return '$_temp0 di Paper';
  }

  @override
  String get strategyRealGateNotSet => 'Aturan belum ditetapkan';

  @override
  String strategyRealGateProgressDays(String days_done, String days_required) {
    return '$days_done/$days_required hari';
  }

  @override
  String strategyRealGateProgressTrades(String trades_done, String trades_required) {
    return '$trades_done/$trades_required trade';
  }

  @override
  String strategyRealGateTradesDone(int trades_done) {
    final intl.NumberFormat trades_doneNumberFormat = intl.NumberFormat.decimalPattern(localeName);
    final String trades_doneString = trades_doneNumberFormat.format(trades_done);

    String _temp0 = intl.Intl.pluralLogic(trades_done, locale: localeName, other: '$trades_doneString trade');
    return '$_temp0 selesai';
  }

  @override
  String strategyRealLockedA11y(String reason) {
    return 'Opsi Real nonaktif: $reason';
  }

  @override
  String get strategyRealLockedBadge => 'Butuh persetujuan Boss';

  @override
  String get strategyRealLockedChip => 'Real terkunci';

  @override
  String get strategyRealLockedChipShort => 'terkunci';

  @override
  String get strategyRealLockedExplain =>
      'Real terkunci. Boss menyetujui tiap strategi sebelum bisa memakai SOL nyata. Sampai saat itu strategi tetap jalan di Paper.';

  @override
  String get strategyRealLockedListNote =>
      'Real terkunci sampai Boss menyetujui. Strategi tetap jalan di Paper selama menunggu.';

  @override
  String get strategyRealLockedReasonGateNotMet => 'Syarat Paper belum terpenuhi';

  @override
  String get strategyRealLockedReasonNeedsOwnerApproval => 'Butuh persetujuan Boss';

  @override
  String get strategyRealLockedReasonOther => 'Belum tersedia saat ini';

  @override
  String get strategyRealLockedReasonPolicy => 'Diblokir aturan wallet';

  @override
  String get strategySave => 'Simpan strategi';

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

  @override
  String get tokenProgramToken2022 => 'Token-2022';

  @override
  String get walletAuthorizeRegrant => 'Berikan izin trading lagi';

  @override
  String get walletAuthorizeRegrantNote => 'Butuh Phantom + passkey. Setelah izin aktif, exit plan lanjut otomatis.';

  @override
  String get walletAuthorizeRegrantTitle => 'Berikan izin trading lagi untuk melanjutkan Real';

  @override
  String get walletLimitsSettingCapLamports => 'Batas total';

  @override
  String get walletLimitsSettingDailyLamports => 'Maks. per 24 jam bergulir';

  @override
  String get walletLimitsSettingMaxPositions => 'Maks. posisi terbuka';

  @override
  String get walletLimitsSettingMaxSlippageBps => 'Slippage maks.';

  @override
  String get walletLimitsSettingPerTradeLamports => 'Maks. per trade';

  @override
  String get walletOwnerCancel => 'Batalkan';

  @override
  String get walletOwnerChangeMain => 'Ganti…';

  @override
  String get walletOwnerDelayNote => 'Perubahan butuh minimal 48 jam dan bisa dibatalkan.';

  @override
  String get walletOwnerMain => 'Wallet utama · login dan satu-satunya tujuan penarikan';

  @override
  String walletOwnerPending(String hh_mm_ss, String usable_at) {
    return 'Aktif $usable_at · sisa $hh_mm_ss';
  }

  @override
  String get walletOwnerTitle => 'Wallet utama';

  @override
  String get walletOwnerTypeLast4 => 'Ketik 4 karakter terakhir alamat baru';

  @override
  String get walletWithdrawFailReasonDestinationNotOwned => 'tujuan bukan wallet utamamu';

  @override
  String get walletWithdrawFailReasonInsufficientBalance => 'saldo tidak cukup';

  @override
  String get walletWithdrawFailReasonOther => 'terjadi kesalahan';

  @override
  String get walletWithdrawFailReasonProviderError => 'gangguan provider wallet';

  @override
  String get walletWithdrawFailReasonTxExpired => 'tidak terkirim tepat waktu';

  @override
  String get walletWithdrawFailReasonUnknown => 'error tak dikenal';

  @override
  String get walletWithdrawFailReasonUserRejected => 'kamu menolak tanda tangan';

  @override
  String get walletWithdrawFailReasonWithdrawSimulationFailed => 'simulasi keamanan gagal';

  @override
  String get pnlTitle => 'PnL';

  @override
  String get pnlUnrealized => 'PnL belum terealisasi';

  @override
  String get pnlRealized => 'PnL terealisasi';

  @override
  String get pnlTotal => 'Total PnL';

  @override
  String get pnlUnrealizedHint => 'Mark-to-market posisi terbuka';

  @override
  String get pnlRealizedHint => 'Dari TP dan trade yang sudah ditutup';

  @override
  String get pnlTotalHint => 'Terealisasi + belum terealisasi';

  @override
  String get pnlViewReport => 'Lihat laporan';

  @override
  String pnlOpenCount(int count) {
    return '$count terbuka';
  }

  @override
  String get pnlReportTitle => 'Laporan PnL';

  @override
  String get pnlReportEyebrow => 'LAPORAN PNL';

  @override
  String pnlRealizedFor(String range) {
    return 'Terealisasi · $range';
  }

  @override
  String get pnlClosed => 'Ditutup';

  @override
  String get pnlTotalAllTime => 'Total semua waktu';

  @override
  String get pnlRealizedAllTime => 'Terealisasi semua waktu';

  @override
  String get pnlReportUnavailable => 'Laporan PnL belum bisa dimuat.';

  @override
  String get pnlRealizedHeroHint => 'Terkunci saat trade ditutup, tidak ikut harga live';

  @override
  String get pnlClosedTrades => 'Trade ditutup';

  @override
  String get pnlByExitReason => 'Per alasan keluar';

  @override
  String get pnlWinRate => 'Rasio menang';

  @override
  String get pnlAvgHold => 'Rata-rata tahan';

  @override
  String get pnlStatsUnavailable => 'Rincian per alasan keluar belum bisa dimuat.';

  @override
  String get pnlPartialNote =>
      'Terealisasi semua waktu juga menghitung TP sebagian di posisi terbuka dan close di luar rentang, jadi bisa lebih besar dari terealisasi rentang ini dan jumlah ledger.';

  @override
  String get pnlRealizedShort => 'terealisasi';

  @override
  String pnlHoldSeconds(int count) {
    return '$count dtk';
  }

  @override
  String pnlHoldMinutes(int count) {
    return '$count mnt';
  }

  @override
  String pnlHoldHours(int hours, int minutes) {
    return '$hours j $minutes mnt';
  }

  @override
  String pnlTrades(int count) {
    String _temp0 = intl.Intl.pluralLogic(count, locale: localeName, other: '$count trade');
    return '$_temp0';
  }

  @override
  String get pnlEmptyTitle => 'Belum ada trade ditutup';

  @override
  String get pnlEmptyBody =>
      'PnL terealisasi muncul di sini setelah posisi ditutup. PnL belum terealisasi tetap terlihat di kartu PnL.';

  @override
  String get pnlEmptyAction => 'Lihat posisi terbuka';

  @override
  String get pnlReceiptSolIn => 'SOL masuk';

  @override
  String get pnlReceiptSolOut => 'SOL keluar';

  @override
  String get pnlReceiptFees => 'Biaya (dilaporkan)';

  @override
  String get pnlReceiptHold => 'Durasi tahan';

  @override
  String get pnlReceiptEntryExit => 'Masuk → keluar';

  @override
  String get pnlReceiptExitReason => 'Alasan keluar';

  @override
  String get pnlReceiptBot => 'Bot';

  @override
  String get pnlReceiptSize => 'Ukuran';

  @override
  String get pnlReceiptSold => 'Terjual';

  @override
  String get pnlReceiptToken => 'Token';

  @override
  String get pnlReceiptMint => 'Mint';

  @override
  String get pnlSell => 'Jual';

  @override
  String get pnlNoSellNote => 'Sell tidak pernah tersedia dari notifikasi.';

  @override
  String get pnlPositionsTitle => 'Posisi';

  @override
  String get pnlPositionNotFound => 'Posisi tidak ditemukan';

  @override
  String get pnlReceiptEntryNow => 'Masuk → sekarang';
}
