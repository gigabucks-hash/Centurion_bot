import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:solbot_mobile/core/notifications/local_notifier.dart';
import 'package:solbot_mobile/core/notifications/notification_catalog.dart';
import 'package:solbot_mobile/data/api/server_clock.dart';
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
    'version': '${a.rev}', // 1.1.2: approval rev → p_expected_rev
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
    expect(shade.single.message.seq, isNotNull, reason: 'mock emits PushPayload v1.1');
    expect(shade.single.message.serverActions, {'open'});
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

  test('push decide sends p_expected_rev = push version; a stale version is refused', () async {
    final a = (await b.watchPending().first).firstWhere((a) => a.id == 'apv_seed1');
    c.read(localNotifierProvider.notifier).receive({...pick(a), 'version': '${a.rev + 5}'}, DateTime.now());
    final shown = c.read(localNotifierProvider).single;
    expect(shown.message.version, a.rev + 5);
    final out = await handleNotificationAction(ContainerReader(c), shown, NotifAction.approve, DateTime.now());
    expect(out, isA<Done>());
    expect((await b.watchPending().first).any((x) => x.id == 'apv_seed1'), isTrue, reason: 'VERSION_CONFLICT');
    expect(c.read(localNotifierProvider).first.message.event, NotifEvent.n17TokenInvalid);
  });

  test('mock push data is all strings (1.1.2): seq/version strings, actions/vars JSON', () async {
    final raw = <Map<String, Object?>>[];
    final sub = b.watchPushPayloads().listen(raw.add);
    b.debugSetChange('ck103.0', 55); // TP1 → N-08
    await Future<void>.delayed(Duration.zero);
    expect(raw, isNotEmpty);
    for (final d in raw) {
      expect(d.values.every((v) => v is String), isTrue, reason: '$d');
      expect(BigInt.tryParse(d['seq']! as String), isNotNull);
      expect(d['vars']! as String, isNot(contains('"sol"')));
      expect(d['vars']! as String, isNot(contains('mm_ss')));
    }
    await sub.cancel();
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
    c.read(localNotifierProvider.notifier).receive({
      'v': '1',
      'event': 'N-04',
      'mode': 'practice',
      'position_id': 'ck100.0',
      'coin': r'$GLOW',
    }, DateTime.now());
    final shown = c.read(localNotifierProvider).single;
    final out = await handleNotificationAction(ContainerReader(c), shown, NotifAction.viewPosition, DateTime.now());
    expect(out, isA<Navigate>().having((n) => n.route, 'route', '/positions/ck100.0'));
  });

  group('seq: dedupe + ordering', () {
    Map<String, Object?> ev(String event, int seq, {String? approval, String ws = 'ws1'}) => {
      'v': '1',
      'event': event,
      'mode': 'practice',
      'workspace_id': ws,
      'seq': '$seq', // int64 string (1.1.2)
      'approval_id': ?approval,
      'actions': '["open"]',
      'vars': '{"symbol":"EXM"}',
    };

    test('duplicate (workspace, seq) is shown once', () {
      final n = c.read(localNotifierProvider.notifier);
      expect(n.receive(ev('N-04', 10), DateTime.now()), isTrue);
      expect(n.receive(ev('N-04', 10), DateTime.now()), isFalse);
      expect(n.receive(ev('N-04', 10, ws: 'ws2'), DateTime.now()), isTrue, reason: 'seq is per workspace');
      expect(c.read(localNotifierProvider), hasLength(2));
    });

    test('shade is ordered by seq, not arrival', () {
      final n = c.read(localNotifierProvider.notifier);
      for (final s in [12, 10, 11]) {
        n.receive(ev('N-04', s), DateTime.now());
      }
      expect(c.read(localNotifierProvider).map((x) => x.message.seq?.toInt()), [12, 11, 10]);
    });

    test('seq strings order numerically as BigInt, never lexically ("10" > "9")', () {
      final n = c.read(localNotifierProvider.notifier);
      for (final s in [9, 10, 100]) {
        n.receive(ev('N-04', s), DateTime.now());
      }
      expect(c.read(localNotifierProvider).map((x) => '${x.message.seq}'), ['100', '10', '9']);
      // Stale check per approval is numeric too: "10" after "9" is newer, not older.
      expect(n.receive(ev('N-01', 99, approval: 'z')..['token'] = 't', DateTime.now()), isTrue);
      expect(
        n.receive(ev('N-03', 100, approval: 'z', ws: 'ws3'), DateTime.now()),
        isTrue,
        reason: '"100" > "99"',
      );
      expect(
        n.receive(ev('N-01', 98, approval: 'z', ws: 'ws4'), DateTime.now()),
        isFalse,
        reason: '98 < 100: stale',
      );
    });

    test('decision supersedes its pick; an older pick arriving late is dropped', () {
      final n = c.read(localNotifierProvider.notifier);
      n.receive({...ev('N-01', 20, approval: 'a1'), 'token': 't', 'exp': '2099-01-01T00:00:00Z'}, DateTime.now());
      n.receive(ev('N-03', 22, approval: 'a1'), DateTime.now());
      final shade = c.read(localNotifierProvider);
      expect(shade.map((x) => x.message.event), [NotifEvent.n03Approved]);
      // Late duplicate delivery of an older event for the same approval.
      expect(n.receive({...ev('N-01', 21, approval: 'a1'), 'token': 't'}, DateTime.now()), isFalse);
    });

    test('server_now feeds the clock skew', () {
      final now = DateTime.utc(2026, 10, 29, 8, 0);
      c.read(localNotifierProvider.notifier).receive({
        ...ev('N-04', 30),
        'server_now': '2026-10-29T08:00:05.000Z',
      }, now);
      expect(c.read(serverClockProvider), const Duration(seconds: 5));
    });
  });
}
