import 'package:flutter/material.dart';
import 'package:flutter_localizations/flutter_localizations.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:centurion_mobile/app/app.dart';
import 'package:centurion_mobile/core/approval_guard.dart';
import 'package:centurion_mobile/core/feature_flags.dart';
import 'package:centurion_mobile/core/startup/deferred_init.dart';
import 'package:centurion_mobile/core/theme/centurion_theme.dart';
import 'package:centurion_mobile/data/mock/mock_backend.dart';
import 'package:centurion_mobile/data/models/models.dart';
import 'package:centurion_mobile/data/providers.dart';
import 'package:centurion_mobile/data/repositories/repositories.dart';
import 'package:centurion_mobile/data/api/settings_keys.dart';
import 'package:centurion_mobile/features/strategies/strategy_patch_flow.dart';
import 'package:centurion_mobile/l10n/gen/app_localizations.dart';

Widget _app(MockBackend b, String location, {bool realSol = false}) => ProviderScope(
  overrides: [
    mockBackendProvider.overrideWithValue(b..realSolEnabled = realSol),
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

Approval _pick(TradeMode mode) {
  final now = DateTime.now().toUtc();
  return Approval(
    id: 'apv_q',
    kind: ApprovalKind.buyPick,
    status: ApprovalStatus.pending,
    title: 'Buy QUOTE',
    detail: 'review sheet test',
    createdAt: now,
    // Far expiry: sorts last, so the test card is stable at the bottom.
    expiresAt: now.add(const Duration(minutes: 59)),
    token: 'tok_q',
    mode: mode,
    strategyId: 'stg_pullback',
    amountLamports: Lamports.parse('250000000'),
    quote: MockBackend.estimateQuote(Lamports.parse('250000000'), now),
  );
}

Future<void> _openReview(WidgetTester tester) async {
  final btn = find.byKey(const Key('review_apv_q'), skipOffstage: false);
  await tester.ensureVisible(btn);
  await tester.pump();
  await tester.tap(btn);
  await tester.pump();
  await tester.pump(const Duration(milliseconds: 400));
}

void main() {
  testWidgets('proposal.updated is silent: merge in the open sheet, inline label, throttled to 1 per 3 s', (
    tester,
  ) async {
    await _phone(tester);
    final b = MockBackend()..debugAddApproval(_pick(TradeMode.practice));
    await tester.pumpWidget(_app(b, '/approvals'));
    await tester.pump();
    await _openReview(tester);
    expect(find.byKey(const Key('quoteState_fresh')), findsOneWidget);
    expect(find.byKey(const Key('quoteUpdatedInline')), findsNothing);

    b.refreshQuote('apv_q'); // rev 2: first update renders at once
    await tester.pump(const Duration(milliseconds: 10));
    await tester.pump();
    expect(find.byKey(const Key('quoteUpdatedInline')), findsOneWidget);
    expect(find.byType(SnackBar), findsNothing, reason: 'no toast');
    await tester.pump(const Duration(seconds: 2, milliseconds: 100));
    expect(find.byKey(const Key('quoteUpdatedInline')), findsNothing, reason: 'label ~2 s');

    b.refreshQuote('apv_q'); // rev 3, inside the 3 s window → held back
    await tester.pump(const Duration(milliseconds: 10));
    await tester.pump();
    expect(find.byKey(const Key('quoteUpdatedInline')), findsNothing);
    await tester.pump(const Duration(seconds: 1));
    expect(find.byKey(const Key('quoteUpdatedInline')), findsOneWidget, reason: 'trailing render at 3 s');

    // Approve from the sheet uses the merged rev (no VERSION_CONFLICT).
    await tester.tap(find.byKey(const Key('reviewApprove')));
    await tester.pump();
    await tester.pump(const Duration(milliseconds: 500));
    expect(b.debugApprovals.firstWhere((a) => a.id == 'apv_q').status, ApprovalStatus.approved);
    await tester.pumpWidget(const SizedBox());
    await tester.pump(const Duration(seconds: 6));
    b.dispose();
  });

  testWidgets('Real: a quote update during the hold cancels and resets it (changed_during_hold)', (tester) async {
    await _phone(tester);
    final b = MockBackend()..debugAddApproval(_pick(TradeMode.real));
    await tester.pumpWidget(_app(b, '/approvals', realSol: true));
    await tester.pump();
    await _openReview(tester);
    final hold = find.byKey(const ValueKey('reviewHold_r1'));
    expect(hold, findsOneWidget);
    final g = await tester.startGesture(tester.getCenter(hold));
    await tester.pump(const Duration(milliseconds: 1000));
    b.refreshQuote('apv_q');
    await tester.pump(const Duration(milliseconds: 10));
    await tester.pump();
    expect(find.byKey(const Key('quoteChangedDuringHold')), findsOneWidget);
    expect(find.byKey(const ValueKey('reviewHold_r2')), findsOneWidget, reason: 'new rev → fresh hold bar');
    await tester.pump(const Duration(seconds: 3)); // finger still down: the reset button never confirms
    await g.up();
    await tester.pump();
    expect(b.debugApprovals.firstWhere((a) => a.id == 'apv_q').status, ApprovalStatus.pending);
    await tester.pumpWidget(const SizedBox());
    await tester.pump(const Duration(seconds: 6));
    b.dispose();
  });

  testWidgets('loosening a guard shows PENDING approval (info tone), never success', (tester) async {
    final b = MockBackend();
    StrategyPatchOutcome? out;
    await tester.pumpWidget(
      ProviderScope(
        overrides: [mockBackendProvider.overrideWithValue(b)],
        child: MaterialApp(
          theme: CenturionTheme.dark(),
          locale: const Locale('id'),
          supportedLocales: AppLocalizations.supportedLocales,
          localizationsDelegates: const [
            AppLocalizations.delegate,
            GlobalMaterialLocalizations.delegate,
            GlobalWidgetsLocalizations.delegate,
            GlobalCupertinoLocalizations.delegate,
          ],
          home: Scaffold(
            body: Consumer(
              builder: (context, ref, _) => TextButton(
                key: const Key('go'),
                onPressed: () async {
                  final s = b.debugStrategies.firstWhere((x) => x.id == 'stg_pullback');
                  out = await submitStrategyPatch(context, ref, s, {SettingsKeys.topHoldersSharePctMax.current: 60});
                },
                child: const Text('go'),
              ),
            ),
          ),
        ),
      ),
    );
    await tester.tap(find.byKey(const Key('go')));
    await tester.pump(const Duration(milliseconds: 100));
    await tester.pump(const Duration(milliseconds: 100));
    expect(out, isA<StrategyPatchPendingApproval>());
    expect(find.byKey(const Key('guardWeakenPending')), findsOneWidget);
    expect(find.byKey(const Key('strategyPatchApplied')), findsNothing);
    expect(find.textContaining('Perubahan menunggu approval'), findsOneWidget);
    await tester.pump(const Duration(seconds: 10));
    b.dispose();
  });

  testWidgets('activity: live head + older pages via next_cursor (footer ends the list)', (tester) async {
    await _phone(tester);
    final b = MockBackend();
    await tester.pumpWidget(_app(b, '/activity'));
    await tester.pump();
    await tester.pump(const Duration(milliseconds: 10));
    await tester.dragUntilVisible(
      find.byKey(const Key('pageEnd'), skipOffstage: false),
      find.byKey(const Key('activityList')),
      const Offset(0, -600),
    );
    expect(find.byKey(const Key('pageEnd')), findsOneWidget);
    await tester.pump(const Duration(seconds: 1));
    b.dispose();
  });
}
