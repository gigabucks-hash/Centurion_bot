/// Contract for push notification data payloads (FCM `data` block; APNs via
/// FCM). Pure Dart: unit-testable, usable from the FCM background isolate and
/// shared with the backend spec. All values are strings (FCM data rule).
///
/// Example (N-01, Practice pick):
/// {"v":"1","event":"N-01","mode":"practice","approval_id":"apv_0012",
///  "token":"tok_…","exp":"1793260000","coin":"$KEPL","strategy":"Pullback v2",
///  "sol":"0.25"}
///
/// Copy is NEVER sent by the server: the client renders it from the typed
/// catalog (`core/notifications/notification_catalog.dart`) in the user's
/// language. Token metadata (`coin`) is untrusted display text.
library;

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
  });

  final NotifEvent event;

  /// Null only for modeless events (N-03 without mode, N-14, N-16, N-17).
  final NotifMode? mode;
  final Map<String, String> vars;
  final String? approvalId;
  final String? positionId;
  final String? token;
  final DateTime? expiresAt;

  /// N-07 variant: timed_out | strategy_deleted | guard_failed | price_ran.
  final String? expireReason;

  /// Single-use approval token present and not yet expired.
  bool tokenValidAt(DateTime now) =>
      token != null && token!.isNotEmpty && expiresAt != null && now.toUtc().isBefore(expiresAt!);

  static const _reserved = {'v', 'event', 'mode', 'approval_id', 'position_id', 'token', 'exp', 'expire_reason'};

  /// Fails closed: unknown version/event, or a missing/unknown mode for an
  /// event that requires one, yields null (the notification is dropped and
  /// the in-app feed remains the source of truth).
  static PushMessage? tryParse(Map<String, dynamic> data) {
    if (data['v'] != '1') return null;
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
    final exp = int.tryParse('${data['exp'] ?? ''}');
    String? str(String k) {
      final v = data[k];
      return v is String && v.isNotEmpty ? v : null;
    }

    final approvalId = str('approval_id');
    if (event.isPick && approvalId == null) return null;
    return PushMessage(
      event: event,
      mode: mode,
      approvalId: approvalId,
      positionId: str('position_id'),
      token: str('token'),
      expiresAt: exp == null ? null : DateTime.fromMillisecondsSinceEpoch(exp * 1000, isUtc: true),
      expireReason: str('expire_reason'),
      vars: {
        for (final e in data.entries)
          if (!_reserved.contains(e.key) && e.value is String) e.key: e.value as String,
      },
    );
  }

  /// Deep link handled by go_router (also `sentra://…` later).
  String? get route {
    String enc(String? s) => Uri.encodeComponent(s ?? '');
    return switch (event) {
      NotifEvent.n01PickPending || NotifEvent.n02FirstBuyPending => '/approvals/${enc(approvalId)}',
      NotifEvent.n10GuardWeakeningRequested =>
        approvalId == null ? '/approvals' : '/approvals/${enc(approvalId)}/review',
      NotifEvent.n04Filled || NotifEvent.n08TpHit || NotifEvent.n09StopHit =>
        positionId == null ? '/positions' : '/positions/${enc(positionId)}',
      NotifEvent.n05Failed || NotifEvent.n07Expired || NotifEvent.n03Approved || NotifEvent.n06Skipped =>
        '/activity',
      NotifEvent.n11CooldownStarted ||
      NotifEvent.n12WeakeningActive ||
      NotifEvent.n13AutoRevertDone ||
      NotifEvent.n15LossStopPaused =>
        '/strategies',
      NotifEvent.n14ModeSwitch => '/',
      NotifEvent.n16ConnectionError => null,
      NotifEvent.n17TokenInvalid => '/approvals',
    };
  }
}
