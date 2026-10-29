import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:solbot_mobile/app/app.dart';
import 'package:solbot_mobile/core/approval_guard.dart';
import 'package:solbot_mobile/data/mock/mock_backend.dart';
import 'package:solbot_mobile/data/providers.dart';

Widget _app(MockBackend b, String location) => ProviderScope(
      overrides: [
        mockBackendProvider.overrideWithValue(b),
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
    await tester.pumpWidget(_app(b, '/approvals/apv_seed4/review'));
    await tester.pump();
    expect(find.textContaining('REAL SOL · memakai SOL nyata'), findsOneWidget);
    expect(find.text('Risk level: TINGGI'), findsOneWidget);
    await tester.enterText(find.byKey(const Key('typedConfirm')), 'Graduated Momentum');
    await tester.pump();
    expect(find.text('✓ cocok'), findsOneWidget);
    final hold = find.byKey(const Key('holdConfirm'));
    await tester.ensureVisible(hold);
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
}
