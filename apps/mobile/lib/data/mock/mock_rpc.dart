import '../api/api_exception.dart';
import '../api/centurion_rpc.dart';
import '../api/wire.dart';
import '../models/models.dart';
import '../repositories/repositories.dart';
import 'mock_backend.dart';

/// In-memory [CenturionRpc] over [MockBackend]. Every call goes through the wire
/// shapes (`toRpcParams()` in, JSON-like map out) so DTO mapping is exercised
/// exactly as with `supabase.rpc`.
class MockCenturionRpc implements CenturionRpc {
  MockCenturionRpc(this.backend);
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
  Future<PracticeResetResult> resetPractice(ResetPracticeRequest r) {
    _record(Rpc.resetPractice, r.toRpcParams());
    return backend.resetPractice(r);
  }

  @override
  Future<ClosePositionResult> closePosition(ClosePositionRequest r) async {
    _record(Rpc.closePosition, r.toRpcParams());
    final res = await backend.closePosition(r);
    return ClosePositionResult.fromJson(res.toJson()); // round-trip the wire shape
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
  Future<List<ExitStat>> exitStats(
    String workspaceId, {
    TradeMode? mode,
    String? strategyId,
    DateTime? from,
    DateTime? to,
  }) async {
    _record(Rpc.exitStats, {
      'p_workspace': workspaceId,
      'p_strategy': ?strategyId,
      if (mode != null) 'p_mode': Wire.mode(mode),
      if (from != null) 'p_from': from.toUtc().toIso8601String(),
      if (to != null) 'p_to': to.toUtc().toIso8601String(),
    });
    if (workspaceId != MockBackend.workspaceId) throw ApiException.fromCode('NOT_FOUND');
    return backend.exitStatsRows(strategyId: strategyId).map(ExitStat.fromJson).toList();
  }
}
