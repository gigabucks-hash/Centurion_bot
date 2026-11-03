/// Turns a parsed [PushMessage] into display-ready copy + buttons, applying
/// locale formatting and the security policy. Pure Dart (no BuildContext),
/// so the same code runs in the FCM background isolate.
library;

import '../../data/money.dart';
import '../l10n_format.dart';
import '../push/push_payload.dart';
import 'notification_catalog.dart';

class RenderedNotification {
  const RenderedNotification({
    required this.message,
    required this.copyKey,
    required this.title,
    required this.body,
    required this.actions,
    required this.channels,
    required this.priority,
    required this.tapRoute,
    this.grouped = false,
  });
  final PushMessage message;
  final String copyKey;
  final String title;
  final String body;

  /// Buttons in display order, after the security policy.
  final List<NotifAction> actions;
  final List<NotifChannel> channels;
  final NotifPriority priority;

  /// Tap target (deep link). Null = no navigation (e.g. N-16 banner).
  final String? tapRoute;
  final bool grouped;
}

class NotificationRenderer {
  const NotificationRenderer({this.policy = NotificationPolicy.lead, this.zoneLabel = 'WIB'});
  final NotificationPolicy policy;

  /// User time-zone label for `{time}` (WIB default).
  final String zoneLabel;

  /// Copy key for a message (variant selection).
  static String copyKeyFor(PushMessage m) => switch (m.event) {
    NotifEvent.n05Failed => m.mode == NotifMode.real ? 'N-05.real' : 'N-05',
    NotifEvent.n07Expired => expireReasonCopyKey(m.expireReason),
    NotifEvent.n12WeakeningActive => m.mode == NotifMode.real ? 'N-12.real' : 'N-12',
    NotifEvent.n14ModeSwitch => m.mode == NotifMode.real ? 'N-14.real' : 'N-14.practice',
    _ => m.event.code,
  };

  /// Security filter on top of the spec table:
  /// - Approve only for Practice picks with a valid single-use token;
  ///   an invalid/expired token hides ALL pick buttons (tap opens the app,
  ///   server re-validates; a stale button press shows N-17).
  /// - Real SOL picks: no Approve ever; Skip only if
  ///   [NotificationPolicy.realSkipFromNotification] (off per team lead).
  /// - Grouped picks: no buttons.
  /// - Not tradeable (`reason_code=UNSUPPORTED_QUOTE_MINT`): never Approve/Skip.
  List<NotifAction> actionsFor(PushMessage m, DateTime now, {bool grouped = false}) {
    final real = m.mode == NotifMode.real;
    final base = real ? m.event.spec.realActions : m.event.spec.practiceActions;
    if (!m.event.isPick) {
      // Never Approve for a not-tradeable coin on any notification.
      return List.unmodifiable(base.where((a) => !(m.notTradeable && a == NotifAction.approve)));
    }
    if (grouped) return const [];
    if (real) {
      return policy.realSkipFromNotification ? const [NotifAction.skip] : const [];
    }
    if (!m.tokenValidAt(now)) return const [];
    // 1.1.2: decide_approval needs p_expected_rev; without the push `version` the
    // action could only fail → no buttons, open the app instead.
    if (m.version == null) return const [];
    // The client only narrows what the server offers (`actions`).
    final offered = m.serverActions;
    if (m.notTradeable) {
      // i18n 0.4.4 / Apex: Skip only, and only when the server explicitly offers it.
      return [if (offered != null && offered.contains('skip')) NotifAction.skip];
    }
    return [
      if (offered == null || offered.contains('approve')) NotifAction.approve,
      if (offered == null || offered.contains('skip')) NotifAction.skip,
    ];
  }

  RenderedNotification render(
    PushMessage m,
    NotifLocale locale,
    DateTime now, {
    int groupCount = 0,
    Duration clockSkew = Duration.zero,
  }) {
    final grouped = m.event.isPick && groupCount > 3;
    final key = grouped ? 'group' : copyKeyFor(m);
    final vars = _formatVars(m, locale, now.add(clockSkew));
    final copy = notifCopy(
      l10nFor(locale),
      key,
      m.mode == NotifMode.real ? 'real' : 'practice',
      vars,
      count: groupCount,
    );
    final priority = m.event == NotifEvent.n14ModeSwitch && m.mode == NotifMode.real
        ? NotifPriority.high
        : m.event.spec.priority;
    return RenderedNotification(
      message: m,
      copyKey: key,
      title: copy.title.trim(),
      body: copy.body.trim(),
      actions: actionsFor(m, now.add(clockSkew), grouped: grouped),
      channels: m.event.spec.channels,
      priority: priority,
      tapRoute: grouped ? '/approvals' : m.route,
      grouped: grouped,
    );
  }

  /// Formats raw push vars per @centurion/i18n 0.4.3 `notifications.meta.json`
  /// `var_format`. Var names ARE the ARB placeholder names (no mapping):
  /// `symbol` plain untrusted text (shown as `$SYM`), `amount_lamports` /
  /// `pnl` lamports integer strings → [Lamports] formatter (`pnl` signed per
  /// T-15), `price` USD decimal string, `pct` N-08 unsigned (the copy has the
  /// `+`) and N-09/N-15 signed, `pct_sold` unsigned, `reason_code` →
  /// `order.fail_reason.*`, timestamps → local time + zone. Money is never double.
  /// Computed on device: `mm_ss` from `exp` − (now + skew).
  Map<String, String> _formatVars(PushMessage m, NotifLocale locale, DateTime now) {
    final loc = locale.name;
    final paper = m.mode != NotifMode.real;
    final out = <String, String>{};
    String pnl(Lamports v) {
      final p = pnlSol(v, loc, paper: paper);
      return p.arrow.isEmpty ? p.text : '${p.arrow} ${p.text}';
    }

    final signedPct = m.event == NotifEvent.n09StopHit || m.event == NotifEvent.n15LossStopPaused;
    m.vars.forEach((k, raw) {
      out[k] = switch (k) {
        'symbol' => raw.startsWith(r'$') ? raw : '\$$raw',
        'amount_lamports' => _or(Lamports.tryParse(raw), raw, (v) => formatSol(v, loc, paper: paper)),
        'reason_code' => orderFailReason(l10nFor(locale), raw),
        // ARB has no glyph: SPEC §1 requires ▲/▼ + sign on every PnL.
        'pnl' => _or(Lamports.tryParse(raw), raw, pnl),
        'pct' => _or(num.tryParse(raw), raw, (v) => formatPct(v, loc, signed: signedPct)),
        'pct_sold' => _or(num.tryParse(raw), raw, (v) => formatPct(v, loc)),
        'price' => _or(Decimal.tryParse(raw), raw, (v) => formatUsd(v, loc)),
        'cooldown_until' ||
        'auto_revert_at' ||
        'scheduled_for' => _or(_parseTime(raw), raw, (t) => formatTime(t.toLocal(), loc, zone: zoneLabel)),
        _ => raw,
      };
    });
    // Countdown is always client-computed from exp − (now + skew); never a push var.
    if (m.expiresAt != null) out['mm_ss'] = formatCountdown(m.expiresAt!.difference(now.toUtc()));
    return out;
  }

  static String _or<T>(T? v, String raw, String Function(T) fmt) => v == null ? raw : fmt(v);

  static DateTime? _parseTime(String raw) {
    final epoch = int.tryParse(raw);
    return epoch != null ? DateTime.fromMillisecondsSinceEpoch(epoch * 1000) : DateTime.tryParse(raw);
  }
}

/// ">3 picks within 60 s" rule, per mode.
class PickGrouper {
  final _recent = <NotifMode, List<DateTime>>{};

  /// Records a pick and returns how many picks (incl. this one) arrived in
  /// the last 60 s for that mode.
  int record(NotifMode mode, DateTime at) {
    final list = _recent.putIfAbsent(mode, () => []);
    list
      ..add(at)
      ..removeWhere((t) => at.difference(t) > const Duration(seconds: 60));
    return list.length;
  }
}
