import 'package:flutter_riverpod/flutter_riverpod.dart';

import '../core/approval_guard.dart';
import '../core/feature_flags.dart';
import 'api/auth.dart';
import 'api/events_feed.dart';
import 'api/sentra_rpc.dart';
import 'mock/mock_backend.dart';
import 'mock/mock_rpc.dart';
import 'models/models.dart';
import 'repositories/repositories.dart';

/// Composition root for the data layer. In prod, `main()` overrides these
/// four repository providers with Supabase implementations; nothing in
/// features/ changes.
final mockBackendProvider = Provider<MockBackend>((ref) {
  final b = MockBackend()..start();
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

final practiceResetRepositoryProvider = Provider<PracticeResetRepository>((ref) => ref.watch(mockBackendProvider));
final eventsFeedProvider = Provider<EventsFeed>((ref) => ref.watch(mockBackendProvider));
final marksSourceProvider = Provider<MarksSource>((ref) => ref.watch(mockBackendProvider));
final sentraRpcProvider = Provider<SentraRpc>((ref) => MockSentraRpc(ref.watch(mockBackendProvider)));
final authRepositoryProvider = Provider<AuthRepository>(
  (ref) => UnimplementedAuthRepository(telegramEnabled: ref.watch(featureFlagsProvider).telegramOidcEnabled),
);

final approvalGuardProvider = Provider<ApprovalGuard>((ref) => const DialogApprovalGuard());

// ---- read models (StreamProviders = realtime) -------------------------------

final summaryProvider = StreamProvider<PortfolioSummary>(
  (ref) => ref.watch(portfolioRepositoryProvider).watchSummary(),
);

final positionsProvider = StreamProvider<List<Position>>(
  (ref) => ref.watch(portfolioRepositoryProvider).watchPositions(),
);

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
