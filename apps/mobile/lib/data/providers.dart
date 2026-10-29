import 'package:flutter_riverpod/flutter_riverpod.dart';

import '../core/approval_guard.dart';
import '../core/feature_flags.dart';
import '../core/perf/per_key_throttle.dart';
import 'api/auth.dart';
import 'api/events_feed.dart';
import 'api/marks.dart';
import 'api/sentra_rpc.dart';
import 'mock/mock_backend.dart';
import 'mock/mock_rpc.dart';
import 'models/models.dart';
import 'repositories/repositories.dart';

/// Composition root for the data layer. In prod, `main()` overrides these
/// four repository providers with Supabase implementations; nothing in
/// features/ changes.
/// Ticking (the mock's stand-in for Realtime) starts after the first frame via
/// `deferredInitProvider`, not here, so building the first screen does no extra work.
final mockBackendProvider = Provider<MockBackend>((ref) {
  final b = MockBackend();
  ref.onDispose(b.dispose);
  return b;
});

final portfolioRepositoryProvider = Provider<PortfolioRepository>((ref) => ref.watch(mockBackendProvider));
final activityRepositoryProvider = Provider<ActivityRepository>((ref) => ref.watch(mockBackendProvider));
final strategyRepositoryProvider = Provider<StrategyRepository>((ref) => ref.watch(mockBackendProvider));
final approvalRepositoryProvider = Provider<ApprovalRepository>((ref) => ref.watch(mockBackendProvider));

final screenerRepositoryProvider = Provider<ScreenerRepository>((ref) => ref.watch(mockBackendProvider));

final screenerProvider = StreamProvider<List<ScreenerCoin>>(
  (ref) => ref.watch(screenerRepositoryProvider).watchScreener(),
);

/// Active workspace id (prod: from the session / workspace picker).
final workspaceIdProvider = Provider<String>((_) => MockBackend.workspaceId);

/// `practice_epoch` gate (1.1.2): drops rows from an archived practice run.
final practiceEpochGateProvider = Provider<PracticeEpochGate>((ref) => PracticeEpochGate());

final practiceResetRepositoryProvider = Provider<PracticeResetRepository>((ref) => ref.watch(mockBackendProvider));
final eventsFeedProvider = Provider<EventsFeed>((ref) => ref.watch(mockBackendProvider));
final marksSourceProvider = Provider<MarksSource>((ref) => ref.watch(mockBackendProvider));

/// Max live-price refresh per row (4 Hz). Marks can arrive much faster for a hot
/// mint; repainting a row more often than this is invisible but costs frames.
const markRowInterval = Duration(milliseconds: 250);

/// Latest mark for one mint, throttled per row. Each visible row watches its own
/// family instance, so one hot mint never rebuilds the whole list.
final liveMarkProvider = StreamProvider.autoDispose.family<MarkMessage, ({String mint, TradeMode mode})>((ref, k) {
  return ref
      .watch(marksSourceProvider)
      .watchMarks(ref.watch(workspaceIdProvider), k.mode)
      .where((m) => m is MarkMessage && m.mint == k.mint)
      .cast<MarkMessage>()
      .transform(PerKeyThrottle<MarkMessage, String>(keyOf: (m) => m.mint, interval: markRowInterval));
});
final sentraRpcProvider = Provider<SentraRpc>((ref) => MockSentraRpc(ref.watch(mockBackendProvider)));

/// Wallet-only SIWS (1.1.4). Mock until the wallet SDK review lands; the mock
/// allowlist holds the demo owner wallet only.
const mockOwnerWallet = 'Own3rWa11etDemo1111111111111111111111111111';
final siwsAuthRepositoryProvider = Provider<SiwsAuthRepository>((_) => MockSiwsAuth(ownerWallets: {mockOwnerWallet}));
final walletSignerProvider = Provider<WalletSigner>((_) => MockWalletSigner(mockOwnerWallet));
final telegramAuthProvider = Provider<TelegramAuthStub>(
  (ref) => TelegramAuthStub(enabled: ref.watch(featureFlagsProvider).telegramOidcEnabled),
);
final authControllerProvider = Provider<AuthController>((ref) {
  final c = AuthController(
    repo: ref.watch(siwsAuthRepositoryProvider),
    signer: ref.watch(walletSignerProvider),
    domain: 'app.sentra.local',
  );
  ref.onDispose(c.dispose);
  return c;
});
final authStateProvider = StreamProvider<AuthState>((ref) {
  final c = ref.watch(authControllerProvider);
  Stream<AuthState> gen() async* {
    yield c.state;
    yield* c.states;
  }

  return gen();
});

final approvalGuardProvider = Provider<ApprovalGuard>((ref) => const DialogApprovalGuard());

// ---- read models (StreamProviders = realtime) -------------------------------

final summaryProvider = StreamProvider<PortfolioSummary>(
  (ref) => ref.watch(portfolioRepositoryProvider).watchSummary(),
);

final positionsProvider = StreamProvider<List<Position>>((ref) {
  final gate = ref.watch(practiceEpochGateProvider);
  return ref.watch(portfolioRepositoryProvider).watchPositions().map(gate.filter);
});

final positionByIdProvider = Provider.family<AsyncValue<Position?>, String>((ref, id) {
  return ref.watch(positionsProvider).whenData((list) {
    for (final p in list) {
      if (p.id == id) return p;
    }
    return null;
  });
});

final activityFeedProvider = StreamProvider.family<List<ActivityEvent>, String?>(
  (ref, strategyId) => ref.watch(activityRepositoryProvider).watchFeed(strategyId: strategyId),
);

final strategiesProvider = StreamProvider<List<Strategy>>(
  (ref) => ref.watch(strategyRepositoryProvider).watchStrategies(),
);

final pendingApprovalsProvider = StreamProvider<List<Approval>>(
  (ref) => ref.watch(approvalRepositoryProvider).watchPending(),
);

final pendingCountProvider = Provider<int>((ref) => ref.watch(pendingApprovalsProvider).valueOrNull?.length ?? 0);

final allApprovalsProvider = StreamProvider<List<Approval>>((ref) => ref.watch(approvalRepositoryProvider).watchAll());

/// Workspace mode drives the persistent banner. Practice/Real are separate
/// workspaces (SPEC §4): Real numbers never render on a Practice screen.
final workspaceModeProvider = Provider<TradeMode>(
  (ref) => ref.watch(summaryProvider).valueOrNull?.mode ?? TradeMode.practice,
);
