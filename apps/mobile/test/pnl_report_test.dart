import 'package:flutter/material.dart';
import 'package:flutter_localizations/flutter_localizations.dart';
import 'package:flutter_test/flutter_test.dart';

import 'package:centurion_mobile/core/theme/centurion_theme.dart';
import 'package:centurion_mobile/core/l10n_format.dart' show formatHold;
import 'package:centurion_mobile/data/models/models.dart';
import 'package:centurion_mobile/features/positions/widgets/pnl_report_card.dart';
import 'package:centurion_mobile/l10n/gen/app_localizations.dart';

PortfolioSummary _summary({required Lamports realized, required Lamports unrealized, int open = 2}) => PortfolioSummary(
  mode: TradeMode.practice,
  cashLamports: Lamports.zero,
  startLamports: Lamports.fromSol('30'),
  realizedPnlLamports: realized,
  unrealizedPnlLamports: unrealized,
  openPositions: open,
  history: const [],
);

Future<void> _pump(
  WidgetTester tester,
  PortfolioSummary summary, {
  Locale locale = const Locale('id'),
  VoidCallback? onTap,
}) async {
  tester.view.physicalSize = const Size(412 * 3, 915 * 3);
  tester.view.devicePixelRatio = 3;
  addTearDown(tester.view.reset);
  await tester.pumpWidget(
    MaterialApp(
      theme: CenturionTheme.dark(),
      locale: locale,
      supportedLocales: AppLocalizations.supportedLocales,
      localizationsDelegates: const [
        AppLocalizations.delegate,
        GlobalMaterialLocalizations.delegate,
        GlobalWidgetsLocalizations.delegate,
        GlobalCupertinoLocalizations.delegate,
      ],
      home: Scaffold(
        body: SingleChildScrollView(
          child: PnlReportCard(summary: summary, onTap: onTap),
        ),
      ),
    ),
  );
}

void main() {
  testWidgets('PnL card (ID): unrealized and realized are separate, total is their sum', (tester) async {
    await _pump(
      tester,
      _summary(realized: Lamports.fromSol('0.41'), unrealized: Lamports.fromSol('-0.12')),
      onTap: () {},
    );

    expect(find.byKey(const Key('pnlReport')), findsOneWidget);
    expect(find.text('PnL belum terealisasi'), findsOneWidget);
    expect(find.text('PnL terealisasi'), findsOneWidget);
    expect(find.text('Total PnL'), findsOneWidget);
    expect(find.text('2 terbuka'), findsOneWidget);
    expect(find.text('Lihat laporan'), findsOneWidget);

    expect(find.byKey(const Key('pnlUnrealized')), findsOneWidget);
    expect(find.byKey(const Key('pnlRealized')), findsOneWidget);
    expect(find.byKey(const Key('pnlTotal')), findsOneWidget);

    // Realized 0.41, unrealized −0.12, total 0.29 — no re-derivation, no rounding drift.
    expect(find.textContaining('0,41'), findsWidgets);
    expect(find.textContaining('0,12'), findsWidgets);
    expect(find.textContaining('0,29'), findsOneWidget);
  });

  testWidgets('PnL card follows the app language (EN copy, same numbers)', (tester) async {
    await _pump(
      tester,
      _summary(realized: Lamports.fromSol('0.41'), unrealized: Lamports.fromSol('-0.12')),
      locale: const Locale('en'),
      onTap: () {},
    );

    expect(find.text('Unrealized PnL'), findsOneWidget);
    expect(find.text('Realized PnL'), findsOneWidget);
    expect(find.text('2 open'), findsOneWidget);
    expect(find.text('View report'), findsOneWidget);
    expect(find.text('PnL belum terealisasi'), findsNothing);
  });

  testWidgets('PnL card: exact zero stays neutral (no arrow, no fake total)', (tester) async {
    await _pump(tester, _summary(realized: Lamports.zero, unrealized: Lamports.zero, open: 0));

    expect(find.text('0 terbuka'), findsOneWidget);
    final total = tester.widget<Text>(
      find.descendant(of: find.byKey(const Key('pnlTotal')), matching: find.byType(Text)),
    );
    expect(total.data, '0,00 SOL');
    expect(total.data, isNot(contains('▲')));
    expect(total.data, isNot(contains('▼')));
  });

  testWidgets('PnL card opens the report; a loss is loss-toned, never profit', (tester) async {
    var taps = 0;
    await _pump(
      tester,
      _summary(realized: Lamports.fromSol('-0.2'), unrealized: Lamports.fromSol('-0.05')),
      onTap: () => taps++,
    );

    await tester.tap(find.byKey(const Key('pnlReport')));
    expect(taps, 1);

    final realized = tester.widget<Text>(
      find.descendant(of: find.byKey(const Key('pnlRealized')), matching: find.byType(Text)).last,
    );
    expect(realized.data, startsWith('▼'));
    expect(realized.style?.color, TradeColors.dark.loss);
  });

  test('ARB PnL copy: EN and ID never silently fall back to the other locale', () {
    final id = lookupAppLocalizations(const Locale('id'));
    final en = lookupAppLocalizations(const Locale('en'));
    expect(id.pnlRealized, 'PnL terealisasi');
    expect(en.pnlRealized, 'Realized PnL');
    expect(id.pnlViewReport, 'Lihat laporan');
    expect(en.pnlViewReport, 'View report');
    expect(formatHold(en, 45), '45s');
    expect(formatHold(id, 45), '45 dtk');
    expect(formatHold(en, 19 * 60), '19m');
    expect(formatHold(id, 19 * 60), '19 mnt');
    expect(formatHold(en, 125 * 60), '2h 5m');
    expect(formatHold(id, 125 * 60), '2 j 5 mnt');
    expect(id.commonRangeAll, 'Semua');
    expect(en.commonRangeAll, 'All');
    expect(id.pnlRealizedFor('7D'), 'Terealisasi · 7D');
    expect(en.pnlRealizedFor('7D'), 'Realized · 7D');
    expect(id.pnlClosed, 'Ditutup');
    expect(en.pnlClosed, 'Closed');
    expect(id.pnlReceiptFees, 'Biaya (dilaporkan)');
    expect(en.pnlReceiptFees, 'Fees (reported)');
    expect(id.pnlTrades(2), '2 trade');
    expect(en.pnlTrades(1), '1 trade');
    expect(en.pnlTrades(2), '2 trades');
  });
}
