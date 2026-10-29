// ignore: unused_import
import 'package:intl/intl.dart' as intl;
import 'app_localizations.dart';

// ignore_for_file: type=lint

/// The translations for English (`en`).
class AppLocalizationsEn extends AppLocalizations {
  AppLocalizationsEn([String locale = 'en']) : super(locale);

  @override
  String get builderApprovalModeRealNote =>
      'Real SOL: “Off” is not available in the MVP.';

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
    String _temp0 = intl.Intl.pluralLogic(
      count,
      locale: localeName,
      other: '# settings loosened',
      one: '# setting loosened',
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
    String _temp0 = intl.Intl.pluralLogic(
      count,
      locale: localeName,
      other: '# hours',
      one: '# hour',
    );
    return '$_temp0';
  }

  @override
  String commonDurationMinutes(int count) {
    String _temp0 = intl.Intl.pluralLogic(
      count,
      locale: localeName,
      other: '# min',
      one: '# min',
    );
    return '$_temp0';
  }

  @override
  String commonDurationSeconds(int count) {
    String _temp0 = intl.Intl.pluralLogic(
      count,
      locale: localeName,
      other: '# s',
      one: '# s',
    );
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
  String commonTimerLeft(String time) {
    return '$time left';
  }

  @override
  String get conflictActionDiscard => 'Discard my edits';

  @override
  String get conflictActionMerge => 'Reload & keep my edits';

  @override
  String get conflictActionReview => 'Review changes';

  @override
  String conflictBannerBody(
      String actor, String base, String theirs, String time) {
    return '$actor saved rev $theirs at $time. Your edits are based on rev $base and have not been saved.';
  }

  @override
  String conflictBannerConflicts(int count) {
    String _temp0 = intl.Intl.pluralLogic(
      count,
      locale: localeName,
      other: '# fields changed on both sides.',
      one: '# field changed on both sides.',
      zero: 'No overlapping fields — your edits can be merged.',
    );
    return '$_temp0';
  }

  @override
  String get conflictBannerTitle =>
      'This strategy changed while you were editing';

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
    String _temp0 = intl.Intl.selectLogic(
      side,
      {
        'mine': 'mine',
        'theirs': 'saved',
        'other': 'base',
      },
    );
    return 'Keep $_temp0';
  }

  @override
  String conflictDiscardConfirm(int count) {
    String _temp0 = intl.Intl.pluralLogic(
      count,
      locale: localeName,
      other: '# edits',
      one: '# edit',
    );
    return 'Discard $_temp0? This can’t be undone.';
  }

  @override
  String get conflictRealGuardReconfirm =>
      'A guard change on a Real SOL strategy must be confirmed again after merging.';

  @override
  String conflictStateMerged(String rev) {
    return 'Merged onto rev $rev. Review, then publish.';
  }

  @override
  String get conflictStateOffline =>
      'Can’t check for newer versions while offline. Your draft is kept locally.';

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
    String _temp0 = intl.Intl.pluralLogic(
      count,
      locale: localeName,
      other: '# expire in under 2 min',
      one: '# expires in under 2 min',
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
  String get guardWeakenAfterAudit =>
      'Recorded in the audit log (who, when, device, diff)';

  @override
  String get guardWeakenAfterAutoRevert =>
      'Mandatory auto-revert after 24 hours unless you confirm again';

  @override
  String get guardWeakenAfterCooldown =>
      'Mandatory 10-minute cooldown before it applies (can be cancelled)';

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
    String _temp0 = intl.Intl.selectLogic(
      level,
      {
        'low': 'Low',
        'medium': 'Medium',
        'high': 'High',
        'other': 'Critical',
      },
    );
    return 'Risk level: $_temp0';
  }

  @override
  String get guardWeakenRiskTitle =>
      'Risk impact (7-day replay on our paper data)';

  @override
  String get guardWeakenTitlePractice => 'You’re about to loosen a guard';

  @override
  String get guardWeakenTitleReal =>
      'You’re about to LOOSEN a guard on a Real SOL strategy';

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
    String _temp0 = intl.Intl.pluralLogic(
      remaining,
      locale: localeName,
      other: 'Wrong code. # attempts left.',
      one: 'Wrong code. # attempt left.',
    );
    return '$_temp0';
  }

  @override
  String get loginPracticeDefault =>
      'New accounts always start in PRACTICE mode.';

  @override
  String get loginSubtitle =>
      'One account, many sign-in methods. You can link more later.';

  @override
  String get loginTelegramExpired => 'This link expired. Request a new one.';

  @override
  String get loginTelegramReopen => 'Open Telegram again';

  @override
  String get loginTelegramTitle => 'Continue in Telegram';

  @override
  String get loginTelegramWaiting => 'Waiting for confirmation…';

  @override
  String get loginTerms =>
      'By continuing you agree to the Terms and Privacy Policy.';

  @override
  String get loginTitle => 'Sign in or create an account';

  @override
  String get loginWalletRejected =>
      'Signature was declined. Nothing was signed.';

  @override
  String get loginWalletSignNote =>
      'You’ll sign a message, not a transaction. No fee.';

  @override
  String get loginWalletSignTitle => 'Sign to sign in';

  @override
  String get modePracticeBanner => 'Practice · paper SOL, no real SOL moves';

  @override
  String get modePracticeBannerShort => 'Practice · paper SOL';

  @override
  String get modePracticeLabel => 'PRACTICE';

  @override
  String get modeRealBanner =>
      'Real SOL · wallet connected, orders use real SOL';

  @override
  String get modeRealBannerShort => 'Real SOL · real money';

  @override
  String get modeRealLabel => 'REAL SOL';

  @override
  String get modeSwitchToRealHold => 'Hold to switch to Real SOL';

  @override
  String get modeSwitchToRealRequirements =>
      'Requires a connected trading wallet and 2FA.';

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
  String get notifActionOpenPick => 'Open pick';

  @override
  String get notifActionSkip => 'Skip';

  @override
  String get notifApprovedBody => 'Order is being placed';

  @override
  String notifApprovedTitle(String coin) {
    return 'Approved: $coin';
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
    return '[$_temp0] $coin expired';
  }

  @override
  String notifFailedBody(String mode, String reason) {
    String _temp0 = intl.Intl.selectLogic(
      mode,
      {
        'real': 'Network fees may apply.',
        'other': 'No SOL was spent.',
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
    return '[$_temp0] Buy $coin failed';
  }

  @override
  String notifFilledBody(String price, String sol) {
    return '$sol at $price · exit plan armed';
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
    return '[$_temp0] Bought $coin';
  }

  @override
  String notifFirstBuyBody(String sol) {
    return 'This strategy hasn’t bought yet. Review before it starts · $sol';
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
    return '[$_temp0] First buy for $strategy: $coin';
  }

  @override
  String get notifGroupedBody => 'Open the queue to review';

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
      other: '# picks await approval',
      one: '# pick awaits approval',
    );
    return '[$_temp0] $_temp1';
  }

  @override
  String notifGuardActiveBody(String time) {
    return 'Auto-reverts $time';
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
    return '[$_temp0] $strategy guard is now looser';
  }

  @override
  String notifGuardCooldownBody(String strategy, String time) {
    return '$strategy: effective $time. Cancel if this wasn’t you.';
  }

  @override
  String get notifGuardCooldownTitle => '[REAL SOL] Guard loosens in 10 min';

  @override
  String notifGuardRequestedBody(
      String from, String setting, String strategy, String to) {
    return '$strategy: $setting $from → $to loosens a guard';
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
    String _temp0 = intl.Intl.selectLogic(
      mode,
      {
        'real': 'REAL SOL',
        'other': 'PRACTICE',
      },
    );
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
  String notifPickPendingBody(String sol, String strategy, String time) {
    return '$strategy · $sol · $time left';
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
    return '[$_temp0] $coin awaits approval';
  }

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
    String _temp0 = intl.Intl.selectLogic(
      mode,
      {
        'real': 'REAL SOL',
        'other': 'PRACTICE',
      },
    );
    return '[$_temp0] Stopped out of $coin';
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
  String notifTpHitTitle(String coin, String mode) {
    String _temp0 = intl.Intl.selectLogic(
      mode,
      {
        'real': 'REAL SOL',
        'other': 'PRACTICE',
      },
    );
    return '[$_temp0] Took profit on $coin';
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
    String _temp0 = intl.Intl.pluralLogic(
      count,
      locale: localeName,
      other: '# open',
      one: '# open',
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
  String get positionsSellNeverFromNotification =>
      'Selling is never available from a notification or popup.';

  @override
  String get positionsSellPlanCancelled => 'Exit plan cancelled (100%)';

  @override
  String get positionsSellRemainingPlan =>
      'Remaining position keeps its exit plan';

  @override
  String positionsSellTitle(String coin) {
    return 'Sell $coin';
  }

  @override
  String get positionsTitle => 'Positions';

  @override
  String queueBatchApprove(int count) {
    String _temp0 = intl.Intl.pluralLogic(
      count,
      locale: localeName,
      other: 'Approve # picks',
      one: 'Approve # pick',
    );
    return '$_temp0';
  }

  @override
  String queueBatchSelected(int count) {
    String _temp0 = intl.Intl.pluralLogic(
      count,
      locale: localeName,
      other: '# selected',
      one: '# selected',
    );
    return '$_temp0';
  }

  @override
  String queueBatchTotal(String sol) {
    return 'Total $sol';
  }

  @override
  String queueExpiredReasonGuardFailed(String reason) {
    return 'Guard failed while waiting: $reason';
  }

  @override
  String queueExpiredReasonPriceRan(String pct) {
    return 'Price ran $pct past the entry limit';
  }

  @override
  String get queueExpiredReasonStrategyArchived => 'Strategy was archived';

  @override
  String get queueExpiredReasonStrategyDeleted => 'Strategy was deleted';

  @override
  String get queueExpiredReasonTimedOut => 'Approval window ended';

  @override
  String get queueGuardReject => 'Reject change';

  @override
  String get queuePickApprove => 'Approve';

  @override
  String get queuePickCannotApprove => 'Can’t be approved';

  @override
  String queuePickExpiresIn(String time) {
    return 'Expires in $time';
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
    String _temp0 = intl.Intl.pluralLogic(
      count,
      locale: localeName,
      other: 'Approve # buys with REAL SOL?',
      one: 'Approve # buy with REAL SOL?',
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
  String get queueSwipeDisabledReal =>
      'Swipe is off in Real SOL. Use the buttons.';

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
  String get queueWhyFirstBuy =>
      'Approval mode is “Ask: first buy”. This is the strategy’s first buy.';

  @override
  String get queueWhyTitle => 'Why does this need approval?';

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
  String get settingsLanguageLabel => 'Language';

  @override
  String settingsLanguageNumberFormat(String example) {
    return 'Numbers follow the language: $example';
  }

  @override
  String get settingsLoginLastMethodLock =>
      'This is your only sign-in method. Link another before unlinking.';

  @override
  String get settingsLoginLink => 'Link';

  @override
  String get settingsLoginLinked => 'Linked';

  @override
  String get settingsLoginReauth => 'Confirm it’s you to continue';

  @override
  String get settingsLoginUnlink => 'Unlink';

  @override
  String get settingsLoginWalletNote =>
      'Sign-in wallet only proves identity. It can’t trade.';

  @override
  String get settingsModeDefaultApproval => 'Default approval mode';

  @override
  String get settingsModeDefaultNewStrategy => 'New strategies start in';

  @override
  String get settingsNotifDesktopPopup => 'Desktop always-on-top popup';

  @override
  String get settingsNotifEmail => 'Email';

  @override
  String get settingsNotifPracticeActions =>
      'Allow Approve from notifications (Practice only)';

  @override
  String get settingsNotifPush => 'Push notifications';

  @override
  String get settingsSectionAppearance => 'Appearance';

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
