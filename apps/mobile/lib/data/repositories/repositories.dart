import '../models/models.dart';

/// Data-layer contracts. UI and providers depend ONLY on these, so the mock
/// implementation can be swapped for Supabase/REST via a provider override.

abstract interface class PortfolioRepository {
  /// Emits on every fill / mark update (Supabase Realtime in prod).
  Stream<PortfolioSummary> watchSummary();
  Stream<List<Position>> watchPositions();

  /// Equity curve for the Positions header (SPEC §6: 1D/7D/30D/All).
  Future<List<PnlPoint>> equityHistory(EquityRange range);

  /// Manual sell of [pct]% of the remaining size. Returns SOL received.
  /// Never callable from a notification (SPEC §6).
  Future<double> sellPosition(String positionId, {required double pct});
}

abstract interface class ActivityRepository {
  /// Newest first. Implementations should cap the in-memory list.
  Stream<List<ActivityEvent>> watchFeed({String? strategyId});
}

abstract interface class StrategyRepository {
  Stream<List<Strategy>> watchStrategies();

  /// Pause/resume. Sends [expectedRev]; throws [ConflictException] if stale.
  Future<Strategy> setPaused(String strategyId, {required bool paused, required int expectedRev});
}

abstract interface class ApprovalRepository {
  Stream<List<Approval>> watchPending();

  /// All statuses (inbox filter chips). Expired items carry [Approval.expireReason].
  Stream<List<Approval>> watchAll();

  /// Idempotent: calling twice with the same token returns the same result.
  Future<ApprovalStatus> decide(String approvalId, {required bool approve, required String token});
}

/// Source of raw push data payloads (FCM `data` map in prod; mock emits
/// the same shape). Parsed by `core/notifications/push_message.dart`.
abstract interface class PushSource {
  Stream<Map<String, String>> watchPushPayloads();
}
