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
  String get chartTitle => 'Chart';

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
  String coinTrailTitle(String strategy, String symbol) {
    return 'Coin trail · $symbol ($strategy)';
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
  String get errorCodeApprovalRequiresApp => 'Decide this in the official app, not via MCP.';

  @override
  String get errorCodeApprovalTokenInvalid => 'This notification action expired. Open the app to continue.';

  @override
  String get errorCodeAuthTgInvalid => 'Telegram login couldn’t be verified. Try again.';

  @override
  String get errorCodeAuthTgNoProfile => 'Allow Telegram to share your profile to sign in.';

  @override
  String get errorCodeAuthTgReplay => 'This Telegram login was already used. Start again.';

  @override
  String get errorCodeConfirmationInvalid => 'This confirmation expired or was already used. Start again.';

  @override
  String get errorCodeConfirmationRequired => 'This change needs confirmation: passkey, typed name and hold.';

  @override
  String get errorCodeConfirmationRestartRequired =>
      'The strategy changed during confirmation. Start the confirmation again.';

  @override
  String get errorCodeForbiddenRole => 'Your workspace role doesn’t allow this action.';

  @override
  String get errorCodeForbiddenScope => 'This token doesn’t have permission for this action.';

  @override
  String get errorCodeGuardCooldownActive => 'This guard change is in its cooldown.';

  @override
  String get errorCodeHoldTooShort => 'Released too early. Hold until the bar is full.';

  @override
  String get errorCodeInternal => 'Something went wrong. Try again.';

  @override
  String get errorCodeInvalidFraction => 'Choose a sell amount from 0.01% to 100%.';

  @override
  String get errorCodeJobDeadLettered => 'A background task failed after all retries. Support has been notified.';

  @override
  String get errorCodeLastLoginMethod => 'This is your only sign-in method. Link another one before unlinking.';

  @override
  String get errorCodeModeNotAllowed => 'Only Practice is available. Real SOL isn’t enabled yet.';

  @override
  String get errorCodeNotFound => 'Not found, or you don’t have access.';

  @override
  String get errorCodeOtpInvalid => 'Wrong or expired code.';

  @override
  String get errorCodeOtpLocked => 'Too many attempts. Try again in 15 minutes.';

  @override
  String get errorCodePositionAlreadyClosed => 'This position is already closed.';

  @override
  String get errorCodePracticeCashInsufficient =>
      'Practice cash is too low for the next entry. Entries pause until cash recovers or you reset Practice.';

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
  String get errorCodeReplayUnavailable => 'Replay isn’t available right now. Showing the estimate.';

  @override
  String errorCodeResetCooldown(String next_allowed_at) {
    return 'Practice can be reset once a day. Next: $next_allowed_at';
  }

  @override
  String get errorCodeSettingsSchemaInvalid => 'These strategy settings aren’t valid. Check the highlighted fields.';

  @override
  String get errorCodeSiwsNonceInvalid => 'This sign-in request expired. Try again.';

  @override
  String get errorCodeSiwsSignatureInvalid => 'The wallet signature couldn’t be verified.';

  @override
  String get errorCodeSourceDegraded => 'A market data source is degraded. New picks may be delayed.';

  @override
  String get errorCodeStrategyRetired => 'This strategy was archived or deleted.';

  @override
  String get errorCodeStrategyRevConflict => 'This strategy changed while you were editing.';

  @override
  String get errorCodeTwoFactorRequired => 'Enter your two-factor code to continue.';

  @override
  String get errorCodeTypedConfirmationMismatch => 'The name doesn’t match exactly.';

  @override
  String get errorCodeUnauthenticated => 'Your session ended. Sign in again.';

  @override
  String get errorCodeUnavailable => 'Service is temporarily unavailable. Retrying…';

  @override
  String get errorCodeValidationFailed => 'Some values aren’t valid. Check the highlighted fields.';

  @override
  String get errorCodeVersionConflict => 'This changed elsewhere. Reload and try again.';

  @override
  String get errorCodeWalletRoleConflict => 'A sign-in wallet can’t also be your trading wallet.';

  @override
  String get errorCodeWebauthnInvalid => 'Passkey check failed. Try again.';

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
  String get feedActorIngest => 'Ingest';

  @override
  String get feedActorScreener => 'Screener';

  @override
  String get feedActorSystem => 'System';

  @override
  String get feedActorYou => 'You';

  @override
  String feedEventBlocked(String symbol) {
    return 'Blocked $symbol';
  }

  @override
  String feedEventBought(String amount_lamports, String symbol) {
    return 'Bought $symbol · $amount_lamports';
  }

  @override
  String feedEventExpired(String symbol) {
    return 'Proposal for $symbol expired';
  }

  @override
  String feedEventPassed(String pass, String score, String symbol) {
    return 'Passed $symbol · fit $score/$pass';
  }

  @override
  String feedEventSkipped(String symbol) {
    return 'Skipped pick $symbol';
  }

  @override
  String feedEventSold(String pnl, String symbol) {
    return 'Sold $symbol · $pnl';
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
  String notifApprovedTitle(String symbol) {
    return 'Approved: $symbol';
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
  String notifExpiredTitle(String mode, String symbol) {
    String _temp0 = intl.Intl.selectLogic(mode, {'real': 'REAL SOL', 'other': 'PRACTICE'});
    return '[$_temp0] $symbol expired';
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
  String notifFilledBody(String amount_lamports, String price) {
    return '$amount_lamports at $price · exit plan armed';
  }

  @override
  String notifFilledTitle(String mode, String symbol) {
    String _temp0 = intl.Intl.selectLogic(mode, {'real': 'REAL SOL', 'other': 'PRACTICE'});
    return '[$_temp0] Bought $symbol';
  }

  @override
  String notifFirstBuyBody(String amount_lamports, String mm_ss) {
    return 'This strategy hasn’t bought yet. Review before it starts · $amount_lamports · $mm_ss left';
  }

  @override
  String notifFirstBuyTitle(String mode, String strategy, String symbol) {
    String _temp0 = intl.Intl.selectLogic(mode, {'real': 'REAL SOL', 'other': 'PRACTICE'});
    return '[$_temp0] First buy for $strategy: $symbol';
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
  String notifPickPendingBody(String amount_lamports, String mm_ss, String strategy) {
    return '$strategy · $amount_lamports · $mm_ss left';
  }

  @override
  String notifPickPendingTitle(String mode, String symbol) {
    String _temp0 = intl.Intl.selectLogic(mode, {'real': 'REAL SOL', 'other': 'PRACTICE'});
    return '[$_temp0] $symbol awaits approval';
  }

  @override
  String notifPracticeResetBody(String amount_lamports) {
    return 'Balance back to $amount_lamports. Pending buys were cleared.';
  }

  @override
  String get notifPracticeResetTitle => '[PRACTICE] Practice reset';

  @override
  String notifSkippedBody(String reason) {
    return 'Reason: $reason';
  }

  @override
  String notifSkippedTitle(String symbol) {
    return 'Skipped: $symbol';
  }

  @override
  String notifSlHitBody(String pct, String pnl, String stop_type) {
    return '$stop_type · $pnl ($pct)';
  }

  @override
  String notifSlHitTitle(String mode, String symbol) {
    String _temp0 = intl.Intl.selectLogic(mode, {'real': 'REAL SOL', 'other': 'PRACTICE'});
    return '[$_temp0] Stopped out of $symbol';
  }

  @override
  String get notifTokenInvalidBody => 'Open the app to continue';

  @override
  String get notifTokenInvalidTitle => 'Notification action expired';

  @override
  String notifTpHitBody(String pct, String pct_sold, String pnl) {
    return 'Sold $pct_sold at +$pct · $pnl';
  }

  @override
  String notifTpHitTitle(String mode, String symbol) {
    String _temp0 = intl.Intl.selectLogic(mode, {'real': 'REAL SOL', 'other': 'PRACTICE'});
    return '[$_temp0] Took profit on $symbol';
  }

  @override
  String get orderFailReasonGuardFailed => 'A guard check failed right before the order';

  @override
  String get orderFailReasonInsufficientPracticeBalance => 'Not enough paper SOL';

  @override
  String get orderFailReasonModeNotAllowed => 'Only Practice orders run; Real SOL isn’t enabled yet';

  @override
  String get orderFailReasonPoolStale => 'Pool data was out of date; the order was not sent';

  @override
  String get orderFailReasonPositionAlreadyClosed => 'This position was already closed';

  @override
  String get orderFailReasonSlippageExceeded => 'Price moved more than your slippage limit';

  @override
  String get orderFailReasonUnknown => 'The order couldn’t be completed';

  @override
  String get orderFailReasonUnsupportedQuoteMint => 'This coin has no SOL pair, so it can’t be traded';

  @override
  String get orderFailReasonValidationFailed => 'The order didn’t pass validation';

  @override
  String positionsEmpty(String mode) {
    String _temp0 = intl.Intl.selectLogic(mode, {'real': 'No open positions', 'other': 'No paper positions'});
    return '$_temp0';
  }

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
  String get positionsSellConfirmTitle => 'Confirm sell';

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
  String get positionsSellNotTradeableDetail =>
      'This position no longer has a SOL pair, so selling is blocked until one exists.';

  @override
  String get positionsSellPlanCancelled => 'Exit plan cancelled (100%)';

  @override
  String positionsSellQuoteTtl(String seconds) {
    return 'Quote valid for $seconds s.';
  }

  @override
  String get positionsSellRemainingPlan => 'Remaining position keeps its exit plan';

  @override
  String positionsSellTitle(String symbol) {
    return 'Sell $symbol';
  }

  @override
  String get positionsSellUnavailable => 'Sell — not available';

  @override
  String get positionsTitle => 'Positions';

  @override
  String get positionsTitlePaper => 'Positions (paper)';

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
  String queueBatchExcludedNotTradeable(int count) {
    final intl.NumberFormat countNumberFormat = intl.NumberFormat.decimalPattern(localeName);
    final String countString = countNumberFormat.format(count);

    String _temp0 = intl.Intl.pluralLogic(
      count,
      locale: localeName,
      other: '$countString picks left out: not tradeable',
      one: '$countString pick left out: not tradeable',
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
  String queueBatchTotal(String amount_lamports) {
    return 'Total $amount_lamports';
  }

  @override
  String get queueEmpty => 'No pending picks';

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
  String queueRealHold(String amount_lamports) {
    return 'Hold to approve $amount_lamports';
  }

  @override
  String get queueSkipReasonAlreadyPumped => 'Already pumped';

  @override
  String get queueSkipReasonNotTradeable => 'Not tradeable';

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
  String get queueTitleShort => 'Queue';

  @override
  String get queueWhyFirstBuy => 'Approval mode is “Ask: first buy”. This is the strategy’s first buy.';

  @override
  String get queueWhyTitle => 'Why does this need approval?';

  @override
  String get screenerActionOpenQueue => 'Open queue';

  @override
  String screenerCardGuardFailed(String score) {
    return 'Guard failed · score $score';
  }

  @override
  String screenerCardNotTradeable(String score) {
    return 'Score $score · no SOL pair';
  }

  @override
  String screenerCardPassed(String score) {
    return 'Passed · score $score';
  }

  @override
  String get screenerColAction => 'Action';

  @override
  String get screenerColCoin => 'Coin';

  @override
  String get screenerColGuard => 'Guard';

  @override
  String get screenerColLiquidity => 'Liquidity';

  @override
  String get screenerColMcap => 'Mcap';

  @override
  String get screenerColScore => 'Score';

  @override
  String get screenerColStatus => 'Status';

  @override
  String get screenerColVenue => 'Venue';

  @override
  String get screenerDetailApproveUnavailable => 'Approve — not available';

  @override
  String get screenerDetailChartNote => 'Chart and metrics stay visible (read-only).';

  @override
  String get screenerDetailChartReadonly => 'Price chart (read-only)';

  @override
  String get screenerDetailGuard => 'Guard';

  @override
  String get screenerDetailGuardNotRun => 'not run';

  @override
  String get screenerDetailInfoOnly => '(info only)';

  @override
  String get screenerDetailNone => 'none';

  @override
  String screenerDetailQuoteNotSol(String quote_symbol) {
    return '$quote_symbol · not SOL';
  }

  @override
  String get screenerDetailQuotePair => 'Quote pair';

  @override
  String get screenerDetailReasonCode => 'Reason code';

  @override
  String get screenerDetailScore => 'Screener score';

  @override
  String screenerDetailScoreValue(String max_score, String score) {
    return '$score / $max_score';
  }

  @override
  String screenerDetailScoreValueInfo(String max_score, String score) {
    return '$score / $max_score (info only)';
  }

  @override
  String get screenerDetailSkipHint => 'You can still skip it. Skipping isn’t a trade.';

  @override
  String get screenerDetailSolPair => 'SOL pair';

  @override
  String get screenerEmpty => 'No screened coins yet';

  @override
  String get screenerFilterAll => 'All';

  @override
  String get screenerFilterPassed => 'Passed';

  @override
  String get screenerFilterRejected => 'Rejected';

  @override
  String get screenerLegend =>
      'Red marks risk (guard fail, rug, loss). Grey “Not tradeable” coins have no SOL pair: they can’t be approved, but you can skip them.';

  @override
  String get screenerNotTradeableBadge => 'Not tradeable';

  @override
  String get screenerNotTradeableDetail =>
      'No SOL quote pair for this coin. Sentra only trades SOL pairs, so it can’t be approved.';

  @override
  String get screenerStatusPassed => 'Passed';

  @override
  String get screenerStatusPendingGuard => 'Awaiting guard';

  @override
  String get screenerStatusPickQueued => 'Pick · in queue';

  @override
  String get screenerStatusPickQueuedShort => 'Pick · queue';

  @override
  String get screenerStatusRejected => 'Rejected';

  @override
  String get screenerStatusRejectedGuard => 'Rejected · guard failed';

  @override
  String screenerStatusRejectedScore(String score_threshold) {
    return 'Rejected · score < $score_threshold';
  }

  @override
  String get screenerTitle => 'Coins · screener';

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
