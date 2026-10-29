import 'package:flutter_test/flutter_test.dart';
import 'package:sentra_mobile/data/api/api_exception.dart';
import 'package:sentra_mobile/data/api/decide_approval.dart';
import 'package:sentra_mobile/data/mock/mock_backend.dart';
import 'package:sentra_mobile/data/models/models.dart';
import 'package:sentra_mobile/data/repositories/repositories.dart' show ResetPracticeRequest;
import 'package:sentra_mobile/features/approvals/approvals_screen.dart' show decideRequest;

Matcher _api(String code) => throwsA(isA<ApiException>().having((e) => e.rawCode, 'code', code));

void main() {
  group('MockBackend decide_approval', () {
    test('approve opens a position; same idempotency key replays', () async {
      final b = MockBackend();
      final pick = b.debugApprovals.firstWhere((a) => a.kind == ApprovalKind.buyPick && a.isPending);
      final before = b.debugPositions.length;
      final req = decideRequest(pick, approve: true);
      final r1 = await b.decide(req);
      final r2 = await b.decide(req);
      expect(r1.status, ApprovalStatus.approved);
      expect(r1.replayed, isFalse);
      expect(r2.replayed, isTrue);
      expect(r2.rev, r1.rev);
      expect(r1.rev, pick.rev + 1);
      expect(b.debugPositions.length, before + 1);
      // Different key, already decided → typed error.
      expect(
        () => b.decide(
          DecideApprovalRequest(
            approvalId: pick.id,
            token: pick.token,
            approve: true,
            expectedRev: r1.rev,
            idempotencyKey: 'other',
          ),
        ),
        _api('APPROVAL_ALREADY_DECIDED'),
      );
      b.dispose();
    });

    test('skip is wire `rejected`, UI enum stays skipped', () async {
      final b = MockBackend();
      final pick = b.debugApprovals.firstWhere((a) => a.kind == ApprovalKind.buyPick && a.isPending);
      final r = await b.decide(decideRequest(pick, approve: false));
      expect(r.status, ApprovalStatus.skipped);
      expect(r.toJson()['status'], 'rejected');
      expect(decideRequest(pick, approve: false).toRpcParams()['p_decision'], 'reject');
      b.dispose();
    });

    test('forged token, stale version, expiry → typed ApiException', () async {
      var now = DateTime(2026, 10, 29, 15);
      final b = MockBackend(clock: () => now);
      final pick = b.debugApprovals.firstWhere((a) => a.isPending);
      expect(
        () => b.decide(DecideApprovalRequest(approvalId: pick.id, token: 'forged', approve: true, expectedRev: 1)),
        _api('APPROVAL_TOKEN_INVALID'),
      );
      expect(
        () => b.decide(DecideApprovalRequest(approvalId: pick.id, token: pick.token, approve: true, expectedRev: 99)),
        _api('VERSION_CONFLICT'),
      );
      now = now.add(const Duration(hours: 3));
      expect(() => b.decide(decideRequest(pick, approve: true)), _api('APPROVAL_EXPIRED'));
      b.dispose();
    });

    test(
      'UNSUPPORTED_QUOTE_MINT pick: approve rejected, skip allowed with reason not_tradeable, batch-excluded',
      () async {
        final now = DateTime(2026, 10, 29, 15);
        final b = MockBackend(clock: () => now)
          ..debugAddApproval(
            Approval(
              id: 'apv_nt',
              kind: ApprovalKind.buyPick,
              status: ApprovalStatus.pending,
              title: 'Buy NOPAIR',
              detail: 'x',
              createdAt: now,
              expiresAt: now.add(const Duration(minutes: 10)),
              token: 'tok_nt',
              reasonCode: unsupportedQuoteMint,
            ),
          );
        final a = b.debugApprovals.firstWhere((a) => a.id == 'apv_nt');
        expect(a.notTradeable, isTrue);
        expect(a.approvable, isFalse);
        expect(a.swipeable, isTrue, reason: 'left swipe (skip) allowed; right is disabled in the UI');
        expect(a.defaultSkipChip, SkipChip.notTradeable);
        expect(a.copyWith(rev: 2).notTradeable, isTrue, reason: 'copyWith keeps reason_code');
        // Batch approve leaves it out.
        final batch = batchApprovable(b.debugApprovals);
        expect(batch.items.map((x) => x.id), isNot(contains('apv_nt')));
        expect(batch.excludedNotTradeable, 1);
        // 1.1.2 has a real code for it (kind: skip) → no more VALIDATION_FAILED stand-in.
        expect(() => b.decide(decideRequest(a, approve: true)), _api('UNSUPPORTED_QUOTE_MINT'));
        // Skip/reject is allowed; 1.1.3: the enum travels as reject_reason (REST) / p_reject_reason (RPC).
        final req = decideRequest(a, approve: false, chip: a.defaultSkipChip);
        expect(req.toRestBody(), {
          'decision': 'reject',
          'token': 'tok_nt',
          'expected_rev': a.rev,
          'reject_reason': 'not_tradeable',
        });
        expect(req.toRpcParams()['p_reject_reason'], 'not_tradeable');
        expect(req.toRpcParams().containsKey('p_reason'), isFalse, reason: 'RPC has no free-text p_reason');
        final events = <Map<String, Object?>>[];
        final sub = b.rawEvents.listen(events.add);
        final res = await b.decide(req);
        await Future<void>.delayed(Duration.zero);
        expect(res.status, ApprovalStatus.skipped);
        final rejected = events.firstWhere((e) => e['type'] == 'proposal.rejected');
        expect((rejected['payload']! as Map)['reject_reason'], 'not_tradeable');
        expect(res.rejectReason, RejectReason.notTradeable);
        await sub.cancel();
        b.dispose();
      },
    );

    test('Real approve blocked server-side until Phase 7', () async {
      final b = MockBackend();
      final real = b.debugApprovals.firstWhere((a) => a.mode == TradeMode.real && a.isPending);
      expect(() => b.decide(decideRequest(real, approve: true)), _api('REAL_SOL_DISABLED'));
      b.dispose();
    });
  });

  group('MockBackend strategies', () {
    test('pause bumps rev; stale rev → STRATEGY_REV_CONFLICT (P0409) with 409 details', () async {
      final b = MockBackend();
      final s = (await b.watchStrategies().first).firstWhere((s) => s.isRunning);
      final updated = await b.setPaused(s.id, paused: true, expectedRev: s.rev);
      expect(updated.status, StrategyStatus.paused);
      expect(updated.rev, s.rev + 1);
      try {
        await b.setPaused(s.id, paused: false, expectedRev: s.rev);
        fail('expected conflict');
      } on ApiException catch (e) {
        expect(e.rawCode, 'STRATEGY_REV_CONFLICT');
        expect(e.isConflict, isTrue);
        expect(e.sqlState, 'P0409');
        expect(e.details['current_rev'], s.rev + 1);
      }
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

  group('practice reset', () {
    test('30 SOL, archives practice, once per 24 h (RESET_COOLDOWN + next_allowed_at)', () async {
      var now = DateTime.utc(2026, 10, 29, 9);
      final b = MockBackend(clock: () => now);
      final r = await b.resetPractice(const ResetPracticeRequest(MockBackend.workspaceId));
      expect(r.startingBalance, Lamports.parse('30000000000'));
      expect(r.epoch, 2);
      expect(r.nextAllowedAt, now.add(const Duration(hours: 24)));
      expect(b.debugPositions.where((p) => p.mode == TradeMode.practice), isEmpty);
      final s = await b.watchSummary().first;
      expect(s.cashLamports, Lamports.parse('30000000000'));
      expect(s.totalPnlLamports, Lamports.zero);
      expect(b.debugApprovals.where((a) => a.mode == TradeMode.practice && a.isPending), isEmpty);
      expect(b.debugApprovals.where((a) => a.expireReason == ExpireReason.practiceReset), isNotEmpty);
      now = now.add(const Duration(hours: 23));
      try {
        await b.resetPractice(const ResetPracticeRequest(MockBackend.workspaceId));
        fail('expected cooldown');
      } on ApiException catch (e) {
        expect(e.rawCode, 'RESET_COOLDOWN');
        expect(e.code.http, 429);
        expect(e.details['next_allowed_at'], '2026-10-30T09:00:00.000Z');
      }
      now = now.add(const Duration(hours: 1));
      expect((await b.resetPractice(const ResetPracticeRequest(MockBackend.workspaceId))).epoch, 3);
      b.dispose();
    });
  });
}
