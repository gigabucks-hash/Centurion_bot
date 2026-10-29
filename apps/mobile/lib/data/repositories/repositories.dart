import '../api/decide_approval.dart';
import '../models/models.dart';

export '../api/decide_approval.dart';
export '../api/marks.dart' show MarksSource;

/// Data-layer contracts. UI and providers depend ONLY on these, so the mock
/// implementation can be swapped for Supabase/REST via a provider override.

abstract interface class PortfolioRepository {
  /// Emits on every fill / mark update (Supabase Realtime in prod).
  Stream<PortfolioSummary> watchSummary();
  Stream<List<Position>> watchPositions();

  /// Equity curve for the Positions header (SPEC §6: 1D/7D/30D/All).
  Future<List<PnlPoint>> equityHistory(EquityRange range);

  /// Manual sell of [pct]% of the remaining size. Returns lamports received.
  /// Never callable from a notification (SPEC §6).
  Future<Lamports> sellPosition(String positionId, {required int pct});
}

abstract interface class ActivityRepository {
  /// Newest first. Implementations should cap the in-memory list.
  Stream<List<ActivityEvent>> watchFeed({String? strategyId});
}

abstract interface class StrategyRepository {
  Stream<List<Strategy>> watchStrategies();

  /// Pause/resume. Sends [expectedRev]; throws [ApiException] (STRATEGY_REV_CONFLICT) if stale.
  Future<Strategy> setPaused(String strategyId, {required bool paused, required int expectedRev});
}

abstract interface class ApprovalRepository {
  Stream<List<Approval>> watchPending();

  /// All statuses (inbox filter chips). Expired items carry [Approval.expireReason].
  Stream<List<Approval>> watchAll();

  /// `decide_approval` RPC. Idempotent per `p_idempotency_key` (`replayed: true`).
  /// Throws [ApiException] (APPROVAL_TOKEN_INVALID / _EXPIRED / _ALREADY_DECIDED,
  /// VERSION_CONFLICT, REAL_SOL_DISABLED, ...).
  Future<DecideApprovalResult> decide(DecideApprovalRequest request);
}

/// Source of raw PushPayload v1 maps (EVENTS_SCHEMA §6). In prod this is the
/// FCM/APNs `data` map (all values strings, `vars` JSON-encoded); the mock emits
/// the canonical JSON shape. Parsed by `core/push/push_payload.dart`.
abstract interface class PushSource {
  Stream<Map<String, Object?>> watchPushPayloads();
}

class PracticeResetResult {
  const PracticeResetResult({
    required this.epoch,
    required this.startingBalance,
    required this.archived,
    required this.nextAllowedAt,
    required this.serverNow,
  });
  final int epoch;
  final Lamports startingBalance;

  /// Counts of archived rows (positions, approvals, ...).
  final Map<String, int> archived;
  final DateTime nextAllowedAt;
  final DateTime serverNow;

  static PracticeResetResult fromJson(Map<String, Object?> j) => PracticeResetResult(
        epoch: (j['epoch']! as num).toInt(),
        startingBalance: Lamports.parse(j['starting_balance_lamports']! as String),
        archived: {for (final e in ((j['archived'] as Map?) ?? const {}).entries) '${e.key}': (e.value as num).toInt()},
        nextAllowedAt: DateTime.parse(j['next_allowed_at']! as String),
        serverNow: DateTime.parse(j['server_now']! as String),
      );
}

/// `POST /workspaces/{ws}/practice/reset` (contract v1.1): back to 30 SOL,
/// at most once per 24 h; otherwise 429 RESET_COOLDOWN with
/// `details.next_allowed_at`. Practice only; Real is never resettable.
abstract interface class PracticeResetRepository {
  Future<PracticeResetResult> resetPractice({required String idempotencyKey});
}
