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
  AppLocalizations(String locale)
      : localeName = intl.Intl.canonicalizedLocale(locale.toString());

  final String localeName;

  static AppLocalizations of(BuildContext context) {
    return Localizations.of<AppLocalizations>(context, AppLocalizations)!;
  }

  static const LocalizationsDelegate<AppLocalizations> delegate =
      _AppLocalizationsDelegate();

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
  static const List<LocalizationsDelegate<dynamic>> localizationsDelegates =
      <LocalizationsDelegate<dynamic>>[
    delegate,
    GlobalMaterialLocalizations.delegate,
    GlobalCupertinoLocalizations.delegate,
    GlobalWidgetsLocalizations.delegate,
  ];

  /// A list of this localizations delegate's supported locales.
  static const List<Locale> supportedLocales = <Locale>[
    Locale('en'),
    Locale('id')
  ];

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
  /// **'{count, plural, one {# setting loosened} other {# settings loosened}}'**
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
  /// **'Coin trail · {coin} ({strategy})'**
  String coinTrailTitle(String coin, String strategy);

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
  /// **'{count, plural, one {# hour} other {# hours}}'**
  String commonDurationHours(int count);

  /// common.duration.minutes
  ///
  /// In en, this message translates to:
  /// **'{count, plural, one {# min} other {# min}}'**
  String commonDurationMinutes(int count);

  /// common.duration.seconds
  ///
  /// In en, this message translates to:
  /// **'{count, plural, one {# s} other {# s}}'**
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

  /// time = mm:ss from expires_at
  ///
  /// In en, this message translates to:
  /// **'{time} left'**
  String commonTimerLeft(String time);

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

  /// conflict.banner.body
  ///
  /// In en, this message translates to:
  /// **'{actor} saved rev {theirs} at {time}. Your edits are based on rev {base} and have not been saved.'**
  String conflictBannerBody(
      String actor, String base, String theirs, String time);

  /// conflict.banner.conflicts
  ///
  /// In en, this message translates to:
  /// **'{count, plural, =0 {No overlapping fields — your edits can be merged.} one {# field changed on both sides.} other {# fields changed on both sides.}}'**
  String conflictBannerConflicts(int count);

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
  /// **'Discard {count, plural, one {# edit} other {# edits}}? This can’t be undone.'**
  String conflictDiscardConfirm(int count);

  /// conflict.real_guard.reconfirm
  ///
  /// In en, this message translates to:
  /// **'A guard change on a Real SOL strategy must be confirmed again after merging.'**
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
  /// **'{count, plural, one {# expires in under 2 min} other {# expire in under 2 min}}'**
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
  /// **'Blocked {coin}'**
  String feedEventBlocked(String coin);

  /// feed.event.bought
  ///
  /// In en, this message translates to:
  /// **'Bought {coin} · {sol}'**
  String feedEventBought(String coin, String sol);

  /// feed.event.expired
  ///
  /// In en, this message translates to:
  /// **'Proposal for {coin} expired'**
  String feedEventExpired(String coin);

  /// feed.event.passed
  ///
  /// In en, this message translates to:
  /// **'Passed {coin} · fit {score}/{pass}'**
  String feedEventPassed(String coin, String pass, String score);

  /// feed.event.skipped
  ///
  /// In en, this message translates to:
  /// **'Skipped pick {coin}'**
  String feedEventSkipped(String coin);

  /// feed.event.sold
  ///
  /// In en, this message translates to:
  /// **'Sold {coin} · {pnl}'**
  String feedEventSold(String coin, String pnl);

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
  /// **'{remaining, plural, one {Wrong code. # attempt left.} other {Wrong code. # attempts left.}}'**
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

  /// login.telegram.expired
  ///
  /// In en, this message translates to:
  /// **'This link expired. Request a new one.'**
  String get loginTelegramExpired;

  /// login.telegram.reopen
  ///
  /// In en, this message translates to:
  /// **'Open Telegram again'**
  String get loginTelegramReopen;

  /// login.telegram.title
  ///
  /// In en, this message translates to:
  /// **'Continue in Telegram'**
  String get loginTelegramTitle;

  /// login.telegram.waiting
  ///
  /// In en, this message translates to:
  /// **'Waiting for confirmation…'**
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

  /// Practice only, valid approval token
  ///
  /// In en, this message translates to:
  /// **'Approve'**
  String get notifActionApprove;

  /// notif.action.cancel_change
  ///
  /// In en, this message translates to:
  /// **'Cancel change'**
  String get notifActionCancelChange;

  /// Real SOL: replaces Approve
  ///
  /// In en, this message translates to:
  /// **'Open pick'**
  String get notifActionOpenPick;

  /// notif.action.skip
  ///
  /// In en, this message translates to:
  /// **'Skip'**
  String get notifActionSkip;

  /// notif.approved.body
  ///
  /// In en, this message translates to:
  /// **'Order is being placed'**
  String get notifApprovedBody;

  /// mode = real | practice (select); labels never translated
  ///
  /// In en, this message translates to:
  /// **'Approved: {coin}'**
  String notifApprovedTitle(String coin);

  /// notif.expired.body
  ///
  /// In en, this message translates to:
  /// **'{reason}'**
  String notifExpiredBody(String reason);

  /// mode = real | practice (select); labels never translated
  ///
  /// In en, this message translates to:
  /// **'[{mode, select, real {REAL SOL} other {PRACTICE}}] {coin} expired'**
  String notifExpiredTitle(String coin, String mode);

  /// notif.failed.body
  ///
  /// In en, this message translates to:
  /// **'{reason}. {mode, select, real {Network fees may apply.} other {No SOL was spent.}}'**
  String notifFailedBody(String mode, String reason);

  /// mode = real | practice (select); labels never translated
  ///
  /// In en, this message translates to:
  /// **'[{mode, select, real {REAL SOL} other {PRACTICE}}] Buy {coin} failed'**
  String notifFailedTitle(String coin, String mode);

  /// notif.filled.body
  ///
  /// In en, this message translates to:
  /// **'{sol} at {price} · exit plan armed'**
  String notifFilledBody(String price, String sol);

  /// mode = real | practice (select); labels never translated
  ///
  /// In en, this message translates to:
  /// **'[{mode, select, real {REAL SOL} other {PRACTICE}}] Bought {coin}'**
  String notifFilledTitle(String coin, String mode);

  /// notif.first_buy.body
  ///
  /// In en, this message translates to:
  /// **'This strategy hasn’t bought yet. Review before it starts · {sol}'**
  String notifFirstBuyBody(String sol);

  /// mode = real | practice (select); labels never translated
  ///
  /// In en, this message translates to:
  /// **'[{mode, select, real {REAL SOL} other {PRACTICE}}] First buy for {strategy}: {coin}'**
  String notifFirstBuyTitle(String coin, String mode, String strategy);

  /// notif.grouped.body
  ///
  /// In en, this message translates to:
  /// **'Open the queue to review'**
  String get notifGroupedBody;

  /// mode = real | practice (select); labels never translated
  ///
  /// In en, this message translates to:
  /// **'[{mode, select, real {REAL SOL} other {PRACTICE}}] {count, plural, one {# pick awaits approval} other {# picks await approval}}'**
  String notifGroupedTitle(int count, String mode);

  /// notif.guard_active.body
  ///
  /// In en, this message translates to:
  /// **'Auto-reverts {time}'**
  String notifGuardActiveBody(String time);

  /// mode = real | practice (select); labels never translated
  ///
  /// In en, this message translates to:
  /// **'[{mode, select, real {REAL SOL} other {PRACTICE}}] {strategy} guard is now looser'**
  String notifGuardActiveTitle(String mode, String strategy);

  /// notif.guard_cooldown.body
  ///
  /// In en, this message translates to:
  /// **'{strategy}: effective {time}. Cancel if this wasn’t you.'**
  String notifGuardCooldownBody(String strategy, String time);

  /// mode = real | practice (select); labels never translated
  ///
  /// In en, this message translates to:
  /// **'[REAL SOL] Guard loosens in 10 min'**
  String get notifGuardCooldownTitle;

  /// notif.guard_requested.body
  ///
  /// In en, this message translates to:
  /// **'{strategy}: {setting} {from} → {to} loosens a guard'**
  String notifGuardRequestedBody(
      String from, String setting, String strategy, String to);

  /// mode = real | practice (select); labels never translated
  ///
  /// In en, this message translates to:
  /// **'[{mode, select, real {REAL SOL} other {PRACTICE}}] Guard change pending'**
  String notifGuardRequestedTitle(String mode);

  /// notif.guard_reverted.body
  ///
  /// In en, this message translates to:
  /// **'{setting} back to {from}'**
  String notifGuardRevertedBody(String from, String setting);

  /// mode = real | practice (select); labels never translated
  ///
  /// In en, this message translates to:
  /// **'[REAL SOL] {strategy} guard restored'**
  String notifGuardRevertedTitle(String strategy);

  /// notif.loss_stop.body
  ///
  /// In en, this message translates to:
  /// **'Down {pct} from peak. Re-arm needs approval.'**
  String notifLossStopBody(String pct);

  /// mode = real | practice (select); labels never translated
  ///
  /// In en, this message translates to:
  /// **'[{mode, select, real {REAL SOL} other {PRACTICE}}] {strategy} paused'**
  String notifLossStopTitle(String mode, String strategy);

  /// notif.mode_practice.body
  ///
  /// In en, this message translates to:
  /// **'Orders use paper SOL'**
  String get notifModePracticeBody;

  /// mode = real | practice (select); labels never translated
  ///
  /// In en, this message translates to:
  /// **'Back to PRACTICE'**
  String get notifModePracticeTitle;

  /// notif.mode_real.body
  ///
  /// In en, this message translates to:
  /// **'Next orders use real SOL'**
  String get notifModeRealBody;

  /// mode = real | practice (select); labels never translated
  ///
  /// In en, this message translates to:
  /// **'Now in REAL SOL'**
  String get notifModeRealTitle;

  /// notif.offline.body
  ///
  /// In en, this message translates to:
  /// **'Data may be delayed. Retrying…'**
  String get notifOfflineBody;

  /// mode = real | practice (select); labels never translated
  ///
  /// In en, this message translates to:
  /// **'Lost connection to server'**
  String get notifOfflineTitle;

  /// notif.pick_pending.body
  ///
  /// In en, this message translates to:
  /// **'{strategy} · {sol} · {time} left'**
  String notifPickPendingBody(String sol, String strategy, String time);

  /// mode = real | practice (select); labels never translated
  ///
  /// In en, this message translates to:
  /// **'[{mode, select, real {REAL SOL} other {PRACTICE}}] {coin} awaits approval'**
  String notifPickPendingTitle(String coin, String mode);

  /// notif.skipped.body
  ///
  /// In en, this message translates to:
  /// **'Reason: {reason}'**
  String notifSkippedBody(String reason);

  /// mode = real | practice (select); labels never translated
  ///
  /// In en, this message translates to:
  /// **'Skipped: {coin}'**
  String notifSkippedTitle(String coin);

  /// notif.sl_hit.body
  ///
  /// In en, this message translates to:
  /// **'{stop_type} · {pnl} ({pct})'**
  String notifSlHitBody(String pct, String pnl, String stop_type);

  /// mode = real | practice (select); labels never translated
  ///
  /// In en, this message translates to:
  /// **'[{mode, select, real {REAL SOL} other {PRACTICE}}] Stopped out of {coin}'**
  String notifSlHitTitle(String coin, String mode);

  /// notif.token_invalid.body
  ///
  /// In en, this message translates to:
  /// **'Open the app to continue'**
  String get notifTokenInvalidBody;

  /// mode = real | practice (select); labels never translated
  ///
  /// In en, this message translates to:
  /// **'Notification action expired'**
  String get notifTokenInvalidTitle;

  /// notif.tp_hit.body
  ///
  /// In en, this message translates to:
  /// **'Sold {pct_sold} at +{pct} · {pnl}'**
  String notifTpHitBody(String pct, String pct_sold, String pnl);

  /// mode = real | practice (select); labels never translated
  ///
  /// In en, this message translates to:
  /// **'[{mode, select, real {REAL SOL} other {PRACTICE}}] Took profit on {coin}'**
  String notifTpHitTitle(String coin, String mode);

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
  /// **'{count, plural, one {# open} other {# open}}'**
  String positionsOpenCount(int count);

  /// positions.sell.estimate
  ///
  /// In en, this message translates to:
  /// **'Estimated proceeds'**
  String get positionsSellEstimate;

  /// Practice, all platforms; no single-press confirm
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
  /// **'Sell {coin}'**
  String positionsSellTitle(String coin);

  /// positions.title
  ///
  /// In en, this message translates to:
  /// **'Positions'**
  String get positionsTitle;

  /// queue.batch.approve
  ///
  /// In en, this message translates to:
  /// **'{count, plural, one {Approve # pick} other {Approve # picks}}'**
  String queueBatchApprove(int count);

  /// queue.batch.selected
  ///
  /// In en, this message translates to:
  /// **'{count, plural, one {# selected} other {# selected}}'**
  String queueBatchSelected(int count);

  /// queue.batch.total
  ///
  /// In en, this message translates to:
  /// **'Total {sol}'**
  String queueBatchTotal(String sol);

  /// queue.expired.reason.guard_failed
  ///
  /// In en, this message translates to:
  /// **'Guard failed while waiting: {reason}'**
  String queueExpiredReasonGuardFailed(String reason);

  /// queue.expired.reason.price_ran
  ///
  /// In en, this message translates to:
  /// **'Price ran {pct} past the entry limit'**
  String queueExpiredReasonPriceRan(String pct);

  /// queue.expired.reason.strategy_archived
  ///
  /// In en, this message translates to:
  /// **'Strategy was archived'**
  String get queueExpiredReasonStrategyArchived;

  /// queue.expired.reason.strategy_deleted
  ///
  /// In en, this message translates to:
  /// **'Strategy was deleted'**
  String get queueExpiredReasonStrategyDeleted;

  /// queue.expired.reason.timed_out
  ///
  /// In en, this message translates to:
  /// **'Approval window ended'**
  String get queueExpiredReasonTimedOut;

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
  /// **'Expires in {time}'**
  String queuePickExpiresIn(String time);

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
  /// **'{count, plural, one {Approve # buy with REAL SOL?} other {Approve # buys with REAL SOL?}}'**
  String queueRealBatchConfirmTitle(int count);

  /// queue.real.hold
  ///
  /// In en, this message translates to:
  /// **'Hold to approve {sol}'**
  String queueRealHold(String sol);

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

class _AppLocalizationsDelegate
    extends LocalizationsDelegate<AppLocalizations> {
  const _AppLocalizationsDelegate();

  @override
  Future<AppLocalizations> load(Locale locale) {
    return SynchronousFuture<AppLocalizations>(lookupAppLocalizations(locale));
  }

  @override
  bool isSupported(Locale locale) =>
      <String>['en', 'id'].contains(locale.languageCode);

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
      'that was used.');
}
