import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:flutter_test/flutter_test.dart';

import 'package:centurion_mobile/app/app.dart';
import 'package:centurion_mobile/core/approval_guard.dart';
import 'package:centurion_mobile/core/feature_flags.dart';
import 'package:centurion_mobile/core/format.dart';
import 'package:centurion_mobile/core/notifications/local_notifier.dart';
import 'package:centurion_mobile/core/notifications/notification_catalog.dart';
import 'package:centurion_mobile/core/startup/deferred_init.dart';
import 'package:centurion_mobile/core/widgets/coin_avatar.dart';
import 'package:centurion_mobile/data/api/centurion_rpc.dart';
import 'package:centurion_mobile/data/mock/mock_backend.dart';
import 'package:centurion_mobile/data/models/models.dart';
import 'package:centurion_mobile/data/providers.dart';
import 'package:centurion_mobile/core/l10n_format.dart' show formatHold;
import 'package:centurion_mobile/l10n/gen/app_localizations.dart';

/// Real mock backend (deterministic seed), no post-first-frame tick: the same
/// data the app ships in the demo build.
Widget _app(MockBackend b, {String location = '/pnl', NotifLocale? locale}) => ProviderScope(
  overrides: [
    mockBackendProvider.overrideWithValue(b),
    deferredInitProvider.overrideWithValue(DeferredInit(const [])),
    featureFlagsProvider.overrideWithValue(const FeatureFlags()),
    approvalGuardProvider.overrideWithValue(const AlwaysAllowGuard()),
    if (locale != null) notificationLocaleProvider.overrideWith((ref) => locale),
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

Lamports _lamports(Map<String, Object?> row, String key) => Lamports.parse(row[key]! as String);

Text _text(WidgetTester tester, Key key) {
  final widget = tester.widget(find.byKey(key));
  if (widget is Text) return widget;
  return tester.widget<Text>(find.descendant(of: find.byKey(key), matching: find.byType(Text)).last);
}

Position _oldClosed(MockBackend b) {
  final now = b.serverNow;
  return Position(
    id: 'ck_old.0',
    strategyId: 'stg_newpairs',
    symbol: 'OLD',
    mint: MockBackend.mockMint('OLD'),
    mode: TradeMode.practice,
    state: PositionState.closed,
    costLamports: Lamports.fromSol('0.1'),
    proceedsLamports: Lamports.fromSol('0.12'),
    soldBps: 10000,
    entryPriceUsd: Decimal.parse('0.0002'),
    markPriceUsd: Decimal.parse('0.00025'),
    peakPriceUsd: Decimal.parse('0.00026'),
    openedAt: now.subtract(const Duration(days: 11)),
    closedAt: now.subtract(const Duration(days: 10)),
    exitReason: 'Took profit: exit plan complete',
    lockedPnlLamports: Lamports.fromSol('0.02'),
    lockedPnlPct: 20,
    practiceEpoch: b.epoch,
    decimals: 6,
    qtyRaw: BigInt.zero,
  );
}

/// A closed row [age] before the mock clock, for range-boundary tests.
Position _closedAgo(MockBackend b, {required String id, required String symbol, required Duration age}) {
  final closedAt = b.serverNow.subtract(age);
  return Position(
    id: id,
    strategyId: 'stg_newpairs',
    symbol: symbol,
    mint: MockBackend.mockMint(symbol),
    mode: TradeMode.practice,
    state: PositionState.closed,
    costLamports: Lamports.fromSol('0.1'),
    proceedsLamports: Lamports.fromSol('0.12'),
    soldBps: 10000,
    entryPriceUsd: Decimal.parse('0.0002'),
    markPriceUsd: Decimal.parse('0.00025'),
    peakPriceUsd: Decimal.parse('0.00026'),
    openedAt: closedAt.subtract(const Duration(hours: 3)),
    closedAt: closedAt,
    exitReason: 'Took profit: exit plan complete',
    lockedPnlLamports: Lamports.fromSol('0.02'),
    lockedPnlPct: 20,
    practiceEpoch: b.epoch,
    decimals: 6,
    qtyRaw: BigInt.zero,
  );
}

void main() {
  testWidgets('PnL report: 7D strip is the server summary, not a sum of ledger rows', (tester) async {
    await _phone(tester);
    final b = MockBackend();
    addTearDown(b.dispose);
    final row = b.pnlSummaryRow(window: PnlWindow.d7);
    final windowRealized = _lamports(row, 'realized_pnl_window_lamports');
    final allTimeRealized = _lamports(row, 'realized_pnl_lamports');
    final unrealized = _lamports(row, 'unrealized_pnl_lamports');
    final total = _lamports(row, 'total_pnl_lamports');
    final closedCount = row['closed_count']! as int;
    final winRate = row['win_rate_pct']! as num;
    final avgHold = row['avg_hold_s']! as int;
    expect(closedCount, 1, reason: 'the seed has one closed FERN trade inside 7D');

    await tester.pumpWidget(_app(b));
    await _settle(tester);

    expect(find.byKey(const Key('pnlReportHeader')), findsOneWidget);
    expect(find.text('Laporan PnL'), findsOneWidget);
    expect(tester.widget<ChoiceChip>(find.byKey(const Key('pnlWindow_d7'))).selected, isTrue);

    // Range realized is the server's windowed number; all-time realized is the snapshot.
    expect(_text(tester, const Key('pnlReportRealized')).data, fmtPnl(windowRealized, unit: true));
    expect(_text(tester, const Key('pnlReportRealizedAllTime')).data, fmtPnl(allTimeRealized, unit: true));
    expect(_text(tester, const Key('pnlReportUnrealized')).data, fmtPnl(unrealized, unit: true));
    expect(_text(tester, const Key('pnlReportTotal')).data, fmtPnl(total, unit: true));
    expect(_text(tester, const Key('pnlReportClosed')).data, '$closedCount');
    expect(_text(tester, const Key('pnlReportWinRate')).data, fmtRatePct(winRate.toDouble()));
    expect(
      _text(tester, const Key('pnlReportAvgHold')).data,
      formatHold(lookupAppLocalizations(const Locale('id')), avgHold),
    );
    expect(windowRealized, isNot(allTimeRealized), reason: 'partial TP on GLOW makes them differ');

    // Reconciliation note: all-time realized includes partial TPs outside the ledger.
    expect(find.textContaining('TP sebagian'), findsOneWidget);

    // Per exit reason (windowed exit_stats), localized label.
    expect(find.text('Per alasan keluar'), findsOneWidget);
    final stat = b.exitStatsRows().first;
    expect(find.byKey(Key('exitStat_${stat['exit_reason']}')), findsOneWidget);
    expect(find.textContaining('Rasio menang'), findsWidgets);
    expect(find.textContaining('Rata-rata tahan'), findsWidgets);

    // Ledger: newest by close time, logo, locked realized number and %.
    final closed = b.debugPositions.where((p) => !p.isOpen).toList();
    expect(find.text('Trade ditutup · $closedCount'), findsOneWidget);
    final ledgerRow = find.byKey(Key('closed_${closed.first.id}'));
    expect(ledgerRow, findsOneWidget);
    expect(find.descendant(of: ledgerRow, matching: find.byType(CoinAvatar)), findsOneWidget);
    expect(find.descendant(of: ledgerRow, matching: find.text('\$${closed.first.symbol}')), findsOneWidget);
    expect(find.descendant(of: ledgerRow, matching: find.text(fmtPnl(closed.first.pnlLamports))), findsOneWidget);
    expect(find.descendant(of: ledgerRow, matching: find.textContaining('terealisasi')), findsOneWidget);
  });

  testWidgets('PnL report: 1D/30D/All refetch the range and the ledger follows it', (tester) async {
    await _phone(tester);
    final b = MockBackend();
    addTearDown(b.dispose);
    b.debugAddPosition(_oldClosed(b));
    expect(b.pnlSummaryRow(window: PnlWindow.d7)['closed_count'], 1);
    expect(b.pnlSummaryRow(window: PnlWindow.d30)['closed_count'], 2);

    await tester.pumpWidget(_app(b));
    await _settle(tester);
    expect(_text(tester, const Key('pnlReportClosed')).data, '1');
    expect(find.byKey(const Key('closed_ck_old.0')), findsNothing);

    await tester.tap(find.byKey(const Key('pnlWindow_d30')));
    await _settle(tester);
    await _settle(tester);
    expect(_text(tester, const Key('pnlReportClosed')).data, '2');
    expect(find.byKey(const Key('closed_ck_old.0')), findsOneWidget);
    expect(find.text('Trade ditutup · 2'), findsOneWidget);

    await tester.tap(find.byKey(const Key('pnlWindow_d1')));
    await _settle(tester);
    await _settle(tester);
    expect(_text(tester, const Key('pnlReportClosed')).data, '1');
    expect(find.byKey(const Key('closed_ck_old.0')), findsNothing);

    // All also includes the 10-day-old close and sends the wire value.
    await tester.tap(find.byKey(const Key('pnlWindow_all')));
    await _settle(tester);
    await _settle(tester);
    expect(_text(tester, const Key('pnlReportClosed')).data, '2');
  });

  testWidgets('PnL report: 1h window is wired end to end and the ledger follows it', (tester) async {
    await _phone(tester);
    final b = MockBackend();
    addTearDown(b.dispose);
    // Seed has FERN closed 41 min ago; this one sits between 1h and 7D.
    b.debugAddPosition(_closedAgo(b, id: 'ck_2h.0', symbol: 'TWO', age: const Duration(hours: 2)));
    expect(PnlWindow.h1.wire, '1h');
    expect(b.pnlSummaryRow(window: PnlWindow.h1)['closed_count'], 1);
    expect(b.pnlSummaryRow(window: PnlWindow.d7)['closed_count'], 2);

    await tester.pumpWidget(_app(b));
    await _settle(tester);
    expect(tester.widget<ChoiceChip>(find.byKey(const Key('pnlWindow_d7'))).selected, isTrue);
    expect(find.byKey(const Key('closed_ck_2h.0')), findsOneWidget);

    await tester.tap(find.byKey(const Key('pnlWindow_h1')));
    await _settle(tester);
    await _settle(tester);

    expect(tester.widget<ChoiceChip>(find.byKey(const Key('pnlWindow_h1'))).selected, isTrue);
    expect(_text(tester, const Key('pnlReportClosed')).data, '1');
    expect(find.text('Trade ditutup · 1'), findsOneWidget);
    expect(find.textContaining('1h'), findsWidgets); // realized-for label
    expect(find.byKey(const Key('closed_ck_2h.0')), findsNothing);
    expect(find.byKey(const Key('closed_ck099.0')), findsOneWidget);
  });

  testWidgets('PnL report: /pnl?window=1h deep link starts on 1h', (tester) async {
    await _phone(tester);
    final b = MockBackend();
    addTearDown(b.dispose);
    b.debugAddPosition(_closedAgo(b, id: 'ck_2h.0', symbol: 'TWO', age: const Duration(hours: 2)));

    await tester.pumpWidget(_app(b, location: '/pnl?window=1h'));
    await _settle(tester);
    await _settle(tester);

    expect(tester.widget<ChoiceChip>(find.byKey(const Key('pnlWindow_h1'))).selected, isTrue);
    expect(_text(tester, const Key('pnlReportClosed')).data, '1');
    expect(find.byKey(const Key('closed_ck_2h.0')), findsNothing);
  });

  testWidgets('PnL report: /pnl?window=30d opens on 30D and pages that range', (tester) async {
    await _phone(tester);
    final b = MockBackend();
    addTearDown(b.dispose);
    b.debugAddPosition(_oldClosed(b));
    expect(b.pnlSummaryRow(window: PnlWindow.d30)['closed_count'], 2);

    await tester.pumpWidget(_app(b, location: '/pnl?window=30d'));
    await _settle(tester);
    await _settle(tester);

    expect(tester.widget<ChoiceChip>(find.byKey(const Key('pnlWindow_d30'))).selected, isTrue);
    expect(_text(tester, const Key('pnlReportClosed')).data, '2');
  });

  testWidgets('PnL report: zero closes keep realized neutral and stats em-dash (never 0%)', (tester) async {
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
    await _settle(tester);

    expect(find.byKey(const Key('pnlEmpty')), findsOneWidget);
    expect(find.text('Belum ada trade ditutup'), findsOneWidget);
    expect(find.text('Per alasan keluar'), findsNothing);
    expect(_text(tester, const Key('pnlReportRealized')).data, '0,00 SOL');
    expect(_text(tester, const Key('pnlReportRealized')).data, isNot(contains('▲')));
    expect(_text(tester, const Key('pnlReportTotal')).data, '0,00 SOL');
    expect(_text(tester, const Key('pnlReportClosed')).data, '0');
    expect(_text(tester, const Key('pnlReportWinRate')).data, '—');
    expect(_text(tester, const Key('pnlReportAvgHold')).data, '—');
    expect(find.textContaining('0%'), findsNothing);
  });

  testWidgets('PnL report: English copy is not hardcoded Indonesian', (tester) async {
    await _phone(tester);
    final b = MockBackend();
    addTearDown(b.dispose);
    await tester.pumpWidget(_app(b, locale: NotifLocale.en));
    await _settle(tester);

    expect(find.text('PnL report'), findsOneWidget);
    expect(find.textContaining('Realized · 7D'), findsOneWidget);
    expect(find.text('All-time realized'), findsOneWidget);
    expect(find.textContaining('Closed trades'), findsWidgets);
    expect(find.text('Win rate'), findsOneWidget);
    expect(find.text('Avg hold'), findsOneWidget);
    expect(find.text('Laporan PnL'), findsNothing);
  });

  test('PnlSummary: zero closes give null stats and exact lamports', () {
    final p = PnlSummary.fromJson({
      'mode': 'practice',
      'practice_epoch': 3,
      'window': '7d',
      'from': '2026-11-01T00:00:00.000Z',
      'to': null,
      'unrealized_pnl_lamports': null,
      'realized_pnl_lamports': null,
      'total_pnl_lamports': null,
      'realized_pnl_window_lamports': '0',
      'closed_count': 0,
      'win_count': 0,
      'win_rate_pct': null,
      'avg_hold_s': null,
      'fees_lamports': '2500000',
      'best_pnl_lamports': null,
      'worst_pnl_lamports': null,
      'as_of_seq': '18042',
      'ts': '2026-11-05T10:00:00.000Z',
    });
    expect(p.realizedPnl, isNull);
    expect(p.unrealizedPnl, isNull);
    expect(p.totalPnl, isNull);
    expect(p.realizedPnlWindow, Lamports.zero);
    expect(p.winRatePct, isNull, reason: 'never a fake 0%');
    expect(p.avgHoldS, isNull);
    expect(p.fees, Lamports.fromInt(2500000));
    expect(p.asOfSeq, BigInt.from(18042));
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

    await tester.tap(find.byKey(const Key('pnlBack')));
    await _settle(tester);
    // Home keeps its scroll offset, so the card is the stable shell marker
    // (the hero above it is outside the lazy viewport and not built).
    expect(find.byKey(const Key('pnlReport')), findsOneWidget);
    expect(find.byKey(const Key('pnlReportHeader')), findsNothing);
  });
}
