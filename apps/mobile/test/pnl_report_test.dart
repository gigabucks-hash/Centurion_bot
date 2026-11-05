import 'package:flutter/material.dart';
import 'package:flutter_test/flutter_test.dart';

import 'package:centurion_mobile/core/theme/centurion_theme.dart';
import 'package:centurion_mobile/data/models/models.dart';
import 'package:centurion_mobile/features/positions/widgets/pnl_report_card.dart';

PortfolioSummary _summary({required Lamports realized, required Lamports unrealized, int open = 2}) => PortfolioSummary(
  mode: TradeMode.practice,
  cashLamports: Lamports.zero,
  startLamports: Lamports.fromSol('30'),
  realizedPnlLamports: realized,
  unrealizedPnlLamports: unrealized,
  openPositions: open,
  history: const [],
);

Future<void> _pump(WidgetTester tester, PortfolioSummary summary) async {
  tester.view.physicalSize = const Size(412 * 3, 915 * 3);
  tester.view.devicePixelRatio = 3;
  addTearDown(tester.view.reset);
  await tester.pumpWidget(
    MaterialApp(
      theme: CenturionTheme.dark(),
      home: Scaffold(
        body: SingleChildScrollView(child: PnlReportCard(summary: summary)),
      ),
    ),
  );
}

void main() {
  testWidgets('PnL report: unrealized and realized are separate, total is their sum', (tester) async {
    await _pump(tester, _summary(realized: Lamports.fromSol('0.41'), unrealized: Lamports.fromSol('-0.12')));

    expect(find.byKey(const Key('pnlReport')), findsOneWidget);
    expect(find.text('Belum terealisasi'), findsOneWidget);
    expect(find.text('Terealisasi'), findsOneWidget);
    expect(find.text('Total PnL'), findsOneWidget);
    expect(find.text('2 posisi terbuka'), findsOneWidget);

    expect(find.byKey(const Key('pnlUnrealized')), findsOneWidget);
    expect(find.byKey(const Key('pnlRealized')), findsOneWidget);
    expect(find.byKey(const Key('pnlTotal')), findsOneWidget);

    // Realized 0.41, unrealized −0.12, total 0.29 — no re-derivation, no rounding drift.
    expect(find.textContaining('0,41'), findsWidgets);
    expect(find.textContaining('0,12'), findsWidgets);
    expect(find.textContaining('0,29'), findsOneWidget);
  });

  testWidgets('PnL report: exact zero stays neutral (no arrow, no fake percentage)', (tester) async {
    await _pump(tester, _summary(realized: Lamports.zero, unrealized: Lamports.zero, open: 0));

    expect(find.text('0 posisi terbuka'), findsOneWidget);
    final total = tester.widget<Text>(
      find.descendant(of: find.byKey(const Key('pnlTotal')), matching: find.byType(Text)),
    );
    expect(total.data, '0,00 SOL');
    expect(total.data, isNot(contains('▲')));
    expect(total.data, isNot(contains('▼')));
  });
}
