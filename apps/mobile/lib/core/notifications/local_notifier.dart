/// Push → parse → render → local display pipeline (mock).
///
/// Prod: the FCM `onMessage`/background handler calls [PushMessage.tryParse]
/// and [NotificationRenderer.render], then `flutter_local_notifications.show`
/// with one `AndroidNotificationAction` / iOS category per [NotifAction].
/// Prototype: [MockLocalNotifier] keeps them in an in-app "notification
/// shade" (Lainnya → Notifikasi) so the same catalog/policy code is exercised.
library;

import 'package:flutter_riverpod/flutter_riverpod.dart';

import '../../data/api/api_exception.dart';
import '../../data/api/decide_approval.dart';
import '../../data/api/server_clock.dart';
import '../../data/api/wire.dart';
import '../../data/providers.dart';
import '../push/push_payload.dart';
import 'notification_catalog.dart';
import 'notification_renderer.dart';

/// User language (ID default, EN available): drives MaterialApp.locale and
/// notification copy, so copy and number format always match.
final notificationLocaleProvider = StateProvider<NotifLocale>((_) => NotifLocale.id);

final notificationRendererProvider = Provider<NotificationRenderer>((_) => const NotificationRenderer());

class ShownNotification {
  const ShownNotification(this.message, this.receivedAt, {this.groupCount = 0});
  final PushMessage message;
  final DateTime receivedAt;
  final int groupCount;
}

abstract interface class LocalNotifier {
  void show(ShownNotification n);
}

/// In-memory shade, newest first, capped. Rendering happens at display time
/// so switching ID/EN re-renders already shown items.
class MockLocalNotifier extends Notifier<List<ShownNotification>> implements LocalNotifier {
  static const cap = 30;
  static const _seenCap = 500;
  final _grouper = PickGrouper();

  /// `workspace:seq` already shown (FCM may deliver twice; several devices/channels).
  final _seen = <String>{};
  final _seenOrder = <String>[];

  /// approval_id → highest seq seen; an older event for the same approval is stale.
  final _approvalSeq = <String, BigInt>{};

  @override
  List<ShownNotification> build() => const [];

  /// Inserts newest-first by `seq` (server order, never `ts`); seq-less items
  /// (local N-16/N-17) go on top.
  @override
  void show(ShownNotification n) {
    final seq = n.message.seq;
    final list = [...state];
    var at = 0;
    if (seq != null) {
      while (at < list.length && (list[at].message.seq == null || list[at].message.seq! > seq)) {
        at++;
      }
    }
    list.insert(at, n);
    state = list.take(cap).toList();
  }

  static const _terminal = {NotifEvent.n03Approved, NotifEvent.n06Skipped, NotifEvent.n07Expired};

  /// Entry point for a raw FCM-style data map. Returns false when dropped
  /// (invalid, duplicate seq, or older than what we know for that approval).
  bool receive(Map<String, dynamic> data, DateTime now) {
    final m = PushMessage.tryParse(data);
    if (m == null) return false;
    final seq = m.seq;
    if (seq != null) {
      final key = '${m.workspaceId ?? ''}:$seq';
      if (_seen.contains(key)) return false;
      final aid = m.approvalId;
      if (aid != null) {
        final last = _approvalSeq[aid];
        if (last != null && seq < last) return false; // stale (e.g. N-01 after its N-03)
        _approvalSeq[aid] = seq;
      }
      _seen.add(key);
      _seenOrder.add(key);
      if (_seenOrder.length > _seenCap) _seen.remove(_seenOrder.removeAt(0));
    }
    if (m.serverNow != null) ref.read(serverClockProvider.notifier).observe(m.serverNow!, localNow: now);
    // A decided/expired approval supersedes its pick notification (buttons must vanish).
    if (_terminal.contains(m.event) && m.approvalId != null) {
      state = state.where((s) => !(s.message.event.isPick && s.message.approvalId == m.approvalId)).toList();
    }
    final count = m.event.isPick && m.mode != null ? _grouper.record(m.mode!, now) : 0;
    show(ShownNotification(m, now, groupCount: count));
    return true;
  }

  void dismiss(ShownNotification n) => state = [...state]..remove(n);
}

final localNotifierProvider = NotifierProvider<MockLocalNotifier, List<ShownNotification>>(MockLocalNotifier.new);

/// Wires the backend's push stream into the notifier. Watched by HomeShell.
final pushPipelineProvider = Provider<void>((ref) {
  final source = ref.watch(mockBackendProvider);
  final sub = source.watchPushPayloads().listen((data) {
    ref.read(localNotifierProvider.notifier).receive(data, DateTime.now());
  });
  ref.onDispose(sub.cancel);
});

/// Result of pressing a notification button.
sealed class ActionOutcome {
  const ActionOutcome();
}

class Navigate extends ActionOutcome {
  const Navigate(this.route);
  final String route;
}

class Done extends ActionOutcome {
  const Done(this.message);
  final String message;
}

/// Handles a button press. Re-checks the security policy at press time
/// (the token may have expired since display); a stale/rejected action is
/// answered with N-17 "Notification action expired".
Future<ActionOutcome> handleNotificationAction(
  ProviderContainerLike ref,
  ShownNotification shown,
  NotifAction action,
  DateTime now,
) async {
  final m = shown.message;
  final renderer = ref.read(notificationRendererProvider);
  final notifier = ref.read(localNotifierProvider.notifier);
  void tokenInvalid() => notifier.receive({'v': 1, 'event': 'N-17'}, now);
  final skew = ref.read(serverClockProvider);

  switch (action) {
    case NotifAction.approve:
    case NotifAction.skip:
      final allowed = renderer.actionsFor(m, now.add(skew), grouped: shown.groupCount > 3);
      if (!allowed.contains(action) || m.approvalId == null) {
        tokenInvalid();
        return const Done('Aksi dari notifikasi kedaluwarsa');
      }
      final approve = action == NotifAction.approve;
      try {
        // 1.1.2: p_expected_rev = push `version` (approval rev; actionsFor guarantees
        // non-null). Client/via come from the JWT, never a param.
        final res = await ref
            .read(approvalRepositoryProvider)
            .decide(
              DecideApprovalRequest(
                approvalId: m.approvalId!,
                token: m.token ?? '',
                approve: approve,
                expectedRev: m.version!,
                idempotencyKey: 'push:${m.approvalId}:r${m.version}:${Wire.decision(approve: approve)}',
              ),
            );
        ref.read(serverClockProvider.notifier).observe(res.serverNow, localNow: now);
        notifier.dismiss(shown);
        return Done(action == NotifAction.approve ? 'Disetujui dari notifikasi' : 'Dilewati dari notifikasi');
      } on ApiException {
        tokenInvalid();
        return const Done('Aksi dari notifikasi kedaluwarsa');
      }
    case NotifAction.retry:
      return const Done('Mencoba lagi…');
    case NotifAction.undo:
      return const Done('Undo (5 dtk) ada di kartu Approvals');
    case NotifAction.cancel:
    case NotifAction.review:
    case NotifAction.view:
    case NotifAction.viewPosition:
    case NotifAction.detail:
    case NotifAction.open:
      final route = renderer.render(m, NotifLocale.id, now, groupCount: shown.groupCount, clockSkew: skew).tapRoute;
      return Navigate(route ?? '/');
  }
}

/// Minimal read surface shared by WidgetRef and ProviderContainer.
abstract interface class ProviderContainerLike {
  T read<T>(ProviderListenable<T> provider);
}

class WidgetRefReader implements ProviderContainerLike {
  WidgetRefReader(this._ref);
  final WidgetRef _ref;
  @override
  T read<T>(ProviderListenable<T> provider) => _ref.read(provider);
}

class ContainerReader implements ProviderContainerLike {
  ContainerReader(this._c);
  final ProviderContainer _c;
  @override
  T read<T>(ProviderListenable<T> provider) => _c.read(provider);
}
