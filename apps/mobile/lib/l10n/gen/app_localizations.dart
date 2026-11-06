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

  /// 0.4.10 G1-blue v2
  ///
  /// In en, this message translates to:
  /// **'Approve {symbol} before {mm_ss}'**
  String alertApproveBefore(String mm_ss, String symbol);

  /// 0.4.10 G1-blue v2
  ///
  /// In en, this message translates to:
  /// **'Review {symbol}: Guard rejected the buy'**
  String alertGuardRejected(String symbol);

  /// 0.4.10 G1-blue v2
  ///
  /// In en, this message translates to:
  /// **'Check {symbol}: TP{n} hit, {pct}% sold'**
  String alertTpHit(String n, String pct, String symbol);

  /// app.about.title
  ///
  /// In en, this message translates to:
  /// **'About Centurion Trade'**
  String get appAboutTitle;

  /// version/build from the app binary
  ///
  /// In en, this message translates to:
  /// **'Version {version} ({build})'**
  String appAboutVersion(String build, String version);

  /// brand; do not translate. Source: APP_NAME in build_locales.py
  ///
  /// In en, this message translates to:
  /// **'Centurion Trade'**
  String get appName;

  /// splash / cold start a11y label
  ///
  /// In en, this message translates to:
  /// **'Starting Centurion Trade…'**
  String get appSplashLoading;

  /// window/document title, store subtitle
  ///
  /// In en, this message translates to:
  /// **'Centurion Trade · Solana trading bot'**
  String get appTitle;

  /// VERBATIM signed SIWS statement (server statement_version bumped, Rev 4.8): never translate, must equal the server string exactly
  ///
  /// In en, this message translates to:
  /// **'Sign in to Centurion Trade'**
  String get authSiwsStatement;

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

  /// settings stall_exit; fires exit_reason stall
  ///
  /// In en, this message translates to:
  /// **'Stall exit'**
  String get builderExitStall;

  /// min_move_pct = formatPct unsigned; window = formatted window_s; never before one full window
  ///
  /// In en, this message translates to:
  /// **'Sell all if the price moves less than {min_move_pct} in {window}'**
  String builderExitStallHint(String min_move_pct, String window);

  /// builder.exit.time_stop
  ///
  /// In en, this message translates to:
  /// **'Time stop'**
  String get builderExitTimeStop;

  /// duration = formatted time_stop_s; fires exit_reason max_hold
  ///
  /// In en, this message translates to:
  /// **'Sell all after holding for {duration}'**
  String builderExitTimeStopHint(String duration);

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

  /// chart tab / panel title
  ///
  /// In en, this message translates to:
  /// **'Chart'**
  String get chartTitle;

  /// formatLamportsOrDash(expected_out_lamports)
  ///
  /// In en, this message translates to:
  /// **'Expected SOL out'**
  String get closePreviewExpectedOut;

  /// Real hold replaced by close.preview.refresh
  ///
  /// In en, this message translates to:
  /// **'Preview expired — refresh to continue'**
  String get closePreviewExpired;

  /// formatLamportsOrDash(min_out_lamports)
  ///
  /// In en, this message translates to:
  /// **'Min. received'**
  String get closePreviewMinReceived;

  /// POST …/close/preview again (same 3 s rule)
  ///
  /// In en, this message translates to:
  /// **'Refresh preview'**
  String get closePreviewRefresh;

  /// close.preview.refreshing
  ///
  /// In en, this message translates to:
  /// **'Refreshing preview…'**
  String get closePreviewRefreshing;

  /// sub-line of review.swap_fee on the sell sheet
  ///
  /// In en, this message translates to:
  /// **'taken from proceeds'**
  String get closePreviewSwapFeeFromOutput;

  /// until 1.1.5 ships: values show —
  ///
  /// In en, this message translates to:
  /// **'Preview isn’t available yet, so Real sells stay off.'**
  String get closePreviewUnavailable;

  /// seconds = quoteState(preview).expiresInS
  ///
  /// In en, this message translates to:
  /// **'{seconds,plural,one{Preview valid for {seconds} s} other{Preview valid for {seconds} s}}'**
  String closePreviewValid(int seconds);

  /// qty = formatRawQty(qty_raw, decimals)
  ///
  /// In en, this message translates to:
  /// **'You sell'**
  String get closePreviewYouSell;

  /// wire mcap_source=curve (1.1.5); suffix after the mcap value
  ///
  /// In en, this message translates to:
  /// **'(curve)'**
  String get coinMcapSourceCurve;

  /// wire mcap_source=pool (1.1.5); suffix after the mcap value
  ///
  /// In en, this message translates to:
  /// **'(pool)'**
  String get coinMcapSourcePool;

  /// wire mcap_source=unavailable (1.1.5); value shows — + common.value.unavailable
  ///
  /// In en, this message translates to:
  /// **'Source unavailable'**
  String get coinMcapSourceUnavailable;

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

  /// chart/sparkline range chip (ID: H = hari)
  ///
  /// In en, this message translates to:
  /// **'1D'**
  String get commonRange1d;

  /// chart/sparkline range chip (ID: H = hari)
  ///
  /// In en, this message translates to:
  /// **'30D'**
  String get commonRange30d;

  /// chart/sparkline range chip (ID: H = hari)
  ///
  /// In en, this message translates to:
  /// **'7D'**
  String get commonRange7d;

  /// chart/sparkline range chip (ID: H = hari)
  ///
  /// In en, this message translates to:
  /// **'All'**
  String get commonRangeAll;

  /// skeleton container aria-label (announce once)
  ///
  /// In en, this message translates to:
  /// **'Loading…'**
  String get commonStateLoading;

  /// section = already-translated section title
  ///
  /// In en, this message translates to:
  /// **'Loading {section}…'**
  String commonStateLoadingSection(String section);

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

  /// Practice unit; never a bare SOL
  ///
  /// In en, this message translates to:
  /// **'paper SOL'**
  String get commonUnitPaperSol;

  /// Real SOL unit
  ///
  /// In en, this message translates to:
  /// **'SOL'**
  String get commonUnitSol;

  /// tooltip + aria-label for a muted “—” (e.g. Mcap until Backend ships it)
  ///
  /// In en, this message translates to:
  /// **'Data not available yet'**
  String get commonValueUnavailable;

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

  /// 0.4.10 G1-blue v2
  ///
  /// In en, this message translates to:
  /// **'Real balance · trading wallet'**
  String get dashboardBalanceRealLabel;

  /// 0.4.10 G1-blue v2: after the PnL line, lower-case
  ///
  /// In en, this message translates to:
  /// **'today'**
  String get dashboardBalanceToday;

  /// 0.4.9 G1 eyebrow above the dashboard headline (product term, not translated); style AppText.eyebrow / text-eyebrow
  ///
  /// In en, this message translates to:
  /// **'Command deck'**
  String get dashboardEyebrow;

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

  /// 0.4.9 G1 dashboard headline (Sora display)
  ///
  /// In en, this message translates to:
  /// **'All your positions at a glance.'**
  String get dashboardHeadline;

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

  /// 0.4.10 G1-blue v2
  ///
  /// In en, this message translates to:
  /// **'{count,plural,one{{count} new} other{{count} new}}'**
  String dashboardNeedsActionCount(int count);

  /// 0.4.10 G1-blue v2: card of verb-first alerts
  ///
  /// In en, this message translates to:
  /// **'Needs action'**
  String get dashboardNeedsActionTitle;

  /// 0.4.10 G1-blue v2
  ///
  /// In en, this message translates to:
  /// **'Real daily limit'**
  String get dashboardStatDailyLimitReal;

  /// 0.4.10 G1-blue v2
  ///
  /// In en, this message translates to:
  /// **'Open positions'**
  String get dashboardStatOpenPositions;

  /// 0.4.10 G1-blue v2
  ///
  /// In en, this message translates to:
  /// **'Paper strategies'**
  String get dashboardStatPaperStrategies;

  /// 0.4.10 G1-blue v2
  ///
  /// In en, this message translates to:
  /// **'Realized PnL · today'**
  String get dashboardStatRealizedToday;

  /// 0.4.10 G1-blue v2
  ///
  /// In en, this message translates to:
  /// **'Win rate · 7 days'**
  String get dashboardStatWinRate7d;

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
  /// **'Paper strategies · start {start} · live updates'**
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

  /// wire error.code AGENT_BUDGET_EXCEEDED (contracts 1.1.6 errors v7)
  ///
  /// In en, this message translates to:
  /// **'The agent hit its call limit. Try again later.'**
  String get errorCodeAgentBudgetExceeded;

  /// wire error.code AGENT_REQUEST_EXPIRED (contracts 1.1.6 errors v7)
  ///
  /// In en, this message translates to:
  /// **'This agent connection request expired. Start again from the agent.'**
  String get errorCodeAgentRequestExpired;

  /// wire error.code AGENT_TRADE_DISABLED (contracts 1.1.6 errors v7)
  ///
  /// In en, this message translates to:
  /// **'Agent trading is off. Turn it on in the Centurion Trade app.'**
  String get errorCodeAgentTradeDisabled;

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

  /// wire error.code BUYS_PAUSED (contracts 1.1.6 errors v7)
  ///
  /// In en, this message translates to:
  /// **'New buys are stopped. Resume buying first.'**
  String get errorCodeBuysPaused;

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

  /// wire error.code GUARD_WEAKEN_REQUIRES_APPROVAL
  ///
  /// In en, this message translates to:
  /// **'Change waiting for approval. It loosens a guard, so nothing applies until you approve it.'**
  String get errorCodeGuardWeakenRequiresApproval;

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

  /// wire error.code LOGO_NOT_FOUND (contracts 1.1.6 errors v7)
  ///
  /// In en, this message translates to:
  /// **'No logo for this coin. The symbol initials are shown instead.'**
  String get errorCodeLogoNotFound;

  /// wire error.code LOGO_REJECTED (contracts 1.1.6 errors v7)
  ///
  /// In en, this message translates to:
  /// **'This coin\'s logo was rejected. The symbol initials are shown instead.'**
  String get errorCodeLogoRejected;

  /// wire error.code LOOSEN_REQUIRES_APP (contracts 1.1.6 errors v7)
  ///
  /// In en, this message translates to:
  /// **'Open the Centurion Trade app to loosen limits or guards.'**
  String get errorCodeLoosenRequiresApp;

  /// wire error.code MODE_NOT_ALLOWED
  ///
  /// In en, this message translates to:
  /// **'This strategy is not approved for Real mode'**
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
  /// **'Paper cash is too low for the next entry. Entries pause until cash recovers or you reset Paper.'**
  String get errorCodePracticeCashInsufficient;

  /// wire error.code QUOTE_MISSING_OR_STALE
  ///
  /// In en, this message translates to:
  /// **'Quote expired — refresh it and check the values again before approving.'**
  String get errorCodeQuoteMissingOrStale;

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
  /// **'Paper can be reset once a day. Next: {next_allowed_at}'**
  String errorCodeResetCooldown(String next_allowed_at);

  /// wire error.code RESUME_REQUIRES_APP (contracts 1.1.6 errors v7)
  ///
  /// In en, this message translates to:
  /// **'Buying was paused in the app. Resume it in the Centurion Trade app.'**
  String get errorCodeResumeRequiresApp;

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

  /// wire error.code SIWS_SESSION_REQUIRED (contracts 1.1.6 errors v7)
  ///
  /// In en, this message translates to:
  /// **'Sign in with your wallet in the Centurion Trade app.'**
  String get errorCodeSiwsSessionRequired;

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

  /// wire ExitReason (1.1.4: also time_stop_s)
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
  /// **'Paper reset'**
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

  /// wire ExitReason (1.1.4 stall_exit; not v1.0 stall = no_new_high)
  ///
  /// In en, this message translates to:
  /// **'Stall exit'**
  String get exitReasonStall;

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

  /// queue chip for proposal.expired reason=kill_switch
  ///
  /// In en, this message translates to:
  /// **'Real stopped'**
  String get expireReasonKillSwitchBadge;

  /// detail line / N-07 body for reason=kill_switch
  ///
  /// In en, this message translates to:
  /// **'Real trading was stopped'**
  String get expireReasonKillSwitchDetail;

  /// queue chip for proposal.expired reason=practice_reset
  ///
  /// In en, this message translates to:
  /// **'Paper reset'**
  String get expireReasonPracticeResetBadge;

  /// detail line / N-07 body for reason=practice_reset
  ///
  /// In en, this message translates to:
  /// **'Paper was reset; pending buys were cleared'**
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

  /// wire actor ingest
  ///
  /// In en, this message translates to:
  /// **'Ingest'**
  String get feedActorIngest;

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

  /// guard.changed status=expired (contracts 1.1.4)
  ///
  /// In en, this message translates to:
  /// **'Expired before approval'**
  String get guardChangeStatusExpired;

  /// guard.changed status=rejected (contracts 1.1.4)
  ///
  /// In en, this message translates to:
  /// **'Rejected'**
  String get guardChangeStatusRejected;

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

  /// expires_at = formatDateTime(proposal.expires_at)
  ///
  /// In en, this message translates to:
  /// **'This change loosens a guard, so nothing applies until you approve it. Approve before {expires_at} or it expires.'**
  String guardWeakenPendingBody(String expires_at);

  /// opens the guard_change proposal (Location: /approvals/{id})
  ///
  /// In en, this message translates to:
  /// **'Review in queue'**
  String get guardWeakenPendingOpen;

  /// 202 GuardChangeProposed; info tone (not error); also used for 409 GUARD_WEAKEN_REQUIRES_APPROVAL
  ///
  /// In en, this message translates to:
  /// **'Change waiting for approval'**
  String get guardWeakenPendingTitle;

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

  /// manual Stop → real.buys.paused (exit plans keep running); initial focus; one click + one dialog, no 2FA, no hold
  ///
  /// In en, this message translates to:
  /// **'Stop buying'**
  String get killSwitchActionEngage;

  /// → real.buys.resumed (immediate); replaces kill_switch.reenable.action
  ///
  /// In en, this message translates to:
  /// **'Resume buying'**
  String get killSwitchActionResume;

  /// 0.4.9 G1 Stop dialog: Stop = new buys only (Boss decision)
  ///
  /// In en, this message translates to:
  /// **'Exit plans, TP and SL keep running.'**
  String get killSwitchDialogEffectExitsKeep;

  /// kill_switch.dialog.effect.inflight
  ///
  /// In en, this message translates to:
  /// **'Orders already sent can’t be recalled.'**
  String get killSwitchDialogEffectInflight;

  /// kill_switch.dialog.effect.proposals
  ///
  /// In en, this message translates to:
  /// **'Pending Real proposals expire.'**
  String get killSwitchDialogEffectProposals;

  /// kill_switch.dialog.effect.unsigned
  ///
  /// In en, this message translates to:
  /// **'Unsigned orders are cancelled.'**
  String get killSwitchDialogEffectUnsigned;

  /// exit plans keep running
  ///
  /// In en, this message translates to:
  /// **'Stop new Real buys?'**
  String get killSwitchDialogTitle;

  /// kill_switch.offline
  ///
  /// In en, this message translates to:
  /// **'Can’t reach the server. Stop isn’t confirmed yet. Retrying…'**
  String get killSwitchOffline;

  /// kill_switch.option.exits_run
  ///
  /// In en, this message translates to:
  /// **'Exit plan keeps running (recommended)'**
  String get killSwitchOptionExitsRun;

  /// kill_switch.option.sell_all
  ///
  /// In en, this message translates to:
  /// **'{count,plural,one{Also sell {count} position now} other{Also sell {count} positions now}}'**
  String killSwitchOptionSellAll(int count);

  /// kill_switch_reason=loss_velocity (Backend final Phase 7, auto trips only; lower-case: used mid-sentence)
  ///
  /// In en, this message translates to:
  /// **'losses grew too fast'**
  String get killSwitchReasonLossVelocity;

  /// kill_switch_reason=other (Backend final Phase 7, auto trips only; lower-case: used mid-sentence)
  ///
  /// In en, this message translates to:
  /// **'a safety rule triggered'**
  String get killSwitchReasonOther;

  /// kill_switch_reason=policy_mismatch (Backend final Phase 7, auto trips only; lower-case: used mid-sentence)
  ///
  /// In en, this message translates to:
  /// **'wallet rules don’t match'**
  String get killSwitchReasonPolicyMismatch;

  /// kill_switch_reason=provider_error (Backend final Phase 7, auto trips only; lower-case: used mid-sentence)
  ///
  /// In en, this message translates to:
  /// **'a provider or signer problem · only exits run'**
  String get killSwitchReasonProviderError;

  /// wire scope=global
  ///
  /// In en, this message translates to:
  /// **'All Real trading'**
  String get killSwitchScopeGlobal;

  /// wire scope=strategy
  ///
  /// In en, this message translates to:
  /// **'One strategy'**
  String get killSwitchScopeStrategy;

  /// wire scope=workspace
  ///
  /// In en, this message translates to:
  /// **'This workspace'**
  String get killSwitchScopeWorkspace;

  /// kill_switch.sell_all.body
  ///
  /// In en, this message translates to:
  /// **'Sells at market now. Safety checks still apply: simulation and your slippage cap.'**
  String get killSwitchSellAllBody;

  /// one per failures[] item; symbol resolved from mint (untrusted); reason_code → order.fail_reason.<lower> (unknown → .unknown)
  ///
  /// In en, this message translates to:
  /// **'{symbol}: {reason_code}. Still open; exit plan keeps running.'**
  String killSwitchSellAllFailureRow(String reason_code, String symbol);

  /// kill_switch.sell_all.hold
  ///
  /// In en, this message translates to:
  /// **'Hold 2.5 s to sell all'**
  String get killSwitchSellAllHold;

  /// after real.sell_all.requested until real.sell_all.completed (same sell_all_id); button disabled
  ///
  /// In en, this message translates to:
  /// **'{requested_count,plural,one{Selling {requested_count} position…} other{Selling {requested_count} positions…}}'**
  String killSwitchSellAllInProgress(int requested_count);

  /// 429 RATE_LIMITED on sell all (~1 per 60 s); retry_after_s = error.retry_after_s / Retry-After, counts down
  ///
  /// In en, this message translates to:
  /// **'Sell all was just requested. Try again in {retry_after_s,plural,one{{retry_after_s} second} other{{retry_after_s} seconds}}.'**
  String killSwitchSellAllRateLimited(int retry_after_s);

  /// 0.4.10 G1-blue v2: partial-failure dialog title
  ///
  /// In en, this message translates to:
  /// **'Retry selling {symbol}'**
  String killSwitchSellAllRetryTitle(String symbol);

  /// lead decision: confirm dialog + 2.5 s hold, NO Phantom step-up
  ///
  /// In en, this message translates to:
  /// **'{count,plural,one{Sell {count} Real position now?} other{Sell {count} Real positions now?}}'**
  String killSwitchSellAllTitle(int count);

  /// kill_switch.status.authority
  ///
  /// In en, this message translates to:
  /// **'{state, select, revoked {Bot authority revoked} other {Bot authority still active}}'**
  String killSwitchStatusAuthority(String state);

  /// at = formatDateTime; device_label untrusted text
  ///
  /// In en, this message translates to:
  /// **'Stopped {actor_type, select, user {by you on {device_label}} rule {automatically} other {by the system}} at {at}'**
  String killSwitchStatusBy(String actor_type, String at, String device_label);

  /// Rev 5.2: exits are never frozen (no state var)
  ///
  /// In en, this message translates to:
  /// **'Exit plans keep running'**
  String get killSwitchStatusExits;

  /// 0.4.9 G1 stopped banner, next to kill_switch.action.resume
  ///
  /// In en, this message translates to:
  /// **'Bot authority stays active. No cooldown: resume any time with one click.'**
  String get killSwitchStatusResumeHint;

  /// 0.4.10 G1-blue v2: verb-first stopped banner title (kill_switch.status.title stays for Desktop)
  ///
  /// In en, this message translates to:
  /// **'Resume Real buying when ready'**
  String get killSwitchStatusResumeWhenReady;

  /// manual Stop = real.buys.paused (exits keep running); auto trip = real.kill_switch.tripped
  ///
  /// In en, this message translates to:
  /// **'New buys stopped'**
  String get killSwitchStatusTitle;

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

  /// 0.4.10: mode is per strategy
  ///
  /// In en, this message translates to:
  /// **'New strategies always start in Paper.'**
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
  /// **'Telegram shares your name, username and photo with Centurion Trade.'**
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

  /// tooltip; time = formatTime(mcap_as_of) or formatDateTime if not today
  ///
  /// In en, this message translates to:
  /// **'As of {time}'**
  String mcapAsOf(String time);

  /// coin detail row label; table column stays screener.col.mcap
  ///
  /// In en, this message translates to:
  /// **'Market cap'**
  String get mcapLabel;

  /// amount = formatMcapSol(market_cap_lamports, loc, {paper:false}); secondary line under USD
  ///
  /// In en, this message translates to:
  /// **'≈ {amount}'**
  String mcapSolValue(String amount);

  /// tooltip second line ONLY when mcap_source is curve|pool and mcap_usd is set (mcapView in format.mjs, 1.1.5)
  ///
  /// In en, this message translates to:
  /// **'USD is indicative (reference SOL price), not live.'**
  String get mcapUsdIndicative;

  /// mode.practice.banner
  ///
  /// In en, this message translates to:
  /// **'Paper · paper SOL, no real SOL moves'**
  String get modePracticeBanner;

  /// mode.practice.banner_short
  ///
  /// In en, this message translates to:
  /// **'Paper · paper SOL'**
  String get modePracticeBannerShort;

  /// do not translate mode labels. 0.4.10: copy Practice → Paper (per-strategy mode; wire value stays practice); key rename in 0.5.0
  ///
  /// In en, this message translates to:
  /// **'PAPER'**
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

  /// 0.4.10: mode is per strategy
  ///
  /// In en, this message translates to:
  /// **'Strategy back to Paper'**
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
  /// **'View {symbol}: approved'**
  String notifApprovedTitle(String symbol);

  /// N-22
  ///
  /// In en, this message translates to:
  /// **'Your account stays active.'**
  String get notifDeletionCancelledBody;

  /// N-22; placeholders = push vars (snake_case)
  ///
  /// In en, this message translates to:
  /// **'Check account: deletion cancelled'**
  String get notifDeletionCancelledTitle;

  /// N-21
  ///
  /// In en, this message translates to:
  /// **'Your account will be deleted on {scheduled_for}. Cancel in Settings if this wasn’t you.'**
  String notifDeletionScheduledBody(String scheduled_for);

  /// N-21; placeholders = push vars (snake_case)
  ///
  /// In en, this message translates to:
  /// **'Check account: deletion scheduled'**
  String get notifDeletionScheduledTitle;

  /// N-07
  ///
  /// In en, this message translates to:
  /// **'{reason}'**
  String notifExpiredBody(String reason);

  /// N-07; placeholders = push vars (snake_case)
  ///
  /// In en, this message translates to:
  /// **'[{mode, select, real {REAL} other {PAPER}}] Re-check {symbol}: approval expired'**
  String notifExpiredTitle(String mode, String symbol);

  /// N-05
  ///
  /// In en, this message translates to:
  /// **'{reason_code} · {amount_lamports}. {mode, select, real {Network fees may apply.} other {No SOL was spent.}}'**
  String notifFailedBody(String amount_lamports, String mode, String reason_code);

  /// N-05; placeholders = push vars (snake_case)
  ///
  /// In en, this message translates to:
  /// **'[{mode, select, real {REAL} other {PAPER}}] Check {symbol}: {side, select, sell {sell} other {buy}} failed'**
  String notifFailedTitle(String mode, String side, String symbol);

  /// N-04
  ///
  /// In en, this message translates to:
  /// **'{amount_lamports} at {price} · exit plan armed'**
  String notifFilledBody(String amount_lamports, String price);

  /// N-04; placeholders = push vars (snake_case)
  ///
  /// In en, this message translates to:
  /// **'[{mode, select, real {REAL} other {PAPER}}] View {symbol}: bought'**
  String notifFilledTitle(String mode, String symbol);

  /// N-02
  ///
  /// In en, this message translates to:
  /// **'This strategy hasn’t bought yet. Review before it starts · {amount_lamports} · {mm_ss} left'**
  String notifFirstBuyBody(String amount_lamports, String mm_ss);

  /// N-02; placeholders = push vars (snake_case)
  ///
  /// In en, this message translates to:
  /// **'[{mode, select, real {REAL} other {PAPER}}] Review first buy for {strategy}: {symbol}'**
  String notifFirstBuyTitle(String mode, String strategy, String symbol);

  /// N-18
  ///
  /// In en, this message translates to:
  /// **'Open the queue to review'**
  String get notifGroupedBody;

  /// N-18; placeholders = push vars (snake_case)
  ///
  /// In en, this message translates to:
  /// **'[{mode,select,other{PAPER} real{REAL}}] Review {count,plural,one{{count} pick} other{{count} picks}} awaiting approval'**
  String notifGroupedTitle(int count, String mode);

  /// N-12
  ///
  /// In en, this message translates to:
  /// **'Auto-reverts {auto_revert_at}'**
  String notifGuardActiveBody(String auto_revert_at);

  /// N-12; placeholders = push vars (snake_case)
  ///
  /// In en, this message translates to:
  /// **'[{mode, select, real {REAL} other {PAPER}}] Review {strategy}: guard is now looser'**
  String notifGuardActiveTitle(String mode, String strategy);

  /// N-19
  ///
  /// In en, this message translates to:
  /// **'{strategy} was edited elsewhere. Request the change again.'**
  String notifGuardCancelledBody(String strategy);

  /// N-19; placeholders = push vars (snake_case)
  ///
  /// In en, this message translates to:
  /// **'[{mode, select, real {REAL} other {PAPER}}] Check guard: change cancelled'**
  String notifGuardCancelledTitle(String mode);

  /// N-11
  ///
  /// In en, this message translates to:
  /// **'{strategy}: effective {cooldown_until}. Cancel if this wasn’t you.'**
  String notifGuardCooldownBody(String cooldown_until, String strategy);

  /// N-11; placeholders = push vars (snake_case)
  ///
  /// In en, this message translates to:
  /// **'[REAL] Cancel within 10 min to keep the guard'**
  String get notifGuardCooldownTitle;

  /// N-10
  ///
  /// In en, this message translates to:
  /// **'{strategy}: {setting} {from} → {to} loosens a guard'**
  String notifGuardRequestedBody(String from, String setting, String strategy, String to);

  /// N-10; placeholders = push vars (snake_case)
  ///
  /// In en, this message translates to:
  /// **'[{mode, select, real {REAL} other {PAPER}}] Confirm the pending guard change'**
  String notifGuardRequestedTitle(String mode);

  /// N-13
  ///
  /// In en, this message translates to:
  /// **'{setting} back to {from}'**
  String notifGuardRevertedBody(String from, String setting);

  /// N-13; placeholders = push vars (snake_case)
  ///
  /// In en, this message translates to:
  /// **'[REAL] Check {strategy}: guard restored'**
  String notifGuardRevertedTitle(String strategy);

  /// N-15
  ///
  /// In en, this message translates to:
  /// **'Down {pct} from peak. Re-arm needs approval.'**
  String notifLossStopBody(String pct);

  /// N-15; placeholders = push vars (snake_case)
  ///
  /// In en, this message translates to:
  /// **'[{mode, select, real {REAL} other {PAPER}}] Review {strategy}: paused by loss stop'**
  String notifLossStopTitle(String mode, String strategy);

  /// N-14b
  ///
  /// In en, this message translates to:
  /// **'This strategy’s orders use paper SOL'**
  String get notifModePracticeBody;

  /// N-14b; placeholders = push vars (snake_case)
  ///
  /// In en, this message translates to:
  /// **'Check strategy mode: back to PAPER'**
  String get notifModePracticeTitle;

  /// N-14
  ///
  /// In en, this message translates to:
  /// **'Next orders of this strategy use real SOL'**
  String get notifModeRealBody;

  /// N-14; placeholders = push vars (snake_case)
  ///
  /// In en, this message translates to:
  /// **'Check strategy mode: now in REAL'**
  String get notifModeRealTitle;

  /// N-16
  ///
  /// In en, this message translates to:
  /// **'Data may be delayed. Retrying…'**
  String get notifOfflineBody;

  /// N-16; placeholders = push vars (snake_case)
  ///
  /// In en, this message translates to:
  /// **'Reconnect: lost connection to server'**
  String get notifOfflineTitle;

  /// N-01
  ///
  /// In en, this message translates to:
  /// **'{strategy} · {amount_lamports} · {mm_ss} left'**
  String notifPickPendingBody(String amount_lamports, String mm_ss, String strategy);

  /// N-01; placeholders = push vars (snake_case)
  ///
  /// In en, this message translates to:
  /// **'[{mode, select, real {REAL} other {PAPER}}] Review {symbol}: awaiting approval'**
  String notifPickPendingTitle(String mode, String symbol);

  /// N-20
  ///
  /// In en, this message translates to:
  /// **'Balance back to {amount_lamports}. Pending buys were cleared.'**
  String notifPracticeResetBody(String amount_lamports);

  /// N-20; placeholders = push vars (snake_case)
  ///
  /// In en, this message translates to:
  /// **'[PAPER] Check balance: Paper reset'**
  String get notifPracticeResetTitle;

  /// N-43
  ///
  /// In en, this message translates to:
  /// **'Open positions keep their exit plan · {actor_type, select, user {by you on {device_label}} other {by the system}}'**
  String notifRealBuysPausedBody(String actor_type, String device_label);

  /// N-43 RESERVED Phase 7; placeholders = wire vars (snake_case)
  ///
  /// In en, this message translates to:
  /// **'[REAL] Resume buying when ready: new buys stopped'**
  String get notifRealBuysPausedTitle;

  /// N-44
  ///
  /// In en, this message translates to:
  /// **'New buys run again now · {actor_type, select, user {by you on {device_label}} other {by the system}}'**
  String notifRealBuysResumedBody(String actor_type, String device_label);

  /// N-44 RESERVED Phase 7; placeholders = wire vars (snake_case)
  ///
  /// In en, this message translates to:
  /// **'[REAL] Check buys: new buys resumed'**
  String get notifRealBuysResumedTitle;

  /// N-39
  ///
  /// In en, this message translates to:
  /// **'+{amount_lamports} · balance {balance_lamports}'**
  String notifRealDepositDetectedBody(String amount_lamports, String balance_lamports);

  /// N-39 RESERVED Phase 7; placeholders = wire vars (snake_case)
  ///
  /// In en, this message translates to:
  /// **'[REAL] View deposit: received'**
  String get notifRealDepositDetectedTitle;

  /// N-31
  ///
  /// In en, this message translates to:
  /// **'{signer_state, select, revoked {Trading authority is still revoked · grant it again to continue} other {New Real buys run again now}}'**
  String notifRealKillSwitchClearedBody(String signer_state);

  /// N-31 RESERVED Phase 7; placeholders = wire vars (snake_case)
  ///
  /// In en, this message translates to:
  /// **'[REAL] Check Real: automatic stop cleared'**
  String get notifRealKillSwitchClearedTitle;

  /// N-29
  ///
  /// In en, this message translates to:
  /// **'{reason, select, policy_mismatch {Stopped automatically: wallet rules don’t match. New buys are blocked.} loss_velocity {Stopped automatically: losses grew too fast. New buys are blocked.} provider_error {Stopped automatically: provider/signer problem · only exits run.} other {Stopped automatically: a safety rule triggered. New buys are blocked.}}'**
  String notifRealKillSwitchTrippedBody(String reason);

  /// N-29 RESERVED Phase 7; placeholders = wire vars (snake_case)
  ///
  /// In en, this message translates to:
  /// **'[REAL] Review Real: trading stopped automatically'**
  String get notifRealKillSwitchTrippedTitle;

  /// N-27
  ///
  /// In en, this message translates to:
  /// **'{setting}: {from} → {to}'**
  String notifRealLimitChangedBody(String from, String setting, String to);

  /// N-27 RESERVED Phase 7; placeholders = wire vars (snake_case)
  ///
  /// In en, this message translates to:
  /// **'[REAL] Check limits: updated'**
  String get notifRealLimitChangedTitle;

  /// N-28
  ///
  /// In en, this message translates to:
  /// **'{setting}: {from} → {to} from {activates_at}, and it stays until you change it. Cancel if this wasn’t you.'**
  String notifRealLimitLoosenRequestedBody(String activates_at, String from, String setting, String to);

  /// N-28 RESERVED Phase 7; placeholders = wire vars (snake_case)
  ///
  /// In en, this message translates to:
  /// **'[REAL] Review limit change: pending'**
  String get notifRealLimitLoosenRequestedTitle;

  /// N-25
  ///
  /// In en, this message translates to:
  /// **'Matches what you approved.'**
  String get notifRealPolicyActivatedBody;

  /// N-25 RESERVED Phase 7; placeholders = wire vars (snake_case)
  ///
  /// In en, this message translates to:
  /// **'[REAL] Check wallet rules: v{version} active'**
  String notifRealPolicyActivatedTitle(String version);

  /// N-26
  ///
  /// In en, this message translates to:
  /// **'Real trading stopped for safety. Open the app to compare v{version}.'**
  String notifRealPolicyMismatchBody(String version);

  /// N-26 RESERVED Phase 7; placeholders = wire vars (snake_case)
  ///
  /// In en, this message translates to:
  /// **'[REAL] Compare wallet rules: they don’t match'**
  String get notifRealPolicyMismatchTitle;

  /// N-46
  ///
  /// In en, this message translates to:
  /// **'{sold_count,plural,one{{sold_count} of {requested_count} sold} other{{sold_count} of {requested_count} sold}}{failed_count,plural,one{ · {failed_count} failed: still open, its exit plan keeps running} other{ · {failed_count} failed: still open, their exit plans keep running} =0{}}'**
  String notifRealSellAllCompletedBody(int failed_count, int requested_count, int sold_count);

  /// N-46 RESERVED Phase 7; placeholders = wire vars (snake_case)
  ///
  /// In en, this message translates to:
  /// **'[REAL] {failed_count,plural,other{Retry sell all: {failed_count} failed} =0{View sell all: done}}'**
  String notifRealSellAllCompletedTitle(int failed_count);

  /// N-46 extra line, only when amount_out_lamports is not null (formatLamports)
  ///
  /// In en, this message translates to:
  /// **'Total out: {amount_out_lamports}'**
  String notifRealSellAllCompletedTotal(String amount_out_lamports);

  /// N-45
  ///
  /// In en, this message translates to:
  /// **'{requested_count,plural,one{Selling {requested_count} position at market.} other{Selling {requested_count} positions at market.}} Guards still apply.'**
  String notifRealSellAllRequestedBody(int requested_count);

  /// N-45 RESERVED Phase 7; placeholders = wire vars (snake_case)
  ///
  /// In en, this message translates to:
  /// **'[REAL] Track sell all: selling all positions'**
  String get notifRealSellAllRequestedTitle;

  /// N-23
  ///
  /// In en, this message translates to:
  /// **'The bot can swap within your limits until {expires_at}. It can’t transfer or withdraw.'**
  String notifRealSignerGrantedBody(String expires_at);

  /// N-23 RESERVED Phase 7; placeholders = wire vars (snake_case)
  ///
  /// In en, this message translates to:
  /// **'[REAL] Check trading authority: granted'**
  String get notifRealSignerGrantedTitle;

  /// N-24
  ///
  /// In en, this message translates to:
  /// **'{reason, select, user {You revoked it.} expiry {The authority expired.} other {Revoked.}} Real trading can’t sign until you authorize it again.'**
  String notifRealSignerRevokedBody(String reason);

  /// N-24 RESERVED Phase 7; placeholders = wire vars (snake_case)
  ///
  /// In en, this message translates to:
  /// **'[REAL] Grant authority again: bot authority revoked'**
  String get notifRealSignerRevokedTitle;

  /// N-41
  ///
  /// In en, this message translates to:
  /// **'{amount_lamports} arrived in your main wallet {address_short}.'**
  String notifRealWithdrawConfirmedBody(String address_short, String amount_lamports);

  /// N-41 RESERVED Phase 7; placeholders = wire vars (snake_case)
  ///
  /// In en, this message translates to:
  /// **'[REAL] View withdrawal: received'**
  String get notifRealWithdrawConfirmedTitle;

  /// N-42
  ///
  /// In en, this message translates to:
  /// **'{amount_lamports} wasn’t sent: {reason_code}. Your balance is unchanged.'**
  String notifRealWithdrawFailedBody(String amount_lamports, String reason_code);

  /// N-42 RESERVED Phase 7; placeholders = wire vars (snake_case)
  ///
  /// In en, this message translates to:
  /// **'[REAL] Check withdrawal: failed'**
  String get notifRealWithdrawFailedTitle;

  /// N-40
  ///
  /// In en, this message translates to:
  /// **'{amount_lamports} → main wallet {address_short}'**
  String notifRealWithdrawRequestedBody(String address_short, String amount_lamports);

  /// N-40 RESERVED Phase 7; placeholders = wire vars (snake_case)
  ///
  /// In en, this message translates to:
  /// **'[REAL] Track withdrawal: sent'**
  String get notifRealWithdrawRequestedTitle;

  /// N-32
  ///
  /// In en, this message translates to:
  /// **'{address_short} becomes active {usable_at}. Cancel before {cancel_until} if this wasn’t you.'**
  String notifRealWithdrawAddressAddedBody(String address_short, String cancel_until, String usable_at);

  /// N-32 RESERVED Phase 7; placeholders = wire vars (snake_case)
  ///
  /// In en, this message translates to:
  /// **'[REAL] Review new main wallet: registered'**
  String get notifRealWithdrawAddressAddedTitle;

  /// N-34
  ///
  /// In en, this message translates to:
  /// **'{address_short} won’t be added.'**
  String notifRealWithdrawAddressCancelledBody(String address_short);

  /// N-34 RESERVED Phase 7; placeholders = wire vars (snake_case)
  ///
  /// In en, this message translates to:
  /// **'[REAL] Check main wallet: change cancelled'**
  String get notifRealWithdrawAddressCancelledTitle;

  /// N-33
  ///
  /// In en, this message translates to:
  /// **'{address_short} is now your main wallet and withdraw destination.'**
  String notifRealWithdrawAddressUsableBody(String address_short);

  /// N-33 RESERVED Phase 7; placeholders = wire vars (snake_case)
  ///
  /// In en, this message translates to:
  /// **'[REAL] Check main wallet: active'**
  String get notifRealWithdrawAddressUsableTitle;

  /// N-06
  ///
  /// In en, this message translates to:
  /// **'Reason: {reason}'**
  String notifSkippedBody(String reason);

  /// N-06; placeholders = push vars (snake_case)
  ///
  /// In en, this message translates to:
  /// **'View {symbol}: skipped'**
  String notifSkippedTitle(String symbol);

  /// N-09
  ///
  /// In en, this message translates to:
  /// **'{stop_type} · {pnl} ({pct})'**
  String notifSlHitBody(String pct, String pnl, String stop_type);

  /// N-09; placeholders = push vars (snake_case)
  ///
  /// In en, this message translates to:
  /// **'[{mode, select, real {REAL} other {PAPER}}] Check {symbol}: stop loss hit'**
  String notifSlHitTitle(String mode, String symbol);

  /// N-17
  ///
  /// In en, this message translates to:
  /// **'Open the app to continue'**
  String get notifTokenInvalidBody;

  /// N-17; placeholders = push vars (snake_case)
  ///
  /// In en, this message translates to:
  /// **'Open the app: notification action expired'**
  String get notifTokenInvalidTitle;

  /// N-08
  ///
  /// In en, this message translates to:
  /// **'Sold {pct_sold} at +{pct} · {pnl}'**
  String notifTpHitBody(String pct, String pct_sold, String pnl);

  /// N-08; placeholders = push vars (snake_case)
  ///
  /// In en, this message translates to:
  /// **'[{mode, select, real {REAL} other {PAPER}}] Check {symbol}: take profit hit'**
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
  /// **'This strategy is not approved for Real mode'**
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

  /// pnl = pnlSol, pct = pnlPct (signed, T-15), range = common.range.* label
  ///
  /// In en, this message translates to:
  /// **'{pnl} ({pct}) · {range}'**
  String portfolioBalanceChange(String pct, String pnl, String range);

  /// privacy toggle (tap to reveal)
  ///
  /// In en, this message translates to:
  /// **'Balance hidden'**
  String get portfolioBalanceHidden;

  /// hero balance on Home/Dashboard
  ///
  /// In en, this message translates to:
  /// **'{mode, select, real {Balance} other {Paper balance}}'**
  String portfolioBalanceLabel(String mode);

  /// portfolio.balance.updated
  ///
  /// In en, this message translates to:
  /// **'Updated {time}'**
  String portfolioBalanceUpdated(String time);

  /// sparkline is decorative; this is its text alternative
  ///
  /// In en, this message translates to:
  /// **'Balance {trend, select, up {up} down {down} other {unchanged}} over {range}, from {start} to {end}'**
  String portfolioSparklineA11y(String end, String range, String start, String trend);

  /// positions.caption.next_tp: compact caption under the exit progress bar
  ///
  /// In en, this message translates to:
  /// **'next TP{n} +{pct}%'**
  String positionsCaptionNextTp(String n, String pct);

  /// positions.caption.stop_loss
  ///
  /// In en, this message translates to:
  /// **'SL −{pct}%'**
  String positionsCaptionStopLoss(String pct);

  /// positions.caption.tp_filled
  ///
  /// In en, this message translates to:
  /// **'TP{n} ✓'**
  String positionsCaptionTpFilled(String n);

  /// positions.caption.trail_armed
  ///
  /// In en, this message translates to:
  /// **'trail armed'**
  String get positionsCaptionTrailArmed;

  /// positions.caption.trail_armed_pct
  ///
  /// In en, this message translates to:
  /// **'trail −{pct}% armed'**
  String positionsCaptionTrailArmedPct(String pct);

  /// positions.caption.trail_off
  ///
  /// In en, this message translates to:
  /// **'trail off'**
  String get positionsCaptionTrailOff;

  /// 0.4.9 G1: accessible name of the Comfortable/Compact segmented control in a table card header (role=radiogroup); options = settings.appearance.density.*
  ///
  /// In en, this message translates to:
  /// **'Table density'**
  String get positionsDensityLabel;

  /// positions.empty
  ///
  /// In en, this message translates to:
  /// **'{mode, select, real {No open positions} other {No paper positions}}'**
  String positionsEmpty(String mode);

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

  /// 0.4.9 G1: chip on each position affected by an auto-trip policy_mismatch (exit plan, TP and SL held until re-grant); never color-only
  ///
  /// In en, this message translates to:
  /// **'Exits on hold'**
  String get positionsExitHeldBadge;

  /// 0.4.9 G1 policy_mismatch banner body
  ///
  /// In en, this message translates to:
  /// **'Exit plans, TP and SL are on hold until you grant trading authority again.'**
  String get positionsExitHeldDetail;

  /// position detail: exit plan name
  ///
  /// In en, this message translates to:
  /// **'Exit plan · {name}'**
  String positionsExitPlanTitle(String name);

  /// screen-reader label on the exit progress bar; next is empty or positionsExitSemanticsNext
  ///
  /// In en, this message translates to:
  /// **'Exit plan: stop loss {sl}%, now {now}%, {filled} of {total} take profits filled{next}'**
  String positionsExitSemantics(String sl, String now, String filled, String total, String next);

  /// suffix for positionsExitSemantics when a rung is next
  ///
  /// In en, this message translates to:
  /// **', next +{pct}%'**
  String positionsExitSemanticsNext(String pct);

  /// exit ladder status: trail / stop loss active
  ///
  /// In en, this message translates to:
  /// **'armed'**
  String get positionsLadderArmed;

  /// exit ladder: TP rung already filled
  ///
  /// In en, this message translates to:
  /// **'filled {time}'**
  String positionsLadderFilledAt(String time);

  /// exit ladder: the next TP rung
  ///
  /// In en, this message translates to:
  /// **'next'**
  String get positionsLadderNext;

  /// exit ladder: current price row
  ///
  /// In en, this message translates to:
  /// **'Now'**
  String get positionsLadderNow;

  /// exit ladder: TP rung not reached yet
  ///
  /// In en, this message translates to:
  /// **'waiting'**
  String get positionsLadderPending;

  /// exit ladder: take-profit rung label
  ///
  /// In en, this message translates to:
  /// **'TP{n} · sell {pct}%'**
  String positionsLadderTp(String n, String pct);

  /// exit ladder: trailing stop row
  ///
  /// In en, this message translates to:
  /// **'Trailing −{pct}% from high'**
  String positionsLadderTrail(String pct);

  /// exit ladder: trailing stop not armed until TP1 fills
  ///
  /// In en, this message translates to:
  /// **'active after TP1'**
  String get positionsLadderTrailAfterTp1;

  /// positions.next_action
  ///
  /// In en, this message translates to:
  /// **'Next: {rung} at {gain} (sell {pct})'**
  String positionsNextAction(String gain, String pct, String rung);

  /// position detail: no TP rung left, trailing stop is the next action
  ///
  /// In en, this message translates to:
  /// **'Next: trailing −{pct}% from high'**
  String positionsNextTrailing(String pct);

  /// positions.open_count
  ///
  /// In en, this message translates to:
  /// **'{count,plural,one{{count} open} other{{count} open}}'**
  String positionsOpenCount(int count);

  /// 0.4.10 G1-blue v2: PnL block label; number = pnlSol (only colored element)
  ///
  /// In en, this message translates to:
  /// **'Unrealized PnL'**
  String get positionsPnlUnrealized;

  /// biometric approval action label for a real sell
  ///
  /// In en, this message translates to:
  /// **'Sell {pct}% {symbol} (Real SOL)'**
  String positionsSellConfirmAction(String pct, String symbol);

  /// positions.sell.confirm_title
  ///
  /// In en, this message translates to:
  /// **'Confirm sell'**
  String get positionsSellConfirmTitle;

  /// positions.sell.estimate
  ///
  /// In en, this message translates to:
  /// **'Estimated proceeds'**
  String get positionsSellEstimate;

  /// positions.sell.estimate value; amount excludes the unit, unit = commonUnitSol / commonUnitPaperSol
  ///
  /// In en, this message translates to:
  /// **'≈ {amount} {unit}'**
  String positionsSellEstimateValue(String amount, String unit);

  /// positions.sell.fees.practice
  ///
  /// In en, this message translates to:
  /// **'Simulation: 0% slippage · fee {fee}%'**
  String positionsSellFeesPractice(String fee);

  /// positions.sell.fees.real
  ///
  /// In en, this message translates to:
  /// **'Max slippage 3% · automatic priority fee · fee {fee}%'**
  String positionsSellFeesReal(String fee);

  /// sell success snackbar
  ///
  /// In en, this message translates to:
  /// **'Sold {pct}% {symbol} · ≈ {amount} {unit}'**
  String positionsSellFilled(String pct, String symbol, String amount, String unit);

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

  /// 0.4.9 G1: per-row action while exits are on hold; signed in Phantom (not the bot signer). Label of the action, not exit_reason.manual
  ///
  /// In en, this message translates to:
  /// **'Sell manually'**
  String get positionsSellManual;

  /// 0.4.9 G1 policy_mismatch banner
  ///
  /// In en, this message translates to:
  /// **'Manual selling still works, signed in Phantom.'**
  String get positionsSellManualNote;

  /// positions.sell.never_from_notification
  ///
  /// In en, this message translates to:
  /// **'Selling is never available from a notification or popup.'**
  String get positionsSellNeverFromNotification;

  /// positions.sell.not_tradeable_detail
  ///
  /// In en, this message translates to:
  /// **'This position no longer has a SOL pair, so selling is blocked until one exists.'**
  String get positionsSellNotTradeableDetail;

  /// sell accepted without proceeds in the response
  ///
  /// In en, this message translates to:
  /// **'Sell order {pct}% {symbol} sent'**
  String positionsSellOrderSent(String pct, String symbol);

  /// positions.sell.plan_cancelled
  ///
  /// In en, this message translates to:
  /// **'Exit plan cancelled (100%)'**
  String get positionsSellPlanCancelled;

  /// seconds = computed from quote expiry − (now + skew)
  ///
  /// In en, this message translates to:
  /// **'Quote valid for {seconds} s.'**
  String positionsSellQuoteTtl(String seconds);

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

  /// disabled, labelled CTA (not tradeable)
  ///
  /// In en, this message translates to:
  /// **'Sell — not available'**
  String get positionsSellUnavailable;

  /// 0.4.10 G1-blue v2
  ///
  /// In en, this message translates to:
  /// **'Position age'**
  String get positionsStatsAge;

  /// 0.4.10 G1-blue v2
  ///
  /// In en, this message translates to:
  /// **'Entry price'**
  String get positionsStatsEntryPrice;

  /// 0.4.10 G1-blue v2
  ///
  /// In en, this message translates to:
  /// **'Market cap'**
  String get positionsStatsMcap;

  /// 0.4.10 G1-blue v2
  ///
  /// In en, this message translates to:
  /// **'Amount'**
  String get positionsStatsQty;

  /// 0.4.10 G1-blue v2
  ///
  /// In en, this message translates to:
  /// **'Stats'**
  String get positionsStatsTitle;

  /// 0.4.10 G1-blue v2
  ///
  /// In en, this message translates to:
  /// **'Value / cost'**
  String get positionsStatsValueCost;

  /// 0.4.10 G1-blue v2
  ///
  /// In en, this message translates to:
  /// **'Volume 24h'**
  String get positionsStatsVolume24h;

  /// position detail: time stop still ahead
  ///
  /// In en, this message translates to:
  /// **'Time stop {time} WIB ({countdown} left)'**
  String positionsTimeStopAt(String time, String countdown);

  /// position detail: time stop already passed
  ///
  /// In en, this message translates to:
  /// **'Time stop passed · exit on the next tick'**
  String get positionsTimeStopOverdue;

  /// positions.title
  ///
  /// In en, this message translates to:
  /// **'Positions'**
  String get positionsTitle;

  /// Practice section header
  ///
  /// In en, this message translates to:
  /// **'Positions (paper)'**
  String get positionsTitlePaper;

  /// 0.4.10 G1-blue v2
  ///
  /// In en, this message translates to:
  /// **'Thin line = previous value. Applies to the rest of the position; sends no transaction.'**
  String get positionsTpslNote;

  /// 0.4.10 G1-blue v2
  ///
  /// In en, this message translates to:
  /// **'Reset'**
  String get positionsTpslReset;

  /// 0.4.10 G1-blue v2
  ///
  /// In en, this message translates to:
  /// **'Save exit plan'**
  String get positionsTpslSave;

  /// 0.4.10 G1-blue v2: pct integer as text
  ///
  /// In en, this message translates to:
  /// **'sell {pct}%'**
  String positionsTpslSellPct(String pct);

  /// 0.4.10 G1-blue v2
  ///
  /// In en, this message translates to:
  /// **'Stop loss'**
  String get positionsTpslStopLoss;

  /// 0.4.10 G1-blue v2: n = ladder rung number
  ///
  /// In en, this message translates to:
  /// **'Take profit {n}'**
  String positionsTpslTakeProfit(String n);

  /// 0.4.10 G1-blue v2
  ///
  /// In en, this message translates to:
  /// **'Edit TP / SL'**
  String get positionsTpslTitle;

  /// 0.4.10 G1-blue v2: previous value marker
  ///
  /// In en, this message translates to:
  /// **'was {value}'**
  String positionsTpslWas(String value);

  /// queue.batch.approve
  ///
  /// In en, this message translates to:
  /// **'{count,plural,one{Approve {count} pick} other{Approve {count} picks}}'**
  String queueBatchApprove(int count);

  /// batch approve never includes not-tradeable picks
  ///
  /// In en, this message translates to:
  /// **'{count,plural,one{{count} pick left out: not tradeable} other{{count} picks left out: not tradeable}}'**
  String queueBatchExcludedNotTradeable(int count);

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

  /// dev/mock suffix stays app-local
  ///
  /// In en, this message translates to:
  /// **'No pending picks'**
  String get queueEmpty;

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

  /// ProposalKind sell_position (contracts 1.1.5)
  ///
  /// In en, this message translates to:
  /// **'Sell'**
  String get queuePickKindSellPosition;

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

  /// 0.4.9 G1 Real approval card/queue hint when the pick is inside the wallet limits (hold only, no Phantom step)
  ///
  /// In en, this message translates to:
  /// **'Within limits: just hold, no Phantom.'**
  String get queueRealWithinLimits;

  /// queue.skip_reason.already_pumped
  ///
  /// In en, this message translates to:
  /// **'Already pumped'**
  String get queueSkipReasonAlreadyPumped;

  /// preselected skip reason for UNSUPPORTED_QUOTE_MINT picks; wire reject_reason=not_tradeable (contracts 1.1.3)
  ///
  /// In en, this message translates to:
  /// **'Not tradeable'**
  String get queueSkipReasonNotTradeable;

  /// queue.skip_reason.other
  ///
  /// In en, this message translates to:
  /// **'Other…'**
  String get queueSkipReasonOther;

  /// chip → wire reject_reason price_moved
  ///
  /// In en, this message translates to:
  /// **'Price moved'**
  String get queueSkipReasonPriceMoved;

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
  String queueTabWithCount(int count, String label);

  /// queue.title
  ///
  /// In en, this message translates to:
  /// **'Approval queue'**
  String get queueTitle;

  /// tab / compact header; full title = queue.title
  ///
  /// In en, this message translates to:
  /// **'Queue'**
  String get queueTitleShort;

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

  /// 0.4.10 G1-blue v2
  ///
  /// In en, this message translates to:
  /// **'Done'**
  String get receiptDone;

  /// 0.4.10 G1-blue v2
  ///
  /// In en, this message translates to:
  /// **'Exit plan armed'**
  String get receiptExitPlanArmed;

  /// 0.4.10 G1-blue v2
  ///
  /// In en, this message translates to:
  /// **'Fees'**
  String get receiptFees;

  /// 0.4.10 G1-blue v2
  ///
  /// In en, this message translates to:
  /// **'Paid'**
  String get receiptPaid;

  /// 0.4.10 G1-blue v2
  ///
  /// In en, this message translates to:
  /// **'Received'**
  String get receiptReceived;

  /// 0.4.10 G1-blue v2: receipt card after a fill
  ///
  /// In en, this message translates to:
  /// **'Bought {symbol}'**
  String receiptTitleBuy(String symbol);

  /// 0.4.10 G1-blue v2
  ///
  /// In en, this message translates to:
  /// **'Sold {symbol}'**
  String receiptTitleSell(String symbol);

  /// 0.4.10 G1-blue v2
  ///
  /// In en, this message translates to:
  /// **'View transaction'**
  String get receiptViewTx;

  /// wire ApprovalRejectReason not_tradeable (proposal.rejected.reject_reason, audit approval.reject)
  ///
  /// In en, this message translates to:
  /// **'Not tradeable'**
  String get rejectReasonNotTradeable;

  /// wire ApprovalRejectReason other (proposal.rejected.reject_reason, audit approval.reject)
  ///
  /// In en, this message translates to:
  /// **'Other'**
  String get rejectReasonOther;

  /// wire ApprovalRejectReason price_moved (proposal.rejected.reject_reason, audit approval.reject)
  ///
  /// In en, this message translates to:
  /// **'Price moved'**
  String get rejectReasonPriceMoved;

  /// wire ApprovalRejectReason user_declined (proposal.rejected.reject_reason, audit approval.reject)
  ///
  /// In en, this message translates to:
  /// **'Skipped by you'**
  String get rejectReasonUserDeclined;

  /// value = formatLamports(est_ata_rent_lamports); row hidden when "0" (showAtaRent)
  ///
  /// In en, this message translates to:
  /// **'Token account rent (new)'**
  String get reviewAtaRent;

  /// 0.4.10 G1-blue v2: approval quote card title; symbol untrusted
  ///
  /// In en, this message translates to:
  /// **'Approve buying {symbol}'**
  String reviewBuyTitle(String symbol);

  /// collapsible row label (mobile)
  ///
  /// In en, this message translates to:
  /// **'Fees & slippage'**
  String get reviewDetailsToggle;

  /// time = formatTime(quote_ts)
  ///
  /// In en, this message translates to:
  /// **'Estimates as of {time}. Final values can change with the price.'**
  String reviewEstimateNote(String time);

  /// label
  ///
  /// In en, this message translates to:
  /// **'Min. received'**
  String get reviewMinReceived;

  /// min_out = formatRawQty(min_out_raw, decimals); decimals from ApprovalWire (1.1.5); symbol untrusted. Missing value or decimals → whole row shows —
  ///
  /// In en, this message translates to:
  /// **'≥ {min_out} {symbol}'**
  String reviewMinReceivedValue(String min_out, String symbol);

  /// value = formatLamportsOrDash(est_network_fee_lamports); base + priority fee (contracts 1.1.4)
  ///
  /// In en, this message translates to:
  /// **'Est. network fee'**
  String get reviewNetworkFee;

  /// sub-line of review.network_fee; base/priority = networkFeeParts() formatted with formatLamports
  ///
  /// In en, this message translates to:
  /// **'base {base} + priority {priority}'**
  String reviewNetworkFeeBreakdown(String base, String priority);

  /// review.practice_note
  ///
  /// In en, this message translates to:
  /// **'Paper: simulated fill. No real SOL moves.'**
  String get reviewPracticeNote;

  /// value = price_sol
  ///
  /// In en, this message translates to:
  /// **'Price'**
  String get reviewPrice;

  /// pct = pnlPct (signed)
  ///
  /// In en, this message translates to:
  /// **'Price moved {pct} since this pick. Review again before approving.'**
  String reviewPriceMoved(String pct);

  /// value = formatLamportsOrDash(priority_fee_lamports); breakdown only: already inside est_network_fee_lamports, never add it again (1.1.5)
  ///
  /// In en, this message translates to:
  /// **'Priority fee'**
  String get reviewPriorityFee;

  /// 0.4.9 G1 quote row next to review.quote.refresh; age_seconds = now − quote_ts, valid_seconds = quoteState().expiresInS (skew-corrected, integers as text)
  ///
  /// In en, this message translates to:
  /// **'Quote {age_seconds} s old · valid {valid_seconds} s'**
  String reviewQuoteAgeValid(String age_seconds, String valid_seconds);

  /// once per expiry while the sheet is visible and not held (GET auto-refreshes a stale quote)
  ///
  /// In en, this message translates to:
  /// **'Refreshing automatically…'**
  String get reviewQuoteAutoRefreshing;

  /// quote_id changed (quoteChanged) while a Real hold is in progress: cancel the hold, reset the bar; next approve sends the new expected_quote_id. Rev is unchanged (1.1.5)
  ///
  /// In en, this message translates to:
  /// **'Quote changed. Check the new values and hold again.'**
  String get reviewQuoteChangedDuringHold;

  /// 0.4.10 G1-blue v2: disclosure; holds min received, fees, ATA rent, total max
  ///
  /// In en, this message translates to:
  /// **'Details'**
  String get reviewQuoteDetails;

  /// 0.4.10 G1-blue v2: approval card countdown (review.quote.expires_in stays the seconds plural)
  ///
  /// In en, this message translates to:
  /// **'{mm_ss} until it expires'**
  String reviewQuoteExpiresCountdown(String mm_ss);

  /// seconds = quoteState().expiresInS; shown while fresh
  ///
  /// In en, this message translates to:
  /// **'{seconds,plural,one{Expires in {seconds} s} other{Expires in {seconds} s}}'**
  String reviewQuoteExpiresIn(int seconds);

  /// quote_id shortened with formatIdShort (first 6 chars); diagnostics row, muted
  ///
  /// In en, this message translates to:
  /// **'Quote {quote_id}'**
  String reviewQuoteId(String quote_id);

  /// Real: quoteState().complete=false; skeleton rows
  ///
  /// In en, this message translates to:
  /// **'Hold is off until the quote is complete.'**
  String get reviewQuoteLoading;

  /// Real: all quote fields null; hold/Approve disabled
  ///
  /// In en, this message translates to:
  /// **'No quote yet — refresh to continue'**
  String get reviewQuoteMissing;

  /// Practice is never blocked by a missing/stale quote
  ///
  /// In en, this message translates to:
  /// **'Estimate expired. Paper can still approve; values may differ.'**
  String get reviewQuotePracticeStale;

  /// 0.4.10 G1-blue v2: rate = formatRawQty
  ///
  /// In en, this message translates to:
  /// **'1 SOL = {rate} {symbol}'**
  String reviewQuoteRate(String rate, String symbol);

  /// CTA: POST …/approvals/{id}/quote (1.1.5; max 1 per 3 s, inside the window returns the existing quote → spinner ≤ 3 s, no error)
  ///
  /// In en, this message translates to:
  /// **'Refresh quote'**
  String get reviewQuoteRefresh;

  /// CTA busy state; values keep their old text, muted
  ///
  /// In en, this message translates to:
  /// **'Refreshing quote…'**
  String get reviewQuoteRefreshing;

  /// Real: hold/Approve replaced by review.quote.refresh until a fresh quote (409 QUOTE_MISSING_OR_STALE otherwise)
  ///
  /// In en, this message translates to:
  /// **'Quote expired — refresh to continue'**
  String get reviewQuoteStale;

  /// 0.4.10 G1-blue v2: verb-first stale state
  ///
  /// In en, this message translates to:
  /// **'Refresh the quote, then re-check the values before approving.'**
  String get reviewQuoteStaleAction;

  /// seconds = quoteState().ageS (server_now − quote_ts)
  ///
  /// In en, this message translates to:
  /// **'{seconds,plural,one{Quote updated {seconds} s ago} other{Quote updated {seconds} s ago} =0{Quote updated just now}}'**
  String reviewQuoteUpdatedAgo(int seconds);

  /// proposal.updated with a NEW quote_id (rev unchanged, 1.1.5): subtle inline label ~2 s, polite live region; no toast/push
  ///
  /// In en, this message translates to:
  /// **'Quote updated'**
  String get reviewQuoteUpdatedInline;

  /// 0.4.10 G1-blue v2
  ///
  /// In en, this message translates to:
  /// **'You pay'**
  String get reviewQuoteYouPay;

  /// 0.4.10 G1-blue v2
  ///
  /// In en, this message translates to:
  /// **'You receive (estimate)'**
  String get reviewQuoteYouReceiveEst;

  /// review.real_note
  ///
  /// In en, this message translates to:
  /// **'Real SOL: network fees are paid even if the order fails.'**
  String get reviewRealNote;

  /// value = formatBps(max_slippage_bps)
  ///
  /// In en, this message translates to:
  /// **'Max slippage'**
  String get reviewSlippage;

  /// value = formatBps(swap_fee_bps); taken from SOL in, not added to the total (1.1.5)
  ///
  /// In en, this message translates to:
  /// **'Swap fee'**
  String get reviewSwapFee;

  /// sub-line of review.swap_fee
  ///
  /// In en, this message translates to:
  /// **'taken from SOL in, not added'**
  String get reviewSwapFeeFromInput;

  /// transaction review sheet before Approve/Sell
  ///
  /// In en, this message translates to:
  /// **'{side, select, sell {Review sell} other {Review buy}}'**
  String reviewTitle(String side);

  /// value = formatLamportsOrDash(total_max_lamports) = SOL in + est_network_fee + est_ata_rent (1.1.5); check with totalMaxCheck()
  ///
  /// In en, this message translates to:
  /// **'Total (max)'**
  String get reviewTotalMax;

  /// formula sub-line under review.total_max
  ///
  /// In en, this message translates to:
  /// **'= SOL in + network fee + token account rent'**
  String get reviewTotalMaxHint;

  /// value = formatLamports(amount_lamports)
  ///
  /// In en, this message translates to:
  /// **'You pay'**
  String get reviewYouPay;

  /// 0.4.10 G1-blue v2: accessible name of the risk chip
  ///
  /// In en, this message translates to:
  /// **'{label}: {used} of {limit} SOL used'**
  String riskChipA11y(String label, String limit, String used);

  /// 0.4.10 G1-blue v2
  ///
  /// In en, this message translates to:
  /// **'Daily limit'**
  String get riskChipDailyLimit;

  /// 0.4.10 G1-blue v2: risk chip label; always with shield icon
  ///
  /// In en, this message translates to:
  /// **'Guard'**
  String get riskChipGuard;

  /// 0.4.10 G1-blue v2: formatted SOL values
  ///
  /// In en, this message translates to:
  /// **'{used}/{limit}'**
  String riskChipUsage(String limit, String used);

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

  /// screener.detail.chart_note
  ///
  /// In en, this message translates to:
  /// **'Chart and metrics stay visible (read-only).'**
  String get screenerDetailChartNote;

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

  /// not tradeable: score shown for transparency only
  ///
  /// In en, this message translates to:
  /// **'{score} / {max_score} (info only)'**
  String screenerDetailScoreValueInfo(String max_score, String score);

  /// Rev 4.4 decision: Skip allowed on not-tradeable picks, Approve absent/disabled
  ///
  /// In en, this message translates to:
  /// **'You can still skip it. Skipping isn’t a trade.'**
  String get screenerDetailSkipHint;

  /// screener.detail.sol_pair
  ///
  /// In en, this message translates to:
  /// **'SOL pair'**
  String get screenerDetailSolPair;

  /// screener.empty
  ///
  /// In en, this message translates to:
  /// **'No screened coins yet'**
  String get screenerEmpty;

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

  /// screener footer legend (user-facing)
  ///
  /// In en, this message translates to:
  /// **'Red marks risk (guard fail, rug, loss). Grey “Not tradeable” coins have no SOL pair: they can’t be approved, but you can skip them.'**
  String get screenerLegend;

  /// neutral chip (text.tertiary on surface.sunken), not loss/error red
  ///
  /// In en, this message translates to:
  /// **'Not tradeable'**
  String get screenerNotTradeableBadge;

  /// shown instead of Approve/Skip; reason_code UNSUPPORTED_QUOTE_MINT
  ///
  /// In en, this message translates to:
  /// **'No SOL quote pair for this coin. Centurion Trade only trades SOL pairs, so it can’t be approved.'**
  String get screenerNotTradeableDetail;

  /// screener.status.passed
  ///
  /// In en, this message translates to:
  /// **'Passed'**
  String get screenerStatusPassed;

  /// passed screener, guard not finished
  ///
  /// In en, this message translates to:
  /// **'Awaiting guard'**
  String get screenerStatusPendingGuard;

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

  /// 0.4.9 G1: also the table header toggle
  ///
  /// In en, this message translates to:
  /// **'Comfortable'**
  String get settingsAppearanceDensityComfortable;

  /// 0.4.9 G1: also the table header toggle (Desktop/Web only; mobile has no compact mode)
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
  /// **'Allow Approve from notifications (Paper only)'**
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

  /// stepup.both_required
  ///
  /// In en, this message translates to:
  /// **'Two signatures, both required'**
  String get stepupBothRequired;

  /// default on Linux; offered when in-app WebAuthn fails
  ///
  /// In en, this message translates to:
  /// **'Continue in browser'**
  String get stepupBrowserContinue;

  /// stepup.browser.done
  ///
  /// In en, this message translates to:
  /// **'Confirmed. You’re back in the app.'**
  String get stepupBrowserDone;

  /// one-time code older than 2 min
  ///
  /// In en, this message translates to:
  /// **'The confirmation expired. Start again.'**
  String get stepupBrowserExpired;

  /// stepup.browser.reopen
  ///
  /// In en, this message translates to:
  /// **'Reopen browser'**
  String get stepupBrowserReopen;

  /// PKCE state mismatch; nothing runs
  ///
  /// In en, this message translates to:
  /// **'Blocked: this confirmation didn’t come from this app.'**
  String get stepupBrowserStateMismatch;

  /// stepup.browser.timeout
  ///
  /// In en, this message translates to:
  /// **'No answer from the browser in 5 min, so it was cancelled.'**
  String get stepupBrowserTimeout;

  /// stepup.browser.waiting
  ///
  /// In en, this message translates to:
  /// **'Finish in your browser, then come back.'**
  String get stepupBrowserWaiting;

  /// Phantom rejected or passkey cancelled
  ///
  /// In en, this message translates to:
  /// **'Nothing changed.'**
  String get stepupCancelled;

  /// step-up preview row label
  ///
  /// In en, this message translates to:
  /// **'Action'**
  String get stepupFieldAction;

  /// step-up preview row label
  ///
  /// In en, this message translates to:
  /// **'Amount'**
  String get stepupFieldAmount;

  /// step-up preview row label
  ///
  /// In en, this message translates to:
  /// **'Expires'**
  String get stepupFieldExpires;

  /// step-up preview row label
  ///
  /// In en, this message translates to:
  /// **'From'**
  String get stepupFieldFrom;

  /// step-up preview row label
  ///
  /// In en, this message translates to:
  /// **'Nonce'**
  String get stepupFieldNonce;

  /// step-up preview row label
  ///
  /// In en, this message translates to:
  /// **'Payload hash'**
  String get stepupFieldPayloadHash;

  /// step-up preview row label
  ///
  /// In en, this message translates to:
  /// **'To'**
  String get stepupFieldTo;

  /// stepup.passkey.step
  ///
  /// In en, this message translates to:
  /// **'2 · Owner passkey'**
  String get stepupPasskeyStep;

  /// stepup.passkey.use
  ///
  /// In en, this message translates to:
  /// **'Use passkey'**
  String get stepupPasskeyUse;

  /// stepup.passkey.waiting
  ///
  /// In en, this message translates to:
  /// **'Waiting for passkey…'**
  String get stepupPasskeyWaiting;

  /// stepup.phantom.open
  ///
  /// In en, this message translates to:
  /// **'Open Phantom to sign'**
  String get stepupPhantomOpen;

  /// signs payload_hash (readable text message)
  ///
  /// In en, this message translates to:
  /// **'1 · Phantom signature'**
  String get stepupPhantomStep;

  /// mm_ss = step-up expiry (2 min) via formatCountdown
  ///
  /// In en, this message translates to:
  /// **'Waiting for Phantom… {mm_ss} left'**
  String stepupPhantomWaiting(String mm_ss);

  /// stepup.title
  ///
  /// In en, this message translates to:
  /// **'Confirm money action'**
  String get stepupTitle;

  /// stepup.totp_optional
  ///
  /// In en, this message translates to:
  /// **'TOTP is optional and doesn’t replace either signature.'**
  String get stepupTotpOptional;

  /// 0.4.10 G1-blue v2
  ///
  /// In en, this message translates to:
  /// **'In Paper, hold 1.2 s. In Real, hold 2.5 s.'**
  String get strategyApprovalHoldNote;

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

  /// 0.4.10 G1-blue v2: mobile secondary action
  ///
  /// In en, this message translates to:
  /// **'Edit parameters'**
  String get strategyEditParams;

  /// 0.4.10 G1-blue v2
  ///
  /// In en, this message translates to:
  /// **'Strategy editor'**
  String get strategyEditorEyebrow;

  /// 0.4.10 G1-blue v2: rev = next strategy revision (integer)
  ///
  /// In en, this message translates to:
  /// **'Saved as rev {rev} · applies to the next pick'**
  String strategyEditorRevNote(String rev);

  /// 0.4.10 G1-blue v2
  ///
  /// In en, this message translates to:
  /// **'Approval'**
  String get strategyEditorSectionApproval;

  /// 0.4.10 G1-blue v2
  ///
  /// In en, this message translates to:
  /// **'Entry'**
  String get strategyEditorSectionEntry;

  /// 0.4.10 G1-blue v2
  ///
  /// In en, this message translates to:
  /// **'Exit plan'**
  String get strategyEditorSectionExit;

  /// 0.4.10 G1-blue v2
  ///
  /// In en, this message translates to:
  /// **'Mode'**
  String get strategyListColMode;

  /// 0.4.10 G1-blue v2
  ///
  /// In en, this message translates to:
  /// **'Status'**
  String get strategyListColStatus;

  /// 0.4.10 G1-blue v2
  ///
  /// In en, this message translates to:
  /// **'Strategy'**
  String get strategyListColStrategy;

  /// 0.4.10 G1-blue v2: segmented filter; count = integer as text
  ///
  /// In en, this message translates to:
  /// **'All · {count}'**
  String strategyListFilterAll(int count);

  /// 0.4.10 G1-blue v2: wire mode practice
  ///
  /// In en, this message translates to:
  /// **'Paper · {count}'**
  String strategyListFilterPaper(int count);

  /// 0.4.10 G1-blue v2
  ///
  /// In en, this message translates to:
  /// **'Real · {count}'**
  String strategyListFilterReal(int count);

  /// 0.4.10 G1-blue v2: column header; value in the strategy's mode unit (SOL / paper SOL)
  ///
  /// In en, this message translates to:
  /// **'7-day PnL'**
  String get strategyListPnl7d;

  /// 0.4.10 G1-blue v2: mobile header subline
  ///
  /// In en, this message translates to:
  /// **'{real_count} Real · {paper_count} Paper'**
  String strategyListSummary(int paper_count, int real_count);

  /// 0.4.10 G1-blue v2: strategies page headline
  ///
  /// In en, this message translates to:
  /// **'Every strategy runs in Paper or Real.'**
  String get strategyListTitle;

  /// 0.4.10 G1-blue v2
  ///
  /// In en, this message translates to:
  /// **'Strategy mode'**
  String get strategyModeLabel;

  /// 0.4.10 G1-blue v2: per-strategy mode chip (Practice cyan stripe treatment); wire mode practice; never translated
  ///
  /// In en, this message translates to:
  /// **'Paper'**
  String get strategyModePaper;

  /// 0.4.10 G1-blue v2: Paper option in the mode selector
  ///
  /// In en, this message translates to:
  /// **'Runs with paper SOL. No real SOL, no Phantom.'**
  String get strategyModePaperDesc;

  /// 0.4.10 G1-blue v2: per-strategy mode chip (magenta); never translated
  ///
  /// In en, this message translates to:
  /// **'Real'**
  String get strategyModeReal;

  /// 0.4.10 G1-blue v2
  ///
  /// In en, this message translates to:
  /// **'Mode applies per strategy. Open positions keep their original mode.'**
  String get strategyModeScopeNote;

  /// 0.4.10 G1-blue v2
  ///
  /// In en, this message translates to:
  /// **'New strategy'**
  String get strategyNew;

  /// 0.4.10 G1-blue v2: when days_required = null (threshold not set)
  ///
  /// In en, this message translates to:
  /// **'{days_done,plural,one{{days_done} day} other{{days_done} days}} in Paper'**
  String strategyRealGateDaysDone(int days_done);

  /// 0.4.10 G1-blue v2: any *_required = null; never assume a number
  ///
  /// In en, this message translates to:
  /// **'Rule not set yet'**
  String get strategyRealGateNotSet;

  /// 0.4.10 G1-blue v2: paper_progress (contracts 1.1.6); only when days_required != null. Rule is a placeholder until Boss decides
  ///
  /// In en, this message translates to:
  /// **'{days_done}/{days_required} days'**
  String strategyRealGateProgressDays(String days_done, String days_required);

  /// 0.4.10 G1-blue v2: paper_progress; only when trades_required != null
  ///
  /// In en, this message translates to:
  /// **'{trades_done}/{trades_required} trades'**
  String strategyRealGateProgressTrades(String trades_done, String trades_required);

  /// 0.4.10 G1-blue v2: when trades_required = null
  ///
  /// In en, this message translates to:
  /// **'{trades_done,plural,one{{trades_done} trade} other{{trades_done} trades}} closed'**
  String strategyRealGateTradesDone(int trades_done);

  /// 0.4.10 G1-blue v2: reason = strategy.real_locked_reason.<real_locked_reason> text
  ///
  /// In en, this message translates to:
  /// **'Real option disabled: {reason}'**
  String strategyRealLockedA11y(String reason);

  /// 0.4.10 G1-blue v2: real_locked_reason = needs_owner_approval
  ///
  /// In en, this message translates to:
  /// **'Needs Boss approval'**
  String get strategyRealLockedBadge;

  /// 0.4.10 G1-blue v2: shown when real_locked = true (contracts 1.1.6); always with a lock icon
  ///
  /// In en, this message translates to:
  /// **'Real locked'**
  String get strategyRealLockedChip;

  /// 0.4.10 G1-blue v2: compact list variant next to the Paper chip
  ///
  /// In en, this message translates to:
  /// **'locked'**
  String get strategyRealLockedChipShort;

  /// 0.4.10 G1-blue v2: generic on purpose; the Paper gate rule is not decided (no numbers in copy)
  ///
  /// In en, this message translates to:
  /// **'Real is locked. Boss approves each strategy before it can use real SOL. Until then it keeps running in Paper.'**
  String get strategyRealLockedExplain;

  /// 0.4.10 G1-blue v2
  ///
  /// In en, this message translates to:
  /// **'Real stays locked until Boss approves. The strategy keeps running in Paper meanwhile.'**
  String get strategyRealLockedListNote;

  /// 0.4.10 G1-blue v2: contracts 1.1.6 RealLockedReason
  ///
  /// In en, this message translates to:
  /// **'Paper requirements not met yet'**
  String get strategyRealLockedReasonGateNotMet;

  /// 0.4.10 G1-blue v2: contracts 1.1.6 RealLockedReason
  ///
  /// In en, this message translates to:
  /// **'Needs Boss approval'**
  String get strategyRealLockedReasonNeedsOwnerApproval;

  /// 0.4.10 G1-blue v2: contracts 1.1.6 RealLockedReason
  ///
  /// In en, this message translates to:
  /// **'Not available right now'**
  String get strategyRealLockedReasonOther;

  /// 0.4.10 G1-blue v2: contracts 1.1.6 RealLockedReason
  ///
  /// In en, this message translates to:
  /// **'Blocked by wallet rules'**
  String get strategyRealLockedReasonPolicy;

  /// 0.4.10 G1-blue v2: primary action in the editor
  ///
  /// In en, this message translates to:
  /// **'Save strategy'**
  String get strategySave;

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

  /// chip when token_program = Token-2022 program id (isToken2022); do not translate
  ///
  /// In en, this message translates to:
  /// **'Token-2022'**
  String get tokenProgramToken2022;

  /// CTA when signer_state=revoked (e.g. after policy_mismatch the signer stays revoked until re-granted)
  ///
  /// In en, this message translates to:
  /// **'Grant trading authority again'**
  String get walletAuthorizeRegrant;

  /// 0.4.9 G1 policy_mismatch banner / sticky CTA, under wallet.authorize.regrant
  ///
  /// In en, this message translates to:
  /// **'Needs Phantom + passkey. Once authority is active, exit plans resume automatically.'**
  String get walletAuthorizeRegrantNote;

  /// 0.4.10 G1-blue v2: verb-first policy_mismatch banner title
  ///
  /// In en, this message translates to:
  /// **'Grant trading permission again to resume Real'**
  String get walletAuthorizeRegrantTitle;

  /// real.limit.* setting=cap_lamports (confirmed by Backend, Rev 4.8); from/to via formatLimitValue
  ///
  /// In en, this message translates to:
  /// **'Total cap'**
  String get walletLimitsSettingCapLamports;

  /// real.limit.* setting=daily_lamports (confirmed by Backend, Rev 4.8); from/to via formatLimitValue
  ///
  /// In en, this message translates to:
  /// **'Max per rolling 24 h'**
  String get walletLimitsSettingDailyLamports;

  /// real.limit.* setting=max_positions (confirmed by Backend, Rev 4.8); from/to via formatLimitValue
  ///
  /// In en, this message translates to:
  /// **'Max open positions'**
  String get walletLimitsSettingMaxPositions;

  /// real.limit.* setting=max_slippage_bps (confirmed by Backend, Rev 4.8); from/to via formatLimitValue
  ///
  /// In en, this message translates to:
  /// **'Max slippage'**
  String get walletLimitsSettingMaxSlippageBps;

  /// real.limit.* setting=per_trade_lamports (confirmed by Backend, Rev 4.8); from/to via formatLimitValue
  ///
  /// In en, this message translates to:
  /// **'Max per trade'**
  String get walletLimitsSettingPerTradeLamports;

  /// cancels a pending (quarantined) wallet
  ///
  /// In en, this message translates to:
  /// **'Cancel'**
  String get walletOwnerCancel;

  /// wallet.owner.change_main
  ///
  /// In en, this message translates to:
  /// **'Change…'**
  String get walletOwnerChangeMain;

  /// wallet.owner.delay_note
  ///
  /// In en, this message translates to:
  /// **'Changes take at least 48 h and can be cancelled.'**
  String get walletOwnerDelayNote;

  /// wallet.owner.main
  ///
  /// In en, this message translates to:
  /// **'Main wallet · sign-in and the only withdraw destination'**
  String get walletOwnerMain;

  /// usable_at = formatDateTime; hh_mm_ss = formatCountdownHms (computed); WITHDRAW_ADDRESS_PENDING maps here
  ///
  /// In en, this message translates to:
  /// **'Active {usable_at} · {hh_mm_ss} left'**
  String walletOwnerPending(String hh_mm_ss, String usable_at);

  /// Rev 5.2: one owner wallet, no backup
  ///
  /// In en, this message translates to:
  /// **'Main wallet'**
  String get walletOwnerTitle;

  /// wallet.owner.type_last4
  ///
  /// In en, this message translates to:
  /// **'Type the last 4 characters of the new address'**
  String get walletOwnerTypeLast4;

  /// real.withdraw.failed reason_code=destination_not_owned (Backend enum, Rev 4.8); lower-case, used mid-sentence in N-42
  ///
  /// In en, this message translates to:
  /// **'the destination isn’t your main wallet'**
  String get walletWithdrawFailReasonDestinationNotOwned;

  /// real.withdraw.failed reason_code=insufficient_balance (Backend enum, Rev 4.8); lower-case, used mid-sentence in N-42
  ///
  /// In en, this message translates to:
  /// **'not enough balance'**
  String get walletWithdrawFailReasonInsufficientBalance;

  /// real.withdraw.failed reason_code=other (Backend enum, Rev 4.8); lower-case, used mid-sentence in N-42
  ///
  /// In en, this message translates to:
  /// **'something went wrong'**
  String get walletWithdrawFailReasonOther;

  /// real.withdraw.failed reason_code=provider_error (Backend enum, Rev 4.8); lower-case, used mid-sentence in N-42
  ///
  /// In en, this message translates to:
  /// **'wallet provider error'**
  String get walletWithdrawFailReasonProviderError;

  /// real.withdraw.failed reason_code=tx_expired (Backend enum, Rev 4.8); lower-case, used mid-sentence in N-42
  ///
  /// In en, this message translates to:
  /// **'it wasn’t sent in time'**
  String get walletWithdrawFailReasonTxExpired;

  /// fallback for a reason_code outside the enum
  ///
  /// In en, this message translates to:
  /// **'unknown error'**
  String get walletWithdrawFailReasonUnknown;

  /// real.withdraw.failed reason_code=user_rejected (Backend enum, Rev 4.8); lower-case, used mid-sentence in N-42
  ///
  /// In en, this message translates to:
  /// **'you rejected the signature'**
  String get walletWithdrawFailReasonUserRejected;

  /// real.withdraw.failed reason_code=withdraw_simulation_failed (Backend enum, Rev 4.8); lower-case, used mid-sentence in N-42
  ///
  /// In en, this message translates to:
  /// **'the safety simulation failed'**
  String get walletWithdrawFailReasonWithdrawSimulationFailed;

  /// pnl.title — PnL card title
  ///
  /// In en, this message translates to:
  /// **'PnL'**
  String get pnlTitle;

  /// pnl.unrealized — label of the mark-to-market cell
  ///
  /// In en, this message translates to:
  /// **'Unrealized PnL'**
  String get pnlUnrealized;

  /// pnl.realized — label of the locked-in cell
  ///
  /// In en, this message translates to:
  /// **'Realized PnL'**
  String get pnlRealized;

  /// pnl.total — label of the realized + unrealized total
  ///
  /// In en, this message translates to:
  /// **'Total PnL'**
  String get pnlTotal;

  /// pnl.unrealized.hint
  ///
  /// In en, this message translates to:
  /// **'Mark-to-market of open positions'**
  String get pnlUnrealizedHint;

  /// pnl.realized.hint
  ///
  /// In en, this message translates to:
  /// **'From take-profits and closed trades'**
  String get pnlRealizedHint;

  /// pnl.total.hint
  ///
  /// In en, this message translates to:
  /// **'Realized + unrealized'**
  String get pnlTotalHint;

  /// pnl.view_report — card link to the report
  ///
  /// In en, this message translates to:
  /// **'View report'**
  String get pnlViewReport;

  /// pnl.open_count — open positions on the card
  ///
  /// In en, this message translates to:
  /// **'{count} open'**
  String pnlOpenCount(int count);

  /// pnl.report.title
  ///
  /// In en, this message translates to:
  /// **'PnL report'**
  String get pnlReportTitle;

  /// pnl.report.eyebrow — uppercase eyebrow above the strip
  ///
  /// In en, this message translates to:
  /// **'PNL REPORT'**
  String get pnlReportEyebrow;

  /// pnl.realized.range — range realized cell, {range} = 1D/7D/30D/All
  ///
  /// In en, this message translates to:
  /// **'Realized · {range}'**
  String pnlRealizedFor(String range);

  /// pnl.closed — closed count / closed-at label
  ///
  /// In en, this message translates to:
  /// **'Closed'**
  String get pnlClosed;

  /// pnl.total_all_time — reconciliation footer
  ///
  /// In en, this message translates to:
  /// **'Total all-time'**
  String get pnlTotalAllTime;

  /// pnl.realized_all_time — reconciliation footer (includes partial take-profits)
  ///
  /// In en, this message translates to:
  /// **'All-time realized'**
  String get pnlRealizedAllTime;

  /// pnl.report.unavailable — report error body
  ///
  /// In en, this message translates to:
  /// **'The PnL report could not be loaded.'**
  String get pnlReportUnavailable;

  /// pnl.realized.hint_locked — closed detail receipt
  ///
  /// In en, this message translates to:
  /// **'Locked at close, does not follow the live price'**
  String get pnlRealizedHeroHint;

  /// pnl.closed_trades — ledger section header
  ///
  /// In en, this message translates to:
  /// **'Closed trades'**
  String get pnlClosedTrades;

  /// pnl.by_exit_reason — exit_stats() breakdown header
  ///
  /// In en, this message translates to:
  /// **'By exit reason'**
  String get pnlByExitReason;

  /// pnl.win_rate
  ///
  /// In en, this message translates to:
  /// **'Win rate'**
  String get pnlWinRate;

  /// pnl.avg_hold
  ///
  /// In en, this message translates to:
  /// **'Avg hold'**
  String get pnlAvgHold;

  /// pnl.stats_unavailable — exit_stats() error row
  ///
  /// In en, this message translates to:
  /// **'The breakdown by exit reason could not be loaded.'**
  String get pnlStatsUnavailable;

  /// pnl.partial_note — reconciliation note, shown for every range
  ///
  /// In en, this message translates to:
  /// **'All-time realized also counts partial take-profits on open positions and closes outside the range, so it can be larger than this range realized and the ledger sum.'**
  String get pnlPartialNote;

  /// pnl.realized.short — ledger row suffix
  ///
  /// In en, this message translates to:
  /// **'realized'**
  String get pnlRealizedShort;

  /// pnl.hold.seconds — hold under a minute
  ///
  /// In en, this message translates to:
  /// **'{count}s'**
  String pnlHoldSeconds(int count);

  /// pnl.hold.minutes — hold under an hour
  ///
  /// In en, this message translates to:
  /// **'{count}m'**
  String pnlHoldMinutes(int count);

  /// pnl.hold.hours — hold of an hour or more
  ///
  /// In en, this message translates to:
  /// **'{hours}h {minutes}m'**
  String pnlHoldHours(int hours, int minutes);

  /// pnl.trades — count of closed trades in an exit-reason row
  ///
  /// In en, this message translates to:
  /// **'{count, plural, =1{1 trade} other{{count} trades}}'**
  String pnlTrades(int count);

  /// pnl.empty.title
  ///
  /// In en, this message translates to:
  /// **'No closed trades yet'**
  String get pnlEmptyTitle;

  /// pnl.empty.body
  ///
  /// In en, this message translates to:
  /// **'Realized PnL appears here once a position closes. Unrealized PnL stays on the PnL card.'**
  String get pnlEmptyBody;

  /// pnl.empty.action
  ///
  /// In en, this message translates to:
  /// **'See open positions'**
  String get pnlEmptyAction;

  /// pnl.receipt.sol_in — closed detail: cost basis (sol_in_lamports)
  ///
  /// In en, this message translates to:
  /// **'SOL in'**
  String get pnlReceiptSolIn;

  /// pnl.receipt.sol_out — closed detail: proceeds (sol_out_lamports)
  ///
  /// In en, this message translates to:
  /// **'SOL out'**
  String get pnlReceiptSolOut;

  /// pnl.receipt.fees — reported context, never re-subtracted from PnL
  ///
  /// In en, this message translates to:
  /// **'Fees (reported)'**
  String get pnlReceiptFees;

  /// pnl.receipt.hold — closed detail hold label
  ///
  /// In en, this message translates to:
  /// **'Hold'**
  String get pnlReceiptHold;

  /// pnl.receipt.entry_exit — entry price → exit price
  ///
  /// In en, this message translates to:
  /// **'Entry → exit'**
  String get pnlReceiptEntryExit;

  /// pnl.receipt.exit_reason
  ///
  /// In en, this message translates to:
  /// **'Exit reason'**
  String get pnlReceiptExitReason;

  /// pnl.receipt.bot — strategy that owned the position
  ///
  /// In en, this message translates to:
  /// **'Bot'**
  String get pnlReceiptBot;

  /// pnl.receipt.size — open detail: remaining cost basis
  ///
  /// In en, this message translates to:
  /// **'Size'**
  String get pnlReceiptSize;

  /// pnl.receipt.sold — open detail: share already sold
  ///
  /// In en, this message translates to:
  /// **'Sold'**
  String get pnlReceiptSold;

  /// pnl.receipt.token — open detail: raw token amount
  ///
  /// In en, this message translates to:
  /// **'Token'**
  String get pnlReceiptToken;

  /// pnl.receipt.mint — open detail: mint address
  ///
  /// In en, this message translates to:
  /// **'Mint'**
  String get pnlReceiptMint;

  /// pnl.sell — sell button on the open position detail
  ///
  /// In en, this message translates to:
  /// **'Sell'**
  String get pnlSell;

  /// pnl.no_sell_note — safety note under the sell button
  ///
  /// In en, this message translates to:
  /// **'Sell is never available from a notification.'**
  String get pnlNoSellNote;

  /// pnl.positions_title — detail app bar fallback
  ///
  /// In en, this message translates to:
  /// **'Positions'**
  String get pnlPositionsTitle;

  /// pnl.position_not_found — detail empty state
  ///
  /// In en, this message translates to:
  /// **'Position not found'**
  String get pnlPositionNotFound;

  /// pnl.receipt.entry_now — open detail: entry price → current mark
  ///
  /// In en, this message translates to:
  /// **'Entry → now'**
  String get pnlReceiptEntryNow;
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
