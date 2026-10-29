// ignore: unused_import
import 'package:intl/intl.dart' as intl;
import 'app_localizations.dart';

// ignore_for_file: type=lint

/// The translations for Indonesian (`id`).
class AppLocalizationsId extends AppLocalizations {
  AppLocalizationsId([String locale = 'id']) : super(locale);

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
  String get errorCodeAccountDeletionBlocked => 'Tutup posisi Real SOL dan tarik saldo trading wallet dulu.';

  @override
  String get errorCodeAccountDeletionPending => 'Penghapusan akun sudah dijadwalkan.';

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
  String get errorCodeModeNotAllowed => 'Hanya Practice yang tersedia. Real SOL belum aktif.';

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
      'Saldo practice tidak cukup untuk entry berikutnya. Entry dijeda sampai saldo pulih atau practice direset.';

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
    return 'Practice bisa di-reset sekali sehari. Berikutnya: $next_allowed_at';
  }

  @override
  String get errorCodeSettingsSchemaInvalid => 'Pengaturan strategi tidak sesuai skema. Cek kolom yang ditandai.';

  @override
  String get errorCodeSiwsNonceInvalid => 'Permintaan masuk kedaluwarsa. Coba lagi.';

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
  String get exitReasonPracticeReset => 'Practice di-reset';

  @override
  String get exitReasonProfitTarget => 'Take profit';

  @override
  String get exitReasonRugDetected => 'Rug terdeteksi';

  @override
  String get exitReasonSellFloor => 'Sell floor';

  @override
  String get exitReasonSellPressure => 'Tekanan jual';

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
  String get expireReasonPracticeResetBadge => 'Practice di-reset';

  @override
  String get expireReasonPracticeResetDetail => 'Practice di-reset; buy tertunda dihapus';

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
  String get loginPracticeDefault => 'Akun baru selalu mulai di mode PRACTICE.';

  @override
  String get loginSubtitle => 'Satu akun, banyak metode masuk. Bisa ditambah nanti.';

  @override
  String get loginTelegramCancelled => 'Login Telegram dibatalkan. Tidak ada yang berubah.';

  @override
  String get loginTelegramConsent => 'Telegram membagikan nama, username, dan foto ke Sentra.';

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
  String get modePracticeBanner => 'Practice · paper SOL, tidak ada SOL nyata yang bergerak';

  @override
  String get modePracticeBannerShort => 'Practice · paper SOL';

  @override
  String get modePracticeLabel => 'PRACTICE';

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
  String get notifActionOpen => 'Buka';

  @override
  String get notifActionSkip => 'Lewati';

  @override
  String get notifApprovedBody => 'Order sedang diproses';

  @override
  String notifApprovedTitle(String symbol) {
    return 'Disetujui: $symbol';
  }

  @override
  String get notifDeletionCancelledBody => 'Akunmu tetap aktif.';

  @override
  String get notifDeletionCancelledTitle => 'Penghapusan akun dibatalkan';

  @override
  String notifDeletionScheduledBody(String scheduled_for) {
    return 'Akunmu akan dihapus pada $scheduled_for. Batalkan di Pengaturan jika bukan kamu.';
  }

  @override
  String get notifDeletionScheduledTitle => 'Penghapusan akun dijadwalkan';

  @override
  String notifExpiredBody(String reason) {
    return '$reason';
  }

  @override
  String notifExpiredTitle(String mode, String symbol) {
    String _temp0 = intl.Intl.selectLogic(mode, {'real': 'REAL SOL', 'other': 'PRACTICE'});
    return '[$_temp0] $symbol kedaluwarsa';
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
    String _temp0 = intl.Intl.selectLogic(mode, {'real': 'REAL SOL', 'other': 'PRACTICE'});
    String _temp1 = intl.Intl.selectLogic(side, {'sell': 'Jual', 'other': 'Beli'});
    return '[$_temp0] $_temp1 $symbol gagal';
  }

  @override
  String notifFilledBody(String amount_lamports, String price) {
    return '$amount_lamports di $price · exit plan aktif';
  }

  @override
  String notifFilledTitle(String mode, String symbol) {
    String _temp0 = intl.Intl.selectLogic(mode, {'real': 'REAL SOL', 'other': 'PRACTICE'});
    return '[$_temp0] Terbeli $symbol';
  }

  @override
  String notifFirstBuyBody(String amount_lamports, String mm_ss) {
    return 'Strategi ini belum pernah beli. Cek sebelum mulai · $amount_lamports · sisa $mm_ss';
  }

  @override
  String notifFirstBuyTitle(String mode, String strategy, String symbol) {
    String _temp0 = intl.Intl.selectLogic(mode, {'real': 'REAL SOL', 'other': 'PRACTICE'});
    return '[$_temp0] Buy pertama $strategy: $symbol';
  }

  @override
  String get notifGroupedBody => 'Buka antrean untuk meninjau';

  @override
  String notifGroupedTitle(int count, String mode) {
    final intl.NumberFormat countNumberFormat = intl.NumberFormat.decimalPattern(localeName);
    final String countString = countNumberFormat.format(count);

    String _temp0 = intl.Intl.selectLogic(mode, {'other': 'PRACTICE', 'real': 'REAL SOL'});
    String _temp1 = intl.Intl.pluralLogic(count, locale: localeName, other: '$countString pick menunggu approval');
    return '[$_temp0] $_temp1';
  }

  @override
  String notifGuardActiveBody(String auto_revert_at) {
    return 'Auto-revert $auto_revert_at';
  }

  @override
  String notifGuardActiveTitle(String mode, String strategy) {
    String _temp0 = intl.Intl.selectLogic(mode, {'real': 'REAL SOL', 'other': 'PRACTICE'});
    return '[$_temp0] Guard $strategy kini lebih longgar';
  }

  @override
  String notifGuardCancelledBody(String strategy) {
    return '$strategy diedit di tempat lain. Ajukan ulang perubahannya.';
  }

  @override
  String notifGuardCancelledTitle(String mode) {
    String _temp0 = intl.Intl.selectLogic(mode, {'real': 'REAL SOL', 'other': 'PRACTICE'});
    return '[$_temp0] Perubahan guard dibatalkan';
  }

  @override
  String notifGuardCooldownBody(String cooldown_until, String strategy) {
    return '$strategy: berlaku $cooldown_until. Batalkan jika bukan kamu.';
  }

  @override
  String get notifGuardCooldownTitle => '[REAL SOL] Guard dilonggarkan dalam 10 mnt';

  @override
  String notifGuardRequestedBody(String from, String setting, String strategy, String to) {
    return '$strategy: $setting $from → $to melonggarkan guard';
  }

  @override
  String notifGuardRequestedTitle(String mode) {
    String _temp0 = intl.Intl.selectLogic(mode, {'real': 'REAL SOL', 'other': 'PRACTICE'});
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
    String _temp0 = intl.Intl.selectLogic(mode, {'real': 'REAL SOL', 'other': 'PRACTICE'});
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
  String notifPickPendingBody(String amount_lamports, String mm_ss, String strategy) {
    return '$strategy · $amount_lamports · sisa $mm_ss';
  }

  @override
  String notifPickPendingTitle(String mode, String symbol) {
    String _temp0 = intl.Intl.selectLogic(mode, {'real': 'REAL SOL', 'other': 'PRACTICE'});
    return '[$_temp0] $symbol menunggu approval';
  }

  @override
  String notifPracticeResetBody(String amount_lamports) {
    return 'Saldo kembali ke $amount_lamports. Buy tertunda dihapus.';
  }

  @override
  String get notifPracticeResetTitle => '[PRACTICE] Practice di-reset';

  @override
  String notifSkippedBody(String reason) {
    return 'Alasan: $reason';
  }

  @override
  String notifSkippedTitle(String symbol) {
    return 'Dilewati: $symbol';
  }

  @override
  String notifSlHitBody(String pct, String pnl, String stop_type) {
    return '$stop_type · $pnl ($pct)';
  }

  @override
  String notifSlHitTitle(String mode, String symbol) {
    String _temp0 = intl.Intl.selectLogic(mode, {'real': 'REAL SOL', 'other': 'PRACTICE'});
    return '[$_temp0] Stop $symbol';
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
  String notifTpHitTitle(String mode, String symbol) {
    String _temp0 = intl.Intl.selectLogic(mode, {'real': 'REAL SOL', 'other': 'PRACTICE'});
    return '[$_temp0] Take profit $symbol';
  }

  @override
  String get orderFailReasonGuardFailed => 'Cek guard gagal tepat sebelum order';

  @override
  String get orderFailReasonInsufficientPracticeBalance => 'Saldo paper SOL tidak cukup';

  @override
  String get orderFailReasonModeNotAllowed => 'Hanya order Practice yang jalan; Real SOL belum aktif';

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
    final intl.NumberFormat countNumberFormat = intl.NumberFormat.decimalPattern(localeName);
    final String countString = countNumberFormat.format(count);

    String _temp0 = intl.Intl.pluralLogic(count, locale: localeName, other: '$countString terbuka');
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
  String get positionsSellHoldReleased => 'Dilepas terlalu cepat — tidak ada yang dijual';

  @override
  String get positionsSellNeverFromNotification => 'Jual tidak pernah tersedia dari notifikasi atau popup.';

  @override
  String get positionsSellPlanCancelled => 'Exit plan dibatalkan (100%)';

  @override
  String get positionsSellRemainingPlan => 'Sisa posisi tetap memakai exit plan';

  @override
  String positionsSellTitle(String symbol) {
    return 'Jual $symbol';
  }

  @override
  String get positionsTitle => 'Posisi';

  @override
  String queueBatchApprove(int count) {
    final intl.NumberFormat countNumberFormat = intl.NumberFormat.decimalPattern(localeName);
    final String countString = countNumberFormat.format(count);

    String _temp0 = intl.Intl.pluralLogic(count, locale: localeName, other: 'Setujui $countString pick');
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
  String get queueSkipReasonAlreadyPumped => 'Sudah pump';

  @override
  String get queueSkipReasonOther => 'Lainnya…';

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
  String queueTabWithCount(String count, String label) {
    return '$label · $count';
  }

  @override
  String get queueTitle => 'Antrean approval';

  @override
  String get queueWhyFirstBuy => 'Mode approval “Tanya: buy pertama”. Ini buy pertama strategi ini.';

  @override
  String get queueWhyTitle => 'Kenapa butuh approval?';

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
  String get screenerDetailSolPair => 'Pair SOL';

  @override
  String get screenerFilterAll => 'Semua';

  @override
  String get screenerFilterPassed => 'Lolos';

  @override
  String get screenerFilterRejected => 'Ditolak';

  @override
  String get screenerNotTradeableBadge => 'Tidak bisa ditradingkan';

  @override
  String get screenerNotTradeableDetail =>
      'Koin ini tidak punya pair quote SOL. Sentra hanya trading pair SOL, jadi tidak bisa di-approve.';

  @override
  String get screenerStatusPassed => 'Lolos';

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
  String get settingsNotifPracticeActions => 'Izinkan Setujui dari notifikasi (khusus Practice)';

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
