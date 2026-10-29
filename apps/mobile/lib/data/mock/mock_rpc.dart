import '../api/api_exception.dart';
import '../api/sentra_rpc.dart';
import '../api/wire.dart';
import '../models/models.dart';
import '../repositories/repositories.dart';
import 'mock_backend.dart';

/// In-memory [SentraRpc] over [MockBackend]. Every call goes through the wire
/// shapes (`toRpcParams()` in, JSON-like map out) so DTO mapping is exercised
/// exactly as with `supabase.rpc`.
class MockSentraRpc implements SentraRpc {
  MockSentraRpc(this.backend);
  final MockBackend backend;

  /// Last call (name, params), for tests asserting the wire params.
  (String, Map<String, Object?>)? lastCall;

  void _record(String name, Map<String, Object?> params) => lastCall = (name, params);

  @override
  Future<DecideApprovalResult> decideApproval(DecideApprovalRequest r) async {
    _record(Rpc.decideApproval, r.toRpcParams());
    final res = await backend.decide(r);
    return DecideApprovalResult.fromJson(res.toJson()); // round-trip wire (rejected ↔ skipped)
  }

  @override
  Future<StrategyWriteResult> setStrategyStatus(SetStrategyStatusRequest r) async {
    _record(Rpc.setStrategyStatus, r.toRpcParams());
    final s = await backend.setPaused(
      r.strategyId,
      paused: r.status != StrategyStatus.running,
      expectedRev: r.expectedRev,
    );
    return StrategyWriteResult(strategyId: s.id, rev: s.rev, status: s.status, serverNow: backend.serverNow);
  }

  @override
  Future<StrategyWriteResult> updateStrategy(UpdateStrategyRequest r) async {
    _record(Rpc.updateStrategy, r.toRpcParams());
    final s = await backend.updateStrategy(
      r.strategyId,
      expectedRev: r.expectedRev,
      patch: r.patch,
      name: r.name,
      status: r.status,
    );
    return StrategyWriteResult(strategyId: s.id, rev: s.rev, status: s.status, serverNow: backend.serverNow);
  }

  @override
  Future<PracticeResetResult> resetPractice(String workspaceId) {
    _record(Rpc.resetPractice, {'p_workspace': workspaceId});
    return backend.resetPractice(idempotencyKey: 'rpc:$workspaceId:${backend.epoch}');
  }

  @override
  Future<DeviceRecord> registerDevice(RegisterDeviceRequest r) async {
    _record(Rpc.registerDevice, r.toRpcParams());
    if (!r.validDeviceId || r.token.isEmpty) throw ApiException.fromCode('DEVICE_TOKEN_INVALID');
    final prev = backend.devices[r.deviceId];
    final rev = ((prev?['rev'] as int?) ?? 0) + 1;
    final now = backend.serverNow;
    backend.devices[r.deviceId] = {...r.toRpcParams(), 'rev': rev, 'last_seen_at': now};
    return DeviceRecord(id: 'dev_${r.deviceId}', deviceId: r.deviceId, platform: r.platform, rev: rev, lastSeenAt: now);
  }

  @override
  Future<void> revokeDevice(String deviceId) async {
    _record(Rpc.revokeDevice, {'p_device_id': deviceId});
    backend.devices.remove(deviceId);
  }

  @override
  Future<PortfolioLatest> portfolioLatest(TradeMode mode) async {
    _record(Rpc.portfolioLatest, {'mode': Wire.mode(mode)});
    if (mode == TradeMode.real) throw ApiException.fromCode('REAL_SOL_DISABLED');
    return PortfolioLatest.fromJson(backend.portfolioLatestRow());
  }

  @override
  Future<List<ExitStat>> exitStats({required TradeMode mode, String? strategyId, String window = '24h'}) async {
    _record(Rpc.exitStats, {'p_mode': Wire.mode(mode), 'p_strategy_id': strategyId, 'p_window': window});
    return backend.exitStatsRows(strategyId: strategyId).map(ExitStat.fromJson).toList();
  }
}
