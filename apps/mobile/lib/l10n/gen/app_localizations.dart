import 'dart:async';

import 'package:flutter/foundation.dart';
import 'package:flutter/widgets.dart';
import 'package:flutter_localizations/flutter_localizations.dart';
import 'package:intl/intl.dart' as intl;

import 'app_localizations_en.dart';
import 'app_localizations_id.dart';

// ignore_for_file: type=lint

/// Callers can lookup localized strings with an instance of AppLocalizations
/// returned by `AppLocalizations.of(context)`.
///
/// Applications need to include `AppLocalizations.delegate()` in their app's
/// `localizationDelegates` list, and the locales they support in the app's
/// `supportedLocales` list. For example:
///
/// ```dart
/// import 'gen/app_localizations.dart';
///
/// return MaterialApp(
///   localizationsDelegates: AppLocalizations.localizationsDelegates,
///   supportedLocales: AppLocalizations.supportedLocales,
///   home: MyApplicationHome(),
/// );
/// ```
///
/// ## Update pubspec.yaml
///
/// Please make sure to update your pubspec.yaml to include the following
/// packages:
///
/// ```yaml
/// dependencies:
///   # Internationalization support.
///   flutter_localizations:
///     sdk: flutter
///   intl: any # Use the pinned version from flutter_localizations
///
///   # Rest of dependencies
/// ```
///
/// ## iOS Applications
///
/// iOS applications define key application metadata, including supported
/// locales, in an Info.plist file that is built into the application bundle.
/// To configure the locales supported by your app, you’ll need to edit this
/// file.
///
/// First, open your project’s ios/Runner.xcworkspace Xcode workspace file.
/// Then, in the Project Navigator, open the Info.plist file under the Runner
/// project’s Runner folder.
///
/// Next, select the Information Property List item, select Add Item from the
/// Editor menu, then select Localizations from the pop-up menu.
///
/// Select and expand the newly-created Localizations item then, for each
/// locale your application supports, add a new item and select the locale
/// you wish to add from the pop-up menu in the Value field. This list should
/// be consistent with the languages listed in the AppLocalizations.supportedLocales
/// property.
abstract class AppLocalizations {
  AppLocalizations(String locale) : localeName = intl.Intl.canonicalizedLocale(locale.toString());

  final String localeName;

  static AppLocalizations of(BuildContext context) {
    return Localizations.of<AppLocalizations>(context, AppLocalizations)!;
  }

  static const LocalizationsDelegate<AppLocalizations> delegate = _AppLocalizationsDelegate();

  /// A list of this localizations delegate along with the default localizations
  /// delegates.
  ///
  /// Returns a list of localizations delegates containing this delegate along with
  /// GlobalMaterialLocalizations.delegate, GlobalCupertinoLocalizations.delegate,
  /// and GlobalWidgetsLocalizations.delegate.
  ///
  /// Additional delegates can be added by appending to this list in
  /// MaterialApp. This list does not have to be used at all if a custom list
  /// of delegates is preferred or required.
  static const List<LocalizationsDelegate<dynamic>> localizationsDelegates = <LocalizationsDelegate<dynamic>>[
    delegate,
    GlobalMaterialLocalizations.delegate,
    GlobalCupertinoLocalizations.delegate,
    GlobalWidgetsLocalizations.delegate,
  ];

  /// A list of this localizations delegate's supported locales.
  static const List<Locale> supportedLocales = <Locale>[Locale('en'), Locale('id')];

  /// builder.approval_mode.real_note
  ///
  /// In en, this message translates to:
  /// **'Real SOL: “Off” is not available in the MVP.'**
  String get builderApprovalModeRealNote;

  /// builder.diff.tag.neutral
  ///
  /// In en, this message translates to:
  /// **'neutral'**
  String get builderDiffTagNeutral;

  /// builder.diff.tag.new
  ///
  /// In en, this message translates to:
  /// **'new'**
  String get builderDiffTagNew;

  /// builder.diff.tag.strengthens
  ///
  /// In en, this message translates to:
  /// **'tightens'**
  String get builderDiffTagStrengthens;

  /// builder.diff.tag.weakens
  ///
  /// In en, this message translates to:
  /// **'loosens'**
  String get builderDiffTagWeakens;

  /// builder.diff.title
  ///
  /// In en, this message translates to:
  /// **'Changes vs rev {rev}'**
  String builderDiffTitle(String rev);

  /// builder.exit.col.gain
  ///
  /// In en, this message translates to:
  /// **'Gain %'**
  String get builderExitColGain;

  /// builder.exit.col.pullback
  ///
  /// In en, this message translates to:
  /// **'Pullback %'**
  String get builderExitColPullback;

  /// builder.exit.col.sell
  ///
  /// In en, this message translates to:
  /// **'Sell % of position'**
  String get builderExitColSell;

  /// builder.exit.drain
  ///
  /// In en, this message translates to:
  /// **'Drain: drop'**
  String get builderExitDrain;

  /// builder.exit.hard_sl
  ///
  /// In en, this message translates to:
  /// **'Hard stop loss from entry'**
  String get builderExitHardSl;

  /// builder.exit.ladder.add
  ///
  /// In en, this message translates to:
  /// **'Add rung'**
  String get builderExitLadderAdd;

  /// builder.exit.ladder.title
  ///
  /// In en, this message translates to:
  /// **'Take-profit ladder (up to 8 rungs)'**
  String get builderExitLadderTitle;

  /// builder.exit.ladder.total
  ///
  /// In en, this message translates to:
  /// **'Total sold: {pct}'**
  String builderExitLadderTotal(String pct);

  /// builder.exit.no_trade
  ///
  /// In en, this message translates to:
  /// **'No-trade exit'**
  String get builderExitNoTrade;

  /// builder.exit.time_stop
  ///
  /// In en, this message translates to:
  /// **'Time stop'**
  String get builderExitTimeStop;

  /// builder.exit.trailing
  ///
  /// In en, this message translates to:
  /// **'Trailing stop from high'**
  String get builderExitTrailing;

  /// builder.guards.preset.balanced
  ///
  /// In en, this message translates to:
  /// **'Balanced'**
  String get builderGuardsPresetBalanced;

  /// builder.guards.preset.loose
  ///
  /// In en, this message translates to:
  /// **'Loose'**
  String get builderGuardsPresetLoose;

  /// builder.guards.preset.strict
  ///
  /// In en, this message translates to:
  /// **'Strict'**
  String get builderGuardsPresetStrict;

  /// builder.guards.weakening_inline
  ///
  /// In en, this message translates to:
  /// **'Loosens the guard (was {from}). Needs approval.'**
  String builderGuardsWeakeningInline(String from);

  /// builder.publish
  ///
  /// In en, this message translates to:
  /// **'Review & publish'**
  String get builderPublish;

  /// builder.step.entry
  ///
  /// In en, this message translates to:
  /// **'Entry'**
  String get builderStepEntry;

  /// builder.step.exit
  ///
  /// In en, this message translates to:
  /// **'Exit plan'**
  String get builderStepExit;

  /// builder.step.guards
  ///
  /// In en, this message translates to:
  /// **'Guards'**
  String get builderStepGuards;

  /// builder.step.progress
  ///
  /// In en, this message translates to:
  /// **'Step {current} of {total} · {name}'**
  String builderStepProgress(String current, String name, String total);

  /// builder.step.review
  ///
  /// In en, this message translates to:
  /// **'Review & sim'**
  String get builderStepReview;

  /// builder.step.screener
  ///
  /// In en, this message translates to:
  /// **'Screener'**
  String get builderStepScreener;

  /// builder.step.valid
  ///
  /// In en, this message translates to:
  /// **'Valid'**
  String get builderStepValid;

  /// builder.step.weakened
  ///
  /// In en, this message translates to:
  /// **'{count,plural,one{{count} setting loosened} other{{count} settings loosened}}'**
  String builderStepWeakened(int count);

  /// builder.title.edit
  ///
  /// In en, this message translates to:
  /// **'Edit strategy · {name}'**
  String builderTitleEdit(String name);

  /// builder.title.new
  ///
  /// In en, this message translates to:
  /// **'New strategy'**
  String get builderTitleNew;

  /// builder.validation.range
  ///
  /// In en, this message translates to:
  /// **'Must be between {min} and {max}'**
  String builderValidationRange(String max, String min);

  /// coin_trail.snapshot_note
  ///
  /// In en, this message translates to:
  /// **'Values and thresholds as read at that moment (rev {rev}).'**
  String coinTrailSnapshotNote(String rev);

  /// coin_trail.step.buy
  ///
  /// In en, this message translates to:
  /// **'Buy'**
  String get coinTrailStepBuy;

  /// coin_trail.step.closed
  ///
  /// In en, this message translates to:
  /// **'Closed'**
  String get coinTrailStepClosed;

  /// coin_trail.step.entry
  ///
  /// In en, this message translates to:
  /// **'Entry'**
  String get coinTrailStepEntry;

  /// coin_trail.step.guard
  ///
  /// In en, this message translates to:
  /// **'Guard'**
  String get coinTrailStepGuard;

  /// coin_trail.step.screen
  ///
  /// In en, this message translates to:
  /// **'Screen'**
  String get coinTrailStepScreen;

  /// coin_trail.step.tp
  ///
  /// In en, this message translates to:
  /// **'Take profit'**
  String get coinTrailStepTp;

  /// coin_trail.step.trail
  ///
  /// In en, this message translates to:
  /// **'Trailing stop'**
  String get coinTrailStepTrail;

  /// coin_trail.title
  ///
  /// In en, this message translates to:
  /// **'Coin trail · {symbol} ({strategy})'**
  String coinTrailTitle(String strategy, String symbol);

  /// common.action.approve
  ///
  /// In en, this message translates to:
  /// **'Approve'**
  String get commonActionApprove;

  /// common.action.back
  ///
  /// In en, this message translates to:
  /// **'Back'**
  String get commonActionBack;

  /// common.action.cancel
  ///
  /// In en, this message translates to:
  /// **'Cancel'**
  String get commonActionCancel;

  /// common.action.next
  ///
  /// In en, this message translates to:
  /// **'Next'**
  String get commonActionNext;

  /// common.action.retry
  ///
  /// In en, this message translates to:
  /// **'Try again'**
  String get commonActionRetry;

  /// common.action.review
  ///
  /// In en, this message translates to:
  /// **'Review'**
  String get commonActionReview;

  /// common.action.save_draft
  ///
  /// In en, this message translates to:
  /// **'Save draft'**
  String get commonActionSaveDraft;

  /// common.action.skip
  ///
  /// In en, this message translates to:
  /// **'Skip'**
  String get commonActionSkip;

  /// common.action.undo
  ///
  /// In en, this message translates to:
  /// **'Undo'**
  String get commonActionUndo;

  /// common.action.view
  ///
  /// In en, this message translates to:
  /// **'View'**
  String get commonActionView;

  /// common.duration.hours
  ///
  /// In en, this message translates to:
  /// **'{count,plural,one{{count} hour} other{{count} hours}}'**
  String commonDurationHours(int count);

  /// common.duration.minutes
  ///
  /// In en, this message translates to:
  /// **'{count,plural,one{{count} min} other{{count} min}}'**
  String commonDurationMinutes(int count);

  /// common.duration.seconds
  ///
  /// In en, this message translates to:
  /// **'{count,plural,one{{count} s} other{{count} s}}'**
  String commonDurationSeconds(int count);

  /// screen-reader label
  ///
  /// In en, this message translates to:
  /// **'Down {amount}'**
  String commonPnlDown(String amount);

  /// common.pnl.flat
  ///
  /// In en, this message translates to:
  /// **'No change'**
  String get commonPnlFlat;

  /// screen-reader label; amount = formatted SOL with sign
  ///
  /// In en, this message translates to:
  /// **'Up {amount}'**
  String commonPnlUp(String amount);

  /// time = formatted local time
  ///
  /// In en, this message translates to:
  /// **'Draft saved · {time}'**
  String commonStateSavedAt(String time);

  /// common.state.saving
  ///
  /// In en, this message translates to:
  /// **'Saving…'**
  String get commonStateSaving;

  /// mm_ss = expires_at − (local_now + skew), skew from server_now
  ///
  /// In en, this message translates to:
  /// **'{mm_ss} left'**
  String commonTimerLeft(String mm_ss);

  /// common.you
  ///
  /// In en, this message translates to:
  /// **'You'**
  String get commonYou;

  /// conflict.action.discard
  ///
  /// In en, this message translates to:
  /// **'Discard my edits'**
  String get conflictActionDiscard;

  /// conflict.action.merge
  ///
  /// In en, this message translates to:
  /// **'Reload & keep my edits'**
  String get conflictActionMerge;

  /// conflict.action.review
  ///
  /// In en, this message translates to:
  /// **'Review changes'**
  String get conflictActionReview;

  /// 409 body: current_rev, base_rev
  ///
  /// In en, this message translates to:
  /// **'Saved as rev {current_rev}. Your edits are based on rev {base_rev} and have not been saved.'**
  String conflictBannerBody(String base_rev, String current_rev);

  /// changed_by.actor -> display name (or common.you), changed_by.via enum, changed_by.device model, changed_at -> formatDateTime
  ///
  /// In en, this message translates to:
  /// **'Changed by {actor} via {via, select, web {web} mobile {mobile} desktop {desktop} mcp {MCP agent} push {notification} other {app}} on {device} · {changed_at}'**
  String conflictBannerChangedBy(String actor, String changed_at, String device, String via);

  /// conflict.banner.conflicts
  ///
  /// In en, this message translates to:
  /// **'{count,plural,one{{count} field changed on both sides.} other{{count} fields changed on both sides.} =0{No overlapping fields — your edits can be merged.}}'**
  String conflictBannerConflicts(int count);

  /// changed_fields -> localized labels joined with Intl.ListFormat
  ///
  /// In en, this message translates to:
  /// **'Changed fields: {fields}'**
  String conflictBannerFields(String fields);

  /// conflict.banner.title
  ///
  /// In en, this message translates to:
  /// **'This strategy changed while you were editing'**
  String get conflictBannerTitle;

  /// conflict.diff.col.base
  ///
  /// In en, this message translates to:
  /// **'Your base (rev {rev})'**
  String conflictDiffColBase(String rev);

  /// conflict.diff.col.mine
  ///
  /// In en, this message translates to:
  /// **'Your edit'**
  String get conflictDiffColMine;

  /// conflict.diff.col.theirs
  ///
  /// In en, this message translates to:
  /// **'Saved (rev {rev})'**
  String conflictDiffColTheirs(String rev);

  /// conflict.diff.pick
  ///
  /// In en, this message translates to:
  /// **'Keep {side, select, mine {mine} theirs {saved} other {base}}'**
  String conflictDiffPick(String side);

  /// conflict.discard.confirm
  ///
  /// In en, this message translates to:
  /// **'Discard {count,plural,one{{count} edit} other{{count} edits}}? This can’t be undone.'**
  String conflictDiscardConfirm(int count);

  /// guard.changed status=cancelled
  ///
  /// In en, this message translates to:
  /// **'Your pending guard change was cancelled because the strategy was edited elsewhere. Request it again.'**
  String get conflictGuardChangeCancelled;

  /// 409 CONFIRMATION_RESTART_REQUIRED
  ///
  /// In en, this message translates to:
  /// **'This loosens a guard on a Real SOL strategy. The full confirmation starts over, and the 10-minute cooldown and 24-hour auto-revert restart from the new confirmation.'**
  String get conflictRealGuardReconfirm;

  /// conflict.state.merged
  ///
  /// In en, this message translates to:
  /// **'Merged onto rev {rev}. Review, then publish.'**
  String conflictStateMerged(String rev);

  /// conflict.state.offline
  ///
  /// In en, this message translates to:
  /// **'Can’t check for newer versions while offline. Your draft is kept locally.'**
  String get conflictStateOffline;

  /// dashboard.feed.filter.all
  ///
  /// In en, this message translates to:
  /// **'All'**
  String get dashboardFeedFilterAll;

  /// dashboard.feed.filter.buys
  ///
  /// In en, this message translates to:
  /// **'Buys'**
  String get dashboardFeedFilterBuys;

  /// dashboard.feed.filter.guard
  ///
  /// In en, this message translates to:
  /// **'Guard'**
  String get dashboardFeedFilterGuard;

  /// dashboard.feed.filter.proposals
  ///
  /// In en, this message translates to:
  /// **'Proposals'**
  String get dashboardFeedFilterProposals;

  /// dashboard.feed.filter.sells
  ///
  /// In en, this message translates to:
  /// **'Sells'**
  String get dashboardFeedFilterSells;

  /// dashboard.feed.title
  ///
  /// In en, this message translates to:
  /// **'Activity feed'**
  String get dashboardFeedTitle;

  /// dashboard.kpi.awaiting
  ///
  /// In en, this message translates to:
  /// **'Awaiting approval'**
  String get dashboardKpiAwaiting;

  /// dashboard.kpi.cash
  ///
  /// In en, this message translates to:
  /// **'Cash'**
  String get dashboardKpiCash;

  /// dashboard.kpi.expiring_soon
  ///
  /// In en, this message translates to:
  /// **'{count,plural,one{{count} expires in under 2 min} other{{count} expire in under 2 min}}'**
  String dashboardKpiExpiringSoon(int count);

  /// dashboard.kpi.open_positions
  ///
  /// In en, this message translates to:
  /// **'Open positions'**
  String get dashboardKpiOpenPositions;

  /// dashboard.kpi.realized_pnl
  ///
  /// In en, this message translates to:
  /// **'Realized PnL'**
  String get dashboardKpiRealizedPnl;

  /// dashboard.strategies.col.approval
  ///
  /// In en, this message translates to:
  /// **'Approval'**
  String get dashboardStrategiesColApproval;

  /// dashboard.strategies.col.avg_hold
  ///
  /// In en, this message translates to:
  /// **'Avg hold'**
  String get dashboardStrategiesColAvgHold;

  /// dashboard.strategies.col.max_dd
  ///
  /// In en, this message translates to:
  /// **'Max DD'**
  String get dashboardStrategiesColMaxDd;

  /// dashboard.strategies.col.name
  ///
  /// In en, this message translates to:
  /// **'Name'**
  String get dashboardStrategiesColName;

  /// dashboard.strategies.col.pnl
  ///
  /// In en, this message translates to:
  /// **'PnL'**
  String get dashboardStrategiesColPnl;

  /// dashboard.strategies.col.status
  ///
  /// In en, this message translates to:
  /// **'Status'**
  String get dashboardStrategiesColStatus;

  /// dashboard.strategies.col.win_rate
  ///
  /// In en, this message translates to:
  /// **'Win rate'**
  String get dashboardStrategiesColWinRate;

  /// dashboard.strategies.new
  ///
  /// In en, this message translates to:
  /// **'New strategy'**
  String get dashboardStrategiesNew;

  /// dashboard.strategies.title
  ///
  /// In en, this message translates to:
  /// **'Strategies'**
  String get dashboardStrategiesTitle;

  /// start = formatted paper SOL
  ///
  /// In en, this message translates to:
  /// **'Practice workspace · start {start} · live updates'**
  String dashboardSubtitlePractice(String start);

  /// dashboard.title
  ///
  /// In en, this message translates to:
  /// **'Team overview'**
  String get dashboardTitle;

  /// wire error.code ACCOUNT_DELETION_BLOCKED
  ///
  /// In en, this message translates to:
  /// **'Close your Real SOL positions and withdraw your trading wallet first.'**
  String get errorCodeAccountDeletionBlocked;

  /// wire error.code ACCOUNT_DELETION_PENDING
  ///
  /// In en, this message translates to:
  /// **'Account deletion is already scheduled.'**
  String get errorCodeAccountDeletionPending;

  /// wire error.code APPROVAL_ALREADY_DECIDED
  ///
  /// In en, this message translates to:
  /// **'This was already decided on another device.'**
  String get errorCodeApprovalAlreadyDecided;

  /// wire error.code APPROVAL_EXPIRED
  ///
  /// In en, this message translates to:
  /// **'This proposal expired: {reason}'**
  String errorCodeApprovalExpired(String reason);

  /// wire error.code APPROVAL_REQUIRES_APP
  ///
  /// In en, this message translates to:
  /// **'Decide this in the official app, not via MCP.'**
  String get errorCodeApprovalRequiresApp;

  /// wire error.code APPROVAL_TOKEN_INVALID
  ///
  /// In en, this message translates to:
  /// **'This notification action expired. Open the app to continue.'**
  String get errorCodeApprovalTokenInvalid;

  /// wire error.code AUTH_TG_INVALID
  ///
  /// In en, this message translates to:
  /// **'Telegram login couldn’t be verified. Try again.'**
  String get errorCodeAuthTgInvalid;

  /// wire error.code AUTH_TG_NO_PROFILE
  ///
  /// In en, this message translates to:
  /// **'Allow Telegram to share your profile to sign in.'**
  String get errorCodeAuthTgNoProfile;

  /// wire error.code AUTH_TG_REPLAY
  ///
  /// In en, this message translates to:
  /// **'This Telegram login was already used. Start again.'**
  String get errorCodeAuthTgReplay;

  /// wire error.code CONFIRMATION_INVALID
  ///
  /// In en, this message translates to:
  /// **'This confirmation expired or was already used. Start again.'**
  String get errorCodeConfirmationInvalid;

  /// wire error.code CONFIRMATION_REQUIRED
  ///
  /// In en, this message translates to:
  /// **'This change needs confirmation: passkey, typed name and hold.'**
  String get errorCodeConfirmationRequired;

  /// wire error.code CONFIRMATION_RESTART_REQUIRED
  ///
  /// In en, this message translates to:
  /// **'The strategy changed during confirmation. Start the confirmation again.'**
  String get errorCodeConfirmationRestartRequired;

  /// wire error.code FORBIDDEN_ROLE
  ///
  /// In en, this message translates to:
  /// **'Your workspace role doesn’t allow this action.'**
  String get errorCodeForbiddenRole;

  /// wire error.code FORBIDDEN_SCOPE
  ///
  /// In en, this message translates to:
  /// **'This token doesn’t have permission for this action.'**
  String get errorCodeForbiddenScope;

  /// wire error.code GUARD_COOLDOWN_ACTIVE
  ///
  /// In en, this message translates to:
  /// **'This guard change is in its cooldown.'**
  String get errorCodeGuardCooldownActive;

  /// wire error.code HOLD_TOO_SHORT
  ///
  /// In en, this message translates to:
  /// **'Released too early. Hold until the bar is full.'**
  String get errorCodeHoldTooShort;

  /// wire error.code INTERNAL
  ///
  /// In en, this message translates to:
  /// **'Something went wrong. Try again.'**
  String get errorCodeInternal;

  /// wire error.code INVALID_FRACTION
  ///
  /// In en, this message translates to:
  /// **'Choose a sell amount from 0.01% to 100%.'**
  String get errorCodeInvalidFraction;

  /// wire error.code JOB_DEAD_LETTERED
  ///
  /// In en, this message translates to:
  /// **'A background task failed after all retries. Support has been notified.'**
  String get errorCodeJobDeadLettered;

  /// wire error.code LAST_LOGIN_METHOD
  ///
  /// In en, this message translates to:
  /// **'This is your only sign-in method. Link another one before unlinking.'**
  String get errorCodeLastLoginMethod;

  /// wire error.code MODE_NOT_ALLOWED
  ///
  /// In en, this message translates to:
  /// **'Only Practice is available. Real SOL isn’t enabled yet.'**
  String get errorCodeModeNotAllowed;

  /// wire error.code NOT_FOUND
  ///
  /// In en, this message translates to:
  /// **'Not found, or you don’t have access.'**
  String get errorCodeNotFound;

  /// wire error.code OTP_INVALID
  ///
  /// In en, this message translates to:
  /// **'Wrong or expired code.'**
  String get errorCodeOtpInvalid;

  /// wire error.code OTP_LOCKED
  ///
  /// In en, this message translates to:
  /// **'Too many attempts. Try again in 15 minutes.'**
  String get errorCodeOtpLocked;

  /// wire error.code POSITION_ALREADY_CLOSED
  ///
  /// In en, this message translates to:
  /// **'This position is already closed.'**
  String get errorCodePositionAlreadyClosed;

  /// wire error.code PRACTICE_CASH_INSUFFICIENT
  ///
  /// In en, this message translates to:
  /// **'Practice cash is too low for the next entry. Entries pause until cash recovers or you reset Practice.'**
  String get errorCodePracticeCashInsufficient;

  /// wire error.code RATE_LIMITED
  ///
  /// In en, this message translates to:
  /// **'Too many requests. Try again in {retry_after_s,plural,one{{retry_after_s} second} other{{retry_after_s} seconds}}.'**
  String errorCodeRateLimited(int retry_after_s);

  /// wire error.code REAL_SOL_DISABLED
  ///
  /// In en, this message translates to:
  /// **'Real SOL isn’t available yet.'**
  String get errorCodeRealSolDisabled;

  /// wire error.code REAUTH_REQUIRED
  ///
  /// In en, this message translates to:
  /// **'Please confirm it’s you again to continue.'**
  String get errorCodeReauthRequired;

  /// wire error.code REPLAY_UNAVAILABLE
  ///
  /// In en, this message translates to:
  /// **'Replay isn’t available right now. Showing the estimate.'**
  String get errorCodeReplayUnavailable;

  /// wire error.code RESET_COOLDOWN
  ///
  /// In en, this message translates to:
  /// **'Practice can be reset once a day. Next: {next_allowed_at}'**
  String errorCodeResetCooldown(String next_allowed_at);

  /// wire error.code SETTINGS_SCHEMA_INVALID
  ///
  /// In en, this message translates to:
  /// **'These strategy settings aren’t valid. Check the highlighted fields.'**
  String get errorCodeSettingsSchemaInvalid;

  /// wire error.code SIWS_NONCE_INVALID
  ///
  /// In en, this message translates to:
  /// **'This sign-in request expired. Try again.'**
  String get errorCodeSiwsNonceInvalid;

  /// wire error.code SIWS_SIGNATURE_INVALID
  ///
  /// In en, this message translates to:
  /// **'The wallet signature couldn’t be verified.'**
  String get errorCodeSiwsSignatureInvalid;

  /// wire error.code SOURCE_DEGRADED
  ///
  /// In en, this message translates to:
  /// **'A market data source is degraded. New picks may be delayed.'**
  String get errorCodeSourceDegraded;

  /// wire error.code STRATEGY_RETIRED
  ///
  /// In en, this message translates to:
  /// **'This strategy was archived or deleted.'**
  String get errorCodeStrategyRetired;

  /// wire error.code STRATEGY_REV_CONFLICT
  ///
  /// In en, this message translates to:
  /// **'This strategy changed while you were editing.'**
  String get errorCodeStrategyRevConflict;

  /// wire error.code TWO_FACTOR_REQUIRED
  ///
  /// In en, this message translates to:
  /// **'Enter your two-factor code to continue.'**
  String get errorCodeTwoFactorRequired;

  /// wire error.code TYPED_CONFIRMATION_MISMATCH
  ///
  /// In en, this message translates to:
  /// **'The name doesn’t match exactly.'**
  String get errorCodeTypedConfirmationMismatch;

  /// wire error.code UNAUTHENTICATED
  ///
  /// In en, this message translates to:
  /// **'Your session ended. Sign in again.'**
  String get errorCodeUnauthenticated;

  /// wire error.code UNAVAILABLE
  ///
  /// In en, this message translates to:
  /// **'Service is temporarily unavailable. Retrying…'**
  String get errorCodeUnavailable;

  /// wire error.code VALIDATION_FAILED
  ///
  /// In en, this message translates to:
  /// **'Some values aren’t valid. Check the highlighted fields.'**
  String get errorCodeValidationFailed;

  /// wire error.code VERSION_CONFLICT
  ///
  /// In en, this message translates to:
  /// **'This changed elsewhere. Reload and try again.'**
  String get errorCodeVersionConflict;

  /// wire error.code WALLET_ROLE_CONFLICT
  ///
  /// In en, this message translates to:
  /// **'A sign-in wallet can’t also be your trading wallet.'**
  String get errorCodeWalletRoleConflict;

  /// wire error.code WEBAUTHN_INVALID
  ///
  /// In en, this message translates to:
  /// **'Passkey check failed. Try again.'**
  String get errorCodeWebauthnInvalid;

  /// wire ExitReason
  ///
  /// In en, this message translates to:
  /// **'Drawdown halt'**
  String get exitReasonDrawdownHalt;

  /// wire ExitReason
  ///
  /// In en, this message translates to:
  /// **'No-trade exit'**
  String get exitReasonIdle;

  /// wire ExitReason
  ///
  /// In en, this message translates to:
  /// **'Stop loss'**
  String get exitReasonLossGuard;

  /// wire ExitReason
  ///
  /// In en, this message translates to:
  /// **'Manual sell'**
  String get exitReasonManual;

  /// wire ExitReason
  ///
  /// In en, this message translates to:
  /// **'Time stop'**
  String get exitReasonMaxHold;

  /// wire ExitReason
  ///
  /// In en, this message translates to:
  /// **'No new high'**
  String get exitReasonNoNewHigh;

  /// wire ExitReason
  ///
  /// In en, this message translates to:
  /// **'Trailing stop'**
  String get exitReasonPeakTrail;

  /// wire ExitReason
  ///
  /// In en, this message translates to:
  /// **'Practice reset'**
  String get exitReasonPracticeReset;

  /// wire ExitReason
  ///
  /// In en, this message translates to:
  /// **'Take profit'**
  String get exitReasonProfitTarget;

  /// wire ExitReason
  ///
  /// In en, this message translates to:
  /// **'Rug detected'**
  String get exitReasonRugDetected;

  /// wire ExitReason
  ///
  /// In en, this message translates to:
  /// **'Sell floor'**
  String get exitReasonSellFloor;

  /// wire ExitReason
  ///
  /// In en, this message translates to:
  /// **'Sell pressure'**
  String get exitReasonSellPressure;

  /// wire ExitReason
  ///
  /// In en, this message translates to:
  /// **'Strategy retired'**
  String get exitReasonStrategyRetired;

  /// queue chip for proposal.expired reason=account_deleted
  ///
  /// In en, this message translates to:
  /// **'Account deleted'**
  String get expireReasonAccountDeletedBadge;

  /// detail line / N-07 body for reason=account_deleted
  ///
  /// In en, this message translates to:
  /// **'The account was deleted'**
  String get expireReasonAccountDeletedDetail;

  /// queue chip for proposal.expired reason=guard_failed
  ///
  /// In en, this message translates to:
  /// **'Guard failed'**
  String get expireReasonGuardFailedBadge;

  /// detail line / N-07 body for reason=guard_failed
  ///
  /// In en, this message translates to:
  /// **'A guard check failed while waiting'**
  String get expireReasonGuardFailedDetail;

  /// queue chip for proposal.expired reason=practice_reset
  ///
  /// In en, this message translates to:
  /// **'Practice reset'**
  String get expireReasonPracticeResetBadge;

  /// detail line / N-07 body for reason=practice_reset
  ///
  /// In en, this message translates to:
  /// **'Practice was reset; pending buys were cleared'**
  String get expireReasonPracticeResetDetail;

  /// queue chip for proposal.expired reason=price_moved
  ///
  /// In en, this message translates to:
  /// **'Price moved'**
  String get expireReasonPriceMovedBadge;

  /// detail line / N-07 body for reason=price_moved
  ///
  /// In en, this message translates to:
  /// **'Price moved past the entry limit'**
  String get expireReasonPriceMovedDetail;

  /// queue chip for proposal.expired reason=strategy_archived
  ///
  /// In en, this message translates to:
  /// **'Strategy archived'**
  String get expireReasonStrategyArchivedBadge;

  /// detail line / N-07 body for reason=strategy_archived
  ///
  /// In en, this message translates to:
  /// **'{strategy} was archived while this waited'**
  String expireReasonStrategyArchivedDetail(String strategy);

  /// queue chip for proposal.expired reason=strategy_deleted
  ///
  /// In en, this message translates to:
  /// **'Strategy deleted'**
  String get expireReasonStrategyDeletedBadge;

  /// detail line / N-07 body for reason=strategy_deleted
  ///
  /// In en, this message translates to:
  /// **'{strategy} was deleted while this waited'**
  String expireReasonStrategyDeletedDetail(String strategy);

  /// queue chip for proposal.expired reason=timeout
  ///
  /// In en, this message translates to:
  /// **'Timed out'**
  String get expireReasonTimeoutBadge;

  /// detail line / N-07 body for reason=timeout
  ///
  /// In en, this message translates to:
  /// **'Approval window ended'**
  String get expireReasonTimeoutDetail;

  /// feed.actor.entry
  ///
  /// In en, this message translates to:
  /// **'Entry'**
  String get feedActorEntry;

  /// feed.actor.executor
  ///
  /// In en, this message translates to:
  /// **'Executor'**
  String get feedActorExecutor;

  /// feed.actor.exit
  ///
  /// In en, this message translates to:
  /// **'Exit'**
  String get feedActorExit;

  /// feed.actor.guard
  ///
  /// In en, this message translates to:
  /// **'Guard'**
  String get feedActorGuard;

  /// feed.actor.screener
  ///
  /// In en, this message translates to:
  /// **'Screener'**
  String get feedActorScreener;

  /// feed.actor.system
  ///
  /// In en, this message translates to:
  /// **'System'**
  String get feedActorSystem;

  /// feed.actor.you
  ///
  /// In en, this message translates to:
  /// **'You'**
  String get feedActorYou;

  /// feed.event.blocked
  ///
  /// In en, this message translates to:
  /// **'Blocked {symbol}'**
  String feedEventBlocked(String symbol);

  /// feed.event.bought
  ///
  /// In en, this message translates to:
  /// **'Bought {symbol} · {amount_lamports}'**
  String feedEventBought(String amount_lamports, String symbol);

  /// feed.event.expired
  ///
  /// In en, this message translates to:
  /// **'Proposal for {symbol} expired'**
  String feedEventExpired(String symbol);

  /// feed.event.passed
  ///
  /// In en, this message translates to:
  /// **'Passed {symbol} · fit {score}/{pass}'**
  String feedEventPassed(String pass, String score, String symbol);

  /// feed.event.skipped
  ///
  /// In en, this message translates to:
  /// **'Skipped pick {symbol}'**
  String feedEventSkipped(String symbol);

  /// feed.event.sold
  ///
  /// In en, this message translates to:
  /// **'Sold {symbol} · {pnl}'**
  String feedEventSold(String pnl, String symbol);

  /// POST …/guard-impact/estimate
  ///
  /// In en, this message translates to:
  /// **'Up to {max_extra_passes} more coins could pass per {window}. Based on rules, not a replay.'**
  String guardImpactEstimateBody(String max_extra_passes, String window);

  /// method static_v1; always visible until replay result arrives
  ///
  /// In en, this message translates to:
  /// **'Estimate'**
  String get guardImpactEstimateLabel;

  /// guard.impact.replay_body
  ///
  /// In en, this message translates to:
  /// **'{newly_passing} more would have passed, {newly_passing_rugged} of them rugged ({samples} samples).'**
  String guardImpactReplayBody(String newly_passing, String newly_passing_rugged, String samples);

  /// GUARD_REPLAY_ENABLED on
  ///
  /// In en, this message translates to:
  /// **'Replay · {window}'**
  String guardImpactReplayLabel(String window);

  /// guard.impact.replay_loading
  ///
  /// In en, this message translates to:
  /// **'Running replay… showing the estimate meanwhile'**
  String get guardImpactReplayLoading;

  /// 503 REPLAY_UNAVAILABLE
  ///
  /// In en, this message translates to:
  /// **'Replay unavailable right now. Showing the estimate.'**
  String get guardImpactReplayUnavailable;

  /// guard.weaken.after.audit
  ///
  /// In en, this message translates to:
  /// **'Recorded in the audit log (who, when, device, diff)'**
  String get guardWeakenAfterAudit;

  /// guard.weaken.after.auto_revert
  ///
  /// In en, this message translates to:
  /// **'Mandatory auto-revert after 24 hours unless you confirm again'**
  String get guardWeakenAfterAutoRevert;

  /// guard.weaken.after.cooldown
  ///
  /// In en, this message translates to:
  /// **'Mandatory 10-minute cooldown before it applies (can be cancelled)'**
  String get guardWeakenAfterCooldown;

  /// guard.weaken.after.notify
  ///
  /// In en, this message translates to:
  /// **'All devices and email are notified'**
  String get guardWeakenAfterNotify;

  /// guard.weaken.cancel
  ///
  /// In en, this message translates to:
  /// **'Cancel (Esc)'**
  String get guardWeakenCancel;

  /// guard.weaken.changes
  ///
  /// In en, this message translates to:
  /// **'Changes (before → after)'**
  String get guardWeakenChanges;

  /// guard.weaken.direction.looser
  ///
  /// In en, this message translates to:
  /// **'looser'**
  String get guardWeakenDirectionLooser;

  /// guard.weaken.direction.off
  ///
  /// In en, this message translates to:
  /// **'turned off'**
  String get guardWeakenDirectionOff;

  /// guard.weaken.hold.practice
  ///
  /// In en, this message translates to:
  /// **'Hold 1.2 s to loosen'**
  String get guardWeakenHoldPractice;

  /// guard.weaken.hold.real
  ///
  /// In en, this message translates to:
  /// **'Hold 2.5 s to loosen'**
  String get guardWeakenHoldReal;

  /// guard.weaken.match
  ///
  /// In en, this message translates to:
  /// **'{matched} of {total} characters match'**
  String guardWeakenMatch(String matched, String total);

  /// guard.weaken.risk.level
  ///
  /// In en, this message translates to:
  /// **'Risk level: {level, select, low {Low} medium {Medium} high {High} other {Critical}}'**
  String guardWeakenRiskLevel(String level);

  /// guard.weaken.risk.title
  ///
  /// In en, this message translates to:
  /// **'Risk impact (7-day replay on our paper data)'**
  String get guardWeakenRiskTitle;

  /// guard.weaken.title.practice
  ///
  /// In en, this message translates to:
  /// **'You’re about to loosen a guard'**
  String get guardWeakenTitlePractice;

  /// guard.weaken.title.real
  ///
  /// In en, this message translates to:
  /// **'You’re about to LOOSEN a guard on a Real SOL strategy'**
  String get guardWeakenTitleReal;

  /// guard.weaken.type_name
  ///
  /// In en, this message translates to:
  /// **'Type the strategy name to confirm'**
  String get guardWeakenTypeName;

  /// Use the Apple system-localized title when available
  ///
  /// In en, this message translates to:
  /// **'Continue with Apple'**
  String get loginButtonApple;

  /// login.button.email
  ///
  /// In en, this message translates to:
  /// **'Send 6-digit code'**
  String get loginButtonEmail;

  /// Google: localization permitted
  ///
  /// In en, this message translates to:
  /// **'Continue with Google'**
  String get loginButtonGoogle;

  /// login.button.telegram
  ///
  /// In en, this message translates to:
  /// **'Log in with Telegram'**
  String get loginButtonTelegram;

  /// login.button.wallet
  ///
  /// In en, this message translates to:
  /// **'Connect Solana wallet'**
  String get loginButtonWallet;

  /// login.email.label
  ///
  /// In en, this message translates to:
  /// **'Email'**
  String get loginEmailLabel;

  /// login.or
  ///
  /// In en, this message translates to:
  /// **'or'**
  String get loginOr;

  /// login.otp.locked
  ///
  /// In en, this message translates to:
  /// **'Too many attempts. Try again in {minutes} min.'**
  String loginOtpLocked(String minutes);

  /// login.otp.resend_in
  ///
  /// In en, this message translates to:
  /// **'Resend in {time}'**
  String loginOtpResendIn(String time);

  /// login.otp.sent_to
  ///
  /// In en, this message translates to:
  /// **'Sent to {email}'**
  String loginOtpSentTo(String email);

  /// login.otp.title
  ///
  /// In en, this message translates to:
  /// **'Enter the code'**
  String get loginOtpTitle;

  /// login.otp.wrong
  ///
  /// In en, this message translates to:
  /// **'{remaining,plural,one{Wrong code. {remaining} attempt left.} other{Wrong code. {remaining} attempts left.}}'**
  String loginOtpWrong(int remaining);

  /// login.practice_default
  ///
  /// In en, this message translates to:
  /// **'New accounts always start in PRACTICE mode.'**
  String get loginPracticeDefault;

  /// login.subtitle
  ///
  /// In en, this message translates to:
  /// **'One account, many sign-in methods. You can link more later.'**
  String get loginSubtitle;

  /// login.telegram.cancelled
  ///
  /// In en, this message translates to:
  /// **'Telegram login was cancelled. Nothing changed.'**
  String get loginTelegramCancelled;

  /// login.telegram.consent
  ///
  /// In en, this message translates to:
  /// **'Telegram shares your name, username and photo with Sentra.'**
  String get loginTelegramConsent;

  /// login.telegram.retry
  ///
  /// In en, this message translates to:
  /// **'Try Telegram again'**
  String get loginTelegramRetry;

  /// login.telegram.title
  ///
  /// In en, this message translates to:
  /// **'Log in with Telegram'**
  String get loginTelegramTitle;

  /// flag AUTH_TELEGRAM_OIDC_ENABLED=false
  ///
  /// In en, this message translates to:
  /// **'Telegram login is not available yet. Use another method.'**
  String get loginTelegramUnavailable;

  /// login.telegram.waiting
  ///
  /// In en, this message translates to:
  /// **'Confirm in Telegram…'**
  String get loginTelegramWaiting;

  /// login.terms
  ///
  /// In en, this message translates to:
  /// **'By continuing you agree to the Terms and Privacy Policy.'**
  String get loginTerms;

  /// login.title
  ///
  /// In en, this message translates to:
  /// **'Sign in or create an account'**
  String get loginTitle;

  /// login.wallet.rejected
  ///
  /// In en, this message translates to:
  /// **'Signature was declined. Nothing was signed.'**
  String get loginWalletRejected;

  /// login.wallet.sign_note
  ///
  /// In en, this message translates to:
  /// **'You’ll sign a message, not a transaction. No fee.'**
  String get loginWalletSignNote;

  /// login.wallet.sign_title
  ///
  /// In en, this message translates to:
  /// **'Sign to sign in'**
  String get loginWalletSignTitle;

  /// mode.practice.banner
  ///
  /// In en, this message translates to:
  /// **'Practice · paper SOL, no real SOL moves'**
  String get modePracticeBanner;

  /// mode.practice.banner_short
  ///
  /// In en, this message translates to:
  /// **'Practice · paper SOL'**
  String get modePracticeBannerShort;

  /// do not translate mode labels
  ///
  /// In en, this message translates to:
  /// **'PRACTICE'**
  String get modePracticeLabel;

  /// mode.real.banner
  ///
  /// In en, this message translates to:
  /// **'Real SOL · wallet connected, orders use real SOL'**
  String get modeRealBanner;

  /// mode.real.banner_short
  ///
  /// In en, this message translates to:
  /// **'Real SOL · real money'**
  String get modeRealBannerShort;

  /// do not translate
  ///
  /// In en, this message translates to:
  /// **'REAL SOL'**
  String get modeRealLabel;

  /// mode.switch.to_real.hold
  ///
  /// In en, this message translates to:
  /// **'Hold to switch to Real SOL'**
  String get modeSwitchToRealHold;

  /// mode.switch.to_real.requirements
  ///
  /// In en, this message translates to:
  /// **'Requires a connected trading wallet and 2FA.'**
  String get modeSwitchToRealRequirements;

  /// mode.switch.to_real.title
  ///
  /// In en, this message translates to:
  /// **'Switch to Real SOL?'**
  String get modeSwitchToRealTitle;

  /// mode.switch.toast_practice
  ///
  /// In en, this message translates to:
  /// **'Back to Practice'**
  String get modeSwitchToastPractice;

  /// nav.activity
  ///
  /// In en, this message translates to:
  /// **'Activity'**
  String get navActivity;

  /// nav.approvals
  ///
  /// In en, this message translates to:
  /// **'Approvals'**
  String get navApprovals;

  /// nav.coins
  ///
  /// In en, this message translates to:
  /// **'Coins'**
  String get navCoins;

  /// nav.dashboard
  ///
  /// In en, this message translates to:
  /// **'Dashboard'**
  String get navDashboard;

  /// nav.home
  ///
  /// In en, this message translates to:
  /// **'Home'**
  String get navHome;

  /// nav.more
  ///
  /// In en, this message translates to:
  /// **'More'**
  String get navMore;

  /// nav.positions
  ///
  /// In en, this message translates to:
  /// **'Positions'**
  String get navPositions;

  /// nav.search.placeholder
  ///
  /// In en, this message translates to:
  /// **'Search coin or strategy'**
  String get navSearchPlaceholder;

  /// nav.settings
  ///
  /// In en, this message translates to:
  /// **'Settings'**
  String get navSettings;

  /// nav.strategies
  ///
  /// In en, this message translates to:
  /// **'Strategies'**
  String get navStrategies;

  /// Practice buy_pick only, valid token
  ///
  /// In en, this message translates to:
  /// **'Approve'**
  String get notifActionApprove;

  /// notif.action.cancel_change
  ///
  /// In en, this message translates to:
  /// **'Cancel change'**
  String get notifActionCancelChange;

  /// only action for Real, guard changes, team actions
  ///
  /// In en, this message translates to:
  /// **'Open'**
  String get notifActionOpen;

  /// Practice buy_pick only (push); Real: in-app only
  ///
  /// In en, this message translates to:
  /// **'Skip'**
  String get notifActionSkip;

  /// N-03
  ///
  /// In en, this message translates to:
  /// **'Order is being placed'**
  String get notifApprovedBody;

  /// N-03; placeholders = push vars (snake_case)
  ///
  /// In en, this message translates to:
  /// **'Approved: {symbol}'**
  String notifApprovedTitle(String symbol);

  /// N-22
  ///
  /// In en, this message translates to:
  /// **'Your account stays active.'**
  String get notifDeletionCancelledBody;

  /// N-22; placeholders = push vars (snake_case)
  ///
  /// In en, this message translates to:
  /// **'Account deletion cancelled'**
  String get notifDeletionCancelledTitle;

  /// N-21
  ///
  /// In en, this message translates to:
  /// **'Your account will be deleted on {scheduled_for}. Cancel in Settings if this wasn’t you.'**
  String notifDeletionScheduledBody(String scheduled_for);

  /// N-21; placeholders = push vars (snake_case)
  ///
  /// In en, this message translates to:
  /// **'Account deletion scheduled'**
  String get notifDeletionScheduledTitle;

  /// N-07
  ///
  /// In en, this message translates to:
  /// **'{reason}'**
  String notifExpiredBody(String reason);

  /// N-07; placeholders = push vars (snake_case)
  ///
  /// In en, this message translates to:
  /// **'[{mode, select, real {REAL SOL} other {PRACTICE}}] {symbol} expired'**
  String notifExpiredTitle(String mode, String symbol);

  /// N-05
  ///
  /// In en, this message translates to:
  /// **'{reason_code} · {amount_lamports}. {mode, select, real {Network fees may apply.} other {No SOL was spent.}}'**
  String notifFailedBody(String amount_lamports, String mode, String reason_code);

  /// N-05; placeholders = push vars (snake_case)
  ///
  /// In en, this message translates to:
  /// **'[{mode, select, real {REAL SOL} other {PRACTICE}}] {side, select, sell {Sell} other {Buy}} {symbol} failed'**
  String notifFailedTitle(String mode, String side, String symbol);

  /// N-04
  ///
  /// In en, this message translates to:
  /// **'{amount_lamports} at {price} · exit plan armed'**
  String notifFilledBody(String amount_lamports, String price);

  /// N-04; placeholders = push vars (snake_case)
  ///
  /// In en, this message translates to:
  /// **'[{mode, select, real {REAL SOL} other {PRACTICE}}] Bought {symbol}'**
  String notifFilledTitle(String mode, String symbol);

  /// N-02
  ///
  /// In en, this message translates to:
  /// **'This strategy hasn’t bought yet. Review before it starts · {amount_lamports} · {mm_ss} left'**
  String notifFirstBuyBody(String amount_lamports, String mm_ss);

  /// N-02; placeholders = push vars (snake_case)
  ///
  /// In en, this message translates to:
  /// **'[{mode, select, real {REAL SOL} other {PRACTICE}}] First buy for {strategy}: {symbol}'**
  String notifFirstBuyTitle(String mode, String strategy, String symbol);

  /// N-18
  ///
  /// In en, this message translates to:
  /// **'Open the queue to review'**
  String get notifGroupedBody;

  /// N-18; placeholders = push vars (snake_case)
  ///
  /// In en, this message translates to:
  /// **'[{mode,select,other{PRACTICE} real{REAL SOL}}] {count,plural,one{{count} pick awaits approval} other{{count} picks await approval}}'**
  String notifGroupedTitle(int count, String mode);

  /// N-12
  ///
  /// In en, this message translates to:
  /// **'Auto-reverts {auto_revert_at}'**
  String notifGuardActiveBody(String auto_revert_at);

  /// N-12; placeholders = push vars (snake_case)
  ///
  /// In en, this message translates to:
  /// **'[{mode, select, real {REAL SOL} other {PRACTICE}}] {strategy} guard is now looser'**
  String notifGuardActiveTitle(String mode, String strategy);

  /// N-19
  ///
  /// In en, this message translates to:
  /// **'{strategy} was edited elsewhere. Request the change again.'**
  String notifGuardCancelledBody(String strategy);

  /// N-19; placeholders = push vars (snake_case)
  ///
  /// In en, this message translates to:
  /// **'[{mode, select, real {REAL SOL} other {PRACTICE}}] Guard change cancelled'**
  String notifGuardCancelledTitle(String mode);

  /// N-11
  ///
  /// In en, this message translates to:
  /// **'{strategy}: effective {cooldown_until}. Cancel if this wasn’t you.'**
  String notifGuardCooldownBody(String cooldown_until, String strategy);

  /// N-11; placeholders = push vars (snake_case)
  ///
  /// In en, this message translates to:
  /// **'[REAL SOL] Guard loosens in 10 min'**
  String get notifGuardCooldownTitle;

  /// N-10
  ///
  /// In en, this message translates to:
  /// **'{strategy}: {setting} {from} → {to} loosens a guard'**
  String notifGuardRequestedBody(String from, String setting, String strategy, String to);

  /// N-10; placeholders = push vars (snake_case)
  ///
  /// In en, this message translates to:
  /// **'[{mode, select, real {REAL SOL} other {PRACTICE}}] Guard change pending'**
  String notifGuardRequestedTitle(String mode);

  /// N-13
  ///
  /// In en, this message translates to:
  /// **'{setting} back to {from}'**
  String notifGuardRevertedBody(String from, String setting);

  /// N-13; placeholders = push vars (snake_case)
  ///
  /// In en, this message translates to:
  /// **'[REAL SOL] {strategy} guard restored'**
  String notifGuardRevertedTitle(String strategy);

  /// N-15
  ///
  /// In en, this message translates to:
  /// **'Down {pct} from peak. Re-arm needs approval.'**
  String notifLossStopBody(String pct);

  /// N-15; placeholders = push vars (snake_case)
  ///
  /// In en, this message translates to:
  /// **'[{mode, select, real {REAL SOL} other {PRACTICE}}] {strategy} paused'**
  String notifLossStopTitle(String mode, String strategy);

  /// N-14b
  ///
  /// In en, this message translates to:
  /// **'Orders use paper SOL'**
  String get notifModePracticeBody;

  /// N-14b; placeholders = push vars (snake_case)
  ///
  /// In en, this message translates to:
  /// **'Back to PRACTICE'**
  String get notifModePracticeTitle;

  /// N-14
  ///
  /// In en, this message translates to:
  /// **'Next orders use real SOL'**
  String get notifModeRealBody;

  /// N-14; placeholders = push vars (snake_case)
  ///
  /// In en, this message translates to:
  /// **'Now in REAL SOL'**
  String get notifModeRealTitle;

  /// N-16
  ///
  /// In en, this message translates to:
  /// **'Data may be delayed. Retrying…'**
  String get notifOfflineBody;

  /// N-16; placeholders = push vars (snake_case)
  ///
  /// In en, this message translates to:
  /// **'Lost connection to server'**
  String get notifOfflineTitle;

  /// N-01
  ///
  /// In en, this message translates to:
  /// **'{strategy} · {amount_lamports} · {mm_ss} left'**
  String notifPickPendingBody(String amount_lamports, String mm_ss, String strategy);

  /// N-01; placeholders = push vars (snake_case)
  ///
  /// In en, this message translates to:
  /// **'[{mode, select, real {REAL SOL} other {PRACTICE}}] {symbol} awaits approval'**
  String notifPickPendingTitle(String mode, String symbol);

  /// N-20
  ///
  /// In en, this message translates to:
  /// **'Balance back to {amount_lamports}. Pending buys were cleared.'**
  String notifPracticeResetBody(String amount_lamports);

  /// N-20; placeholders = push vars (snake_case)
  ///
  /// In en, this message translates to:
  /// **'[PRACTICE] Practice reset'**
  String get notifPracticeResetTitle;

  /// N-06
  ///
  /// In en, this message translates to:
  /// **'Reason: {reason}'**
  String notifSkippedBody(String reason);

  /// N-06; placeholders = push vars (snake_case)
  ///
  /// In en, this message translates to:
  /// **'Skipped: {symbol}'**
  String notifSkippedTitle(String symbol);

  /// N-09
  ///
  /// In en, this message translates to:
  /// **'{stop_type} · {pnl} ({pct})'**
  String notifSlHitBody(String pct, String pnl, String stop_type);

  /// N-09; placeholders = push vars (snake_case)
  ///
  /// In en, this message translates to:
  /// **'[{mode, select, real {REAL SOL} other {PRACTICE}}] Stopped out of {symbol}'**
  String notifSlHitTitle(String mode, String symbol);

  /// N-17
  ///
  /// In en, this message translates to:
  /// **'Open the app to continue'**
  String get notifTokenInvalidBody;

  /// N-17; placeholders = push vars (snake_case)
  ///
  /// In en, this message translates to:
  /// **'Notification action expired'**
  String get notifTokenInvalidTitle;

  /// N-08
  ///
  /// In en, this message translates to:
  /// **'Sold {pct_sold} at +{pct} · {pnl}'**
  String notifTpHitBody(String pct, String pct_sold, String pnl);

  /// N-08; placeholders = push vars (snake_case)
  ///
  /// In en, this message translates to:
  /// **'[{mode, select, real {REAL SOL} other {PRACTICE}}] Took profit on {symbol}'**
  String notifTpHitTitle(String mode, String symbol);

  /// order.failed reason_code=GUARD_FAILED
  ///
  /// In en, this message translates to:
  /// **'A guard check failed right before the order'**
  String get orderFailReasonGuardFailed;

  /// order.failed reason_code=INSUFFICIENT_PRACTICE_BALANCE
  ///
  /// In en, this message translates to:
  /// **'Not enough paper SOL'**
  String get orderFailReasonInsufficientPracticeBalance;

  /// order.failed reason_code=MODE_NOT_ALLOWED
  ///
  /// In en, this message translates to:
  /// **'Only Practice orders run; Real SOL isn’t enabled yet'**
  String get orderFailReasonModeNotAllowed;

  /// order.failed reason_code=POOL_STALE
  ///
  /// In en, this message translates to:
  /// **'Pool data was out of date; the order was not sent'**
  String get orderFailReasonPoolStale;

  /// order.failed reason_code=POSITION_ALREADY_CLOSED
  ///
  /// In en, this message translates to:
  /// **'This position was already closed'**
  String get orderFailReasonPositionAlreadyClosed;

  /// order.failed reason_code=SLIPPAGE_EXCEEDED
  ///
  /// In en, this message translates to:
  /// **'Price moved more than your slippage limit'**
  String get orderFailReasonSlippageExceeded;

  /// order.failed reason_code=UNKNOWN; fallback for any unknown reason_code
  ///
  /// In en, this message translates to:
  /// **'The order couldn’t be completed'**
  String get orderFailReasonUnknown;

  /// order.failed reason_code=UNSUPPORTED_QUOTE_MINT
  ///
  /// In en, this message translates to:
  /// **'This coin has no SOL pair, so it can’t be traded'**
  String get orderFailReasonUnsupportedQuoteMint;

  /// order.failed reason_code=VALIDATION_FAILED
  ///
  /// In en, this message translates to:
  /// **'The order didn’t pass validation'**
  String get orderFailReasonValidationFailed;

  /// positions.equity.hwm
  ///
  /// In en, this message translates to:
  /// **'High-water mark'**
  String get positionsEquityHwm;

  /// positions.equity.title
  ///
  /// In en, this message translates to:
  /// **'Equity · {range}'**
  String positionsEquityTitle(String range);

  /// positions.next_action
  ///
  /// In en, this message translates to:
  /// **'Next: {rung} at {gain} (sell {pct})'**
  String positionsNextAction(String gain, String pct, String rung);

  /// positions.open_count
  ///
  /// In en, this message translates to:
  /// **'{count,plural,one{{count} open} other{{count} open}}'**
  String positionsOpenCount(int count);

  /// positions.sell.estimate
  ///
  /// In en, this message translates to:
  /// **'Estimated proceeds'**
  String get positionsSellEstimate;

  /// Practice, all platforms; no single-press confirm. pct = formatFractionBps(fraction_bps); wire fraction_bps = pctToFractionBps(ui %)
  ///
  /// In en, this message translates to:
  /// **'Hold 1.2 s to sell {pct}'**
  String positionsSellHoldPractice(String pct);

  /// Real SOL, all platforms (+ biometric on mobile)
  ///
  /// In en, this message translates to:
  /// **'Hold 2.5 s to sell {pct}'**
  String positionsSellHoldReal(String pct);

  /// positions.sell.hold.released
  ///
  /// In en, this message translates to:
  /// **'Released early — nothing was sold'**
  String get positionsSellHoldReleased;

  /// positions.sell.never_from_notification
  ///
  /// In en, this message translates to:
  /// **'Selling is never available from a notification or popup.'**
  String get positionsSellNeverFromNotification;

  /// positions.sell.plan_cancelled
  ///
  /// In en, this message translates to:
  /// **'Exit plan cancelled (100%)'**
  String get positionsSellPlanCancelled;

  /// positions.sell.remaining_plan
  ///
  /// In en, this message translates to:
  /// **'Remaining position keeps its exit plan'**
  String get positionsSellRemainingPlan;

  /// positions.sell.title
  ///
  /// In en, this message translates to:
  /// **'Sell {symbol}'**
  String positionsSellTitle(String symbol);

  /// positions.title
  ///
  /// In en, this message translates to:
  /// **'Positions'**
  String get positionsTitle;

  /// queue.batch.approve
  ///
  /// In en, this message translates to:
  /// **'{count,plural,one{Approve {count} pick} other{Approve {count} picks}}'**
  String queueBatchApprove(int count);

  /// queue.batch.selected
  ///
  /// In en, this message translates to:
  /// **'{count,plural,one{{count} selected} other{{count} selected}}'**
  String queueBatchSelected(int count);

  /// queue.batch.total
  ///
  /// In en, this message translates to:
  /// **'Total {amount_lamports}'**
  String queueBatchTotal(String amount_lamports);

  /// guard change rows use Reject, not Skip
  ///
  /// In en, this message translates to:
  /// **'Reject change'**
  String get queueGuardReject;

  /// queue.pick.approve
  ///
  /// In en, this message translates to:
  /// **'Approve'**
  String get queuePickApprove;

  /// queue.pick.cannot_approve
  ///
  /// In en, this message translates to:
  /// **'Can’t be approved'**
  String get queuePickCannotApprove;

  /// queue.pick.expires_in
  ///
  /// In en, this message translates to:
  /// **'Expires in {mm_ss}'**
  String queuePickExpiresIn(String mm_ss);

  /// queue.pick.kind.buy
  ///
  /// In en, this message translates to:
  /// **'Buy'**
  String get queuePickKindBuy;

  /// queue.pick.kind.first_buy
  ///
  /// In en, this message translates to:
  /// **'First buy'**
  String get queuePickKindFirstBuy;

  /// queue.pick.kind.guard_change
  ///
  /// In en, this message translates to:
  /// **'Loosens guard'**
  String get queuePickKindGuardChange;

  /// queue.pick.review_change
  ///
  /// In en, this message translates to:
  /// **'Review change'**
  String get queuePickReviewChange;

  /// queue.pick.skip
  ///
  /// In en, this message translates to:
  /// **'Skip'**
  String get queuePickSkip;

  /// queue.real.approve_button
  ///
  /// In en, this message translates to:
  /// **'Approve with Real SOL'**
  String get queueRealApproveButton;

  /// queue.real.batch_confirm.title
  ///
  /// In en, this message translates to:
  /// **'{count,plural,one{Approve {count} buy with REAL SOL?} other{Approve {count} buys with REAL SOL?}}'**
  String queueRealBatchConfirmTitle(int count);

  /// queue.real.hold
  ///
  /// In en, this message translates to:
  /// **'Hold to approve {amount_lamports}'**
  String queueRealHold(String amount_lamports);

  /// queue.skip_reason.already_pumped
  ///
  /// In en, this message translates to:
  /// **'Already pumped'**
  String get queueSkipReasonAlreadyPumped;

  /// queue.skip_reason.other
  ///
  /// In en, this message translates to:
  /// **'Other…'**
  String get queueSkipReasonOther;

  /// queue.skip_reason.suspicious_dev
  ///
  /// In en, this message translates to:
  /// **'Suspicious dev'**
  String get queueSkipReasonSuspiciousDev;

  /// queue.skip_reason.thin_liquidity
  ///
  /// In en, this message translates to:
  /// **'Thin liquidity'**
  String get queueSkipReasonThinLiquidity;

  /// queue.swipe.disabled_real
  ///
  /// In en, this message translates to:
  /// **'Swipe is off in Real SOL. Use the buttons.'**
  String get queueSwipeDisabledReal;

  /// queue.swipe.hint
  ///
  /// In en, this message translates to:
  /// **'Swipe right to approve · left to skip'**
  String get queueSwipeHint;

  /// queue.tab.approved
  ///
  /// In en, this message translates to:
  /// **'Approved'**
  String get queueTabApproved;

  /// queue.tab.expired
  ///
  /// In en, this message translates to:
  /// **'Expired'**
  String get queueTabExpired;

  /// queue.tab.pending
  ///
  /// In en, this message translates to:
  /// **'Pending'**
  String get queueTabPending;

  /// queue.tab.skipped
  ///
  /// In en, this message translates to:
  /// **'Skipped'**
  String get queueTabSkipped;

  /// queue.tab.with_count
  ///
  /// In en, this message translates to:
  /// **'{label} · {count}'**
  String queueTabWithCount(String count, String label);

  /// queue.title
  ///
  /// In en, this message translates to:
  /// **'Approval queue'**
  String get queueTitle;

  /// queue.why.first_buy
  ///
  /// In en, this message translates to:
  /// **'Approval mode is “Ask: first buy”. This is the strategy’s first buy.'**
  String get queueWhyFirstBuy;

  /// queue.why.title
  ///
  /// In en, this message translates to:
  /// **'Why does this need approval?'**
  String get queueWhyTitle;

  /// screener.action.open_queue
  ///
  /// In en, this message translates to:
  /// **'Open queue'**
  String get screenerActionOpenQueue;

  /// WF-21 card subtitle
  ///
  /// In en, this message translates to:
  /// **'Guard failed · score {score}'**
  String screenerCardGuardFailed(String score);

  /// WF-21 card subtitle, neutral
  ///
  /// In en, this message translates to:
  /// **'Score {score} · no SOL pair'**
  String screenerCardNotTradeable(String score);

  /// WF-21 card subtitle
  ///
  /// In en, this message translates to:
  /// **'Passed · score {score}'**
  String screenerCardPassed(String score);

  /// WF-20 table column
  ///
  /// In en, this message translates to:
  /// **'Action'**
  String get screenerColAction;

  /// WF-20 table column
  ///
  /// In en, this message translates to:
  /// **'Coin'**
  String get screenerColCoin;

  /// WF-20 table column
  ///
  /// In en, this message translates to:
  /// **'Guard'**
  String get screenerColGuard;

  /// WF-20 table column
  ///
  /// In en, this message translates to:
  /// **'Liquidity'**
  String get screenerColLiquidity;

  /// WF-20 table column
  ///
  /// In en, this message translates to:
  /// **'Mcap'**
  String get screenerColMcap;

  /// WF-20 table column
  ///
  /// In en, this message translates to:
  /// **'Score'**
  String get screenerColScore;

  /// WF-20 table column
  ///
  /// In en, this message translates to:
  /// **'Status'**
  String get screenerColStatus;

  /// WF-20 table column
  ///
  /// In en, this message translates to:
  /// **'Venue'**
  String get screenerColVenue;

  /// disabled, labelled CTA; never hidden
  ///
  /// In en, this message translates to:
  /// **'Approve — not available'**
  String get screenerDetailApproveUnavailable;

  /// screener.detail.chart_readonly
  ///
  /// In en, this message translates to:
  /// **'Price chart (read-only)'**
  String get screenerDetailChartReadonly;

  /// screener.detail.guard
  ///
  /// In en, this message translates to:
  /// **'Guard'**
  String get screenerDetailGuard;

  /// screener.detail.guard_not_run
  ///
  /// In en, this message translates to:
  /// **'not run'**
  String get screenerDetailGuardNotRun;

  /// appended to score_value when not tradeable
  ///
  /// In en, this message translates to:
  /// **'(info only)'**
  String get screenerDetailInfoOnly;

  /// screener.detail.none
  ///
  /// In en, this message translates to:
  /// **'none'**
  String get screenerDetailNone;

  /// quote_symbol = known symbol for quote_mint (e.g. USDC) or short mint
  ///
  /// In en, this message translates to:
  /// **'{quote_symbol} · not SOL'**
  String screenerDetailQuoteNotSol(String quote_symbol);

  /// screener.detail.quote_pair
  ///
  /// In en, this message translates to:
  /// **'Quote pair'**
  String get screenerDetailQuotePair;

  /// value = skip_reason verbatim (support)
  ///
  /// In en, this message translates to:
  /// **'Reason code'**
  String get screenerDetailReasonCode;

  /// screener.detail.score
  ///
  /// In en, this message translates to:
  /// **'Screener score'**
  String get screenerDetailScore;

  /// result.score / result.max_score
  ///
  /// In en, this message translates to:
  /// **'{score} / {max_score}'**
  String screenerDetailScoreValue(String max_score, String score);

  /// screener.detail.sol_pair
  ///
  /// In en, this message translates to:
  /// **'SOL pair'**
  String get screenerDetailSolPair;

  /// screener.filter.all
  ///
  /// In en, this message translates to:
  /// **'All'**
  String get screenerFilterAll;

  /// screener.filter.passed
  ///
  /// In en, this message translates to:
  /// **'Passed'**
  String get screenerFilterPassed;

  /// screener.filter.rejected
  ///
  /// In en, this message translates to:
  /// **'Rejected'**
  String get screenerFilterRejected;

  /// neutral chip (text.tertiary on surface.sunken), not loss/error red
  ///
  /// In en, this message translates to:
  /// **'Not tradeable'**
  String get screenerNotTradeableBadge;

  /// shown instead of Approve/Skip; reason_code UNSUPPORTED_QUOTE_MINT
  ///
  /// In en, this message translates to:
  /// **'No SOL quote pair for this coin. Sentra only trades SOL pairs, so it can’t be approved.'**
  String get screenerNotTradeableDetail;

  /// screener.status.passed
  ///
  /// In en, this message translates to:
  /// **'Passed'**
  String get screenerStatusPassed;

  /// WF-20 status chip
  ///
  /// In en, this message translates to:
  /// **'Pick · in queue'**
  String get screenerStatusPickQueued;

  /// WF-21 mobile chip (narrow)
  ///
  /// In en, this message translates to:
  /// **'Pick · queue'**
  String get screenerStatusPickQueuedShort;

  /// screener.status.rejected
  ///
  /// In en, this message translates to:
  /// **'Rejected'**
  String get screenerStatusRejected;

  /// screener.status.rejected_guard
  ///
  /// In en, this message translates to:
  /// **'Rejected · guard failed'**
  String get screenerStatusRejectedGuard;

  /// score_threshold = result.score_threshold
  ///
  /// In en, this message translates to:
  /// **'Rejected · score < {score_threshold}'**
  String screenerStatusRejectedScore(String score_threshold);

  /// WF-20 header
  ///
  /// In en, this message translates to:
  /// **'Coins · screener'**
  String get screenerTitle;

  /// settings.appearance.density.comfortable
  ///
  /// In en, this message translates to:
  /// **'Comfortable'**
  String get settingsAppearanceDensityComfortable;

  /// settings.appearance.density.compact
  ///
  /// In en, this message translates to:
  /// **'Compact'**
  String get settingsAppearanceDensityCompact;

  /// settings.appearance.density.label
  ///
  /// In en, this message translates to:
  /// **'Density'**
  String get settingsAppearanceDensityLabel;

  /// settings.appearance.theme.dark
  ///
  /// In en, this message translates to:
  /// **'Dark'**
  String get settingsAppearanceThemeDark;

  /// settings.appearance.theme.label
  ///
  /// In en, this message translates to:
  /// **'Theme'**
  String get settingsAppearanceThemeLabel;

  /// settings.appearance.theme.light
  ///
  /// In en, this message translates to:
  /// **'Light'**
  String get settingsAppearanceThemeLight;

  /// settings.appearance.theme.system
  ///
  /// In en, this message translates to:
  /// **'Match system'**
  String get settingsAppearanceThemeSystem;

  /// settings.delete.audit_note
  ///
  /// In en, this message translates to:
  /// **'Audit records are kept but anonymized; your name, devices and sign-in methods are removed.'**
  String get settingsDeleteAuditNote;

  /// settings.delete.cancel
  ///
  /// In en, this message translates to:
  /// **'Cancel deletion'**
  String get settingsDeleteCancel;

  /// settings.delete.check.real_positions
  ///
  /// In en, this message translates to:
  /// **'Close all Real SOL positions'**
  String get settingsDeleteCheckRealPositions;

  /// settings.delete.check.reauth
  ///
  /// In en, this message translates to:
  /// **'Confirm it’s you (last 5 min)'**
  String get settingsDeleteCheckReauth;

  /// settings.delete.check.two_factor
  ///
  /// In en, this message translates to:
  /// **'Two-factor code (if enabled)'**
  String get settingsDeleteCheckTwoFactor;

  /// settings.delete.check.wallet_withdrawn
  ///
  /// In en, this message translates to:
  /// **'Withdraw your trading wallet'**
  String get settingsDeleteCheckWalletWithdrawn;

  /// settings.delete.confirm
  ///
  /// In en, this message translates to:
  /// **'Schedule deletion'**
  String get settingsDeleteConfirm;

  /// grace_days from GET /me/deletion (server-side ACCOUNT_DELETION_GRACE_DAYS, default 7, range 7–30 per Apex Rev 4.1); read-only, client cannot choose
  ///
  /// In en, this message translates to:
  /// **'Grace period: {count,plural,one{{count} day} other{{count} days}}'**
  String settingsDeleteGrace(int count);

  /// settings.delete.intro
  ///
  /// In en, this message translates to:
  /// **'Your account is deleted after a grace period. You can cancel until then.'**
  String get settingsDeleteIntro;

  /// settings.delete.scheduled
  ///
  /// In en, this message translates to:
  /// **'Deletion scheduled for {scheduled_for}. We sent a confirmation email.'**
  String settingsDeleteScheduled(String scheduled_for);

  /// settings.delete.title
  ///
  /// In en, this message translates to:
  /// **'Delete account'**
  String get settingsDeleteTitle;

  /// settings.devices.last_seen
  ///
  /// In en, this message translates to:
  /// **'Last seen {when}'**
  String settingsDevicesLastSeen(String when);

  /// settings.devices.note
  ///
  /// In en, this message translates to:
  /// **'Each device registers its own push token. Removing a device signs it out and stops its notifications.'**
  String get settingsDevicesNote;

  /// settings.devices.push_off
  ///
  /// In en, this message translates to:
  /// **'Push off'**
  String get settingsDevicesPushOff;

  /// settings.devices.push_on
  ///
  /// In en, this message translates to:
  /// **'Push on'**
  String get settingsDevicesPushOn;

  /// settings.devices.revoke
  ///
  /// In en, this message translates to:
  /// **'Remove device'**
  String get settingsDevicesRevoke;

  /// settings.devices.title
  ///
  /// In en, this message translates to:
  /// **'Devices & push'**
  String get settingsDevicesTitle;

  /// settings.language.label
  ///
  /// In en, this message translates to:
  /// **'Language'**
  String get settingsLanguageLabel;

  /// settings.language.number_format
  ///
  /// In en, this message translates to:
  /// **'Numbers follow the language: {example}'**
  String settingsLanguageNumberFormat(String example);

  /// settings.login.last_method_lock
  ///
  /// In en, this message translates to:
  /// **'This is your only sign-in method. Link another before unlinking.'**
  String get settingsLoginLastMethodLock;

  /// settings.login.link
  ///
  /// In en, this message translates to:
  /// **'Link'**
  String get settingsLoginLink;

  /// settings.login.linked
  ///
  /// In en, this message translates to:
  /// **'Linked'**
  String get settingsLoginLinked;

  /// settings.login.reauth
  ///
  /// In en, this message translates to:
  /// **'Confirm it’s you to continue'**
  String get settingsLoginReauth;

  /// settings.login.unlink
  ///
  /// In en, this message translates to:
  /// **'Unlink'**
  String get settingsLoginUnlink;

  /// settings.login.wallet_note
  ///
  /// In en, this message translates to:
  /// **'Sign-in wallet only proves identity. It can’t trade.'**
  String get settingsLoginWalletNote;

  /// settings.mode.default_approval
  ///
  /// In en, this message translates to:
  /// **'Default approval mode'**
  String get settingsModeDefaultApproval;

  /// settings.mode.default_new_strategy
  ///
  /// In en, this message translates to:
  /// **'New strategies start in'**
  String get settingsModeDefaultNewStrategy;

  /// settings.notif.desktop_popup
  ///
  /// In en, this message translates to:
  /// **'Desktop always-on-top popup'**
  String get settingsNotifDesktopPopup;

  /// settings.notif.email
  ///
  /// In en, this message translates to:
  /// **'Email'**
  String get settingsNotifEmail;

  /// settings.notif.practice_actions
  ///
  /// In en, this message translates to:
  /// **'Allow Approve from notifications (Practice only)'**
  String get settingsNotifPracticeActions;

  /// settings.notif.push
  ///
  /// In en, this message translates to:
  /// **'Push notifications'**
  String get settingsNotifPush;

  /// settings.section.appearance
  ///
  /// In en, this message translates to:
  /// **'Appearance'**
  String get settingsSectionAppearance;

  /// settings.section.danger
  ///
  /// In en, this message translates to:
  /// **'Delete account'**
  String get settingsSectionDanger;

  /// settings.section.devices
  ///
  /// In en, this message translates to:
  /// **'Devices & push'**
  String get settingsSectionDevices;

  /// settings.section.language
  ///
  /// In en, this message translates to:
  /// **'Language'**
  String get settingsSectionLanguage;

  /// settings.section.login_methods
  ///
  /// In en, this message translates to:
  /// **'Sign-in methods'**
  String get settingsSectionLoginMethods;

  /// settings.section.mode_defaults
  ///
  /// In en, this message translates to:
  /// **'Mode & defaults'**
  String get settingsSectionModeDefaults;

  /// settings.section.notifications
  ///
  /// In en, this message translates to:
  /// **'Notifications'**
  String get settingsSectionNotifications;

  /// settings.section.profile
  ///
  /// In en, this message translates to:
  /// **'Profile'**
  String get settingsSectionProfile;

  /// settings.section.security
  ///
  /// In en, this message translates to:
  /// **'Security'**
  String get settingsSectionSecurity;

  /// settings.section.trading_wallet
  ///
  /// In en, this message translates to:
  /// **'Trading wallet'**
  String get settingsSectionTradingWallet;

  /// settings.security.2fa
  ///
  /// In en, this message translates to:
  /// **'Two-factor authentication'**
  String get settingsSecurity2fa;

  /// settings.security.audit
  ///
  /// In en, this message translates to:
  /// **'Audit log'**
  String get settingsSecurityAudit;

  /// settings.security.sessions
  ///
  /// In en, this message translates to:
  /// **'Sessions & devices'**
  String get settingsSecuritySessions;

  /// settings.security.sign_out_device
  ///
  /// In en, this message translates to:
  /// **'Sign out'**
  String get settingsSecuritySignOutDevice;

  /// settings.security.this_device
  ///
  /// In en, this message translates to:
  /// **'This device'**
  String get settingsSecurityThisDevice;

  /// settings.wallet.not_connected
  ///
  /// In en, this message translates to:
  /// **'Not connected. Real SOL stays off.'**
  String get settingsWalletNotConnected;

  /// settings.wallet.separate_note
  ///
  /// In en, this message translates to:
  /// **'Separate from your sign-in wallet. Withdrawals need 2FA, email approval, and an allow-listed address.'**
  String get settingsWalletSeparateNote;

  /// settings.wallet.title
  ///
  /// In en, this message translates to:
  /// **'Trading wallet (Real SOL)'**
  String get settingsWalletTitle;

  /// shortcut.a
  ///
  /// In en, this message translates to:
  /// **'Approve focused item'**
  String get shortcutA;

  /// shortcut.enter
  ///
  /// In en, this message translates to:
  /// **'Pop out chart'**
  String get shortcutEnter;

  /// shortcut.esc
  ///
  /// In en, this message translates to:
  /// **'Close / cancel'**
  String get shortcutEsc;

  /// shortcut.jk
  ///
  /// In en, this message translates to:
  /// **'Next / previous'**
  String get shortcutJk;

  /// shortcut.s
  ///
  /// In en, this message translates to:
  /// **'Skip (with reason)'**
  String get shortcutS;

  /// shortcut.shift_a
  ///
  /// In en, this message translates to:
  /// **'Approve selected'**
  String get shortcutShiftA;

  /// shortcut.shift_x
  ///
  /// In en, this message translates to:
  /// **'Sell focused position'**
  String get shortcutShiftX;

  /// shortcut.space
  ///
  /// In en, this message translates to:
  /// **'Details / quick look'**
  String get shortcutSpace;

  /// shortcut.x
  ///
  /// In en, this message translates to:
  /// **'Select / deselect'**
  String get shortcutX;

  /// strategy.approval_mode.ask_every_buy
  ///
  /// In en, this message translates to:
  /// **'Ask: every buy'**
  String get strategyApprovalModeAskEveryBuy;

  /// strategy.approval_mode.ask_first_buy
  ///
  /// In en, this message translates to:
  /// **'Ask: first buy'**
  String get strategyApprovalModeAskFirstBuy;

  /// strategy.approval_mode.off
  ///
  /// In en, this message translates to:
  /// **'Off (auto)'**
  String get strategyApprovalModeOff;

  /// strategy.status.draft
  ///
  /// In en, this message translates to:
  /// **'Draft'**
  String get strategyStatusDraft;

  /// strategy.status.paused
  ///
  /// In en, this message translates to:
  /// **'Paused'**
  String get strategyStatusPaused;

  /// strategy.status.running
  ///
  /// In en, this message translates to:
  /// **'Running'**
  String get strategyStatusRunning;

  /// table.mobile.collapse
  ///
  /// In en, this message translates to:
  /// **'Hide details'**
  String get tableMobileCollapse;

  /// table.mobile.expand
  ///
  /// In en, this message translates to:
  /// **'Show details'**
  String get tableMobileExpand;

  /// table.mobile.scroll_hint
  ///
  /// In en, this message translates to:
  /// **'Scroll for more columns'**
  String get tableMobileScrollHint;
}

class _AppLocalizationsDelegate extends LocalizationsDelegate<AppLocalizations> {
  const _AppLocalizationsDelegate();

  @override
  Future<AppLocalizations> load(Locale locale) {
    return SynchronousFuture<AppLocalizations>(lookupAppLocalizations(locale));
  }

  @override
  bool isSupported(Locale locale) => <String>['en', 'id'].contains(locale.languageCode);

  @override
  bool shouldReload(_AppLocalizationsDelegate old) => false;
}

AppLocalizations lookupAppLocalizations(Locale locale) {
  // Lookup logic when only language code is specified.
  switch (locale.languageCode) {
    case 'en':
      return AppLocalizationsEn();
    case 'id':
      return AppLocalizationsId();
  }

  throw FlutterError(
    'AppLocalizations.delegate failed to load unsupported locale "$locale". This is likely '
    'an issue with the localizations generation tool. Please file an issue '
    'on GitHub with a reproducible sample app and the gen-l10n configuration '
    'that was used.',
  );
}
