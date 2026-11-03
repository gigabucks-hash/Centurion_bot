// ignore: unused_import
import 'package:intl/intl.dart' as intl;
import 'app_localizations.dart';

// ignore_for_file: type=lint

/// The translations for English (`en`).
class AppLocalizationsEn extends AppLocalizations {
  AppLocalizationsEn([String locale = 'en']) : super(locale);

  @override
  String alertApproveBefore(String mm_ss, String symbol) {
    return 'Approve $symbol before $mm_ss';
  }

  @override
  String alertGuardRejected(String symbol) {
    return 'Review $symbol: Guard rejected the buy';
  }

  @override
  String alertTpHit(String n, String pct, String symbol) {
    return 'Check $symbol: TP$n hit, $pct% sold';
  }

  @override
  String get appAboutTitle => 'About Centurion Trade';

  @override
  String appAboutVersion(String build, String version) {
    return 'Version $version ($build)';
  }

  @override
  String get appName => 'Centurion Trade';

  @override
  String get appSplashLoading => 'Starting Centurion Trade…';

  @override
  String get appTitle => 'Centurion Trade · Solana trading bot';

  @override
  String get authSiwsStatement => 'Sign in to Centurion Trade';

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
  String get builderExitStall => 'Stall exit';

  @override
  String builderExitStallHint(String min_move_pct, String window) {
    return 'Sell all if the price moves less than $min_move_pct in $window';
  }

  @override
  String get builderExitTimeStop => 'Time stop';

  @override
  String builderExitTimeStopHint(String duration) {
    return 'Sell all after holding for $duration';
  }

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
  String get closePreviewExpectedOut => 'Expected SOL out';

  @override
  String get closePreviewExpired => 'Preview expired — refresh to continue';

  @override
  String get closePreviewMinReceived => 'Min. received';

  @override
  String get closePreviewRefresh => 'Refresh preview';

  @override
  String get closePreviewRefreshing => 'Refreshing preview…';

  @override
  String get closePreviewSwapFeeFromOutput => 'taken from proceeds';

  @override
  String get closePreviewUnavailable => 'Preview isn’t available yet, so Real sells stay off.';

  @override
  String closePreviewValid(int seconds) {
    final intl.NumberFormat secondsNumberFormat = intl.NumberFormat.decimalPattern(localeName);
    final String secondsString = secondsNumberFormat.format(seconds);

    String _temp0 = intl.Intl.pluralLogic(
      seconds,
      locale: localeName,
      other: 'Preview valid for $secondsString s',
      one: 'Preview valid for $secondsString s',
    );
    return '$_temp0';
  }

  @override
  String get closePreviewYouSell => 'You sell';

  @override
  String get coinMcapSourceCurve => '(curve)';

  @override
  String get coinMcapSourcePool => '(pool)';

  @override
  String get coinMcapSourceUnavailable => 'Source unavailable';

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
  String get commonRange1d => '1D';

  @override
  String get commonRange30d => '30D';

  @override
  String get commonRange7d => '7D';

  @override
  String get commonRangeAll => 'All';

  @override
  String get commonStateLoading => 'Loading…';

  @override
  String commonStateLoadingSection(String section) {
    return 'Loading $section…';
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
  String get commonValueUnavailable => 'Data not available yet';

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
  String get dashboardBalanceRealLabel => 'Real balance · trading wallet';

  @override
  String get dashboardBalanceToday => 'today';

  @override
  String get dashboardEyebrow => 'Command deck';

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
  String get dashboardHeadline => 'All your positions at a glance.';

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
  String dashboardNeedsActionCount(int count) {
    final intl.NumberFormat countNumberFormat = intl.NumberFormat.decimalPattern(localeName);
    final String countString = countNumberFormat.format(count);

    String _temp0 = intl.Intl.pluralLogic(
      count,
      locale: localeName,
      other: '$countString new',
      one: '$countString new',
    );
    return '$_temp0';
  }

  @override
  String get dashboardNeedsActionTitle => 'Needs action';

  @override
  String get dashboardStatDailyLimitReal => 'Real daily limit';

  @override
  String get dashboardStatOpenPositions => 'Open positions';

  @override
  String get dashboardStatPaperStrategies => 'Paper strategies';

  @override
  String get dashboardStatRealizedToday => 'Realized PnL · today';

  @override
  String get dashboardStatWinRate7d => 'Win rate · 7 days';

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
    return 'Paper strategies · start $start · live updates';
  }

  @override
  String get dashboardTitle => 'Team overview';

  @override
  String get errorCodeAccountDeletionBlocked => 'Close your Real SOL positions and withdraw your trading wallet first.';

  @override
  String get errorCodeAccountDeletionPending => 'Account deletion is already scheduled.';

  @override
  String get errorCodeAgentBudgetExceeded => 'The agent hit its call limit. Try again later.';

  @override
  String get errorCodeAgentRequestExpired => 'This agent connection request expired. Start again from the agent.';

  @override
  String get errorCodeAgentTradeDisabled => 'Agent trading is off. Turn it on in the Centurion Trade app.';

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
  String get errorCodeBuysPaused => 'New buys are stopped. Resume buying first.';

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
  String get errorCodeGuardWeakenRequiresApproval =>
      'Change waiting for approval. It loosens a guard, so nothing applies until you approve it.';

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
  String get errorCodeLogoNotFound => 'No logo for this coin. The symbol initials are shown instead.';

  @override
  String get errorCodeLogoRejected => 'This coin\'s logo was rejected. The symbol initials are shown instead.';

  @override
  String get errorCodeLoosenRequiresApp => 'Open the Centurion Trade app to loosen limits or guards.';

  @override
  String get errorCodeModeNotAllowed => 'This strategy is not approved for Real mode';

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
      'Paper cash is too low for the next entry. Entries pause until cash recovers or you reset Paper.';

  @override
  String get errorCodeQuoteMissingOrStale => 'Quote expired — refresh it and check the values again before approving.';

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
    return 'Paper can be reset once a day. Next: $next_allowed_at';
  }

  @override
  String get errorCodeResumeRequiresApp => 'Buying was paused in the app. Resume it in the Centurion Trade app.';

  @override
  String get errorCodeSettingsSchemaInvalid => 'These strategy settings aren’t valid. Check the highlighted fields.';

  @override
  String get errorCodeSiwsNonceInvalid => 'This sign-in request expired. Try again.';

  @override
  String get errorCodeSiwsSessionRequired => 'Sign in with your wallet in the Centurion Trade app.';

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
  String get exitReasonPracticeReset => 'Paper reset';

  @override
  String get exitReasonProfitTarget => 'Take profit';

  @override
  String get exitReasonRugDetected => 'Rug detected';

  @override
  String get exitReasonSellFloor => 'Sell floor';

  @override
  String get exitReasonSellPressure => 'Sell pressure';

  @override
  String get exitReasonStall => 'Stall exit';

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
  String get expireReasonKillSwitchBadge => 'Real stopped';

  @override
  String get expireReasonKillSwitchDetail => 'Real trading was stopped';

  @override
  String get expireReasonPracticeResetBadge => 'Paper reset';

  @override
  String get expireReasonPracticeResetDetail => 'Paper was reset; pending buys were cleared';

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
  String get guardChangeStatusExpired => 'Expired before approval';

  @override
  String get guardChangeStatusRejected => 'Rejected';

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
  String guardWeakenPendingBody(String expires_at) {
    return 'This change loosens a guard, so nothing applies until you approve it. Approve before $expires_at or it expires.';
  }

  @override
  String get guardWeakenPendingOpen => 'Review in queue';

  @override
  String get guardWeakenPendingTitle => 'Change waiting for approval';

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
  String get killSwitchActionEngage => 'Stop buying';

  @override
  String get killSwitchActionResume => 'Resume buying';

  @override
  String get killSwitchDialogEffectExitsKeep => 'Exit plans, TP and SL keep running.';

  @override
  String get killSwitchDialogEffectInflight => 'Orders already sent can’t be recalled.';

  @override
  String get killSwitchDialogEffectProposals => 'Pending Real proposals expire.';

  @override
  String get killSwitchDialogEffectUnsigned => 'Unsigned orders are cancelled.';

  @override
  String get killSwitchDialogTitle => 'Stop new Real buys?';

  @override
  String get killSwitchOffline => 'Can’t reach the server. Stop isn’t confirmed yet. Retrying…';

  @override
  String get killSwitchOptionExitsRun => 'Exit plan keeps running (recommended)';

  @override
  String killSwitchOptionSellAll(int count) {
    final intl.NumberFormat countNumberFormat = intl.NumberFormat.decimalPattern(localeName);
    final String countString = countNumberFormat.format(count);

    String _temp0 = intl.Intl.pluralLogic(
      count,
      locale: localeName,
      other: 'Also sell $countString positions now',
      one: 'Also sell $countString position now',
    );
    return '$_temp0';
  }

  @override
  String get killSwitchReasonLossVelocity => 'losses grew too fast';

  @override
  String get killSwitchReasonOther => 'a safety rule triggered';

  @override
  String get killSwitchReasonPolicyMismatch => 'wallet rules don’t match';

  @override
  String get killSwitchReasonProviderError => 'a provider or signer problem · only exits run';

  @override
  String get killSwitchScopeGlobal => 'All Real trading';

  @override
  String get killSwitchScopeStrategy => 'One strategy';

  @override
  String get killSwitchScopeWorkspace => 'This workspace';

  @override
  String get killSwitchSellAllBody =>
      'Sells at market now. Safety checks still apply: simulation and your slippage cap.';

  @override
  String killSwitchSellAllFailureRow(String reason_code, String symbol) {
    return '$symbol: $reason_code. Still open; exit plan keeps running.';
  }

  @override
  String get killSwitchSellAllHold => 'Hold 2.5 s to sell all';

  @override
  String killSwitchSellAllInProgress(int requested_count) {
    final intl.NumberFormat requested_countNumberFormat = intl.NumberFormat.decimalPattern(localeName);
    final String requested_countString = requested_countNumberFormat.format(requested_count);

    String _temp0 = intl.Intl.pluralLogic(
      requested_count,
      locale: localeName,
      other: 'Selling $requested_countString positions…',
      one: 'Selling $requested_countString position…',
    );
    return '$_temp0';
  }

  @override
  String killSwitchSellAllRateLimited(int retry_after_s) {
    final intl.NumberFormat retry_after_sNumberFormat = intl.NumberFormat.decimalPattern(localeName);
    final String retry_after_sString = retry_after_sNumberFormat.format(retry_after_s);

    String _temp0 = intl.Intl.pluralLogic(
      retry_after_s,
      locale: localeName,
      other: '$retry_after_sString seconds',
      one: '$retry_after_sString second',
    );
    return 'Sell all was just requested. Try again in $_temp0.';
  }

  @override
  String killSwitchSellAllRetryTitle(String symbol) {
    return 'Retry selling $symbol';
  }

  @override
  String killSwitchSellAllTitle(int count) {
    final intl.NumberFormat countNumberFormat = intl.NumberFormat.decimalPattern(localeName);
    final String countString = countNumberFormat.format(count);

    String _temp0 = intl.Intl.pluralLogic(
      count,
      locale: localeName,
      other: 'Sell $countString Real positions now?',
      one: 'Sell $countString Real position now?',
    );
    return '$_temp0';
  }

  @override
  String killSwitchStatusAuthority(String state) {
    String _temp0 = intl.Intl.selectLogic(state, {
      'revoked': 'Bot authority revoked',
      'other': 'Bot authority still active',
    });
    return '$_temp0';
  }

  @override
  String killSwitchStatusBy(String actor_type, String at, String device_label) {
    String _temp0 = intl.Intl.selectLogic(actor_type, {
      'user': 'by you on $device_label',
      'rule': 'automatically',
      'other': 'by the system',
    });
    return 'Stopped $_temp0 at $at';
  }

  @override
  String get killSwitchStatusExits => 'Exit plans keep running';

  @override
  String get killSwitchStatusResumeHint => 'Bot authority stays active. No cooldown: resume any time with one click.';

  @override
  String get killSwitchStatusResumeWhenReady => 'Resume Real buying when ready';

  @override
  String get killSwitchStatusTitle => 'New buys stopped';

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
  String get loginPracticeDefault => 'New strategies always start in Paper.';

  @override
  String get loginSubtitle => 'One account, many sign-in methods. You can link more later.';

  @override
  String get loginTelegramCancelled => 'Telegram login was cancelled. Nothing changed.';

  @override
  String get loginTelegramConsent => 'Telegram shares your name, username and photo with Centurion Trade.';

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
  String mcapAsOf(String time) {
    return 'As of $time';
  }

  @override
  String get mcapLabel => 'Market cap';

  @override
  String mcapSolValue(String amount) {
    return '≈ $amount';
  }

  @override
  String get mcapUsdIndicative => 'USD is indicative (reference SOL price), not live.';

  @override
  String get modePracticeBanner => 'Paper · paper SOL, no real SOL moves';

  @override
  String get modePracticeBannerShort => 'Paper · paper SOL';

  @override
  String get modePracticeLabel => 'PAPER';

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
  String get modeSwitchToastPractice => 'Strategy back to Paper';

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
    return 'View $symbol: approved';
  }

  @override
  String get notifDeletionCancelledBody => 'Your account stays active.';

  @override
  String get notifDeletionCancelledTitle => 'Check account: deletion cancelled';

  @override
  String notifDeletionScheduledBody(String scheduled_for) {
    return 'Your account will be deleted on $scheduled_for. Cancel in Settings if this wasn’t you.';
  }

  @override
  String get notifDeletionScheduledTitle => 'Check account: deletion scheduled';

  @override
  String notifExpiredBody(String reason) {
    return '$reason';
  }

  @override
  String notifExpiredTitle(String mode, String symbol) {
    String _temp0 = intl.Intl.selectLogic(mode, {'real': 'REAL', 'other': 'PAPER'});
    return '[$_temp0] Re-check $symbol: approval expired';
  }

  @override
  String notifFailedBody(String amount_lamports, String mode, String reason_code) {
    String _temp0 = intl.Intl.selectLogic(mode, {'real': 'Network fees may apply.', 'other': 'No SOL was spent.'});
    return '$reason_code · $amount_lamports. $_temp0';
  }

  @override
  String notifFailedTitle(String mode, String side, String symbol) {
    String _temp0 = intl.Intl.selectLogic(mode, {'real': 'REAL', 'other': 'PAPER'});
    String _temp1 = intl.Intl.selectLogic(side, {'sell': 'sell', 'other': 'buy'});
    return '[$_temp0] Check $symbol: $_temp1 failed';
  }

  @override
  String notifFilledBody(String amount_lamports, String price) {
    return '$amount_lamports at $price · exit plan armed';
  }

  @override
  String notifFilledTitle(String mode, String symbol) {
    String _temp0 = intl.Intl.selectLogic(mode, {'real': 'REAL', 'other': 'PAPER'});
    return '[$_temp0] View $symbol: bought';
  }

  @override
  String notifFirstBuyBody(String amount_lamports, String mm_ss) {
    return 'This strategy hasn’t bought yet. Review before it starts · $amount_lamports · $mm_ss left';
  }

  @override
  String notifFirstBuyTitle(String mode, String strategy, String symbol) {
    String _temp0 = intl.Intl.selectLogic(mode, {'real': 'REAL', 'other': 'PAPER'});
    return '[$_temp0] Review first buy for $strategy: $symbol';
  }

  @override
  String get notifGroupedBody => 'Open the queue to review';

  @override
  String notifGroupedTitle(int count, String mode) {
    final intl.NumberFormat countNumberFormat = intl.NumberFormat.decimalPattern(localeName);
    final String countString = countNumberFormat.format(count);

    String _temp0 = intl.Intl.selectLogic(mode, {'other': 'PAPER', 'real': 'REAL'});
    String _temp1 = intl.Intl.pluralLogic(
      count,
      locale: localeName,
      other: '$countString picks',
      one: '$countString pick',
    );
    return '[$_temp0] Review $_temp1 awaiting approval';
  }

  @override
  String notifGuardActiveBody(String auto_revert_at) {
    return 'Auto-reverts $auto_revert_at';
  }

  @override
  String notifGuardActiveTitle(String mode, String strategy) {
    String _temp0 = intl.Intl.selectLogic(mode, {'real': 'REAL', 'other': 'PAPER'});
    return '[$_temp0] Review $strategy: guard is now looser';
  }

  @override
  String notifGuardCancelledBody(String strategy) {
    return '$strategy was edited elsewhere. Request the change again.';
  }

  @override
  String notifGuardCancelledTitle(String mode) {
    String _temp0 = intl.Intl.selectLogic(mode, {'real': 'REAL', 'other': 'PAPER'});
    return '[$_temp0] Check guard: change cancelled';
  }

  @override
  String notifGuardCooldownBody(String cooldown_until, String strategy) {
    return '$strategy: effective $cooldown_until. Cancel if this wasn’t you.';
  }

  @override
  String get notifGuardCooldownTitle => '[REAL] Cancel within 10 min to keep the guard';

  @override
  String notifGuardRequestedBody(String from, String setting, String strategy, String to) {
    return '$strategy: $setting $from → $to loosens a guard';
  }

  @override
  String notifGuardRequestedTitle(String mode) {
    String _temp0 = intl.Intl.selectLogic(mode, {'real': 'REAL', 'other': 'PAPER'});
    return '[$_temp0] Confirm the pending guard change';
  }

  @override
  String notifGuardRevertedBody(String from, String setting) {
    return '$setting back to $from';
  }

  @override
  String notifGuardRevertedTitle(String strategy) {
    return '[REAL] Check $strategy: guard restored';
  }

  @override
  String notifLossStopBody(String pct) {
    return 'Down $pct from peak. Re-arm needs approval.';
  }

  @override
  String notifLossStopTitle(String mode, String strategy) {
    String _temp0 = intl.Intl.selectLogic(mode, {'real': 'REAL', 'other': 'PAPER'});
    return '[$_temp0] Review $strategy: paused by loss stop';
  }

  @override
  String get notifModePracticeBody => 'This strategy’s orders use paper SOL';

  @override
  String get notifModePracticeTitle => 'Check strategy mode: back to PAPER';

  @override
  String get notifModeRealBody => 'Next orders of this strategy use real SOL';

  @override
  String get notifModeRealTitle => 'Check strategy mode: now in REAL';

  @override
  String get notifOfflineBody => 'Data may be delayed. Retrying…';

  @override
  String get notifOfflineTitle => 'Reconnect: lost connection to server';

  @override
  String notifPickPendingBody(String amount_lamports, String mm_ss, String strategy) {
    return '$strategy · $amount_lamports · $mm_ss left';
  }

  @override
  String notifPickPendingTitle(String mode, String symbol) {
    String _temp0 = intl.Intl.selectLogic(mode, {'real': 'REAL', 'other': 'PAPER'});
    return '[$_temp0] Review $symbol: awaiting approval';
  }

  @override
  String notifPracticeResetBody(String amount_lamports) {
    return 'Balance back to $amount_lamports. Pending buys were cleared.';
  }

  @override
  String get notifPracticeResetTitle => '[PAPER] Check balance: Paper reset';

  @override
  String notifRealBuysPausedBody(String actor_type, String device_label) {
    String _temp0 = intl.Intl.selectLogic(actor_type, {'user': 'by you on $device_label', 'other': 'by the system'});
    return 'Open positions keep their exit plan · $_temp0';
  }

  @override
  String get notifRealBuysPausedTitle => '[REAL] Resume buying when ready: new buys stopped';

  @override
  String notifRealBuysResumedBody(String actor_type, String device_label) {
    String _temp0 = intl.Intl.selectLogic(actor_type, {'user': 'by you on $device_label', 'other': 'by the system'});
    return 'New buys run again now · $_temp0';
  }

  @override
  String get notifRealBuysResumedTitle => '[REAL] Check buys: new buys resumed';

  @override
  String notifRealDepositDetectedBody(String amount_lamports, String balance_lamports) {
    return '+$amount_lamports · balance $balance_lamports';
  }

  @override
  String get notifRealDepositDetectedTitle => '[REAL] View deposit: received';

  @override
  String notifRealKillSwitchClearedBody(String signer_state) {
    String _temp0 = intl.Intl.selectLogic(signer_state, {
      'revoked': 'Trading authority is still revoked · grant it again to continue',
      'other': 'New Real buys run again now',
    });
    return '$_temp0';
  }

  @override
  String get notifRealKillSwitchClearedTitle => '[REAL] Check Real: automatic stop cleared';

  @override
  String notifRealKillSwitchTrippedBody(String reason) {
    String _temp0 = intl.Intl.selectLogic(reason, {
      'policy_mismatch': 'Stopped automatically: wallet rules don’t match. New buys are blocked.',
      'loss_velocity': 'Stopped automatically: losses grew too fast. New buys are blocked.',
      'provider_error': 'Stopped automatically: provider/signer problem · only exits run.',
      'other': 'Stopped automatically: a safety rule triggered. New buys are blocked.',
    });
    return '$_temp0';
  }

  @override
  String get notifRealKillSwitchTrippedTitle => '[REAL] Review Real: trading stopped automatically';

  @override
  String notifRealLimitChangedBody(String from, String setting, String to) {
    return '$setting: $from → $to';
  }

  @override
  String get notifRealLimitChangedTitle => '[REAL] Check limits: updated';

  @override
  String notifRealLimitLoosenRequestedBody(String activates_at, String from, String setting, String to) {
    return '$setting: $from → $to from $activates_at, and it stays until you change it. Cancel if this wasn’t you.';
  }

  @override
  String get notifRealLimitLoosenRequestedTitle => '[REAL] Review limit change: pending';

  @override
  String get notifRealPolicyActivatedBody => 'Matches what you approved.';

  @override
  String notifRealPolicyActivatedTitle(String version) {
    return '[REAL] Check wallet rules: v$version active';
  }

  @override
  String notifRealPolicyMismatchBody(String version) {
    return 'Real trading stopped for safety. Open the app to compare v$version.';
  }

  @override
  String get notifRealPolicyMismatchTitle => '[REAL] Compare wallet rules: they don’t match';

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
      other: '$sold_countString of $requested_countString sold',
      one: '$sold_countString of $requested_countString sold',
    );
    String _temp1 = intl.Intl.pluralLogic(
      failed_count,
      locale: localeName,
      zero: '',
      other: ' · $failed_countString failed: still open, their exit plans keep running',
      one: ' · $failed_countString failed: still open, its exit plan keeps running',
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
      zero: 'View sell all: done',
      other: 'Retry sell all: $failed_countString failed',
    );
    return '[REAL] $_temp0';
  }

  @override
  String notifRealSellAllCompletedTotal(String amount_out_lamports) {
    return 'Total out: $amount_out_lamports';
  }

  @override
  String notifRealSellAllRequestedBody(int requested_count) {
    final intl.NumberFormat requested_countNumberFormat = intl.NumberFormat.decimalPattern(localeName);
    final String requested_countString = requested_countNumberFormat.format(requested_count);

    String _temp0 = intl.Intl.pluralLogic(
      requested_count,
      locale: localeName,
      other: 'Selling $requested_countString positions at market.',
      one: 'Selling $requested_countString position at market.',
    );
    return '$_temp0 Guards still apply.';
  }

  @override
  String get notifRealSellAllRequestedTitle => '[REAL] Track sell all: selling all positions';

  @override
  String notifRealSignerGrantedBody(String expires_at) {
    return 'The bot can swap within your limits until $expires_at. It can’t transfer or withdraw.';
  }

  @override
  String get notifRealSignerGrantedTitle => '[REAL] Check trading authority: granted';

  @override
  String notifRealSignerRevokedBody(String reason) {
    String _temp0 = intl.Intl.selectLogic(reason, {
      'user': 'You revoked it.',
      'expiry': 'The authority expired.',
      'other': 'Revoked.',
    });
    return '$_temp0 Real trading can’t sign until you authorize it again.';
  }

  @override
  String get notifRealSignerRevokedTitle => '[REAL] Grant authority again: bot authority revoked';

  @override
  String notifRealWithdrawConfirmedBody(String address_short, String amount_lamports) {
    return '$amount_lamports arrived in your main wallet $address_short.';
  }

  @override
  String get notifRealWithdrawConfirmedTitle => '[REAL] View withdrawal: received';

  @override
  String notifRealWithdrawFailedBody(String amount_lamports, String reason_code) {
    return '$amount_lamports wasn’t sent: $reason_code. Your balance is unchanged.';
  }

  @override
  String get notifRealWithdrawFailedTitle => '[REAL] Check withdrawal: failed';

  @override
  String notifRealWithdrawRequestedBody(String address_short, String amount_lamports) {
    return '$amount_lamports → main wallet $address_short';
  }

  @override
  String get notifRealWithdrawRequestedTitle => '[REAL] Track withdrawal: sent';

  @override
  String notifRealWithdrawAddressAddedBody(String address_short, String cancel_until, String usable_at) {
    return '$address_short becomes active $usable_at. Cancel before $cancel_until if this wasn’t you.';
  }

  @override
  String get notifRealWithdrawAddressAddedTitle => '[REAL] Review new main wallet: registered';

  @override
  String notifRealWithdrawAddressCancelledBody(String address_short) {
    return '$address_short won’t be added.';
  }

  @override
  String get notifRealWithdrawAddressCancelledTitle => '[REAL] Check main wallet: change cancelled';

  @override
  String notifRealWithdrawAddressUsableBody(String address_short) {
    return '$address_short is now your main wallet and withdraw destination.';
  }

  @override
  String get notifRealWithdrawAddressUsableTitle => '[REAL] Check main wallet: active';

  @override
  String notifSkippedBody(String reason) {
    return 'Reason: $reason';
  }

  @override
  String notifSkippedTitle(String symbol) {
    return 'View $symbol: skipped';
  }

  @override
  String notifSlHitBody(String pct, String pnl, String stop_type) {
    return '$stop_type · $pnl ($pct)';
  }

  @override
  String notifSlHitTitle(String mode, String symbol) {
    String _temp0 = intl.Intl.selectLogic(mode, {'real': 'REAL', 'other': 'PAPER'});
    return '[$_temp0] Check $symbol: stop loss hit';
  }

  @override
  String get notifTokenInvalidBody => 'Open the app to continue';

  @override
  String get notifTokenInvalidTitle => 'Open the app: notification action expired';

  @override
  String notifTpHitBody(String pct, String pct_sold, String pnl) {
    return 'Sold $pct_sold at +$pct · $pnl';
  }

  @override
  String notifTpHitTitle(String mode, String symbol) {
    String _temp0 = intl.Intl.selectLogic(mode, {'real': 'REAL', 'other': 'PAPER'});
    return '[$_temp0] Check $symbol: take profit hit';
  }

  @override
  String get orderFailReasonGuardFailed => 'A guard check failed right before the order';

  @override
  String get orderFailReasonInsufficientPracticeBalance => 'Not enough paper SOL';

  @override
  String get orderFailReasonModeNotAllowed => 'This strategy is not approved for Real mode';

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
  String portfolioBalanceChange(String pct, String pnl, String range) {
    return '$pnl ($pct) · $range';
  }

  @override
  String get portfolioBalanceHidden => 'Balance hidden';

  @override
  String portfolioBalanceLabel(String mode) {
    String _temp0 = intl.Intl.selectLogic(mode, {'real': 'Balance', 'other': 'Paper balance'});
    return '$_temp0';
  }

  @override
  String portfolioBalanceUpdated(String time) {
    return 'Updated $time';
  }

  @override
  String portfolioSparklineA11y(String end, String range, String start, String trend) {
    String _temp0 = intl.Intl.selectLogic(trend, {'up': 'up', 'down': 'down', 'other': 'unchanged'});
    return 'Balance $_temp0 over $range, from $start to $end';
  }

  @override
  String get positionsDensityLabel => 'Table density';

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
  String get positionsExitHeldBadge => 'Exits on hold';

  @override
  String get positionsExitHeldDetail => 'Exit plans, TP and SL are on hold until you grant trading authority again.';

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
  String get positionsPnlUnrealized => 'Unrealized PnL';

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
  String get positionsSellManual => 'Sell manually';

  @override
  String get positionsSellManualNote => 'Manual selling still works, signed in Phantom.';

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
  String get positionsStatsAge => 'Position age';

  @override
  String get positionsStatsEntryPrice => 'Entry price';

  @override
  String get positionsStatsMcap => 'Market cap';

  @override
  String get positionsStatsQty => 'Amount';

  @override
  String get positionsStatsTitle => 'Stats';

  @override
  String get positionsStatsValueCost => 'Value / cost';

  @override
  String get positionsStatsVolume24h => 'Volume 24h';

  @override
  String get positionsTitle => 'Positions';

  @override
  String get positionsTitlePaper => 'Positions (paper)';

  @override
  String get positionsTpslNote =>
      'Thin line = previous value. Applies to the rest of the position; sends no transaction.';

  @override
  String get positionsTpslReset => 'Reset';

  @override
  String get positionsTpslSave => 'Save exit plan';

  @override
  String positionsTpslSellPct(String pct) {
    return 'sell $pct%';
  }

  @override
  String get positionsTpslStopLoss => 'Stop loss';

  @override
  String positionsTpslTakeProfit(String n) {
    return 'Take profit $n';
  }

  @override
  String get positionsTpslTitle => 'Edit TP / SL';

  @override
  String positionsTpslWas(String value) {
    return 'was $value';
  }

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
  String get queuePickKindSellPosition => 'Sell';

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
  String get queueRealWithinLimits => 'Within limits: just hold, no Phantom.';

  @override
  String get queueSkipReasonAlreadyPumped => 'Already pumped';

  @override
  String get queueSkipReasonNotTradeable => 'Not tradeable';

  @override
  String get queueSkipReasonOther => 'Other…';

  @override
  String get queueSkipReasonPriceMoved => 'Price moved';

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
  String queueTabWithCount(int count, String label) {
    final intl.NumberFormat countNumberFormat = intl.NumberFormat.decimalPattern(localeName);
    final String countString = countNumberFormat.format(count);

    return '$label · $countString';
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
  String get receiptDone => 'Done';

  @override
  String get receiptExitPlanArmed => 'Exit plan armed';

  @override
  String get receiptFees => 'Fees';

  @override
  String get receiptPaid => 'Paid';

  @override
  String get receiptReceived => 'Received';

  @override
  String receiptTitleBuy(String symbol) {
    return 'Bought $symbol';
  }

  @override
  String receiptTitleSell(String symbol) {
    return 'Sold $symbol';
  }

  @override
  String get receiptViewTx => 'View transaction';

  @override
  String get rejectReasonNotTradeable => 'Not tradeable';

  @override
  String get rejectReasonOther => 'Other';

  @override
  String get rejectReasonPriceMoved => 'Price moved';

  @override
  String get rejectReasonUserDeclined => 'Skipped by you';

  @override
  String get reviewAtaRent => 'Token account rent (new)';

  @override
  String reviewBuyTitle(String symbol) {
    return 'Approve buying $symbol';
  }

  @override
  String get reviewDetailsToggle => 'Fees & slippage';

  @override
  String reviewEstimateNote(String time) {
    return 'Estimates as of $time. Final values can change with the price.';
  }

  @override
  String get reviewMinReceived => 'Min. received';

  @override
  String reviewMinReceivedValue(String min_out, String symbol) {
    return '≥ $min_out $symbol';
  }

  @override
  String get reviewNetworkFee => 'Est. network fee';

  @override
  String reviewNetworkFeeBreakdown(String base, String priority) {
    return 'base $base + priority $priority';
  }

  @override
  String get reviewPracticeNote => 'Paper: simulated fill. No real SOL moves.';

  @override
  String get reviewPrice => 'Price';

  @override
  String reviewPriceMoved(String pct) {
    return 'Price moved $pct since this pick. Review again before approving.';
  }

  @override
  String get reviewPriorityFee => 'Priority fee';

  @override
  String reviewQuoteAgeValid(String age_seconds, String valid_seconds) {
    return 'Quote $age_seconds s old · valid $valid_seconds s';
  }

  @override
  String get reviewQuoteAutoRefreshing => 'Refreshing automatically…';

  @override
  String get reviewQuoteChangedDuringHold => 'Quote changed. Check the new values and hold again.';

  @override
  String get reviewQuoteDetails => 'Details';

  @override
  String reviewQuoteExpiresCountdown(String mm_ss) {
    return '$mm_ss until it expires';
  }

  @override
  String reviewQuoteExpiresIn(int seconds) {
    final intl.NumberFormat secondsNumberFormat = intl.NumberFormat.decimalPattern(localeName);
    final String secondsString = secondsNumberFormat.format(seconds);

    String _temp0 = intl.Intl.pluralLogic(
      seconds,
      locale: localeName,
      other: 'Expires in $secondsString s',
      one: 'Expires in $secondsString s',
    );
    return '$_temp0';
  }

  @override
  String reviewQuoteId(String quote_id) {
    return 'Quote $quote_id';
  }

  @override
  String get reviewQuoteLoading => 'Hold is off until the quote is complete.';

  @override
  String get reviewQuoteMissing => 'No quote yet — refresh to continue';

  @override
  String get reviewQuotePracticeStale => 'Estimate expired. Paper can still approve; values may differ.';

  @override
  String reviewQuoteRate(String rate, String symbol) {
    return '1 SOL = $rate $symbol';
  }

  @override
  String get reviewQuoteRefresh => 'Refresh quote';

  @override
  String get reviewQuoteRefreshing => 'Refreshing quote…';

  @override
  String get reviewQuoteStale => 'Quote expired — refresh to continue';

  @override
  String get reviewQuoteStaleAction => 'Refresh the quote, then re-check the values before approving.';

  @override
  String reviewQuoteUpdatedAgo(int seconds) {
    final intl.NumberFormat secondsNumberFormat = intl.NumberFormat.decimalPattern(localeName);
    final String secondsString = secondsNumberFormat.format(seconds);

    String _temp0 = intl.Intl.pluralLogic(
      seconds,
      locale: localeName,
      zero: 'Quote updated just now',
      other: 'Quote updated $secondsString s ago',
      one: 'Quote updated $secondsString s ago',
    );
    return '$_temp0';
  }

  @override
  String get reviewQuoteUpdatedInline => 'Quote updated';

  @override
  String get reviewQuoteYouPay => 'You pay';

  @override
  String get reviewQuoteYouReceiveEst => 'You receive (estimate)';

  @override
  String get reviewRealNote => 'Real SOL: network fees are paid even if the order fails.';

  @override
  String get reviewSlippage => 'Max slippage';

  @override
  String get reviewSwapFee => 'Swap fee';

  @override
  String get reviewSwapFeeFromInput => 'taken from SOL in, not added';

  @override
  String reviewTitle(String side) {
    String _temp0 = intl.Intl.selectLogic(side, {'sell': 'Review sell', 'other': 'Review buy'});
    return '$_temp0';
  }

  @override
  String get reviewTotalMax => 'Total (max)';

  @override
  String get reviewTotalMaxHint => '= SOL in + network fee + token account rent';

  @override
  String get reviewYouPay => 'You pay';

  @override
  String riskChipA11y(String label, String limit, String used) {
    return '$label: $used of $limit SOL used';
  }

  @override
  String get riskChipDailyLimit => 'Daily limit';

  @override
  String get riskChipGuard => 'Guard';

  @override
  String riskChipUsage(String limit, String used) {
    return '$used/$limit';
  }

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
      'No SOL quote pair for this coin. Centurion Trade only trades SOL pairs, so it can’t be approved.';

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
  String get settingsNotifPracticeActions => 'Allow Approve from notifications (Paper only)';

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
  String get stepupBothRequired => 'Two signatures, both required';

  @override
  String get stepupBrowserContinue => 'Continue in browser';

  @override
  String get stepupBrowserDone => 'Confirmed. You’re back in the app.';

  @override
  String get stepupBrowserExpired => 'The confirmation expired. Start again.';

  @override
  String get stepupBrowserReopen => 'Reopen browser';

  @override
  String get stepupBrowserStateMismatch => 'Blocked: this confirmation didn’t come from this app.';

  @override
  String get stepupBrowserTimeout => 'No answer from the browser in 5 min, so it was cancelled.';

  @override
  String get stepupBrowserWaiting => 'Finish in your browser, then come back.';

  @override
  String get stepupCancelled => 'Nothing changed.';

  @override
  String get stepupFieldAction => 'Action';

  @override
  String get stepupFieldAmount => 'Amount';

  @override
  String get stepupFieldExpires => 'Expires';

  @override
  String get stepupFieldFrom => 'From';

  @override
  String get stepupFieldNonce => 'Nonce';

  @override
  String get stepupFieldPayloadHash => 'Payload hash';

  @override
  String get stepupFieldTo => 'To';

  @override
  String get stepupPasskeyStep => '2 · Owner passkey';

  @override
  String get stepupPasskeyUse => 'Use passkey';

  @override
  String get stepupPasskeyWaiting => 'Waiting for passkey…';

  @override
  String get stepupPhantomOpen => 'Open Phantom to sign';

  @override
  String get stepupPhantomStep => '1 · Phantom signature';

  @override
  String stepupPhantomWaiting(String mm_ss) {
    return 'Waiting for Phantom… $mm_ss left';
  }

  @override
  String get stepupTitle => 'Confirm money action';

  @override
  String get stepupTotpOptional => 'TOTP is optional and doesn’t replace either signature.';

  @override
  String get strategyApprovalHoldNote => 'In Paper, hold 1.2 s. In Real, hold 2.5 s.';

  @override
  String get strategyApprovalModeAskEveryBuy => 'Ask: every buy';

  @override
  String get strategyApprovalModeAskFirstBuy => 'Ask: first buy';

  @override
  String get strategyApprovalModeOff => 'Off (auto)';

  @override
  String get strategyEditParams => 'Edit parameters';

  @override
  String get strategyEditorEyebrow => 'Strategy editor';

  @override
  String strategyEditorRevNote(String rev) {
    return 'Saved as rev $rev · applies to the next pick';
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
  String get strategyListColStrategy => 'Strategy';

  @override
  String strategyListFilterAll(int count) {
    final intl.NumberFormat countNumberFormat = intl.NumberFormat.decimalPattern(localeName);
    final String countString = countNumberFormat.format(count);

    return 'All · $countString';
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
  String get strategyListPnl7d => '7-day PnL';

  @override
  String strategyListSummary(int paper_count, int real_count) {
    final intl.NumberFormat paper_countNumberFormat = intl.NumberFormat.decimalPattern(localeName);
    final String paper_countString = paper_countNumberFormat.format(paper_count);
    final intl.NumberFormat real_countNumberFormat = intl.NumberFormat.decimalPattern(localeName);
    final String real_countString = real_countNumberFormat.format(real_count);

    return '$real_countString Real · $paper_countString Paper';
  }

  @override
  String get strategyListTitle => 'Every strategy runs in Paper or Real.';

  @override
  String get strategyModeLabel => 'Strategy mode';

  @override
  String get strategyModePaper => 'Paper';

  @override
  String get strategyModePaperDesc => 'Runs with paper SOL. No real SOL, no Phantom.';

  @override
  String get strategyModeReal => 'Real';

  @override
  String get strategyModeScopeNote => 'Mode applies per strategy. Open positions keep their original mode.';

  @override
  String get strategyNew => 'New strategy';

  @override
  String strategyRealGateDaysDone(int days_done) {
    final intl.NumberFormat days_doneNumberFormat = intl.NumberFormat.decimalPattern(localeName);
    final String days_doneString = days_doneNumberFormat.format(days_done);

    String _temp0 = intl.Intl.pluralLogic(
      days_done,
      locale: localeName,
      other: '$days_doneString days',
      one: '$days_doneString day',
    );
    return '$_temp0 in Paper';
  }

  @override
  String get strategyRealGateNotSet => 'Rule not set yet';

  @override
  String strategyRealGateProgressDays(String days_done, String days_required) {
    return '$days_done/$days_required days';
  }

  @override
  String strategyRealGateProgressTrades(String trades_done, String trades_required) {
    return '$trades_done/$trades_required trades';
  }

  @override
  String strategyRealGateTradesDone(int trades_done) {
    final intl.NumberFormat trades_doneNumberFormat = intl.NumberFormat.decimalPattern(localeName);
    final String trades_doneString = trades_doneNumberFormat.format(trades_done);

    String _temp0 = intl.Intl.pluralLogic(
      trades_done,
      locale: localeName,
      other: '$trades_doneString trades',
      one: '$trades_doneString trade',
    );
    return '$_temp0 closed';
  }

  @override
  String strategyRealLockedA11y(String reason) {
    return 'Real option disabled: $reason';
  }

  @override
  String get strategyRealLockedBadge => 'Needs Boss approval';

  @override
  String get strategyRealLockedChip => 'Real locked';

  @override
  String get strategyRealLockedChipShort => 'locked';

  @override
  String get strategyRealLockedExplain =>
      'Real is locked. Boss approves each strategy before it can use real SOL. Until then it keeps running in Paper.';

  @override
  String get strategyRealLockedListNote =>
      'Real stays locked until Boss approves. The strategy keeps running in Paper meanwhile.';

  @override
  String get strategyRealLockedReasonGateNotMet => 'Paper requirements not met yet';

  @override
  String get strategyRealLockedReasonNeedsOwnerApproval => 'Needs Boss approval';

  @override
  String get strategyRealLockedReasonOther => 'Not available right now';

  @override
  String get strategyRealLockedReasonPolicy => 'Blocked by wallet rules';

  @override
  String get strategySave => 'Save strategy';

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

  @override
  String get tokenProgramToken2022 => 'Token-2022';

  @override
  String get walletAuthorizeRegrant => 'Grant trading authority again';

  @override
  String get walletAuthorizeRegrantNote =>
      'Needs Phantom + passkey. Once authority is active, exit plans resume automatically.';

  @override
  String get walletAuthorizeRegrantTitle => 'Grant trading permission again to resume Real';

  @override
  String get walletLimitsSettingCapLamports => 'Total cap';

  @override
  String get walletLimitsSettingDailyLamports => 'Max per rolling 24 h';

  @override
  String get walletLimitsSettingMaxPositions => 'Max open positions';

  @override
  String get walletLimitsSettingMaxSlippageBps => 'Max slippage';

  @override
  String get walletLimitsSettingPerTradeLamports => 'Max per trade';

  @override
  String get walletOwnerCancel => 'Cancel';

  @override
  String get walletOwnerChangeMain => 'Change…';

  @override
  String get walletOwnerDelayNote => 'Changes take at least 48 h and can be cancelled.';

  @override
  String get walletOwnerMain => 'Main wallet · sign-in and the only withdraw destination';

  @override
  String walletOwnerPending(String hh_mm_ss, String usable_at) {
    return 'Active $usable_at · $hh_mm_ss left';
  }

  @override
  String get walletOwnerTitle => 'Main wallet';

  @override
  String get walletOwnerTypeLast4 => 'Type the last 4 characters of the new address';

  @override
  String get walletWithdrawFailReasonDestinationNotOwned => 'the destination isn’t your main wallet';

  @override
  String get walletWithdrawFailReasonInsufficientBalance => 'not enough balance';

  @override
  String get walletWithdrawFailReasonOther => 'something went wrong';

  @override
  String get walletWithdrawFailReasonProviderError => 'wallet provider error';

  @override
  String get walletWithdrawFailReasonTxExpired => 'it wasn’t sent in time';

  @override
  String get walletWithdrawFailReasonUnknown => 'unknown error';

  @override
  String get walletWithdrawFailReasonUserRejected => 'you rejected the signature';

  @override
  String get walletWithdrawFailReasonWithdrawSimulationFailed => 'the safety simulation failed';
}
