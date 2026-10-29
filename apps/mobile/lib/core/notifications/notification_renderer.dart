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
        NotifEvent.n07Expired => expireReasonKeys[m.expireReason] ?? 'N-07a',
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
  List<NotifAction> actionsFor(PushMessage m, DateTime now, {bool grouped = false}) {
    final real = m.mode == NotifMode.real;
    final base = real ? m.event.spec.realActions : m.event.spec.practiceActions;
    if (!m.event.isPick) return List.unmodifiable(base);
    if (grouped) return const [];
    if (real) {
      return policy.realSkipFromNotification ? const [NotifAction.skip] : const [];
    }
    if (!m.tokenValidAt(now)) return const [];
    // The client only narrows what the server offers (`actions`).
    final offered = m.serverActions;
    return [
      if (offered == null || offered.contains('approve')) NotifAction.approve,
      if (offered == null || offered.contains('skip')) NotifAction.skip,
    ];
  }

  RenderedNotification render(PushMessage m, NotifLocale locale, DateTime now,
      {int groupCount = 0, Duration clockSkew = Duration.zero}) {
    final grouped = m.event.isPick && groupCount > 3;
    final key = grouped ? 'group' : copyKeyFor(m);
    final vars = _formatVars(m, locale, now.add(clockSkew));
    final copy = notifCopy(l10nFor(locale), key, m.mode == NotifMode.real ? 'real' : 'practice', vars,
        count: groupCount);
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

  /// Formats raw payload vars per `format.mjs`. [now] is server-corrected.
  /// Wire: `sol`/`pnl` are SOL decimal strings (or `*_lamports` integer
  /// strings), `price` a USD decimal string, pct values JSON numbers.
  /// Money is parsed to [Lamports]/[Decimal], never double.
  Map<String, String> _formatVars(PushMessage m, NotifLocale locale, DateTime now) {
    final loc = locale.name;
    final paper = m.mode != NotifMode.real;
    final out = <String, String>{};
    Lamports? lamports(String k) =>
        Lamports.tryParse(m.vars['${k}_lamports']) ?? _tryOr(() => Lamports.fromSol(m.vars[k]!), m.vars[k]);
    String pnl(Lamports v) => '${v.isZero ? '' : v.isNegative ? '▼ ' : '▲ '}${formatSol(v, loc, pnl: true, paper: paper)}';
    m.vars.forEach((k, raw) {
      out[k] = switch (k) {
        'coin' => raw.startsWith(r'$') ? raw : '\$$raw',
        'sol' || 'sol_lamports' => _or(lamports('sol'), raw, (v) => formatSol(v, loc, paper: paper)),
        // ARB has no glyph: SPEC §1 requires ▲/▼ + sign on every PnL.
        'pnl' || 'pnl_lamports' => _or(lamports('pnl'), raw, pnl),
        'pct' => _or(num.tryParse(raw), raw, (v) => formatPct(v, loc, signed: m.event == NotifEvent.n09StopHit)),
        'pct_sold' => _or(num.tryParse(raw), raw, (v) => formatPct(v, loc)),
        'price' || 'price_usd' => _or(Decimal.tryParse(raw), raw, (v) => formatUsd(v, loc)),
        'time' => _or(_parseTime(raw), raw, (t) => formatTime(t.toLocal(), loc, zone: zoneLabel)),
        _ => raw,
      };
    });
    if (out.containsKey('sol_lamports')) out['sol'] = out.remove('sol_lamports')!;
    if (out.containsKey('pnl_lamports')) out['pnl'] = out.remove('pnl_lamports')!;
    if (out.containsKey('price_usd')) out['price'] = out.remove('price_usd')!;
    // Countdown is always client-computed from exp − (now + skew); `vars.mm_ss` is ignored.
    if (m.expiresAt != null) out['mm:ss'] = formatCountdown(m.expiresAt!.difference(now.toUtc()));
    return out;
  }

  static T? _tryOr<T>(T Function() f, String? raw) {
    if (raw == null) return null;
    try {
      return f();
    } on FormatException {
      return null;
    }
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
