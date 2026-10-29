import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:solbot_mobile/app/app.dart';
import 'package:solbot_mobile/core/approval_guard.dart';
import 'package:solbot_mobile/core/feature_flags.dart';
import 'package:solbot_mobile/core/theme/solbot_theme.dart';
import 'package:solbot_mobile/core/widgets/common.dart';
import 'package:solbot_mobile/data/mock/mock_backend.dart';
import 'package:solbot_mobile/data/models/models.dart';
import 'package:solbot_mobile/data/providers.dart';

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

void main() {
  testWidgets('dashboard: mode banner, KPIs, pending count', (tester) async {
    await _phone(tester);
    final b = MockBackend();
    await tester.pumpWidget(_app(b, '/'));
    await tester.pump();
    expect(find.textContaining('PRACTICE · paper SOL'), findsOneWidget);
    expect(find.text('Team overview'), findsOneWidget);
    expect(find.byKey(const Key('totalPnl')), findsOneWidget);
    expect(tester.widget<Text>(find.byKey(const Key('pendingKpi'))).data, '4');
    b.dispose();
  });

  testWidgets('approving a practice pick removes it (no biometric needed)', (tester) async {
    await _phone(tester);
    final b = MockBackend();
    await tester.pumpWidget(_app(b, '/approvals'));
    await tester.pump();
    expect(find.text('\$KEPL'), findsOneWidget);
    await tester.tap(find.byKey(const Key('approve_apv_seed1')));
    await tester.pump(const Duration(milliseconds: 300));
    await tester.pump();
    expect(find.text('\$KEPL'), findsNothing);
    expect(find.text('Guard dilemahkan'), findsNWidgets(2));
    await tester.pump(const Duration(seconds: 5));
    b.dispose();
  });

  testWidgets('skip has a 5 s undo window before the decision is sent', (tester) async {
    await _phone(tester);
    final b = MockBackend();
    await tester.pumpWidget(_app(b, '/approvals'));
    await tester.pump();
    await tester.tap(find.byKey(const Key('skip_apv_seed3')));
    await tester.pumpAndSettle(const Duration(milliseconds: 100));
    await tester.tap(find.text('Sudah pump'));
    await tester.pump(const Duration(milliseconds: 400));
    expect(find.text('\$RIVR'), findsNothing); // hidden optimistically
    await tester.pump(const Duration(milliseconds: 800)); // snackbar entrance
    await tester.tap(find.text('Undo'));
    await tester.pump(const Duration(seconds: 6));
    await tester.pump();
    expect(find.text('\$RIVR'), findsOneWidget); // undo restored it, nothing sent
    b.dispose();
  });

  testWidgets('Real SOL guard change needs typed name before hold is enabled', (tester) async {
    await _phone(tester);
    final b = MockBackend();
    await tester.pumpWidget(_app(b, '/approvals/apv_seed4/review', realSol: true));
    await tester.pump();
    expect(find.textContaining('REAL SOL · memakai SOL nyata'), findsOneWidget);
    expect(find.text('Risk level: TINGGI'), findsOneWidget);
    await tester.enterText(find.byKey(const Key('typedConfirm')), 'Graduated Momentum');
    await tester.pump();
    expect(find.text('✓ cocok'), findsOneWidget);
    final hold = find.byKey(const Key('holdConfirm'));
    await tester.ensureVisible(hold);
    await tester.pump();
    final g = await tester.startGesture(tester.getCenter(hold));
    for (var i = 0; i < 30; i++) {
      await tester.pump(const Duration(milliseconds: 100));
    }
    await g.up();
    await tester.pump(const Duration(milliseconds: 300));
    await tester.pumpAndSettle(const Duration(milliseconds: 100), EnginePhase.sendSemanticsUpdate, const Duration(seconds: 10));
    final pending = await tester.runAsync(() => b.watchPending().first);
    expect(pending!.any((a) => a.id == 'apv_seed4'), isFalse);
    b.dispose();
  });

  testWidgets('strategy toggle pauses a running strategy', (tester) async {
    await _phone(tester);
    final b = MockBackend();
    await tester.pumpWidget(_app(b, '/strategies'));
    await tester.pump();
    final toggle = find.byKey(const Key('toggle_stg_pullback'));
    expect(tester.widget<Switch>(toggle).value, isTrue);
    await tester.tap(toggle);
    await tester.pump(const Duration(milliseconds: 300));
    await tester.pump();
    expect(tester.widget<Switch>(toggle).value, isFalse);
    expect(find.text('Strategi dijeda'), findsNWidgets(2));
    b.dispose();
  });

  testWidgets('Real SOL pick: swipe fully disabled; Practice pick swipeable', (tester) async {
    await _phone(tester);
    final now = DateTime.now();
    final b = MockBackend()
      ..debugAddApproval(Approval(
        id: 'apv_real1',
        kind: ApprovalKind.buyPick,
        status: ApprovalStatus.pending,
        title: 'Buy REALX',
        detail: 'Graduated Momentum · fit 80/70',
        createdAt: now,
        expiresAt: now.add(const Duration(minutes: 10)),
        token: 'tok_real1',
        strategyId: 'stg_grad',
        amountLamports: Lamports.fromSol('0.1'),
        mode: TradeMode.real,
        pickType: PickType.buy,
      ));
    await tester.pumpWidget(_app(b, '/approvals'));
    await tester.pump();
    expect(find.byKey(const ValueKey('swipe_apv_seed1')), findsOneWidget, reason: 'Practice pick swipeable');
    final realCard = find.byKey(const Key('approve_apv_real1'));
    expect(find.byKey(const Key('approve_apv_real1'), skipOffstage: false), findsOneWidget);
    await tester.ensureVisible(find.byKey(const Key('approve_apv_real1'), skipOffstage: false));
    await tester.pump();
    expect(find.byKey(const ValueKey('swipe_apv_real1')), findsNothing);
    expect(find.ancestor(of: realCard, matching: find.byType(Dismissible)), findsNothing);
    // A full-width fling both ways does nothing.
    // Fling on a point inside the Real card (the Approve button row).
    final card = realCard;
    await tester.fling(card, const Offset(400, 0), 2000);
    await tester.pump(const Duration(milliseconds: 600));
    await tester.fling(card, const Offset(-400, 0), 2000);
    await tester.pump(const Duration(milliseconds: 600));
    expect(b.debugApprovals.firstWhere((a) => a.id == 'apv_real1').status, ApprovalStatus.pending);
    await tester.pump(const Duration(seconds: 6));
    expect(b.debugApprovals.firstWhere((a) => a.id == 'apv_real1').status, ApprovalStatus.pending);
    b.dispose();
  });

  testWidgets('guard hold Practice is 1,2 s', (tester) async {
    await _phone(tester);
    final b = MockBackend();
    await tester.pumpWidget(_app(b, '/approvals/apv_seed2/review'));
    await tester.pump();
    expect(tester.widget<HoldToConfirmButton>(find.byKey(const Key('holdConfirm'))).hold,
        const Duration(milliseconds: 1200));
    expect(AppMotion.holdPracticeBase, const Duration(milliseconds: 1200));
    b.dispose();
  });

  testWidgets('guard hold Real 2,5 s: a 1,3 s hold does not decide', (tester) async {
    await _phone(tester);
    final b2 = MockBackend();
    await tester.pumpWidget(_app(b2, '/approvals/apv_seed4/review', realSol: true));
    await tester.pump();
    expect(tester.widget<HoldToConfirmButton>(find.byKey(const Key('holdConfirm'))).hold,
        const Duration(milliseconds: 2500));
    expect(AppMotion.holdRealBase, const Duration(milliseconds: 2500));
    // Practice-length hold on Real does not decide.
    await tester.enterText(find.byKey(const Key('typedConfirm')), 'Graduated Momentum');
    await tester.pump();
    final hold = find.byKey(const Key('holdConfirm'));
    await tester.ensureVisible(hold);
    await tester.pump();
    final g = await tester.startGesture(tester.getCenter(hold));
    for (var i = 0; i < 13; i++) {
      await tester.pump(const Duration(milliseconds: 100));
    }
    await g.up();
    await tester.pump(const Duration(milliseconds: 300));
    expect(b2.debugApprovals.firstWhere((a) => a.id == 'apv_seed4').status, ApprovalStatus.pending);
    await tester.pump(const Duration(seconds: 3));
    b2.dispose();
  });

  testWidgets('Real SOL flag OFF (default): guard hold + Real approve disabled, note shown', (tester) async {
    await _phone(tester);
    final b = MockBackend();
    await tester.pumpWidget(_app(b, '/approvals/apv_seed4/review'));
    await tester.pump();
    expect(find.text(realSolDisabledText), findsOneWidget);
    await tester.enterText(find.byKey(const Key('typedConfirm')), 'Graduated Momentum');
    await tester.pump();
    expect(tester.widget<HoldToConfirmButton>(find.byKey(const Key('holdConfirm'), skipOffstage: false)).enabled, isFalse);
    b.dispose();
  });

  testWidgets('Lainnya: Practice reset once per 24 h, Real flag status shown', (tester) async {
    await _phone(tester);
    final b = MockBackend();
    await tester.pumpWidget(_app(b, '/more'));
    await tester.pump();
    expect(find.text('Real SOL nonaktif sampai Fase 7'), findsOneWidget);
    await tester.tap(find.byKey(const Key('practiceReset')));
    await tester.pumpAndSettle(const Duration(milliseconds: 100));
    await tester.tap(find.byKey(const Key('confirmReset')));
    await tester.pump(const Duration(milliseconds: 300));
    await tester.pump(const Duration(milliseconds: 800));
    expect(find.textContaining('Practice di-reset ke 30,000 paper SOL'), findsOneWidget);
    expect(b.debugPositions.where((p) => p.mode == TradeMode.practice), isEmpty);
    await tester.pump(const Duration(seconds: 5));
    await tester.tap(find.byKey(const Key('practiceReset')));
    await tester.pumpAndSettle(const Duration(milliseconds: 100));
    await tester.tap(find.byKey(const Key('confirmReset')));
    await tester.pump(const Duration(milliseconds: 300));
    await tester.pump(const Duration(milliseconds: 800));
    expect(find.textContaining('Reset berikutnya bisa pukul'), findsOneWidget);
    b.dispose();
  });
}
