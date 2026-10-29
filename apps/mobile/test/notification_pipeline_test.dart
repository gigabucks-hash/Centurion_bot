import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:solbot_mobile/core/notifications/local_notifier.dart';
import 'package:solbot_mobile/core/notifications/notification_catalog.dart';
import 'package:solbot_mobile/data/mock/mock_backend.dart';
import 'package:solbot_mobile/data/models/models.dart';
import 'package:solbot_mobile/data/providers.dart';

void main() {
  late MockBackend b;
  late ProviderContainer c;
  setUp(() {
    b = MockBackend();
    c = ProviderContainer(overrides: [mockBackendProvider.overrideWithValue(b)]);
  });
  tearDown(() {
    c.dispose();
    b.dispose();
  });

  Map<String, String> pick(Approval a, {String mode = 'practice', DateTime? exp}) => {
        'v': '1',
        'event': 'N-01',
        'mode': mode,
        'approval_id': a.id,
        'token': a.token,
        'exp': '${(exp ?? a.expiresAt).millisecondsSinceEpoch ~/ 1000}',
        'coin': r'$KEPL',
        'strategy': 'Pullback v2',
        'sol': '0.25',
      };

  test('backend push stream → parse → shade (mock local notification)', () async {
    c.read(pushPipelineProvider);
    b.debugSetChange('ck103.0', 55); // TP1 → N-08
    await Future<void>.delayed(Duration.zero);
    final shade = c.read(localNotifierProvider);
    expect(shade.single.message.event, NotifEvent.n08TpHit);
    expect(shade.single.message.positionId, 'ck103.0');
  });

  test('malformed or mode-less pick payloads are dropped', () {
    final n = c.read(localNotifierProvider.notifier);
    expect(n.receive({'v': '1', 'event': 'N-01', 'approval_id': 'x'}, DateTime.now()), isFalse);
    expect(c.read(localNotifierProvider), isEmpty);
  });

  test('Approve from a Practice notification decides the approval', () async {
    final a = (await b.watchPending().first).firstWhere((a) => a.id == 'apv_seed1');
    final n = c.read(localNotifierProvider.notifier)..receive(pick(a), DateTime.now());
    final shown = c.read(localNotifierProvider).single;
    final out = await handleNotificationAction(ContainerReader(c), shown, NotifAction.approve, DateTime.now());
    expect(out, isA<Done>());
    expect((await b.watchPending().first).any((x) => x.id == 'apv_seed1'), isFalse);
    expect(c.read(localNotifierProvider), isEmpty, reason: 'dismissed after action');
    expect(n, isNotNull);
  });

  test('stale Approve (token expired since display) → N-17, nothing decided', () async {
    final a = (await b.watchPending().first).firstWhere((a) => a.id == 'apv_seed1');
    c.read(localNotifierProvider.notifier).receive(pick(a), DateTime.now());
    final shown = c.read(localNotifierProvider).single;
    final later = a.expiresAt.add(const Duration(seconds: 1));
    await handleNotificationAction(ContainerReader(c), shown, NotifAction.approve, later);
    expect((await b.watchPending().first).any((x) => x.id == 'apv_seed1'), isTrue);
    expect(c.read(localNotifierProvider).first.message.event, NotifEvent.n17TokenInvalid);
  });

  test('Real pick: a forged Approve/Skip press is refused (N-17)', () async {
    final a = (await b.watchPending().first).firstWhere((a) => a.id == 'apv_seed1');
    c.read(localNotifierProvider.notifier).receive(pick(a, mode: 'real'), DateTime.now());
    final shown = c.read(localNotifierProvider).single;
    for (final act in [NotifAction.approve, NotifAction.skip]) {
      await handleNotificationAction(ContainerReader(c), shown, act, DateTime.now());
    }
    expect((await b.watchPending().first).any((x) => x.id == 'apv_seed1'), isTrue);
    expect(c.read(localNotifierProvider).first.message.event, NotifEvent.n17TokenInvalid);
  });

  test('view buttons navigate to the deep link', () async {
    c.read(localNotifierProvider.notifier).receive(
        {'v': '1', 'event': 'N-04', 'mode': 'practice', 'position_id': 'ck100.0', 'coin': r'$GLOW'}, DateTime.now());
    final shown = c.read(localNotifierProvider).single;
    final out = await handleNotificationAction(ContainerReader(c), shown, NotifAction.viewPosition, DateTime.now());
    expect(out, isA<Navigate>().having((n) => n.route, 'route', '/positions/ck100.0'));
  });
}
