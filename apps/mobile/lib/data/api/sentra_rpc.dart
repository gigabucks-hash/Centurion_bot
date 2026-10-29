/// Contracts 1.1.2 Supabase RPCs and reads used by the app
/// (FLUTTER_INTEGRATION_ANSWERS 1.1.2 §2 is the exact param table).
/// Prod: `supabase.rpc(name, params: req.toRpcParams())`; errors are
/// SQLSTATE `P0`+HTTP with MESSAGE = errors.json code → [ApiException.fromPostgres].
/// Actor and channel come from the JWT: no RPC takes `p_actor`/`p_via`/`p_client`/`p_user`.
/// Every result carries `server_now` (feed [ServerClock]).
library;

import '../models/models.dart';
import '../repositories/repositories.dart' show PracticeResetResult;
import 'decide_approval.dart';
import 'wire.dart';

export 'decide_approval.dart';

/// RPC names (single place).
abstract final class Rpc {
  static const decideApproval = 'decide_approval';
  static const setStrategyStatus = 'set_strategy_status';
  static const updateStrategy = 'update_strategy';
  static const resetPractice = 'reset_practice';
  static const registerDevice = 'register_device';
  static const revokeDevice = 'revoke_device';
  static const exitStats = 'exit_stats';
  static const closePosition = 'close_position';

  /// View (select), replaces v1.0 `v_portfolio_summary`.
  static const portfolioLatest = 'portfolio_latest';
}

/// Strategy status wire values for `set_strategy_status`.
String strategyStatusWire(StrategyStatus s) => switch (s) {
  StrategyStatus.running => 'running',
  StrategyStatus.paused => 'paused',
  StrategyStatus.stopped => 'stopped',
};

class SetStrategyStatusRequest {
  const SetStrategyStatusRequest({required this.strategyId, required this.status, required this.expectedRev});
  final String strategyId;
  final StrategyStatus status;
  final int expectedRev;
  Map<String, Object?> toRpcParams() => {
    'p_strategy': strategyId,
    'p_status': strategyStatusWire(status),
    'p_expected_rev': expectedRev,
  };
}

/// `update_strategy(p_strategy, p_expected_rev, p_patch?, p_name?, p_status?, p_device?, p_challenge_id?)`.
/// Only write path for strategies (direct UPDATE revoked). [patch] keys MUST be
/// `SettingsKeys.*.current` (snake_case). Optional params are omitted when null.
class UpdateStrategyRequest {
  const UpdateStrategyRequest({
    required this.strategyId,
    required this.expectedRev,
    this.patch = const {},
    this.name,
    this.status,
    this.deviceLabel,
    this.challengeId,
  });
  final String strategyId;
  final int expectedRev;
  final Map<String, Object?> patch;
  final String? name;
  final StrategyStatus? status;

  /// `p_device`: optional label, metadata only (never identity).
  final String? deviceLabel;

  /// Real guard loosening: proof-of-confirmation challenge (Phase 7).
  final String? challengeId;

  Map<String, Object?> toRpcParams() => {
    'p_strategy': strategyId,
    'p_expected_rev': expectedRev,
    if (patch.isNotEmpty) 'p_patch': patch,
    'p_name': ?name,
    if (status != null) 'p_status': strategyStatusWire(status!),
    'p_device': ?deviceLabel,
    'p_challenge_id': ?challengeId,
  };
}

/// `reset_practice(p_workspace)`: the only signature in 1.1.2
/// (REST `POST /v1/workspaces/{ws}/practice/reset`). Direct action, not a proposal.
class ResetPracticeRequest {
  const ResetPracticeRequest(this.workspaceId);
  final String workspaceId;
  Map<String, Object?> toRpcParams() => {'p_workspace': workspaceId};
}

/// `close_position(p_position_id, p_expected_rev, p_idempotency_key, p_fraction_bps = 10000)`.
/// Practice only. [expectedRev] = the POSITION `rev`. [fractionBps] 1–10000
/// (10000 = sell all); outside → `422 INVALID_FRACTION`. Replaces `sell_pct`.
class ClosePositionRequest {
  const ClosePositionRequest({
    required this.positionId,
    required this.expectedRev,
    required this.idempotencyKey,
    this.fractionBps = 10000,
  });
  final String positionId;
  final int expectedRev;
  final String idempotencyKey;
  final int fractionBps;

  bool get validFraction => fractionBps >= 1 && fractionBps <= 10000;

  /// Body for idempotency comparison (same key + different body → 422).
  Map<String, Object?> get body => {
    'position_id': positionId,
    'expected_rev': expectedRev,
    'fraction_bps': fractionBps,
  };

  Map<String, Object?> toRpcParams() => {
    'p_position_id': positionId,
    'p_expected_rev': expectedRev,
    'p_idempotency_key': idempotencyKey,
    'p_fraction_bps': fractionBps,
  };
}

/// `ClosePositionResponse` (FLUTTER_INTEGRATION_ANSWERS §6).
class ClosePositionResult {
  const ClosePositionResult({
    required this.positionId,
    required this.positionRev,
    required this.practiceEpoch,
    required this.orderId,
    required this.orderStatus,
    required this.fractionBps,
    required this.jobId,
    required this.status,
    required this.replayed,
    required this.serverNow,
    this.qtyRaw,
    this.decimals,
    this.proceeds,
  });
  final String positionId;
  final int positionRev;
  final int practiceEpoch;
  final String orderId;
  final String orderStatus;
  final int fractionBps;

  /// int64 id as a string.
  final String jobId;

  /// `queued | filled | ...`.
  final String status;
  final bool replayed;
  final DateTime serverNow;
  final String? qtyRaw;
  final int? decimals;

  /// From `fill` when the simulated fill is already known (mock: always).
  final Lamports? proceeds;

  static ClosePositionResult fromJson(Map<String, Object?> j) {
    final p = (j['position']! as Map).cast<String, Object?>();
    final o = (j['order']! as Map).cast<String, Object?>();
    final f = (j['fill'] as Map?)?.cast<String, Object?>();
    return ClosePositionResult(
      positionId: Wire.idOf(p['id']) ?? '${p['id']}',
      positionRev: Wire.intOf(p['rev'])!,
      practiceEpoch: Wire.intOf(p['practice_epoch']) ?? 0,
      qtyRaw: p['qty_raw'] as String?,
      decimals: Wire.intOf(p['decimals']),
      orderId: '${j['order_id'] ?? o['id']}',
      orderStatus: '${o['status']}',
      fractionBps: Wire.intOf(o['fraction_bps']) ?? 10000,
      jobId: Wire.idOf(j['job_id']) ?? '${j['job_id']}',
      status: '${j['status']}',
      replayed: j['replayed'] as bool? ?? false,
      serverNow: DateTime.parse(j['server_now']! as String),
      proceeds: Lamports.tryParse(f?['proceeds_lamports'] as String?),
    );
  }

  Map<String, Object?> toJson() => {
    'position': {
      'id': positionId,
      'rev': positionRev,
      'practice_epoch': practiceEpoch,
      'qty_raw': ?qtyRaw,
      'decimals': ?decimals,
    },
    'order': {'id': orderId, 'status': orderStatus, 'fraction_bps': fractionBps, 'job_id': jobId},
    'order_id': orderId,
    'fill': proceeds == null ? null : {'proceeds_lamports': proceeds!.toWire()},
    'job_id': jobId,
    'status': status,
    'replayed': replayed,
    'server_now': serverNow.toUtc().toIso8601String(),
  };
}

class StrategyWriteResult {
  const StrategyWriteResult({
    required this.strategyId,
    required this.rev,
    required this.status,
    required this.serverNow,
  });
  final String strategyId;
  final int rev;
  final StrategyStatus status;
  final DateTime serverNow;
}

enum DevicePlatform { ios, android, web, desktop }

enum PushProvider { fcm, apns, webpush }

/// `register_device(p_device_id, p_platform, p_provider, p_token, p_app_version, p_locale)`.
class RegisterDeviceRequest {
  const RegisterDeviceRequest({
    required this.deviceId,
    required this.platform,
    required this.provider,
    required this.token,
    required this.appVersion,
    required this.locale,
  });

  /// App-generated install id, 8–128 `[A-Za-z0-9_-]`, kept in Keychain/Keystore.
  final String deviceId;
  final DevicePlatform platform;
  final PushProvider provider;
  final String token;
  final String appVersion;

  /// e.g. `id-ID`.
  final String locale;

  static final _idPattern = RegExp(r'^[A-Za-z0-9_-]{8,128}$');
  bool get validDeviceId => _idPattern.hasMatch(deviceId);

  Map<String, Object?> toRpcParams() => {
    'p_device_id': deviceId,
    'p_platform': platform.name,
    'p_provider': provider.name,
    'p_token': token,
    'p_app_version': appVersion,
    'p_locale': locale,
  };
}

class DeviceRecord {
  const DeviceRecord({
    required this.id,
    required this.deviceId,
    required this.platform,
    required this.rev,
    required this.lastSeenAt,
  });
  final String id;
  final String deviceId;
  final DevicePlatform platform;
  final int rev;
  final DateTime lastSeenAt;
}

/// `portfolio_latest` row (EVENTS_SCHEMA portfolio.snapshot shape).
class PortfolioLatest {
  const PortfolioLatest({
    required this.mode,
    required this.practiceEpoch,
    required this.cash,
    required this.positionsCost,
    required this.positionsValue,
    required this.equity,
    required this.peakEquity,
    required this.realizedPnl,
    required this.unrealizedPnl,
    required this.drawdownBps,
    required this.openPositions,
    required this.asOfSeq,
  });
  final TradeMode mode;

  /// `practice_epoch` (1.1.2; was `epoch`). Drop data from older epochs after a reset.
  final int practiceEpoch;
  final Lamports cash, positionsCost, positionsValue, equity, peakEquity, realizedPnl, unrealizedPnl;
  final int drawdownBps;
  final int openPositions;

  /// int64 seq (string on the wire).
  final BigInt asOfSeq;

  static PortfolioLatest fromJson(Map<String, Object?> j) {
    Lamports l(String k) => Lamports.parse(j[k]! as String);
    return PortfolioLatest(
      mode: Wire.modeOf(j['mode'] as String?) ?? (throw FormatException('mode ${j['mode']}')),
      practiceEpoch: Wire.intOf(j['practice_epoch']) ?? 0,
      cash: l('cash_lamports'),
      positionsCost: l('positions_cost_lamports'),
      positionsValue: l('positions_value_lamports'),
      equity: l('equity_lamports'),
      peakEquity: l('peak_equity_lamports'),
      realizedPnl: l('realized_pnl_lamports'),
      unrealizedPnl: l('unrealized_pnl_lamports'),
      drawdownBps: (j['drawdown_bps'] as num).toInt(),
      openPositions: (j['open_positions'] as num).toInt(),
      asOfSeq: Wire.seqOf(j['as_of_seq'])!,
    );
  }
}

/// One `exit_stats()` row (1.1.2 shape): `{exit_reason, count, pnl_lamports (string),
/// avg_pnl_pct, win_rate_pct (0-100), avg_hold_s}`. Key is `exit_reason`, not `reason`.
class ExitStat {
  const ExitStat({
    required this.exitReason,
    required this.count,
    required this.pnl,
    required this.winRatePct,
    this.avgPnlPct = 0,
    this.avgHoldS = 0,
  });
  final String exitReason;
  final int count;
  final Lamports pnl;
  final double avgPnlPct;
  final double winRatePct;
  final num avgHoldS;

  static ExitStat fromJson(Map<String, Object?> j) => ExitStat(
    exitReason: j['exit_reason']! as String,
    count: Wire.intOf(j['count'])!,
    pnl: Lamports.parse(j['pnl_lamports']! as String),
    avgPnlPct: (j['avg_pnl_pct'] as num?)?.toDouble() ?? 0,
    winRatePct: (j['win_rate_pct'] as num?)?.toDouble() ?? 0,
    avgHoldS: (j['avg_hold_s'] as num?) ?? 0,
  );

  Map<String, Object?> toJson() => {
    'exit_reason': exitReason,
    'count': count,
    'pnl_lamports': pnl.toWire(),
    'avg_pnl_pct': avgPnlPct,
    'win_rate_pct': winRatePct,
    'avg_hold_s': avgHoldS,
  };
}

/// All v1.1 RPCs/reads the app calls. Mock: `MockSentraRpc`; prod: Supabase client (D5–6).
abstract interface class SentraRpc {
  Future<DecideApprovalResult> decideApproval(DecideApprovalRequest r);
  Future<StrategyWriteResult> setStrategyStatus(SetStrategyStatusRequest r);
  Future<StrategyWriteResult> updateStrategy(UpdateStrategyRequest r);

  /// `reset_practice(p_workspace)`; REST twin `POST /workspaces/{ws}/practice/reset`.
  Future<PracticeResetResult> resetPractice(ResetPracticeRequest r);

  /// `close_position(...)`: manual sell (practice only).
  Future<ClosePositionResult> closePosition(ClosePositionRequest r);
  Future<DeviceRecord> registerDevice(RegisterDeviceRequest r);
  Future<void> revokeDevice(String deviceId);

  /// Read `portfolio_latest` for [mode] (current epoch).
  Future<PortfolioLatest> portfolioLatest(TradeMode mode);

  /// `exit_stats(p_workspace, p_strategy?, p_mode?, p_from?, p_to?)` (1.1.2 §8);
  /// current practice epoch only. Rows keyed by `exit_reason`.
  Future<List<ExitStat>> exitStats(
    String workspaceId, {
    TradeMode? mode,
    String? strategyId,
    DateTime? from,
    DateTime? to,
  });
}
