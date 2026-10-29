/// Push → parse → render → local display pipeline (mock).
///
/// Prod: the FCM `onMessage`/background handler calls [PushMessage.tryParse]
/// and [NotificationRenderer.render], then `flutter_local_notifications.show`
/// with one `AndroidNotificationAction` / iOS category per [NotifAction].
/// Prototype: [MockLocalNotifier] keeps them in an in-app "notification
/// shade" (Lainnya → Notifikasi) so the same catalog/policy code is exercised.
library;

import 'package:flutter_riverpod/flutter_riverpod.dart';

import '../../data/models/models.dart';
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
  final _grouper = PickGrouper();

  @override
  List<ShownNotification> build() => const [];

  @override
  void show(ShownNotification n) => state = [n, ...state].take(cap).toList();

  /// Entry point for a raw FCM-style data map. Returns false when dropped.
  bool receive(Map<String, dynamic> data, DateTime now) {
    final m = PushMessage.tryParse(data);
    if (m == null) return false;
    final count = m.event.isPick && m.mode != null ? _grouper.record(m.mode!, now) : 0;
    show(ShownNotification(m, now, groupCount: count));
    return true;
  }

  void dismiss(ShownNotification n) => state = [...state]..remove(n);
}

final localNotifierProvider =
    NotifierProvider<MockLocalNotifier, List<ShownNotification>>(MockLocalNotifier.new);

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
    ProviderContainerLike ref, ShownNotification shown, NotifAction action, DateTime now) async {
  final m = shown.message;
  final renderer = ref.read(notificationRendererProvider);
  final notifier = ref.read(localNotifierProvider.notifier);
  void tokenInvalid() => notifier.receive({'v': '1', 'event': 'N-17'}, now);

  switch (action) {
    case NotifAction.approve:
    case NotifAction.skip:
      final allowed = renderer.actionsFor(m, now, grouped: shown.groupCount > 3);
      if (!allowed.contains(action) || m.approvalId == null) {
        tokenInvalid();
        return const Done('Aksi dari notifikasi kedaluwarsa');
      }
      try {
        await ref
            .read(approvalRepositoryProvider)
            .decide(m.approvalId!, approve: action == NotifAction.approve, token: m.token ?? '');
        notifier.dismiss(shown);
        return Done(action == NotifAction.approve ? 'Disetujui dari notifikasi' : 'Dilewati dari notifikasi');
      } on ConflictException {
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
      final route = renderer.render(m, NotifLocale.id, now, groupCount: shown.groupCount).tapRoute;
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
