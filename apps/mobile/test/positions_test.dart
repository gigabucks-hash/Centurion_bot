import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:solbot_mobile/app/app.dart';
import 'package:solbot_mobile/core/approval_guard.dart';
import 'package:solbot_mobile/core/feature_flags.dart';
import 'package:solbot_mobile/core/widgets/common.dart';
import 'package:solbot_mobile/data/api/api_exception.dart';
import 'package:solbot_mobile/data/api/settings_keys.dart';
import 'package:solbot_mobile/data/mock/mock_backend.dart';
import 'package:solbot_mobile/data/models/models.dart';
import 'package:solbot_mobile/data/providers.dart';
import 'package:solbot_mobile/features/positions/widgets/exit_progress_bar.dart';

/// [realSol] flips the Phase 7 flag (client + mock server) for tests that exercise Real flows.
Widget _app(MockBackend b, String location, {bool realSol = false}) => ProviderScope(
  overrides: [
    mockBackendProvider.overrideWithValue(b..realSolEnabled = realSol),
    featureFlagsProvider.overrideWithValue(FeatureFlags(realSolEnabled: realSol)),
    approvalGuardProvider.overrideWithValue(const AlwaysAllowGuard()),
  ],
  child: SolBotApp(initialLocation: location),
);

Future<void> _phone(WidgetTester tester) async {
  tester.view.physicalSize = const Size(412 * 3, 915 * 3);
  tester.view.devicePixelRatio = 3;
  addTearDown(tester.view.reset);
}

/// Press-and-hold in 100 ms steps (a single long pump does not tick the controller).
Future<void> _hold(WidgetTester tester, Finder f, Duration d) async {
  final g = await tester.startGesture(tester.getCenter(f));
  for (var t = 0; t < d.inMilliseconds; t += 100) {
    await tester.pump(const Duration(milliseconds: 100));
  }
  await g.up();
  await tester.pump();
}

Position _realPosition() {
  final now = DateTime.now();
  return Position(
    id: 'ckR1.0',
    strategyId: 'stg_grad',
    symbol: 'REAL',
    mint: 'So11111111111111111111111111111111111111112',
    mode: TradeMode.real,
    state: PositionState.open,
    costLamports: Lamports.fromSol('0.1'),
    entryPriceUsd: Decimal.parse('0.001'),
    markPriceUsd: Decimal.parse('0.0011'),
    peakPriceUsd: Decimal.parse('0.0011'),
    openedAt: now.subtract(const Duration(minutes: 3)),
    exitPlan: MockBackend.planFor(ExitPresets.threeStepLadder.current, now),
  );
}

void main() {
  group('exit plan (mock backend)', () {
    test('TP rung sells its share, arms trail, emits N-08 push', () async {
      final b = MockBackend();
      final pushes = <Map<String, Object?>>[];
      final sub = b.watchPushPayloads().listen(pushes.add);
      // ck103.0 = ORBI, ladder 50/100/200, nothing filled yet.
      b.debugSetChange('ck103.0', 55);
      final p = (await b.watchPositions().first).firstWhere((p) => p.id == 'ck103.0');
      expect(p.exitPlan!.rungs.first.filled, isTrue);
      expect(p.exitPlan!.trailArmed, isTrue);
      expect(p.soldBps, 3300);
      expect(p.isOpen, isTrue);
      await Future<void>.delayed(Duration.zero);
      expect(pushes.single['event'], 'N-08');
      expect(pushes.single['mode'], 'practice');
      await sub.cancel();
      b.dispose();
    });

    test('stop loss closes the remainder and emits N-09', () async {
      final b = MockBackend();
      final pushes = <Map<String, Object?>>[];
      final sub = b.watchPushPayloads().listen(pushes.add);
      b.debugSetChange('ck101.0', -36); // MOTH, SL −35%
      final p = (await b.watchPositions().first).firstWhere((p) => p.id == 'ck101.0');
      expect(p.isOpen, isFalse);
      expect(p.exitReason, 'Stop loss -35%');
      expect(p.pnlLamports.isNegative, isTrue);
      await Future<void>.delayed(Duration.zero);
      expect(pushes.single['event'], 'N-09');
      await sub.cancel();
      b.dispose();
    });

    test('manual sell 50% halves size, keeps plan; 100% closes', () async {
      final b = MockBackend();
      final before = (await b.watchPositions().first).firstWhere((p) => p.id == 'ck101.0');
      final est = before.estimateSell(50);
      final got = await b.sellPosition('ck101.0', pct: 50);
      expect(got, est); // exact lamports
      var p = (await b.watchPositions().first).firstWhere((p) => p.id == 'ck101.0');
      expect(p.sizeLamports, before.costLamports.bps(5000)); // exact half
      expect(p.isOpen, isTrue);
      expect(p.exitPlan, isNotNull);
      await b.sellPosition('ck101.0', pct: 100);
      p = (await b.watchPositions().first).firstWhere((p) => p.id == 'ck101.0');
      expect(p.isOpen, isFalse);
      expect(
        () => b.sellPosition('ck101.0', pct: 25),
        throwsA(isA<ApiException>().having((e) => e.rawCode, 'code', 'VALIDATION_FAILED')),
      );
      b.dispose();
    });

    test('caption follows the wireframe wording', () async {
      final b = MockBackend();
      final list = await b.watchPositions().first;
      expect(exitCaption(list.firstWhere((p) => p.symbol == 'GLOW')), 'TP1 ✓ · next TP2 +100%');
      expect(exitCaption(list.firstWhere((p) => p.symbol == 'MOTH')), 'SL −35% · trail off');
      b.dispose();
    });
  });

  testWidgets('positions: equity card, cards with exit bar, Practice sell 50%', (tester) async {
    await _phone(tester);
    final b = MockBackend();
    await tester.pumpWidget(_app(b, '/positions'));
    await tester.pump();
    await tester.pump(const Duration(milliseconds: 50));
    expect(find.text('Positions'), findsOneWidget);
    expect(find.text('4 open'), findsOneWidget);
    expect(find.byKey(const Key('equityCard')), findsOneWidget);
    expect(find.byType(ExitProgressBar), findsWidgets);
    // Lainnya tab is the selected destination (wireframe 12).
    expect(tester.widget<NavigationBar>(find.byType(NavigationBar)).selectedIndex, 4);

    await tester.tap(find.byKey(const Key('sell_ck101.0')));
    await tester.pumpAndSettle(const Duration(milliseconds: 100));
    expect(find.text('Jual \$MOTH'), findsOneWidget);
    expect(find.text('Sisa posisi tetap memakai exit plan'), findsOneWidget);
    await tester.tap(find.text('100%'));
    await tester.pump();
    expect(find.text('Posisi ditutup penuh · exit plan dibatalkan'), findsOneWidget);
    await tester.tap(find.text('50%'));
    await tester.pump();
    expect(find.text('Tahan untuk jual 50% (Practice)'), findsOneWidget);
    // Released before 1,2 s → nothing sold.
    await _hold(tester, find.byKey(const Key('sellHold')), const Duration(milliseconds: 900));
    expect(b.debugPositions.firstWhere((p) => p.id == 'ck101.0').soldPct, 0);
    await tester.pump(const Duration(milliseconds: 600)); // let the bar reverse
    // Held past 1,2 s → sold.
    await _hold(tester, find.byKey(const Key('sellHold')), const Duration(milliseconds: 1400));
    await tester.pump(const Duration(milliseconds: 200));
    await tester.pumpAndSettle(const Duration(milliseconds: 100));
    expect(find.textContaining('Terjual 50% \$MOTH'), findsOneWidget);
    final p = b.debugPositions.firstWhere((p) => p.id == 'ck101.0');
    expect(p.soldPct, 50);
    b.dispose();
  });

  testWidgets('detail shows the vertical ladder and next action', (tester) async {
    await _phone(tester);
    final b = MockBackend();
    await tester.pumpWidget(_app(b, '/positions/ck100.0'));
    await tester.pump();
    expect(find.byKey(const Key('exitLadder')), findsOneWidget);
    expect(find.text('TP1 · jual 33%'), findsOneWidget);
    expect(find.text('Sekarang'), findsOneWidget);
    expect(find.text('Stop loss'), findsOneWidget);
    expect(find.textContaining('Berikutnya: TP2 di +100%'), findsOneWidget);
    b.dispose();
  });

  testWidgets('Real SOL sell needs a 2,5 s hold (1,3 s is not enough)', (tester) async {
    await _phone(tester);
    final b = MockBackend()..debugAddPosition(_realPosition());
    await tester.pumpWidget(_app(b, '/positions', realSol: true));
    await tester.pump();
    await tester.scrollUntilVisible(find.byKey(const Key('sell_ckR1.0')), 200);
    await tester.tap(find.byKey(const Key('sell_ckR1.0')));
    await tester.pumpAndSettle(const Duration(milliseconds: 100));
    expect(find.text('Tahan untuk jual 50% (Real SOL)'), findsOneWidget);
    await _hold(tester, find.byKey(const Key('sellHold')), const Duration(milliseconds: 1300));
    expect(
      b.debugPositions.firstWhere((p) => p.id == 'ckR1.0').soldPct,
      0,
      reason: 'Practice duration must not sell Real',
    );
    await tester.pump(const Duration(milliseconds: 1500));
    await _hold(tester, find.byKey(const Key('sellHold')), const Duration(milliseconds: 2700));
    await tester.pump(const Duration(milliseconds: 200));
    await tester.pumpAndSettle(const Duration(milliseconds: 100));
    expect(b.debugPositions.firstWhere((p) => p.id == 'ckR1.0').soldPct, 50);
    b.dispose();
  });

  testWidgets('Real SOL sell disabled while flag is OFF (default)', (tester) async {
    await _phone(tester);
    final b = MockBackend()..debugAddPosition(_realPosition());
    await tester.pumpWidget(_app(b, '/positions'));
    await tester.pump();
    await tester.scrollUntilVisible(find.byKey(const Key('sell_ckR1.0')), 200);
    await tester.tap(find.byKey(const Key('sell_ckR1.0')));
    await tester.pumpAndSettle(const Duration(milliseconds: 100));
    expect(find.text(realSolDisabledText), findsOneWidget);
    expect(tester.widget<HoldToConfirmButton>(find.byKey(const Key('sellHold'))).enabled, isFalse);
    await _hold(tester, find.byKey(const Key('sellHold')), const Duration(milliseconds: 2700));
    expect(b.debugPositions.firstWhere((p) => p.id == 'ckR1.0').soldBps, 0);
    // Server gate too (mock mirrors REAL_SOL_DISABLED).
    await tester.runAsync(() async {
      await expectLater(
        b.sellPosition('ckR1.0', pct: 50),
        throwsA(isA<ApiException>().having((e) => e.rawCode, 'code', 'REAL_SOL_DISABLED')),
      );
    });
    b.dispose();
  });
}
