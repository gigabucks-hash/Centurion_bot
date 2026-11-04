import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:centurion_mobile/core/startup/deferred_init.dart';
import 'package:centurion_mobile/app/app.dart';
import 'package:centurion_mobile/core/approval_guard.dart';
import 'package:centurion_mobile/core/feature_flags.dart';
import 'package:centurion_mobile/core/theme/centurion_theme.dart';
import 'package:centurion_mobile/core/widgets/common.dart';
import 'package:centurion_mobile/data/mock/mock_backend.dart';
import 'package:centurion_mobile/data/models/models.dart';
import 'package:centurion_mobile/data/providers.dart';
import 'package:centurion_mobile/l10n/gen/app_localizations.dart';

/// [realSol] flips the Phase 7 flag (client + mock server) for tests that exercise Real flows.
Widget _app(MockBackend b, String location, {bool realSol = false}) => ProviderScope(
  overrides: [
    mockBackendProvider.overrideWithValue(b..realSolEnabled = realSol),
    // No post-first-frame services (mock tick) in widget tests: deterministic data.
    deferredInitProvider.overrideWithValue(DeferredInit(const [])),
    featureFlagsProvider.overrideWithValue(FeatureFlags(realSolEnabled: realSol)),
    approvalGuardProvider.overrideWithValue(const AlwaysAllowGuard()),
  ],
  child: CenturionApp(initialLocation: location),
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
    expect(find.textContaining('Paper · paper SOL, tidak ada SOL nyata'), findsOneWidget);
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
    expect(find.textContaining('Real SOL · wallet terhubung'), findsOneWidget);
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
    await tester.pumpAndSettle(
      const Duration(milliseconds: 100),
      EnginePhase.sendSemanticsUpdate,
      const Duration(seconds: 10),
    );
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
      ..debugAddApproval(
        Approval(
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
        ),
      );
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

  testWidgets('UNSUPPORTED_QUOTE_MINT pick: neutral badge, Approve disabled, Skip with not_tradeable preselected', (
    tester,
  ) async {
    await _phone(tester);
    final now = DateTime.now();
    final b = MockBackend()
      ..debugAddApproval(
        Approval(
          id: 'apv_nt1',
          kind: ApprovalKind.buyPick,
          status: ApprovalStatus.pending,
          title: 'Buy NOPAIR',
          detail: 'Pullback v2 · fit 90/70',
          createdAt: now,
          expiresAt: now.add(const Duration(minutes: 10)),
          token: 'tok_nt1',
          strategyId: 'stg_pull',
          amountLamports: Lamports.fromSol('0.1'),
          pickType: PickType.buy,
          reasonCode: unsupportedQuoteMint,
        ),
      );
    await tester.pumpWidget(_app(b, '/approvals'));
    await tester.pump();
    final badge = find.byKey(const Key('notTradeable_apv_nt1'), skipOffstage: false);
    await tester.ensureVisible(badge);
    await tester.pump();
    expect(badge, findsOneWidget);
    final ctx = tester.element(badge);
    final l = AppLocalizations.of(ctx);
    expect(find.text(l.screenerNotTradeableBadge), findsOneWidget);
    expect(find.text(l.screenerNotTradeableDetail), findsOneWidget);
    // Neutral color (same token as ±0 PnL), not profit/warning.
    expect(
      tester
          .widget<TagChip>(find.ancestor(of: find.text(l.screenerNotTradeableBadge), matching: find.byType(TagChip)))
          .color,
      ctx.tradeColors.neutral,
    );
    expect(find.text(l.screenerDetailSkipHint), findsOneWidget);
    // Approve present but disabled.
    final approve = tester.widget<FilledButton>(find.byKey(const Key('approve_apv_nt1')));
    expect(approve.onPressed, isNull);
    expect(find.text(l.screenerDetailApproveUnavailable), findsOneWidget);
    // Swipe: left only (skip); right (approve) is not offered.
    final dismissible = tester.widget<Dismissible>(find.byKey(const ValueKey('swipe_apv_nt1')));
    expect(dismissible.direction, DismissDirection.endToStart);
    // A right swipe is a no-op: card stays, nothing decided.
    await tester.fling(find.byKey(const ValueKey('swipe_apv_nt1')), const Offset(400, 0), 2000);
    await tester.pump(const Duration(milliseconds: 600));
    expect(badge, findsOneWidget);
    expect(b.debugApprovals.firstWhere((a) => a.id == 'apv_nt1').isPending, isTrue);
    // Skip button → sheet with `not_tradeable` preselected → confirm.
    await tester.tap(find.byKey(const Key('skip_apv_nt1')));
    await tester.pumpAndSettle(const Duration(milliseconds: 100));
    final chip = tester.widget<ChoiceChip>(find.byKey(const Key('skipReason_not_tradeable')));
    expect(chip.selected, isTrue);
    expect(
      find.descendant(
        of: find.byKey(const Key('skipReason_not_tradeable')),
        matching: find.text(l.queueSkipReasonNotTradeable),
      ),
      findsOneWidget,
    );
    await tester.tap(find.byKey(const Key('skipConfirm')));
    await tester.pump(const Duration(milliseconds: 400));
    expect(find.byKey(const Key('notTradeable_apv_nt1'), skipOffstage: false), findsNothing); // hidden optimistically
    await tester.pump(const Duration(seconds: 6)); // undo window closes → decision sent
    await tester.pump();
    expect(b.debugApprovals.firstWhere((a) => a.id == 'apv_nt1').status, ApprovalStatus.skipped);
    expect(b.debugLastDecide?.rejectReason, RejectReason.notTradeable);
    b.dispose();
  });

  testWidgets('UNSUPPORTED_QUOTE_MINT pick: swipe left skips with reason not_tradeable', (tester) async {
    await _phone(tester);
    final now = DateTime.now();
    final b = MockBackend()
      ..debugAddApproval(
        Approval(
          id: 'apv_nt2',
          kind: ApprovalKind.buyPick,
          status: ApprovalStatus.pending,
          title: 'Buy NOPAIR2',
          detail: 'Pullback v2 · fit 90/70',
          createdAt: now,
          expiresAt: now.add(const Duration(minutes: 10)),
          token: 'tok_nt2',
          strategyId: 'stg_pull',
          amountLamports: Lamports.fromSol('0.1'),
          pickType: PickType.buy,
          reasonCode: unsupportedQuoteMint,
        ),
      );
    await tester.pumpWidget(_app(b, '/approvals'));
    await tester.pump();
    final swipe = find.byKey(const ValueKey('swipe_apv_nt2'), skipOffstage: false);
    await tester.ensureVisible(swipe);
    await tester.pump();
    await tester.fling(swipe, const Offset(-400, 0), 2000);
    await tester.pump(const Duration(milliseconds: 600));
    await tester.pump(const Duration(milliseconds: 600));
    await tester.pump(const Duration(seconds: 6));
    await tester.pump();
    expect(b.debugApprovals.firstWhere((a) => a.id == 'apv_nt2').status, ApprovalStatus.skipped);
    expect(b.debugLastDecide?.rejectReason, RejectReason.notTradeable);
    b.dispose();
  });

  testWidgets('WF-21 Coins: not-tradeable card is neutral, has no actions, cannot swipe; detail CTA disabled', (
    tester,
  ) async {
    await _phone(tester);
    final b = MockBackend();
    await tester.pumpWidget(_app(b, '/coins'));
    await tester.pumpAndSettle();
    final card = find.byKey(const Key('coin_USDX'));
    expect(card, findsOneWidget);
    final l = AppLocalizations.of(tester.element(card));
    expect(find.byKey(const Key('notTradeable_USDX')), findsOneWidget);
    expect(find.descendant(of: card, matching: find.text(l.screenerNotTradeableBadge)), findsOneWidget);
    // Neutral chip, not red/green; no buttons; not swipeable.
    final chip = tester.widget<TagChip>(
      find.descendant(of: find.byKey(const Key('notTradeable_USDX')), matching: find.byType(TagChip)),
    );
    expect(chip.color, tester.element(card).tradeColors.neutral);
    expect(chip.icon, Icons.block);
    expect(find.descendant(of: card, matching: find.byType(ButtonStyleButton)), findsNothing);
    expect(find.ancestor(of: card, matching: find.byType(Dismissible)), findsNothing);
    expect(find.textContaining('Approve'), findsNothing);
    expect(find.text('Skip'), findsNothing);
    // Passed coins still link to the queue (control).
    expect(
      find.descendant(of: find.byKey(const Key('coin_MOON')), matching: find.text('Buka antrean ›')),
      findsOneWidget,
    );

    await tester.tap(card);
    await tester.pumpAndSettle();
    expect(find.byKey(const Key('detail_notTradeable')), findsOneWidget);
    expect(find.text(l.screenerNotTradeableDetail), findsOneWidget);
    expect(find.text('USDC · bukan SOL'), findsOneWidget);
    final cta = tester.widget<FilledButton>(find.byKey(const Key('approve_disabled')));
    expect(cta.onPressed, isNull);
    expect(find.text('Skip'), findsNothing);
    // USDX never entered the approval queue.
    expect(b.debugApprovals.where((a) => a.title.contains('USDX')), isEmpty);
  });

  testWidgets('guard hold Practice is 1,2 s', (tester) async {
    await _phone(tester);
    final b = MockBackend();
    await tester.pumpWidget(_app(b, '/approvals/apv_seed2/review'));
    await tester.pump();
    expect(
      tester.widget<HoldToConfirmButton>(find.byKey(const Key('holdConfirm'))).hold,
      const Duration(milliseconds: 1200),
    );
    expect(AppMotion.holdPracticeBase, const Duration(milliseconds: 1200));
    b.dispose();
  });

  testWidgets('guard hold Real 2,5 s: a 1,3 s hold does not decide', (tester) async {
    await _phone(tester);
    final b2 = MockBackend();
    await tester.pumpWidget(_app(b2, '/approvals/apv_seed4/review', realSol: true));
    await tester.pump();
    expect(
      tester.widget<HoldToConfirmButton>(find.byKey(const Key('holdConfirm'))).hold,
      const Duration(milliseconds: 2500),
    );
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
    expect(
      tester.widget<HoldToConfirmButton>(find.byKey(const Key('holdConfirm'), skipOffstage: false)).enabled,
      isFalse,
    );
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

  group('per-strategy Paper / Real (contracts 1.1.6, read-only)', () {
    testWidgets('list: mode badges, filter counts, Real locked chip + reason a11y, progress without rules', (
      tester,
    ) async {
      await _phone(tester);
      final handle = tester.ensureSemantics();
      await tester.pumpWidget(_app(MockBackend(), '/strategies'));
      await tester.pump();
      expect(find.text('All · 3'), findsNothing, reason: 'ID locale');
      expect(find.text('Semua · 3'), findsOneWidget);
      expect(find.text('Paper · 2'), findsOneWidget);
      expect(find.text('Real · 1'), findsOneWidget);
      expect(find.text('◇ PAPER'), findsNWidgets(2));
      expect(find.text('● REAL SOL'), findsOneWidget);
      expect(find.text('Real terkunci'), findsNWidgets(2));
      expect(find.bySemanticsLabel('Opsi Real nonaktif: Butuh persetujuan Boss'), findsNWidgets(2));
      expect(find.text('4 hari di Paper · 23 trade selesai'), findsOneWidget);
      await tester.tap(find.byKey(const Key('strategy_filter_real')));
      await tester.pump();
      expect(find.text('◇ PAPER'), findsNothing);
      expect(find.text('Graduated Momentum'), findsOneWidget);
      handle.dispose();
    });

    testWidgets('detail: strategy mode banner, Real segment disabled, "rule not set", no Real confirmation', (
      tester,
    ) async {
      await _phone(tester);
      final b = MockBackend();
      await tester.pumpWidget(_app(b, '/strategies'));
      await tester.pump();
      await tester.tap(find.byKey(const Key('strategy_open_stg_pullback')));
      await tester.pumpAndSettle();
      final banner = find.byKey(const Key('strategy_mode_banner'));
      expect(find.descendant(of: banner, matching: find.text('◇ Paper · paper SOL')), findsOneWidget);
      expect(find.text('Aturan belum ditetapkan'), findsOneWidget);
      expect(find.text('4 hari di Paper'), findsOneWidget);
      expect(find.text('23 trade selesai'), findsOneWidget);
      expect(
        find.textContaining(RegExp(r'\d+/\d+ (hari|trade)')),
        findsNothing,
        reason: 'no ratio when required is null',
      );
      final sel = tester.widget<SegmentedButton<TradeMode>>(find.byKey(const Key('strategy_mode_selector')));
      expect(sel.onSelectionChanged, isNull);
      expect(sel.selected, {TradeMode.practice});
      expect(sel.segments.firstWhere((x) => x.value == TradeMode.real).enabled, isFalse);
      await tester.tap(find.text('Real').last, warnIfMissed: false);
      await tester.pumpAndSettle();
      expect(find.byKey(const Key('typedConfirm')), findsNothing);
      expect(find.byType(HoldToConfirmButton), findsNothing);
      // Mock streams are real async: read them through runAsync so the fake-async widget clock does not deadlock.
      final strategies = await tester.runAsync(() => b.watchStrategies().first);
      final s = strategies!.firstWhere((x) => x.id == 'stg_pullback');
      expect(s.mode, TradeMode.practice);
    });
  });
}
