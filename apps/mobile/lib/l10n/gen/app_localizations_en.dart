// ignore: unused_import
import 'package:intl/intl.dart' as intl;
import 'app_localizations.dart';

// ignore_for_file: type=lint

/// The translations for English (`en`).
class AppLocalizationsEn extends AppLocalizations {
  AppLocalizationsEn([String locale = 'en']) : super(locale);

  @override
  String get builderApprovalModeRealNote => 'Real SOL: “Off” is not available in the MVP.';

  @override
  String get builderDiffTagNeutral => 'neutral';

  @override
  String get builderDiffTagNew => 'new';

  @override
  String get builderDiffTagStrengthens => 'tightens';

  @override
  String get builderDiffTagWeakens => 'loosens';

  @override
  String builderDiffTitle(String rev) {
    return 'Changes vs rev $rev';
  }

  @override
  String get builderExitColGain => 'Gain %';

  @override
  String get builderExitColPullback => 'Pullback %';

  @override
  String get builderExitColSell => 'Sell % of position';

  @override
  String get builderExitDrain => 'Drain: drop';

  @override
  String get builderExitHardSl => 'Hard stop loss from entry';

  @override
  String get builderExitLadderAdd => 'Add rung';

  @override
  String get builderExitLadderTitle => 'Take-profit ladder (up to 8 rungs)';

  @override
  String builderExitLadderTotal(String pct) {
    return 'Total sold: $pct';
  }

  @override
  String get builderExitNoTrade => 'No-trade exit';

  @override
  String get builderExitTimeStop => 'Time stop';

  @override
  String get builderExitTrailing => 'Trailing stop from high';

  @override
  String get builderGuardsPresetBalanced => 'Balanced';

  @override
  String get builderGuardsPresetLoose => 'Loose';

  @override
  String get builderGuardsPresetStrict => 'Strict';

  @override
  String builderGuardsWeakeningInline(String from) {
    return 'Loosens the guard (was $from). Needs approval.';
  }

  @override
  String get builderPublish => 'Review & publish';

  @override
  String get builderStepEntry => 'Entry';

  @override
  String get builderStepExit => 'Exit plan';

  @override
  String get builderStepGuards => 'Guards';

  @override
  String builderStepProgress(String current, String name, String total) {
    return 'Step $current of $total · $name';
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

    String _temp0 = intl.Intl.pluralLogic(
      count,
      locale: localeName,
      other: '$countString settings loosened',
      one: '$countString setting loosened',
    );
    return '$_temp0';
  }

  @override
  String builderTitleEdit(String name) {
    return 'Edit strategy · $name';
  }

  @override
  String get builderTitleNew => 'New strategy';

  @override
  String builderValidationRange(String max, String min) {
    return 'Must be between $min and $max';
  }

  @override
  String coinTrailSnapshotNote(String rev) {
    return 'Values and thresholds as read at that moment (rev $rev).';
  }

  @override
  String get coinTrailStepBuy => 'Buy';

  @override
  String get coinTrailStepClosed => 'Closed';

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
    return 'Coin trail · $coin ($strategy)';
  }

  @override
  String get commonActionApprove => 'Approve';

  @override
  String get commonActionBack => 'Back';

  @override
  String get commonActionCancel => 'Cancel';

  @override
  String get commonActionNext => 'Next';

  @override
  String get commonActionRetry => 'Try again';

  @override
  String get commonActionReview => 'Review';

  @override
  String get commonActionSaveDraft => 'Save draft';

  @override
  String get commonActionSkip => 'Skip';

  @override
  String get commonActionUndo => 'Undo';

  @override
  String get commonActionView => 'View';

  @override
  String commonDurationHours(int count) {
    final intl.NumberFormat countNumberFormat = intl.NumberFormat.decimalPattern(localeName);
    final String countString = countNumberFormat.format(count);

    String _temp0 = intl.Intl.pluralLogic(
      count,
      locale: localeName,
      other: '$countString hours',
      one: '$countString hour',
    );
    return '$_temp0';
  }

  @override
  String commonDurationMinutes(int count) {
    final intl.NumberFormat countNumberFormat = intl.NumberFormat.decimalPattern(localeName);
    final String countString = countNumberFormat.format(count);

    String _temp0 = intl.Intl.pluralLogic(
      count,
      locale: localeName,
      other: '$countString min',
      one: '$countString min',
    );
    return '$_temp0';
  }

  @override
  String commonDurationSeconds(int count) {
    final intl.NumberFormat countNumberFormat = intl.NumberFormat.decimalPattern(localeName);
    final String countString = countNumberFormat.format(count);

    String _temp0 = intl.Intl.pluralLogic(count, locale: localeName, other: '$countString s', one: '$countString s');
    return '$_temp0';
  }

  @override
  String commonPnlDown(String amount) {
    return 'Down $amount';
  }

  @override
  String get commonPnlFlat => 'No change';

  @override
  String commonPnlUp(String amount) {
    return 'Up $amount';
  }

  @override
  String commonStateSavedAt(String time) {
    return 'Draft saved · $time';
  }

  @override
  String get commonStateSaving => 'Saving…';

  @override
  String commonTimerLeft(String mm_ss) {
    return '$mm_ss left';
  }

  @override
  String get commonYou => 'You';

  @override
  String get conflictActionDiscard => 'Discard my edits';

  @override
  String get conflictActionMerge => 'Reload & keep my edits';

  @override
  String get conflictActionReview => 'Review changes';

  @override
  String conflictBannerBody(String base_rev, String current_rev) {
    return 'Saved as rev $current_rev. Your edits are based on rev $base_rev and have not been saved.';
  }

  @override
  String conflictBannerChangedBy(String actor, String changed_at, String device, String via) {
    String _temp0 = intl.Intl.selectLogic(via, {
      'web': 'web',
      'mobile': 'mobile',
      'desktop': 'desktop',
      'mcp': 'MCP agent',
      'push': 'notification',
      'other': 'app',
    });
    return 'Changed by $actor via $_temp0 on $device · $changed_at';
  }

  @override
  String conflictBannerConflicts(int count) {
    final intl.NumberFormat countNumberFormat = intl.NumberFormat.decimalPattern(localeName);
    final String countString = countNumberFormat.format(count);

    String _temp0 = intl.Intl.pluralLogic(
      count,
      locale: localeName,
      zero: 'No overlapping fields — your edits can be merged.',
      other: '$countString fields changed on both sides.',
      one: '$countString field changed on both sides.',
    );
    return '$_temp0';
  }

  @override
  String conflictBannerFields(String fields) {
    return 'Changed fields: $fields';
  }

  @override
  String get conflictBannerTitle => 'This strategy changed while you were editing';

  @override
  String conflictDiffColBase(String rev) {
    return 'Your base (rev $rev)';
  }

  @override
  String get conflictDiffColMine => 'Your edit';

  @override
  String conflictDiffColTheirs(String rev) {
    return 'Saved (rev $rev)';
  }

  @override
  String conflictDiffPick(String side) {
    String _temp0 = intl.Intl.selectLogic(side, {'mine': 'mine', 'theirs': 'saved', 'other': 'base'});
    return 'Keep $_temp0';
  }

  @override
  String conflictDiscardConfirm(int count) {
    final intl.NumberFormat countNumberFormat = intl.NumberFormat.decimalPattern(localeName);
    final String countString = countNumberFormat.format(count);

    String _temp0 = intl.Intl.pluralLogic(
      count,
      locale: localeName,
      other: '$countString edits',
      one: '$countString edit',
    );
    return 'Discard $_temp0? This can’t be undone.';
  }

  @override
  String get conflictGuardChangeCancelled =>
      'Your pending guard change was cancelled because the strategy was edited elsewhere. Request it again.';

  @override
  String get conflictRealGuardReconfirm =>
      'This loosens a guard on a Real SOL strategy. The full confirmation starts over, and the 10-minute cooldown and 24-hour auto-revert restart from the new confirmation.';

  @override
  String conflictStateMerged(String rev) {
    return 'Merged onto rev $rev. Review, then publish.';
  }

  @override
  String get conflictStateOffline => 'Can’t check for newer versions while offline. Your draft is kept locally.';

  @override
  String get dashboardFeedFilterAll => 'All';

  @override
  String get dashboardFeedFilterBuys => 'Buys';

  @override
  String get dashboardFeedFilterGuard => 'Guard';

  @override
  String get dashboardFeedFilterProposals => 'Proposals';

  @override
  String get dashboardFeedFilterSells => 'Sells';

  @override
  String get dashboardFeedTitle => 'Activity feed';

  @override
  String get dashboardKpiAwaiting => 'Awaiting approval';

  @override
  String get dashboardKpiCash => 'Cash';

  @override
  String dashboardKpiExpiringSoon(int count) {
    final intl.NumberFormat countNumberFormat = intl.NumberFormat.decimalPattern(localeName);
    final String countString = countNumberFormat.format(count);

    String _temp0 = intl.Intl.pluralLogic(
      count,
      locale: localeName,
      other: '$countString expire in under 2 min',
      one: '$countString expires in under 2 min',
    );
    return '$_temp0';
  }

  @override
  String get dashboardKpiOpenPositions => 'Open positions';

  @override
  String get dashboardKpiRealizedPnl => 'Realized PnL';

  @override
  String get dashboardStrategiesColApproval => 'Approval';

  @override
  String get dashboardStrategiesColAvgHold => 'Avg hold';

  @override
  String get dashboardStrategiesColMaxDd => 'Max DD';

  @override
  String get dashboardStrategiesColName => 'Name';

  @override
  String get dashboardStrategiesColPnl => 'PnL';

  @override
  String get dashboardStrategiesColStatus => 'Status';

  @override
  String get dashboardStrategiesColWinRate => 'Win rate';

  @override
  String get dashboardStrategiesNew => 'New strategy';

  @override
  String get dashboardStrategiesTitle => 'Strategies';

  @override
  String dashboardSubtitlePractice(String start) {
    return 'Practice workspace · start $start · live updates';
  }

  @override
  String get dashboardTitle => 'Team overview';

  @override
  String get errorCodeAccountDeletionBlocked => 'Close your Real SOL positions and withdraw your trading wallet first.';

  @override
  String get errorCodeAccountDeletionPending => 'Account deletion is already scheduled.';

  @override
  String get errorCodeApprovalAlreadyDecided => 'This was already decided on another device.';

  @override
  String errorCodeApprovalExpired(String reason) {
    return 'This proposal expired: $reason';
  }

  @override
  String get errorCodeApprovalTokenInvalid => 'This notification action expired. Open the app to continue.';

  @override
  String get errorCodeAuthTgInvalid => 'Telegram login couldn’t be verified. Try again.';

  @override
  String get errorCodeAuthTgNoProfile => 'Allow Telegram to share your profile to sign in.';

  @override
  String get errorCodeAuthTgReplay => 'This Telegram login was already used. Start again.';

  @override
  String get errorCodeConfirmationRestartRequired =>
      'The strategy changed during confirmation. Start the confirmation again.';

  @override
  String get errorCodeGuardCooldownActive => 'This guard change is in its cooldown.';

  @override
  String get errorCodeHoldTooShort => 'Released too early. Hold until the bar is full.';

  @override
  String get errorCodeInternal => 'Something went wrong. Try again.';

  @override
  String get errorCodeLastLoginMethod => 'This is your only sign-in method. Link another one before unlinking.';

  @override
  String get errorCodeOtpInvalid => 'Wrong or expired code.';

  @override
  String get errorCodeOtpLocked => 'Too many attempts. Try again in 15 minutes.';

  @override
  String errorCodeRateLimited(int retry_after_s) {
    final intl.NumberFormat retry_after_sNumberFormat = intl.NumberFormat.decimalPattern(localeName);
    final String retry_after_sString = retry_after_sNumberFormat.format(retry_after_s);

    String _temp0 = intl.Intl.pluralLogic(
      retry_after_s,
      locale: localeName,
      other: '$retry_after_sString seconds',
      one: '$retry_after_sString second',
    );
    return 'Too many requests. Try again in $_temp0.';
  }

  @override
  String get errorCodeRealSolDisabled => 'Real SOL isn’t available yet.';

  @override
  String get errorCodeReauthRequired => 'Please confirm it’s you again to continue.';

  @override
  String errorCodeResetCooldown(String next_allowed_at) {
    return 'Practice can be reset once a day. Next: $next_allowed_at';
  }

  @override
  String get errorCodeSiwsNonceInvalid => 'This sign-in request expired. Try again.';

  @override
  String get errorCodeSiwsSignatureInvalid => 'The wallet signature couldn’t be verified.';

  @override
  String get errorCodeStrategyRevConflict => 'This strategy changed while you were editing.';

  @override
  String get errorCodeTwoFactorRequired => 'Enter your two-factor code to continue.';

  @override
  String get errorCodeTypedConfirmationMismatch => 'The name doesn’t match exactly.';

  @override
  String get errorCodeUnavailable => 'Service is temporarily unavailable. Retrying…';

  @override
  String get errorCodeWalletRoleConflict => 'A sign-in wallet can’t also be your trading wallet.';

  @override
  String get exitReasonDrawdownHalt => 'Drawdown halt';

  @override
  String get exitReasonIdle => 'No-trade exit';

  @override
  String get exitReasonLossGuard => 'Stop loss';

  @override
  String get exitReasonManual => 'Manual sell';

  @override
  String get exitReasonMaxHold => 'Time stop';

  @override
  String get exitReasonNoNewHigh => 'No new high';

  @override
  String get exitReasonPeakTrail => 'Trailing stop';

  @override
  String get exitReasonPracticeReset => 'Practice reset';

  @override
  String get exitReasonProfitTarget => 'Take profit';

  @override
  String get exitReasonRugDetected => 'Rug detected';

  @override
  String get exitReasonSellFloor => 'Sell floor';

  @override
  String get exitReasonSellPressure => 'Sell pressure';

  @override
  String get exitReasonStrategyRetired => 'Strategy retired';

  @override
  String get expireReasonAccountDeletedBadge => 'Account deleted';

  @override
  String get expireReasonAccountDeletedDetail => 'The account was deleted';

  @override
  String get expireReasonGuardFailedBadge => 'Guard failed';

  @override
  String get expireReasonGuardFailedDetail => 'A guard check failed while waiting';

  @override
  String get expireReasonPracticeResetBadge => 'Practice reset';

  @override
  String get expireReasonPracticeResetDetail => 'Practice was reset; pending buys were cleared';

  @override
  String get expireReasonPriceMovedBadge => 'Price moved';

  @override
  String get expireReasonPriceMovedDetail => 'Price moved past the entry limit';

  @override
  String get expireReasonStrategyArchivedBadge => 'Strategy archived';

  @override
  String expireReasonStrategyArchivedDetail(String strategy) {
    return '$strategy was archived while this waited';
  }

  @override
  String get expireReasonStrategyDeletedBadge => 'Strategy deleted';

  @override
  String expireReasonStrategyDeletedDetail(String strategy) {
    return '$strategy was deleted while this waited';
  }

  @override
  String get expireReasonTimeoutBadge => 'Timed out';

  @override
  String get expireReasonTimeoutDetail => 'Approval window ended';

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
  String get feedActorSystem => 'System';

  @override
  String get feedActorYou => 'You';

  @override
  String feedEventBlocked(String coin) {
    return 'Blocked $coin';
  }

  @override
  String feedEventBought(String coin, String sol) {
    return 'Bought $coin · $sol';
  }

  @override
  String feedEventExpired(String coin) {
    return 'Proposal for $coin expired';
  }

  @override
  String feedEventPassed(String coin, String pass, String score) {
    return 'Passed $coin · fit $score/$pass';
  }

  @override
  String feedEventSkipped(String coin) {
    return 'Skipped pick $coin';
  }

  @override
  String feedEventSold(String coin, String pnl) {
    return 'Sold $coin · $pnl';
  }

  @override
  String guardImpactEstimateBody(String max_extra_passes, String window) {
    return 'Up to $max_extra_passes more coins could pass per $window. Based on rules, not a replay.';
  }

  @override
  String get guardImpactEstimateLabel => 'Estimate';

  @override
  String guardImpactReplayBody(String newly_passing, String newly_passing_rugged, String samples) {
    return '$newly_passing more would have passed, $newly_passing_rugged of them rugged ($samples samples).';
  }

  @override
  String guardImpactReplayLabel(String window) {
    return 'Replay · $window';
  }

  @override
  String get guardImpactReplayLoading => 'Running replay… showing the estimate meanwhile';

  @override
  String get guardImpactReplayUnavailable => 'Replay unavailable right now. Showing the estimate.';

  @override
  String get guardWeakenAfterAudit => 'Recorded in the audit log (who, when, device, diff)';

  @override
  String get guardWeakenAfterAutoRevert => 'Mandatory auto-revert after 24 hours unless you confirm again';

  @override
  String get guardWeakenAfterCooldown => 'Mandatory 10-minute cooldown before it applies (can be cancelled)';

  @override
  String get guardWeakenAfterNotify => 'All devices and email are notified';

  @override
  String get guardWeakenCancel => 'Cancel (Esc)';

  @override
  String get guardWeakenChanges => 'Changes (before → after)';

  @override
  String get guardWeakenDirectionLooser => 'looser';

  @override
  String get guardWeakenDirectionOff => 'turned off';

  @override
  String get guardWeakenHoldPractice => 'Hold 1.2 s to loosen';

  @override
  String get guardWeakenHoldReal => 'Hold 2.5 s to loosen';

  @override
  String guardWeakenMatch(String matched, String total) {
    return '$matched of $total characters match';
  }

  @override
  String guardWeakenRiskLevel(String level) {
    String _temp0 = intl.Intl.selectLogic(level, {
      'low': 'Low',
      'medium': 'Medium',
      'high': 'High',
      'other': 'Critical',
    });
    return 'Risk level: $_temp0';
  }

  @override
  String get guardWeakenRiskTitle => 'Risk impact (7-day replay on our paper data)';

  @override
  String get guardWeakenTitlePractice => 'You’re about to loosen a guard';

  @override
  String get guardWeakenTitleReal => 'You’re about to LOOSEN a guard on a Real SOL strategy';

  @override
  String get guardWeakenTypeName => 'Type the strategy name to confirm';

  @override
  String get loginButtonApple => 'Continue with Apple';

  @override
  String get loginButtonEmail => 'Send 6-digit code';

  @override
  String get loginButtonGoogle => 'Continue with Google';

  @override
  String get loginButtonTelegram => 'Log in with Telegram';

  @override
  String get loginButtonWallet => 'Connect Solana wallet';

  @override
  String get loginEmailLabel => 'Email';

  @override
  String get loginOr => 'or';

  @override
  String loginOtpLocked(String minutes) {
    return 'Too many attempts. Try again in $minutes min.';
  }

  @override
  String loginOtpResendIn(String time) {
    return 'Resend in $time';
  }

  @override
  String loginOtpSentTo(String email) {
    return 'Sent to $email';
  }

  @override
  String get loginOtpTitle => 'Enter the code';

  @override
  String loginOtpWrong(int remaining) {
    final intl.NumberFormat remainingNumberFormat = intl.NumberFormat.decimalPattern(localeName);
    final String remainingString = remainingNumberFormat.format(remaining);

    String _temp0 = intl.Intl.pluralLogic(
      remaining,
      locale: localeName,
      other: 'Wrong code. $remainingString attempts left.',
      one: 'Wrong code. $remainingString attempt left.',
    );
    return '$_temp0';
  }

  @override
  String get loginPracticeDefault => 'New accounts always start in PRACTICE mode.';

  @override
  String get loginSubtitle => 'One account, many sign-in methods. You can link more later.';

  @override
  String get loginTelegramCancelled => 'Telegram login was cancelled. Nothing changed.';

  @override
  String get loginTelegramConsent => 'Telegram shares your name, username and photo with Sentra.';

  @override
  String get loginTelegramRetry => 'Try Telegram again';

  @override
  String get loginTelegramTitle => 'Log in with Telegram';

  @override
  String get loginTelegramUnavailable => 'Telegram login is not available yet. Use another method.';

  @override
  String get loginTelegramWaiting => 'Confirm in Telegram…';

  @override
  String get loginTerms => 'By continuing you agree to the Terms and Privacy Policy.';

  @override
  String get loginTitle => 'Sign in or create an account';

  @override
  String get loginWalletRejected => 'Signature was declined. Nothing was signed.';

  @override
  String get loginWalletSignNote => 'You’ll sign a message, not a transaction. No fee.';

  @override
  String get loginWalletSignTitle => 'Sign to sign in';

  @override
  String get modePracticeBanner => 'Practice · paper SOL, no real SOL moves';

  @override
  String get modePracticeBannerShort => 'Practice · paper SOL';

  @override
  String get modePracticeLabel => 'PRACTICE';

  @override
  String get modeRealBanner => 'Real SOL · wallet connected, orders use real SOL';

  @override
  String get modeRealBannerShort => 'Real SOL · real money';

  @override
  String get modeRealLabel => 'REAL SOL';

  @override
  String get modeSwitchToRealHold => 'Hold to switch to Real SOL';

  @override
  String get modeSwitchToRealRequirements => 'Requires a connected trading wallet and 2FA.';

  @override
  String get modeSwitchToRealTitle => 'Switch to Real SOL?';

  @override
  String get modeSwitchToastPractice => 'Back to Practice';

  @override
  String get navActivity => 'Activity';

  @override
  String get navApprovals => 'Approvals';

  @override
  String get navCoins => 'Coins';

  @override
  String get navDashboard => 'Dashboard';

  @override
  String get navHome => 'Home';

  @override
  String get navMore => 'More';

  @override
  String get navPositions => 'Positions';

  @override
  String get navSearchPlaceholder => 'Search coin or strategy';

  @override
  String get navSettings => 'Settings';

  @override
  String get navStrategies => 'Strategies';

  @override
  String get notifActionApprove => 'Approve';

  @override
  String get notifActionCancelChange => 'Cancel change';

  @override
  String get notifActionOpen => 'Open';

  @override
  String get notifActionSkip => 'Skip';

  @override
  String get notifApprovedBody => 'Order is being placed';

  @override
  String notifApprovedTitle(String coin) {
    return 'Approved: $coin';
  }

  @override
  String get notifDeletionCancelledBody => 'Your account stays active.';

  @override
  String get notifDeletionCancelledTitle => 'Account deletion cancelled';

  @override
  String notifDeletionScheduledBody(String scheduled_for) {
    return 'Your account will be deleted on $scheduled_for. Cancel in Settings if this wasn’t you.';
  }

  @override
  String get notifDeletionScheduledTitle => 'Account deletion scheduled';

  @override
  String notifExpiredBody(String reason) {
    return '$reason';
  }

  @override
  String notifExpiredTitle(String coin, String mode) {
    String _temp0 = intl.Intl.selectLogic(mode, {'real': 'REAL SOL', 'other': 'PRACTICE'});
    return '[$_temp0] $coin expired';
  }

  @override
  String notifFailedBody(String amount_lamports, String mode, String reason_code) {
    String _temp0 = intl.Intl.selectLogic(mode, {'real': 'Network fees may apply.', 'other': 'No SOL was spent.'});
    return '$reason_code · $amount_lamports. $_temp0';
  }

  @override
  String notifFailedTitle(String mode, String side, String symbol) {
    String _temp0 = intl.Intl.selectLogic(mode, {'real': 'REAL SOL', 'other': 'PRACTICE'});
    String _temp1 = intl.Intl.selectLogic(side, {'sell': 'Sell', 'other': 'Buy'});
    return '[$_temp0] $_temp1 $symbol failed';
  }

  @override
  String notifFilledBody(String price, String sol) {
    return '$sol at $price · exit plan armed';
  }

  @override
  String notifFilledTitle(String coin, String mode) {
    String _temp0 = intl.Intl.selectLogic(mode, {'real': 'REAL SOL', 'other': 'PRACTICE'});
    return '[$_temp0] Bought $coin';
  }

  @override
  String notifFirstBuyBody(String mm_ss, String sol) {
    return 'This strategy hasn’t bought yet. Review before it starts · $sol · $mm_ss left';
  }

  @override
  String notifFirstBuyTitle(String coin, String mode, String strategy) {
    String _temp0 = intl.Intl.selectLogic(mode, {'real': 'REAL SOL', 'other': 'PRACTICE'});
    return '[$_temp0] First buy for $strategy: $coin';
  }

  @override
  String get notifGroupedBody => 'Open the queue to review';

  @override
  String notifGroupedTitle(int count, String mode) {
    final intl.NumberFormat countNumberFormat = intl.NumberFormat.decimalPattern(localeName);
    final String countString = countNumberFormat.format(count);

    String _temp0 = intl.Intl.selectLogic(mode, {'other': 'PRACTICE', 'real': 'REAL SOL'});
    String _temp1 = intl.Intl.pluralLogic(
      count,
      locale: localeName,
      other: '$countString picks await approval',
      one: '$countString pick awaits approval',
    );
    return '[$_temp0] $_temp1';
  }

  @override
  String notifGuardActiveBody(String auto_revert_at) {
    return 'Auto-reverts $auto_revert_at';
  }

  @override
  String notifGuardActiveTitle(String mode, String strategy) {
    String _temp0 = intl.Intl.selectLogic(mode, {'real': 'REAL SOL', 'other': 'PRACTICE'});
    return '[$_temp0] $strategy guard is now looser';
  }

  @override
  String notifGuardCancelledBody(String strategy) {
    return '$strategy was edited elsewhere. Request the change again.';
  }

  @override
  String notifGuardCancelledTitle(String mode) {
    String _temp0 = intl.Intl.selectLogic(mode, {'real': 'REAL SOL', 'other': 'PRACTICE'});
    return '[$_temp0] Guard change cancelled';
  }

  @override
  String notifGuardCooldownBody(String cooldown_until, String strategy) {
    return '$strategy: effective $cooldown_until. Cancel if this wasn’t you.';
  }

  @override
  String get notifGuardCooldownTitle => '[REAL SOL] Guard loosens in 10 min';

  @override
  String notifGuardRequestedBody(String from, String setting, String strategy, String to) {
    return '$strategy: $setting $from → $to loosens a guard';
  }

  @override
  String notifGuardRequestedTitle(String mode) {
    String _temp0 = intl.Intl.selectLogic(mode, {'real': 'REAL SOL', 'other': 'PRACTICE'});
    return '[$_temp0] Guard change pending';
  }

  @override
  String notifGuardRevertedBody(String from, String setting) {
    return '$setting back to $from';
  }

  @override
  String notifGuardRevertedTitle(String strategy) {
    return '[REAL SOL] $strategy guard restored';
  }

  @override
  String notifLossStopBody(String pct) {
    return 'Down $pct from peak. Re-arm needs approval.';
  }

  @override
  String notifLossStopTitle(String mode, String strategy) {
    String _temp0 = intl.Intl.selectLogic(mode, {'real': 'REAL SOL', 'other': 'PRACTICE'});
    return '[$_temp0] $strategy paused';
  }

  @override
  String get notifModePracticeBody => 'Orders use paper SOL';

  @override
  String get notifModePracticeTitle => 'Back to PRACTICE';

  @override
  String get notifModeRealBody => 'Next orders use real SOL';

  @override
  String get notifModeRealTitle => 'Now in REAL SOL';

  @override
  String get notifOfflineBody => 'Data may be delayed. Retrying…';

  @override
  String get notifOfflineTitle => 'Lost connection to server';

  @override
  String notifPickPendingBody(String mm_ss, String sol, String strategy) {
    return '$strategy · $sol · $mm_ss left';
  }

  @override
  String notifPickPendingTitle(String coin, String mode) {
    String _temp0 = intl.Intl.selectLogic(mode, {'real': 'REAL SOL', 'other': 'PRACTICE'});
    return '[$_temp0] $coin awaits approval';
  }

  @override
  String notifPracticeResetBody(String sol) {
    return 'Balance back to $sol. Pending buys were cleared.';
  }

  @override
  String get notifPracticeResetTitle => '[PRACTICE] Practice reset';

  @override
  String notifSkippedBody(String reason) {
    return 'Reason: $reason';
  }

  @override
  String notifSkippedTitle(String coin) {
    return 'Skipped: $coin';
  }

  @override
  String notifSlHitBody(String pct, String pnl, String stop_type) {
    return '$stop_type · $pnl ($pct)';
  }

  @override
  String notifSlHitTitle(String coin, String mode) {
    String _temp0 = intl.Intl.selectLogic(mode, {'real': 'REAL SOL', 'other': 'PRACTICE'});
    return '[$_temp0] Stopped out of $coin';
  }

  @override
  String get notifTokenInvalidBody => 'Open the app to continue';

  @override
  String get notifTokenInvalidTitle => 'Notification action expired';

  @override
  String notifTpHitBody(String pct, String pct_sold, String pnl) {
    return 'Sold $pct_sold at $pct · $pnl';
  }

  @override
  String notifTpHitTitle(String coin, String mode) {
    String _temp0 = intl.Intl.selectLogic(mode, {'real': 'REAL SOL', 'other': 'PRACTICE'});
    return '[$_temp0] Took profit on $coin';
  }

  @override
  String get orderFailReasonGuardFailed => 'A guard check failed right before the order';

  @override
  String get orderFailReasonInsufficientPracticeBalance => 'Not enough paper SOL';

  @override
  String get orderFailReasonPoolStale => 'Pool data was out of date; the order was not sent';

  @override
  String get orderFailReasonSlippageExceeded => 'Price moved more than your slippage limit';

  @override
  String get orderFailReasonUnknown => 'The order couldn’t be completed';

  @override
  String get orderFailReasonUnsupportedQuoteMint => 'This coin has no SOL pair, so it can’t be traded';

  @override
  String get positionsEquityHwm => 'High-water mark';

  @override
  String positionsEquityTitle(String range) {
    return 'Equity · $range';
  }

  @override
  String positionsNextAction(String gain, String pct, String rung) {
    return 'Next: $rung at $gain (sell $pct)';
  }

  @override
  String positionsOpenCount(int count) {
    final intl.NumberFormat countNumberFormat = intl.NumberFormat.decimalPattern(localeName);
    final String countString = countNumberFormat.format(count);

    String _temp0 = intl.Intl.pluralLogic(
      count,
      locale: localeName,
      other: '$countString open',
      one: '$countString open',
    );
    return '$_temp0';
  }

  @override
  String get positionsSellEstimate => 'Estimated proceeds';

  @override
  String positionsSellHoldPractice(String pct) {
    return 'Hold 1.2 s to sell $pct';
  }

  @override
  String positionsSellHoldReal(String pct) {
    return 'Hold 2.5 s to sell $pct';
  }

  @override
  String get positionsSellHoldReleased => 'Released early — nothing was sold';

  @override
  String get positionsSellNeverFromNotification => 'Selling is never available from a notification or popup.';

  @override
  String get positionsSellPlanCancelled => 'Exit plan cancelled (100%)';

  @override
  String get positionsSellRemainingPlan => 'Remaining position keeps its exit plan';

  @override
  String positionsSellTitle(String coin) {
    return 'Sell $coin';
  }

  @override
  String get positionsTitle => 'Positions';

  @override
  String queueBatchApprove(int count) {
    final intl.NumberFormat countNumberFormat = intl.NumberFormat.decimalPattern(localeName);
    final String countString = countNumberFormat.format(count);

    String _temp0 = intl.Intl.pluralLogic(
      count,
      locale: localeName,
      other: 'Approve $countString picks',
      one: 'Approve $countString pick',
    );
    return '$_temp0';
  }

  @override
  String queueBatchSelected(int count) {
    final intl.NumberFormat countNumberFormat = intl.NumberFormat.decimalPattern(localeName);
    final String countString = countNumberFormat.format(count);

    String _temp0 = intl.Intl.pluralLogic(
      count,
      locale: localeName,
      other: '$countString selected',
      one: '$countString selected',
    );
    return '$_temp0';
  }

  @override
  String queueBatchTotal(String sol) {
    return 'Total $sol';
  }

  @override
  String get queueGuardReject => 'Reject change';

  @override
  String get queuePickApprove => 'Approve';

  @override
  String get queuePickCannotApprove => 'Can’t be approved';

  @override
  String queuePickExpiresIn(String mm_ss) {
    return 'Expires in $mm_ss';
  }

  @override
  String get queuePickKindBuy => 'Buy';

  @override
  String get queuePickKindFirstBuy => 'First buy';

  @override
  String get queuePickKindGuardChange => 'Loosens guard';

  @override
  String get queuePickReviewChange => 'Review change';

  @override
  String get queuePickSkip => 'Skip';

  @override
  String get queueRealApproveButton => 'Approve with Real SOL';

  @override
  String queueRealBatchConfirmTitle(int count) {
    final intl.NumberFormat countNumberFormat = intl.NumberFormat.decimalPattern(localeName);
    final String countString = countNumberFormat.format(count);

    String _temp0 = intl.Intl.pluralLogic(
      count,
      locale: localeName,
      other: 'Approve $countString buys with REAL SOL?',
      one: 'Approve $countString buy with REAL SOL?',
    );
    return '$_temp0';
  }

  @override
  String queueRealHold(String sol) {
    return 'Hold to approve $sol';
  }

  @override
  String get queueSkipReasonAlreadyPumped => 'Already pumped';

  @override
  String get queueSkipReasonOther => 'Other…';

  @override
  String get queueSkipReasonSuspiciousDev => 'Suspicious dev';

  @override
  String get queueSkipReasonThinLiquidity => 'Thin liquidity';

  @override
  String get queueSwipeDisabledReal => 'Swipe is off in Real SOL. Use the buttons.';

  @override
  String get queueSwipeHint => 'Swipe right to approve · left to skip';

  @override
  String get queueTabApproved => 'Approved';

  @override
  String get queueTabExpired => 'Expired';

  @override
  String get queueTabPending => 'Pending';

  @override
  String get queueTabSkipped => 'Skipped';

  @override
  String queueTabWithCount(String count, String label) {
    return '$label · $count';
  }

  @override
  String get queueTitle => 'Approval queue';

  @override
  String get queueWhyFirstBuy => 'Approval mode is “Ask: first buy”. This is the strategy’s first buy.';

  @override
  String get queueWhyTitle => 'Why does this need approval?';

  @override
  String get screenerNotTradeableBadge => 'Not tradeable';

  @override
  String get screenerNotTradeableDetail =>
      'No SOL quote pair for this coin. Sentra only trades SOL pairs, so it can’t be approved.';

  @override
  String get settingsAppearanceDensityComfortable => 'Comfortable';

  @override
  String get settingsAppearanceDensityCompact => 'Compact';

  @override
  String get settingsAppearanceDensityLabel => 'Density';

  @override
  String get settingsAppearanceThemeDark => 'Dark';

  @override
  String get settingsAppearanceThemeLabel => 'Theme';

  @override
  String get settingsAppearanceThemeLight => 'Light';

  @override
  String get settingsAppearanceThemeSystem => 'Match system';

  @override
  String get settingsDeleteAuditNote =>
      'Audit records are kept but anonymized; your name, devices and sign-in methods are removed.';

  @override
  String get settingsDeleteCancel => 'Cancel deletion';

  @override
  String get settingsDeleteCheckRealPositions => 'Close all Real SOL positions';

  @override
  String get settingsDeleteCheckReauth => 'Confirm it’s you (last 5 min)';

  @override
  String get settingsDeleteCheckTwoFactor => 'Two-factor code (if enabled)';

  @override
  String get settingsDeleteCheckWalletWithdrawn => 'Withdraw your trading wallet';

  @override
  String get settingsDeleteConfirm => 'Schedule deletion';

  @override
  String settingsDeleteGrace(int count) {
    final intl.NumberFormat countNumberFormat = intl.NumberFormat.decimalPattern(localeName);
    final String countString = countNumberFormat.format(count);

    String _temp0 = intl.Intl.pluralLogic(
      count,
      locale: localeName,
      other: '$countString days',
      one: '$countString day',
    );
    return 'Grace period: $_temp0';
  }

  @override
  String get settingsDeleteIntro => 'Your account is deleted after a grace period. You can cancel until then.';

  @override
  String settingsDeleteScheduled(String scheduled_for) {
    return 'Deletion scheduled for $scheduled_for. We sent a confirmation email.';
  }

  @override
  String get settingsDeleteTitle => 'Delete account';

  @override
  String settingsDevicesLastSeen(String when) {
    return 'Last seen $when';
  }

  @override
  String get settingsDevicesNote =>
      'Each device registers its own push token. Removing a device signs it out and stops its notifications.';

  @override
  String get settingsDevicesPushOff => 'Push off';

  @override
  String get settingsDevicesPushOn => 'Push on';

  @override
  String get settingsDevicesRevoke => 'Remove device';

  @override
  String get settingsDevicesTitle => 'Devices & push';

  @override
  String get settingsLanguageLabel => 'Language';

  @override
  String settingsLanguageNumberFormat(String example) {
    return 'Numbers follow the language: $example';
  }

  @override
  String get settingsLoginLastMethodLock => 'This is your only sign-in method. Link another before unlinking.';

  @override
  String get settingsLoginLink => 'Link';

  @override
  String get settingsLoginLinked => 'Linked';

  @override
  String get settingsLoginReauth => 'Confirm it’s you to continue';

  @override
  String get settingsLoginUnlink => 'Unlink';

  @override
  String get settingsLoginWalletNote => 'Sign-in wallet only proves identity. It can’t trade.';

  @override
  String get settingsModeDefaultApproval => 'Default approval mode';

  @override
  String get settingsModeDefaultNewStrategy => 'New strategies start in';

  @override
  String get settingsNotifDesktopPopup => 'Desktop always-on-top popup';

  @override
  String get settingsNotifEmail => 'Email';

  @override
  String get settingsNotifPracticeActions => 'Allow Approve from notifications (Practice only)';

  @override
  String get settingsNotifPush => 'Push notifications';

  @override
  String get settingsSectionAppearance => 'Appearance';

  @override
  String get settingsSectionDanger => 'Delete account';

  @override
  String get settingsSectionDevices => 'Devices & push';

  @override
  String get settingsSectionLanguage => 'Language';

  @override
  String get settingsSectionLoginMethods => 'Sign-in methods';

  @override
  String get settingsSectionModeDefaults => 'Mode & defaults';

  @override
  String get settingsSectionNotifications => 'Notifications';

  @override
  String get settingsSectionProfile => 'Profile';

  @override
  String get settingsSectionSecurity => 'Security';

  @override
  String get settingsSectionTradingWallet => 'Trading wallet';

  @override
  String get settingsSecurity2fa => 'Two-factor authentication';

  @override
  String get settingsSecurityAudit => 'Audit log';

  @override
  String get settingsSecuritySessions => 'Sessions & devices';

  @override
  String get settingsSecuritySignOutDevice => 'Sign out';

  @override
  String get settingsSecurityThisDevice => 'This device';

  @override
  String get settingsWalletNotConnected => 'Not connected. Real SOL stays off.';

  @override
  String get settingsWalletSeparateNote =>
      'Separate from your sign-in wallet. Withdrawals need 2FA, email approval, and an allow-listed address.';

  @override
  String get settingsWalletTitle => 'Trading wallet (Real SOL)';

  @override
  String get shortcutA => 'Approve focused item';

  @override
  String get shortcutEnter => 'Pop out chart';

  @override
  String get shortcutEsc => 'Close / cancel';

  @override
  String get shortcutJk => 'Next / previous';

  @override
  String get shortcutS => 'Skip (with reason)';

  @override
  String get shortcutShiftA => 'Approve selected';

  @override
  String get shortcutShiftX => 'Sell focused position';

  @override
  String get shortcutSpace => 'Details / quick look';

  @override
  String get shortcutX => 'Select / deselect';

  @override
  String get strategyApprovalModeAskEveryBuy => 'Ask: every buy';

  @override
  String get strategyApprovalModeAskFirstBuy => 'Ask: first buy';

  @override
  String get strategyApprovalModeOff => 'Off (auto)';

  @override
  String get strategyStatusDraft => 'Draft';

  @override
  String get strategyStatusPaused => 'Paused';

  @override
  String get strategyStatusRunning => 'Running';

  @override
  String get tableMobileCollapse => 'Hide details';

  @override
  String get tableMobileExpand => 'Show details';

  @override
  String get tableMobileScrollHint => 'Scroll for more columns';
}
