/// Typed catalog of the 17 notification events in
/// `ux-solbot/docs/NOTIFICATIONS.md`: channel, priority and per-mode actions.
///
/// Copy comes from the UX ARB files (`lib/l10n/app_{id,en}.arb`, copied
/// verbatim from `ux-solbot/locales/arb`) via gen-l10n `AppLocalizations`.
/// `lookupAppLocalizations(Locale)` needs no BuildContext, so the same code
/// renders in the FCM background isolate. See [notifCopy].
library;

import 'dart:ui' show Locale;

import '../../l10n/gen/app_localizations.dart';

enum NotifLocale { id, en }

enum NotifMode { practice, real }

enum NotifChannel { push, inApp, popup, email, banner }

enum NotifPriority { low, normal, high }

/// Notification buttons. There is deliberately no `sell`: selling is never
/// possible from a notification (SPEC §6 / NOTIFICATIONS.md).
enum NotifAction { approve, skip, undo, viewPosition, detail, view, review, cancel, retry, open }

/// Security policy for notification actions.
class NotificationPolicy {
  const NotificationPolicy({this.realSkipFromNotification = false});

  /// NOTIFICATIONS.md allows Skip on Real SOL picks; the team lead's rule for
  /// Phase 5 is "Approve/Skip actions only for Practice picks", so this is OFF.
  /// Flip only with lead + UX sign-off.
  final bool realSkipFromNotification;

  static const lead = NotificationPolicy();
}

class EventSpec {
  const EventSpec({
    required this.channels,
    required this.priority,
    required this.practiceActions,
    required this.realActions,
    this.requiresMode = true,
    this.realOnly = false,
  });
  final List<NotifChannel> channels;

  /// Priority for Practice (and modeless). N-14 to Real is raised in [priorityFor].
  final NotifPriority priority;

  /// Actions exactly as the spec table lists them (before policy filters).
  final List<NotifAction> practiceActions;
  final List<NotifAction> realActions;
  final bool requiresMode;
  final bool realOnly;
}

const _pushInAppPopup = [NotifChannel.push, NotifChannel.inApp, NotifChannel.popup];
const _pushInApp = [NotifChannel.push, NotifChannel.inApp];
const _inApp = [NotifChannel.inApp];

enum NotifEvent {
  n01PickPending('N-01', EventSpec(
      channels: _pushInAppPopup, priority: NotifPriority.high,
      practiceActions: [NotifAction.approve, NotifAction.skip], realActions: [NotifAction.skip])),
  n02FirstBuyPending('N-02', EventSpec(
      channels: _pushInAppPopup, priority: NotifPriority.high,
      practiceActions: [NotifAction.approve, NotifAction.skip], realActions: [NotifAction.skip])),
  n03Approved('N-03', EventSpec(
      channels: _inApp, priority: NotifPriority.normal, practiceActions: [], realActions: [], requiresMode: false)),
  n04Filled('N-04', EventSpec(
      channels: _pushInApp, priority: NotifPriority.normal,
      practiceActions: [NotifAction.viewPosition], realActions: [NotifAction.viewPosition])),
  n05Failed('N-05', EventSpec(
      channels: _pushInApp, priority: NotifPriority.high,
      practiceActions: [NotifAction.detail], realActions: [NotifAction.detail])),
  n06Skipped('N-06', EventSpec(
      channels: _inApp, priority: NotifPriority.low,
      practiceActions: [NotifAction.undo], realActions: [NotifAction.undo], requiresMode: false)),
  n07Expired('N-07', EventSpec(
      channels: _inApp, priority: NotifPriority.low, practiceActions: [], realActions: [])),
  n08TpHit('N-08', EventSpec(
      channels: _pushInApp, priority: NotifPriority.normal,
      practiceActions: [NotifAction.view], realActions: [NotifAction.view])),
  n09StopHit('N-09', EventSpec(
      channels: _pushInApp, priority: NotifPriority.normal,
      practiceActions: [NotifAction.view], realActions: [NotifAction.view])),
  n10GuardWeakeningRequested('N-10', EventSpec(
      channels: _pushInApp, priority: NotifPriority.high,
      practiceActions: [NotifAction.review], realActions: [NotifAction.review])),
  n11CooldownStarted('N-11', EventSpec(
      channels: [NotifChannel.push, NotifChannel.email, NotifChannel.inApp], priority: NotifPriority.high,
      practiceActions: [], realActions: [NotifAction.cancel], realOnly: true)),
  n12WeakeningActive('N-12', EventSpec(
      channels: _inApp, priority: NotifPriority.normal, practiceActions: [], realActions: [NotifAction.view])),
  n13AutoRevertDone('N-13', EventSpec(
      channels: _pushInApp, priority: NotifPriority.normal,
      practiceActions: [], realActions: [NotifAction.view], realOnly: true)),
  n14ModeSwitch('N-14', EventSpec(
      channels: [NotifChannel.inApp, NotifChannel.push], priority: NotifPriority.normal,
      practiceActions: [], realActions: [])),
  n15LossStopPaused('N-15', EventSpec(
      channels: _pushInApp, priority: NotifPriority.high,
      practiceActions: [NotifAction.view], realActions: [NotifAction.view])),
  n16ConnectionError('N-16', EventSpec(
      channels: [NotifChannel.banner], priority: NotifPriority.high,
      practiceActions: [NotifAction.retry], realActions: [NotifAction.retry], requiresMode: false)),
  n17TokenInvalid('N-17', EventSpec(
      channels: _inApp, priority: NotifPriority.normal,
      practiceActions: [NotifAction.open], realActions: [NotifAction.open], requiresMode: false));

  const NotifEvent(this.code, this.spec);
  final String code;
  final EventSpec spec;

  bool get isPick => this == n01PickPending || this == n02FirstBuyPending;

  static NotifEvent? byCode(String code) {
    for (final e in values) {
      if (e.code == code) return e;
    }
    return null;
  }

  /// Copy variants (map keys in [notificationCopy]) for this event.
  List<String> get copyKeys => switch (this) {
        n05Failed => ['N-05', 'N-05.real'],
        n07Expired => ['N-07a', 'N-07b', 'N-07c', 'N-07d', 'N-07e'],
        n12WeakeningActive => ['N-12', 'N-12.real'],
        n14ModeSwitch => ['N-14.real', 'N-14.practice'],
        _ => [code],
      };
}

/// N-07 `expire_reason` (wire values, contract v1.1 `ProposalExpiredReason`) → copy key.
/// `practice_reset` / `account_deleted` have no UX copy yet → generic N-07a
/// (reported to UX). Unknown values also fall back to N-07a.
const expireReasonKeys = {
  'timeout': 'N-07a',
  'strategy_deleted': 'N-07b',
  'guard_failed': 'N-07c',
  'price_moved': 'N-07d',
  'strategy_archived': 'N-07e',
  'practice_reset': 'N-07a',
  'account_deleted': 'N-07a',
};

typedef Copy = ({String title, String body});

AppLocalizations l10nFor(NotifLocale l) => lookupAppLocalizations(Locale(l.name));

/// Copy for a variant key, from the ARB. [v] holds already-formatted vars;
/// a missing var renders as `–`. [mode] is `practice`/`real` (ICU select).
Copy notifCopy(AppLocalizations l, String key, String mode, Map<String, String> v, {int count = 0}) {
  String x(String k) => v[k] ?? '–';
  return switch (key) {
    'N-01' => (title: l.notifPickPendingTitle(x('coin'), mode), body: l.notifPickPendingBody(x('sol'), x('strategy'), x('mm:ss'))),
    'N-02' => (title: l.notifFirstBuyTitle(x('coin'), mode, x('strategy')), body: l.notifFirstBuyBody(x('sol'))),
    'N-03' => (title: l.notifApprovedTitle(x('coin')), body: l.notifApprovedBody),
    'N-04' => (title: l.notifFilledTitle(x('coin'), mode), body: l.notifFilledBody(x('price'), x('sol'))),
    'N-05' || 'N-05.real' => (title: l.notifFailedTitle(x('coin'), mode), body: l.notifFailedBody(mode, x('reason'))),
    'N-06' => (title: l.notifSkippedTitle(x('coin')), body: l.notifSkippedBody(x('reason'))),
    'N-07a' => (title: l.notifExpiredTitle(x('coin'), mode), body: l.notifExpiredBody(l.queueExpiredReasonTimedOut)),
    'N-07b' => (title: l.notifExpiredTitle(x('coin'), mode), body: l.notifExpiredBody(l.queueExpiredReasonStrategyDeleted)),
    'N-07c' => (title: l.notifExpiredTitle(x('coin'), mode), body: l.notifExpiredBody(l.queueExpiredReasonGuardFailed(x('reason')))),
    'N-07d' => (title: l.notifExpiredTitle(x('coin'), mode), body: l.notifExpiredBody(l.queueExpiredReasonPriceRan(x('pct')))),
    'N-07e' => (title: l.notifExpiredTitle(x('coin'), mode), body: l.notifExpiredBody(l.queueExpiredReasonStrategyArchived)),
    'N-08' => (title: l.notifTpHitTitle(x('coin'), mode), body: l.notifTpHitBody(x('pct'), x('pct_sold'), x('pnl'))),
    'N-09' => (title: l.notifSlHitTitle(x('coin'), mode), body: l.notifSlHitBody(x('pct'), x('pnl'), x('stop_type'))),
    'N-10' => (title: l.notifGuardRequestedTitle(mode), body: l.notifGuardRequestedBody(x('from'), x('setting'), x('strategy'), x('to'))),
    'N-11' => (title: l.notifGuardCooldownTitle, body: l.notifGuardCooldownBody(x('strategy'), x('time'))),
    'N-12' || 'N-12.real' => (title: l.notifGuardActiveTitle(mode, x('strategy')), body: l.notifGuardActiveBody(x('time'))),
    'N-13' => (title: l.notifGuardRevertedTitle(x('strategy')), body: l.notifGuardRevertedBody(x('from'), x('setting'))),
    'N-14.real' => (title: l.notifModeRealTitle, body: l.notifModeRealBody),
    'N-14.practice' => (title: l.notifModePracticeTitle, body: l.notifModePracticeBody),
    'N-15' => (title: l.notifLossStopTitle(mode, x('strategy')), body: l.notifLossStopBody(x('pct'))),
    'N-16' => (title: l.notifOfflineTitle, body: l.notifOfflineBody),
    'N-17' => (title: l.notifTokenInvalidTitle, body: l.notifTokenInvalidBody),
    // UX-BUG (reported): Flutter gen-l10n does not substitute ICU `#` in plural
    // branches; the ARB should use `{count}`. Remove once the ARB is fixed.
    'group' => (title: l.notifGroupedTitle(count, mode).replaceAll('#', '$count'), body: l.notifGroupedBody),
    _ => throw ArgumentError.value(key, 'key', 'unknown notification copy key'),
  };
}

/// Button label from the ARB. GAP: the ARB has no dedicated "View position" /
/// "Details" / "Open" labels for notifications, so those reuse common keys.
String actionLabel(AppLocalizations l, NotifAction a) => switch (a) {
      NotifAction.approve => l.notifActionApprove,
      NotifAction.skip => l.notifActionSkip,
      NotifAction.cancel => l.notifActionCancelChange,
      NotifAction.open => l.notifActionOpenPick,
      NotifAction.undo => l.commonActionUndo,
      NotifAction.retry => l.commonActionRetry,
      NotifAction.review => l.commonActionReview,
      NotifAction.view || NotifAction.viewPosition || NotifAction.detail => l.commonActionView,
    };
