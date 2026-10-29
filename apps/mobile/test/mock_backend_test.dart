import 'package:flutter_test/flutter_test.dart';
import 'package:solbot_mobile/data/mock/mock_backend.dart';
import 'package:solbot_mobile/data/models/models.dart';

void main() {
  group('MockBackend approvals', () {
    test('approving a buy pick opens a position and is idempotent', () async {
      final b = MockBackend();
      final pending = await b.watchPending().first;
      final pick = pending.firstWhere((a) => a.kind == ApprovalKind.buyPick);
      final before = (await b.watchPositions().first).length;

      final s1 = await b.decide(pick.id, approve: true, token: pick.token);
      final s2 = await b.decide(pick.id, approve: true, token: pick.token);

      expect(s1, ApprovalStatus.approved);
      expect(s2, ApprovalStatus.approved);
      expect((await b.watchPositions().first).length, before + 1);
      expect((await b.watchPending().first).any((a) => a.id == pick.id), isFalse);
      b.dispose();
    });

    test('wrong token is rejected', () async {
      final b = MockBackend();
      final pick = (await b.watchPending().first).first;
      expect(() => b.decide(pick.id, approve: true, token: 'forged'), throwsA(isA<ConflictException>()));
      b.dispose();
    });

    test('expired approval cannot be approved', () async {
      var now = DateTime(2026, 10, 29, 15);
      final b = MockBackend(clock: () => now);
      final pick = (await b.watchPending().first).first;
      now = now.add(const Duration(hours: 3));
      expect(await b.decide(pick.id, approve: true, token: pick.token), ApprovalStatus.expired);
      b.dispose();
    });
  });

  group('MockBackend strategies', () {
    test('pause bumps rev and stale rev conflicts', () async {
      final b = MockBackend();
      final s = (await b.watchStrategies().first).firstWhere((s) => s.isRunning);
      final updated = await b.setPaused(s.id, paused: true, expectedRev: s.rev);
      expect(updated.status, StrategyStatus.paused);
      expect(updated.rev, s.rev + 1);
      expect(() => b.setPaused(s.id, paused: false, expectedRev: s.rev), throwsA(isA<ConflictException>()));
      b.dispose();
    });

    test('tick streams new summary values', () async {
      final b = MockBackend();
      final values = <PortfolioSummary>[];
      final sub = b.watchSummary().listen(values.add);
      await Future<void>.delayed(Duration.zero);
      b.tick();
      b.tick();
      await Future<void>.delayed(Duration.zero);
      expect(values.length, greaterThanOrEqualTo(3));
      await sub.cancel();
      b.dispose();
    });
  });
}
