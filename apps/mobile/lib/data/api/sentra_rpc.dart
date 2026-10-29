/// Contract v1.1 Supabase RPCs and reads used by the app
/// (FLUTTER_INTEGRATION_ANSWERS "v1.1 update" §2–3, API_ENDPOINTS §2, §4.7, §4.10).
/// Prod: `supabase.rpc(name, params: req.toRpcParams())`; errors are
/// SQLSTATE `P04xx` with MESSAGE = errors.json code → [ApiException.fromPostgres].
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

/// `update_strategy(p_strategy, p_expected_rev, p_patch, p_name, p_status, p_actor, p_via, p_device, p_challenge_id)`.
/// Only write path for strategies (direct UPDATE revoked). [patch] keys MUST be
/// `SettingsKeys.*.current` (snake_case v1.1).
class UpdateStrategyRequest {
  const UpdateStrategyRequest({
    required this.strategyId,
    required this.expectedRev,
    this.patch = const {},
    this.name,
    this.status,
    this.via = Wire.clientMobile,
    this.deviceId,
    this.challengeId,
  });
  final String strategyId;
  final int expectedRev;
  final Map<String, Object?> patch;
  final String? name;
  final StrategyStatus? status;
  final String via;
  final String? deviceId;

  /// Real guard loosening: proof-of-confirmation challenge (Phase 7).
  final String? challengeId;

  Map<String, Object?> toRpcParams() => {
    'p_strategy': strategyId,
    'p_expected_rev': expectedRev,
    'p_patch': patch,
    'p_name': name,
    'p_status': status == null ? null : strategyStatusWire(status!),
    'p_actor': null, // server fills from JWT
    'p_via': via,
    'p_device': deviceId,
    'p_challenge_id': challengeId,
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
    required this.epoch,
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
  final int epoch;
  final Lamports cash, positionsCost, positionsValue, equity, peakEquity, realizedPnl, unrealizedPnl;
  final int drawdownBps;
  final int openPositions;
  final int asOfSeq;

  static PortfolioLatest fromJson(Map<String, Object?> j) {
    Lamports l(String k) => Lamports.parse(j[k]! as String);
    return PortfolioLatest(
      mode: Wire.modeOf(j['mode'] as String?) ?? (throw FormatException('mode ${j['mode']}')),
      epoch: (j['epoch'] as num?)?.toInt() ?? 1,
      cash: l('cash_lamports'),
      positionsCost: l('positions_cost_lamports'),
      positionsValue: l('positions_value_lamports'),
      equity: l('equity_lamports'),
      peakEquity: l('peak_equity_lamports'),
      realizedPnl: l('realized_pnl_lamports'),
      unrealizedPnl: l('unrealized_pnl_lamports'),
      drawdownBps: (j['drawdown_bps'] as num).toInt(),
      openPositions: (j['open_positions'] as num).toInt(),
      asOfSeq: (j['as_of_seq'] as num).toInt(),
    );
  }
}

/// One `exit_stats()` row: exits grouped by ExitReason (`ExitReasons.*.current`).
class ExitStat {
  const ExitStat({required this.reason, required this.count, required this.pnl, required this.winRatePct});
  final String reason;
  final int count;
  final Lamports pnl;
  final double winRatePct;

  static ExitStat fromJson(Map<String, Object?> j) => ExitStat(
    reason: j['reason']! as String,
    count: (j['count'] as num).toInt(),
    pnl: Lamports.parse(j['pnl_lamports']! as String),
    winRatePct: (j['win_rate_pct'] as num?)?.toDouble() ?? 0,
  );
}

/// All v1.1 RPCs/reads the app calls. Mock: `MockSentraRpc`; prod: Supabase client (D5–6).
abstract interface class SentraRpc {
  Future<DecideApprovalResult> decideApproval(DecideApprovalRequest r);
  Future<StrategyWriteResult> setStrategyStatus(SetStrategyStatusRequest r);
  Future<StrategyWriteResult> updateStrategy(UpdateStrategyRequest r);

  /// `reset_practice(p_workspace)`; REST twin `POST /workspaces/{ws}/practice/reset`.
  Future<PracticeResetResult> resetPractice(String workspaceId);
  Future<DeviceRecord> registerDevice(RegisterDeviceRequest r);
  Future<void> revokeDevice(String deviceId);

  /// Read `portfolio_latest` for [mode] (current epoch).
  Future<PortfolioLatest> portfolioLatest(TradeMode mode);

  /// `exit_stats()`; current practice epoch only.
  Future<List<ExitStat>> exitStats({required TradeMode mode, String? strategyId, String window = '24h'});
}
