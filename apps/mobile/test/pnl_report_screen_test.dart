import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:flutter_test/flutter_test.dart';

import 'package:centurion_mobile/app/app.dart';
import 'package:centurion_mobile/core/approval_guard.dart';
import 'package:centurion_mobile/core/feature_flags.dart';
import 'package:centurion_mobile/core/format.dart';
import 'package:centurion_mobile/core/startup/deferred_init.dart';
import 'package:centurion_mobile/data/mock/mock_backend.dart';
import 'package:centurion_mobile/data/models/models.dart';
import 'package:centurion_mobile/data/providers.dart';
import 'package:centurion_mobile/data/repositories/repositories.dart';

/// Real mock backend (deterministic seed), no post-first-frame tick: the same
/// data the app ships in the demo build.
Widget _app(MockBackend b, {String location = '/pnl'}) => ProviderScope(
  overrides: [
    mockBackendProvider.overrideWithValue(b),
    deferredInitProvider.overrideWithValue(DeferredInit(const [])),
    featureFlagsProvider.overrideWithValue(const FeatureFlags()),
    approvalGuardProvider.overrideWithValue(const AlwaysAllowGuard()),
  ],
  child: CenturionApp(initialLocation: location),
);

Future<void> _phone(WidgetTester tester) async {
  tester.view.physicalSize = const Size(412 * 3, 915 * 3);
  tester.view.devicePixelRatio = 3;
  addTearDown(tester.view.reset);
}

/// Fixed pumps instead of `pumpAndSettle`: a loading spinner keeps scheduling
/// frames, so settle would not return while a section is still loading.
Future<void> _settle(WidgetTester tester) async {
  for (var i = 0; i < 10; i++) {
    await tester.pump(const Duration(milliseconds: 200));
  }
}

void main() {
  testWidgets('PnL report: realized/unrealized/total come from the summary, not re-added rows', (tester) async {
    await _phone(tester);
    final b = MockBackend();
    addTearDown(b.dispose);
    final latest = b.portfolioLatestRow();
    final realized = Lamports.parse(latest['realized_pnl_lamports']! as String);
    final unrealized = Lamports.parse(latest['unrealized_pnl_lamports']! as String);
    // Synchronous snapshot: awaiting a second stream inside testWidgets would
    // depend on the fake clock (see MockBackend.debugPositions).
    final closed = b.debugPositions.where((p) => !p.isOpen).toList();
    expect(closed, isNotEmpty, reason: 'seed data must include a closed trade');

    await tester.pumpWidget(_app(b));
    await _settle(tester);

    expect(find.byKey(const Key('pnlReportHeader')), findsOneWidget);
    expect(find.text('Laporan PnL'), findsOneWidget);

    // Exact server numbers (no float re-derivation, no sum of loaded rows).
    expect(find.text(fmtPnl(realized, unit: true)), findsWidgets);
    expect(find.text(fmtPnl(unrealized, unit: true)), findsWidgets);
    final total = tester.widget<Text>(
      find.descendant(of: find.byKey(const Key('pnlReportTotal')), matching: find.byType(Text)),
    );
    expect(total.data, fmtPnl(realized + unrealized, unit: true));

    // Per exit reason (exit_stats), localized label.
    expect(find.text('Per alasan keluar'), findsOneWidget);
    final stat = b.exitStatsRows().first;
    expect(find.byKey(Key('exitStat_${stat['exit_reason']}')), findsOneWidget);
    expect(find.textContaining('Rasio menang'), findsOneWidget);
    expect(find.textContaining('Rata-rata tahan'), findsOneWidget);

    // Closed-trade ledger keeps the per-trade realized PnL that was locked at close.
    expect(find.text('Trade ditutup · 1'), findsOneWidget);
    final row = find.byKey(Key('closed_${closed.first.id}'));
    expect(row, findsOneWidget);
    expect(find.descendant(of: row, matching: find.text('\$${closed.first.symbol}')), findsOneWidget);
    expect(find.descendant(of: row, matching: find.text(fmtPnl(closed.first.pnlLamports))), findsOneWidget);
    expect(find.descendant(of: row, matching: find.textContaining('terealisasi')), findsOneWidget);
  });

  testWidgets('PnL report: sign matches the server number and the partial-TP note is present', (tester) async {
    await _phone(tester);
    final b = MockBackend();
    addTearDown(b.dispose);
    final latestRow = b.portfolioLatestRow();
    final realized = Lamports.parse(latestRow['realized_pnl_lamports']! as String);

    await tester.pumpWidget(_app(b));
    await _settle(tester);

    // The note explains why realized can exceed the closed-trade ledger sum.
    expect(find.textContaining('TP sebagian'), findsOneWidget);

    final hero = tester.widget<Text>(
      find.descendant(of: find.byKey(const Key('pnlReportRealized')), matching: find.byType(Text)),
    );
    final d = realized;
    if (d.sign > 0) {
      expect(hero.data, startsWith('▲'));
    } else if (d.sign < 0) {
      expect(hero.data, startsWith('▼'));
    } else {
      expect(hero.data, '0,00 SOL');
    }
  });

  testWidgets('PnL report: no closed trades → empty ledger, no fake zero breakdown', (tester) async {
    await _phone(tester);
    final b = MockBackend();
    addTearDown(b.dispose);
    // resetPractice waits 150 ms, which only runs when the fake clock is pumped.
    final reset = b.resetPractice(const ResetPracticeRequest(MockBackend.workspaceId));
    await tester.pump(const Duration(milliseconds: 300));
    await reset;
    expect(b.debugPositions, isEmpty);

    await tester.pumpWidget(_app(b));
    await _settle(tester);

    expect(find.byKey(const Key('pnlEmpty')), findsOneWidget);
    expect(find.text('Belum ada trade ditutup'), findsOneWidget);
    expect(find.text('Per alasan keluar'), findsNothing);
    final realized = tester.widget<Text>(
      find.descendant(of: find.byKey(const Key('pnlReportRealized')), matching: find.byType(Text)),
    );
    expect(realized.data, '0,00 SOL');
    expect(realized.data, isNot(contains('▲')));
  });

  testWidgets('Home PnL card opens the report and Back returns to the shell', (tester) async {
    await _phone(tester);
    final b = MockBackend();
    addTearDown(b.dispose);
    await tester.pumpWidget(_app(b, location: '/'));
    await _settle(tester);

    await tester.scrollUntilVisible(find.byKey(const Key('pnlReport')), 200);
    await tester.tap(find.byKey(const Key('pnlReport')));
    await _settle(tester);
    expect(find.byKey(const Key('pnlReportHeader')), findsOneWidget);

    // Localized tooltip means `pageBack()` (English "Back") cannot find it;
    // tap the explicit control instead.
    await tester.tap(find.byKey(const Key('pnlBack')));
    await _settle(tester);
    // Home keeps its scroll offset, so the card is the stable shell marker
    // (the hero above it is outside the lazy viewport and not built).
    expect(find.byKey(const Key('pnlReport')), findsOneWidget);
    expect(find.byKey(const Key('pnlReportHeader')), findsNothing);
  });
}
