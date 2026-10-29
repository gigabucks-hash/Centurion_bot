/// PushPayload v1 (contracts 1.1.2, EVENTS_SCHEMA §6). Data-only; copy is
/// rendered on the device from the ARB catalog. Pure Dart: usable from the
/// FCM background isolate.
///
/// Canonical FCM `data` (1.1.2: EVERY value is a string):
/// {"v":"1","event":"N-01","type":"proposal.created","mode":"practice",
///  "workspace_id":"…","seq":"18301","version":"3","deep_link":"sentra://approvals/…",
///  "approval_id":"…","token":"apt_…","exp":"2026-10-29T08:52:00.000Z",
///  "actions":"[\"approve\",\"skip\",\"open\"]",
///  "vars":"{\"symbol\":\"EXM\",\"strategy\":\"Yumi · AMM\",\"amount_lamports\":\"250000000\"}",
///  "server_now":"2026-10-29T08:42:00.151Z"}
///
/// `seq` is an int64 string (kept as [BigInt]); `version` is the approval `rev`
/// that the notification action sends as `p_expected_rev`. `vars.amount_lamports`
/// replaced `vars.sol`; `mm_ss` is no longer sent (computed from `exp` on device).
/// The parser still accepts JSON numbers/lists/maps and the pre-v1.1 flat form
/// (vars as top-level keys, epoch `exp`).
/// Fails closed on unknown `v`/`event`, missing `mode`, real-only events in
/// practice. A Real payload never carries a usable token (dropped if present).
library;

import 'dart:convert';

import '../../data/models/models.dart' show unsupportedQuoteMint;
import '../notifications/notification_catalog.dart';

class PushMessage {
  const PushMessage({
    required this.event,
    required this.mode,
    required this.vars,
    this.approvalId,
    this.positionId,
    this.token,
    this.expiresAt,
    this.expireReason,
    this.serverNow,
    this.serverActions,
    this.type,
    this.workspaceId,
    this.seq,
    this.version,
    this.deepLink,
  });

  final NotifEvent event;

  /// Null only for modeless events (N-03 without mode, N-14, N-16, N-17).
  final NotifMode? mode;

  /// Raw display vars (strings). Token metadata (`coin`) is untrusted text.
  final Map<String, String> vars;
  final String? approvalId;
  final String? positionId;

  /// Single-use Practice buy_pick token. Always null for Real.
  final String? token;
  final DateTime? expiresAt;

  /// N-07 variant (wire: timeout | strategy_deleted | strategy_archived |
  /// guard_failed | price_moved | practice_reset | account_deleted).
  final String? expireReason;

  /// Server clock at send time → clock-skew for countdowns.
  final DateTime? serverNow;

  /// `actions` from the server; the client only ever narrows it. Null = absent (legacy).
  final Set<String>? serverActions;
  final String? type;
  final String? workspaceId;
  final BigInt? seq;

  /// Approval `rev` at send time → `p_expected_rev` for Approve/Skip. Null = not actionable.
  final int? version;
  final String? deepLink;

  /// Screener/order says the coin has no SOL quote pair: informational only,
  /// never Approve/Skip (i18n 0.4.1 `screener.not_tradeable`).
  bool get notTradeable => vars['reason_code'] == unsupportedQuoteMint;

  /// Single-use approval token present and not yet expired.
  bool tokenValidAt(DateTime now) =>
      token != null && token!.isNotEmpty && expiresAt != null && now.toUtc().isBefore(expiresAt!);

  static const _reserved = {
    'v', 'event', 'type', 'mode', 'workspace_id', 'seq', 'version', 'deep_link', 'approval_id', 'position_id', //
    'token', 'exp', 'expire_reason', 'actions', 'vars', 'server_now',
  };

  static DateTime? _time(Object? v) {
    if (v == null) return null;
    if (v is num) return DateTime.fromMillisecondsSinceEpoch(v.toInt() * 1000, isUtc: true);
    final s = '$v';
    final epoch = int.tryParse(s);
    if (epoch != null) return DateTime.fromMillisecondsSinceEpoch(epoch * 1000, isUtc: true);
    return DateTime.tryParse(s)?.toUtc();
  }

  static Object? _json(Object? v) {
    if (v is! String) return v;
    try {
      return jsonDecode(v);
    } on FormatException {
      return null;
    }
  }

  static PushMessage? tryParse(Map<String, dynamic> data) {
    final v = data['v'];
    if (!(v == 1 || v == '1')) return null;
    final event = NotifEvent.byCode('${data['event']}');
    if (event == null) return null;
    final rawMode = data['mode'];
    final mode = switch (rawMode) {
      'practice' => NotifMode.practice,
      'real' => NotifMode.real,
      _ => null,
    };
    if (mode == null && (rawMode != null || event.spec.requiresMode)) return null;
    if (event.spec.realOnly && mode != NotifMode.real) return null;
    String? str(String k) {
      final x = data[k];
      return x is String && x.isNotEmpty ? x : null;
    }

    final approvalId = str('approval_id');
    if (event.isPick && approvalId == null) return null;

    final rawActions = _json(data['actions']);
    final actions = rawActions is List
        ? rawActions.map((e) => '$e').toSet()
        : data['actions'] is String && rawActions == null
        ? '${data['actions']}'.split(',').map((e) => e.trim()).where((e) => e.isNotEmpty).toSet()
        : null;
    final varsJson = _json(data['vars']);
    final vars = <String, String>{
      // Legacy flat vars first; nested `vars` wins.
      for (final e in data.entries)
        if (!_reserved.contains(e.key) && (e.value is String || e.value is num)) e.key: '${e.value}',
      if (varsJson is Map)
        for (final e in varsJson.entries)
          if (e.value != null) '${e.key}': '${e.value}',
    };
    final seq = data['seq'];
    final version = data['version'];
    return PushMessage(
      event: event,
      mode: mode,
      approvalId: approvalId,
      positionId: str('position_id'),
      // Real SOL is never actionable from a push: ignore any token.
      token: mode == NotifMode.real ? null : str('token'),
      expiresAt: _time(data['exp']),
      expireReason: str('expire_reason') ?? vars['reason_code'],
      serverNow: _time(data['server_now']),
      serverActions: actions,
      type: str('type'),
      workspaceId: str('workspace_id'),
      seq: seq is num ? BigInt.from(seq.toInt()) : BigInt.tryParse('${seq ?? ''}'.trim()),
      version: version is num ? version.toInt() : int.tryParse('${version ?? ''}'.trim()),
      deepLink: str('deep_link'),
      vars: vars,
    );
  }

  /// In-app route (go_router). `deep_link` (sentra://…) maps to the same paths.
  String? get route {
    String enc(String? s) => Uri.encodeComponent(s ?? '');
    return switch (event) {
      NotifEvent.n01PickPending || NotifEvent.n02FirstBuyPending => '/approvals/${enc(approvalId)}',
      NotifEvent.n10GuardWeakeningRequested =>
        approvalId == null ? '/approvals' : '/approvals/${enc(approvalId)}/review',
      NotifEvent.n04Filled ||
      NotifEvent.n08TpHit ||
      NotifEvent.n09StopHit => positionId == null ? '/positions' : '/positions/${enc(positionId)}',
      NotifEvent.n05Failed || NotifEvent.n07Expired || NotifEvent.n03Approved || NotifEvent.n06Skipped => '/activity',
      NotifEvent.n11CooldownStarted ||
      NotifEvent.n12WeakeningActive ||
      NotifEvent.n13AutoRevertDone ||
      NotifEvent.n15LossStopPaused => '/strategies',
      NotifEvent.n14ModeSwitch => '/',
      NotifEvent.n16ConnectionError => null,
      NotifEvent.n17TokenInvalid => '/approvals',
    };
  }
}
