import 'package:flutter_test/flutter_test.dart';
import 'package:solbot_mobile/data/api/api_exception.dart';
import 'package:solbot_mobile/data/api/events_feed.dart';
import 'package:solbot_mobile/data/api/marks.dart';
import 'package:solbot_mobile/data/api/sentra_rpc.dart';
import 'package:solbot_mobile/data/api/settings_keys.dart';
import 'package:solbot_mobile/data/api/wire.dart';
import 'package:solbot_mobile/data/mock/mock_backend.dart';
import 'package:solbot_mobile/data/mock/mock_rpc.dart';
import 'package:solbot_mobile/data/models/models.dart';
import 'package:solbot_mobile/data/repositories/repositories.dart';

void main() {
  group('wire mapping (v1.1)', () {
    test('status / kind / mode / approval_mode / expire reasons use wire values', () {
      expect(Wire.approvalStatusOf('rejected'), ApprovalStatus.skipped);
      expect(Wire.approvalStatus(ApprovalStatus.skipped), 'rejected');
      expect(Wire.approvalKind(ApprovalKind.buyPick), 'buy_pick');
      expect(Wire.modeOf('paper'), isNull, reason: 'paper/live are not wire modes');
      expect(Wire.approvalMode(ApprovalMode.askFirstBuy), 'ask_first_buy');
      expect(
        [for (final r in ExpireReason.values) Wire.expireReason(r)],
        [
          'timeout',
          'strategy_deleted',
          'strategy_archived',
          'guard_failed',
          'price_moved',
          'practice_reset',
          'account_deleted',
        ],
      );
      expect(Wire.expireReasonOf('timed_out'), isNull, reason: 'spec spelling is not a wire value');
    });

    test('settings + exit preset mapping follows the CHANGELOG 1.1.0 rename table', () {
      expect(SettingsKeys.ticketLamports.current, 'ticket_lamports');
      expect(SettingsKeys.normalize('maxOpen'), 'max_concurrent_positions');
      expect(SettingsKeys.normalize('stopLossPct'), 'peak_trail_pct');
      expect(SettingsKeys.normalize('shield'), 'guard_checks');
      expect(SettingsKeys.removedV10, contains('askFirst'));
      expect(ExitPresets.normalize('ladder'), 'three_step_ladder');
      expect(ExitPresets.normalize('scalp'), 'fast_half');
      expect(ExitPresets.normalize('stepLock'), 'ratchet');
      expect(ExitPresets.all, hasLength(13));
      expect(SettingsKeys.all, hasLength(59)); // 60 rows, askFirst removed
      for (final k in [...SettingsKeys.all, ...ExitPresets.all]) {
        expect(k.current, matches(RegExp(r'^[a-z][a-z0-9_]*$')), reason: 'snake_case: ${k.current}');
      }
    });

    test('ApiException from Postgres P04xx / REST body', () {
      final pg = ApiException.fromPostgres(sqlState: 'P0409', message: 'STRATEGY_REV_CONFLICT');
      expect(pg.rawCode, 'STRATEGY_REV_CONFLICT');
      expect(pg.isConflict, isTrue);
      final rest = ApiException.fromRestBody({
        'error': {
          'code': 'RESET_COOLDOWN',
          'message': 'wait',
          'details': {'next_allowed_at': 'x'},
        },
      });
      expect(rest.code.http, 429);
      expect(rest.details['next_allowed_at'], 'x');
      final conflict = ApiException.fromRestBody({
        'error': {'code': 'VERSION_CONFLICT'},
        'current_rev': 9,
        'changed_fields': ['approval_mode'],
      });
      expect(conflict.details['current_rev'], 9);
      expect(ApiException.fromCode('SOMETHING_NEW').code, ApiErrorCode.unknown);
    });

    test('marks broadcast: decimal price, never double', () {
      final m =
          MarksMessage.fromBroadcast({
                'event': 'mark',
                'payload': {
                  'mint': 'M',
                  'price_usd': '0.000041230000',
                  'ts': '2026-10-29T08:42:01.020Z',
                  'position_ids': ['p1'],
                  'server_now': '2026-10-29T08:42:01.031Z',
                },
              })!
              as MarkMessage;
      expect(m.priceUsd, Decimal.parse('0.00004123'));
      expect(marksChannel('ws1', TradeMode.practice), 'marks:ws1:practice');
      final c =
          MarksMessage.fromBroadcast({
                'event': 'clock',
                'payload': {'server_now': '2026-10-29T08:42:15.000Z', 'safe_seq': 18240},
              })!
              as ClockMessage;
      expect(c.safeSeq, 18240);
    });
  });

  group('RPCs (mock)', () {
    late MockBackend b;
    late MockSentraRpc rpc;
    setUp(() {
      b = MockBackend();
      rpc = MockSentraRpc(b);
    });
    tearDown(() => b.dispose());

    test('decide_approval params: no device_id, p_* names', () async {
      final pick = b.debugApprovals.firstWhere((a) => a.isPending && a.mode == TradeMode.practice);
      await rpc.decideApproval(
        DecideApprovalRequest(
          approvalId: pick.id,
          token: pick.token,
          approve: true,
          expectedRev: pick.version,
          idempotencyKey: 'k',
        ),
      );
      final (name, params) = rpc.lastCall!;
      expect(name, 'decide_approval');
      expect(params.keys.toSet(), {
        'p_approval_id',
        'p_token',
        'p_decision',
        'p_expected_rev',
        'p_client',
        'p_idempotency_key',
      });
    });

    test('set_strategy_status + update_strategy (snake_case patch only)', () async {
      final s = (await b.watchStrategies().first).firstWhere((s) => s.isRunning);
      final r1 = await rpc.setStrategyStatus(
        SetStrategyStatusRequest(strategyId: s.id, status: StrategyStatus.paused, expectedRev: s.rev),
      );
      expect(rpc.lastCall!.$2, {'p_strategy': s.id, 'p_status': 'paused', 'p_expected_rev': s.rev});
      final r2 = await rpc.updateStrategy(
        UpdateStrategyRequest(
          strategyId: s.id,
          expectedRev: r1.rev,
          patch: {
            SettingsKeys.approvalMode.current: 'ask_every_buy',
            SettingsKeys.ticketLamports.current: '300000000',
            SettingsKeys.exitPreset.current: ExitPresets.ratchet.current,
          },
        ),
      );
      expect(r2.rev, r1.rev + 1);
      final after = (await b.watchStrategies().first).firstWhere((x) => x.id == s.id);
      expect(after.approvalMode, ApprovalMode.askEveryBuy);
      expect(after.ticketLamports, Lamports.parse('300000000'));
      expect(after.exitPlan, 'ratchet');
      // v1.0 camelCase keys are rejected.
      expect(
        () => rpc.updateStrategy(
          UpdateStrategyRequest(strategyId: s.id, expectedRev: r2.rev, patch: {'tradeLamports': '1'}),
        ),
        throwsA(isA<ApiException>().having((e) => e.rawCode, 'code', 'SETTINGS_SCHEMA_INVALID')),
      );
    });

    test('reset_practice, register_device / revoke_device', () async {
      final r = await rpc.resetPractice(MockBackend.workspaceId);
      expect(rpc.lastCall!.$2, {'p_workspace': MockBackend.workspaceId});
      expect(r.startingBalance.toWire(), '30000000000');
      const req = RegisterDeviceRequest(
        deviceId: 'install_ABC123',
        platform: DevicePlatform.android,
        provider: PushProvider.fcm,
        token: 'fcm-token',
        appVersion: '0.1.0',
        locale: 'id-ID',
      );
      final d1 = await rpc.registerDevice(req);
      final d2 = await rpc.registerDevice(req); // rotation bumps rev
      expect(d2.rev, d1.rev + 1);
      expect(rpc.lastCall!.$2.keys.toSet(), {
        'p_device_id',
        'p_platform',
        'p_provider',
        'p_token',
        'p_app_version',
        'p_locale',
      });
      await rpc.revokeDevice('install_ABC123');
      expect(b.devices, isEmpty);
      expect(
        () => rpc.registerDevice(
          const RegisterDeviceRequest(
            deviceId: 'x',
            platform: DevicePlatform.ios,
            provider: PushProvider.apns,
            token: 't',
            appVersion: '1',
            locale: 'en',
          ),
        ),
        throwsA(isA<ApiException>().having((e) => e.rawCode, 'code', 'DEVICE_TOKEN_INVALID')),
      );
    });

    test('portfolio_latest (lamport strings) and exit_stats()', () async {
      final p = await rpc.portfolioLatest(TradeMode.practice);
      final s = await b.watchSummary().first;
      expect(p.equity, s.equityLamports);
      expect(p.cash, s.cashLamports);
      b.debugSetChange('ck101.0', -36); // MOTH → loss_guard
      final stats = await rpc.exitStats(mode: TradeMode.practice);
      expect(stats.map((e) => e.reason), contains('loss_guard'));
      expect(stats.map((e) => e.reason).every((r) => !r.contains(RegExp('[A-Z]'))), isTrue);
    });
  });

  group('events feed', () {
    Map<String, Object?> env(int seq, String id, {String mode = 'practice'}) => {
      'id': id,
      'seq': seq,
      'type': 'proposal.created',
      'version': 1,
      'workspace_id': 'ws',
      'ts': '2026-10-29T08:42:00.123Z',
      'actor': 'entry',
      'mode': mode,
      'payload': {},
    };

    test('dedupe by id, order by seq, watermark only from safe_seq', () {
      final s = EventSequencer();
      final page = [
        env(12, 'c'),
        env(10, 'a'),
        env(11, 'b'),
        env(10, 'a'),
      ].map(EventEnvelope.tryParse).cast<EventEnvelope>();
      expect(s.acceptAll(page).map((e) => e.seq), [10, 11, 12]);
      expect(s.watermark, 0, reason: 'raw rows never move the watermark');
      s.advanceSafe(11);
      expect(s.accept(EventEnvelope.tryParse(env(11, 'late'))!), isFalse);
      expect(s.accept(EventEnvelope.tryParse(env(13, 'd'))!), isTrue);
      expect(EventEnvelope.tryParse(env(14, 'x', mode: 'paper')), isNull, reason: 'fail closed on mode');
    });

    test('mock emits seq-ordered envelopes on decisions and reset', () async {
      final b = MockBackend();
      final got = <EventEnvelope>[];
      final sub = b.watchEvents(MockBackend.workspaceId, TradeMode.practice).listen(got.add);
      final pick = b.debugApprovals.firstWhere((a) => a.isPending && a.mode == TradeMode.practice);
      await b.decide(
        DecideApprovalRequest(approvalId: pick.id, token: pick.token, approve: false, expectedRev: pick.version),
      );
      await b.resetPractice(idempotencyKey: 'k');
      await Future<void>.delayed(Duration.zero);
      expect(got.map((e) => e.type), containsAllInOrder(['proposal.rejected', 'practice.reset']));
      expect(got.first.topic, EventTopic.approvals);
      final seqs = got.map((e) => e.seq).toList();
      expect(seqs, [...seqs]..sort());
      await sub.cancel();
      b.dispose();
    });
  });

  test('PracticeResetResult parses the v1.1 200 body', () {
    final r = PracticeResetResult.fromJson({
      'epoch': 4,
      'starting_balance_lamports': '30000000000',
      'archived': {'positions': 3},
      'next_allowed_at': '2026-10-30T09:00:00.000Z',
      'server_now': '2026-10-29T09:00:00.000Z',
    });
    expect(r.startingBalance, Lamports.fromSol('30'));
    expect(r.archived['positions'], 3);
  });
}
