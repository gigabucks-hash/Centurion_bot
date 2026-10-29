import 'dart:async';
import 'dart:math';

import '../api/api_exception.dart';
import '../api/events_feed.dart';
import '../api/marks.dart';
import '../api/settings_keys.dart';
import '../api/wire.dart';
import '../models/models.dart';
import '../repositories/repositories.dart';

Lamports _sol(String sol) => Lamports.fromSol(sol);
Decimal _d(String v) => Decimal.parse(v);

/// In-memory simulator standing in for Supabase (tables + Realtime + RPC).
///
/// One instance implements every repository so state stays consistent
/// (e.g. approving a buy pick creates a position and an activity event).
/// Call [start] for a periodic tick (UI demo) or [tick] manually (tests).
class MockBackend
    implements
        PortfolioRepository,
        ActivityRepository,
        StrategyRepository,
        ApprovalRepository,
        PushSource,
        PracticeResetRepository,
        MarksSource,
        EventsFeed {
  MockBackend({int seed = 7, DateTime Function()? clock, this.realSolEnabled = false})
      : _rng = Random(seed),
        _clock = clock ?? DateTime.now {
    _seed();
  }

  final Random _rng;
  final DateTime Function() _clock;
  final _changes = StreamController<void>.broadcast();
  final _pushes = StreamController<Map<String, Object?>>.broadcast();
  final _marks = StreamController<MarksMessage>.broadcast();
  final _envelopes = StreamController<Map<String, Object?>>.broadcast();

  /// device_id → registration (register_device / revoke_device).
  final Map<String, Map<String, Object?>> devices = {};

  /// Latest seq (shared by events and pushes, like the server's `events.seq`).
  int get lastSeq => _eventSeq;
  int get epoch => _epoch;
  Timer? _timer;
  int _seq = 0;
  int _eventSeq = 18000;

  /// Server-side Real SOL gate (REAL_SOL_DISABLED until Phase 7). Tests may enable.
  bool realSolEnabled;

  static const workspaceId = 'ws_mock';

  /// Practice starting balance: 30 SOL.
  static final Lamports startLamports = _sol('30');
  static const resetCooldown = Duration(hours: 24);
  int _epoch = 1;
  DateTime? _lastResetAt;
  final List<Strategy> _strategies = [];
  final List<Position> _positions = [];
  final List<ActivityEvent> _events = [];
  final List<Approval> _approvals = [];
  final List<PnlPoint> _history = [];
  /// p_idempotency_key → first result (replayed on retry).
  final Map<String, DecideApprovalResult> _idempotent = {};

  /// Mock server clock (`server_now`).
  DateTime get serverNow => _clock();

  // ---------------------------------------------------------------- lifecycle
  void start({Duration every = const Duration(seconds: 2)}) {
    _timer ??= Timer.periodic(every, (_) => tick());
  }

  void dispose() {
    _timer?.cancel();
    _changes.close();
    _pushes.close();
    _marks.close();
    _envelopes.close();
  }

  /// Advance the simulation by one step: move marks, maybe close a position,
  /// maybe emit a new pick that needs approval.
  void tick() {
    final now = _clock();
    for (var i = 0; i < _positions.length; i++) {
      final p = _positions[i];
      if (!p.isOpen) continue;
      final drift = 1 + (_rng.nextDouble() - 0.47) * 0.08;
      _positions[i] = _runExitPlan(p, scaleDecimal(p.markPriceUsd, drift), now);
      _emitMark(_positions[i], now);
    }
    if (!_marks.isClosed) _marks.add(ClockMessage(safeSeq: _eventSeq, serverNow: now));
    for (var i = 0; i < _approvals.length; i++) {
      final a = _approvals[i];
      if (a.status == ApprovalStatus.pending && a.isExpiredAt(now)) {
        _approvals[i] = a.copyWith(
            status: ApprovalStatus.expired, expireReason: ExpireReason.timedOut, decidedAt: now);
      }
    }
    if (_rng.nextDouble() < 0.25) _newPick(now);
    _history.add(PnlPoint(now, _summary().equityLamports));
    if (_history.length > 120) _history.removeAt(0);
    _notify();
  }

  // ---------------------------------------------------------- repositories
  @override
  Stream<PortfolioSummary> watchSummary() => _watch(_summary);

  @override
  Stream<List<Position>> watchPositions() => _watch(() {
        final list = [..._positions]..sort((a, b) {
            if (a.state != b.state) return a.state == PositionState.open ? -1 : 1;
            return b.openedAt.compareTo(a.openedAt);
          });
        return List.unmodifiable(list);
      });

  @override
  Future<List<PnlPoint>> equityHistory(EquityRange range) async {
    final now = _clock();
    final (count, step) = switch (range) {
      EquityRange.d1 => (24, const Duration(hours: 1)),
      EquityRange.d7 => (7 * 8, const Duration(hours: 3)),
      EquityRange.d30 => (30, const Duration(days: 1)),
      EquityRange.all => (60, const Duration(days: 1)),
    };
    // Deterministic random walk ending at current equity.
    final r = Random(range.index + 11);
    final end = _summary().equityLamports;
    final pts = <Lamports>[end];
    for (var i = 1; i < count; i++) {
      // Random walk in whole lamports (±0,03 SOL per step).
      pts.add(pts.last - Lamports.fromInt(((r.nextDouble() - 0.46) * 60000000).round()));
    }
    final ordered = pts.reversed.toList();
    return [
      for (var i = 0; i < ordered.length; i++)
        PnlPoint(now.subtract(step * (ordered.length - 1 - i)), ordered[i]),
    ];
  }

  @override
  Future<Lamports> sellPosition(String positionId, {required int pct}) async {
    await Future<void>.delayed(const Duration(milliseconds: 150));
    final i = _positions.indexWhere((p) => p.id == positionId);
    if (i < 0) throw ApiException.fromCode('NOT_FOUND');
    final p = _positions[i];
    // No dedicated code for "already closed" in errors.json → VALIDATION_FAILED (reported to Backend).
    if (!p.isOpen) throw ApiException.fromCode('VALIDATION_FAILED', details: {'reason': 'position_closed'});
    if (p.mode == TradeMode.real && !realSolEnabled) throw ApiException.fromCode('REAL_SOL_DISABLED');
    final share = pct.clamp(1, 100);
    final proceeds = p.estimateSell(share);
    final full = share >= 100;
    final soldNowBps = p.remainingBps * share ~/ 100;
    _positions[i] = p.copyWith(
      proceedsLamports: p.proceedsLamports + proceeds,
      soldBps: full ? 10000 : p.soldBps + soldNowBps,
      state: full ? PositionState.closed : null,
      closedAt: full ? _clock() : null,
      exitReason: full ? 'You sold 100% manually' : null,
    );
    _emitEvent(ActivityKind.sold, Actor.you, '${p.symbol}: you sold $share%',
        strategyId: p.strategyId, symbol: p.symbol, pnlLamports: proceeds - p.costLamports.bps(soldNowBps));
    _notify();
    return proceeds;
  }

  @override
  Stream<Map<String, Object?>> watchPushPayloads() => _pushes.stream;

  /// Raw envelopes (as Realtime would deliver them).
  Stream<Map<String, Object?>> get rawEvents => _envelopes.stream;

  @override
  Stream<EventEnvelope> watchEvents(String workspaceId, TradeMode mode, {int afterSeq = 0}) => _envelopes.stream
      .map(EventEnvelope.tryParse)
      .where((e) => e != null && e.mode == mode && e.seq > afterSeq)
      .cast<EventEnvelope>();

  /// Emits an EVENTS_SCHEMA §2 envelope; returns its seq.
  int _emitEnvelope(String type, String subject, Map<String, Object?> payload,
      {TradeMode mode = TradeMode.practice, String? strategyId, String actor = 'system'}) {
    final now = _clock();
    final seq = ++_eventSeq;
    if (!_envelopes.isClosed) {
      _envelopes.add({
        'id': '$subject:${now.millisecondsSinceEpoch}:$type',
        'seq': seq,
        'type': type,
        'version': 1,
        'workspace_id': workspaceId,
        'strategy_id': strategyId,
        'ts': now.toUtc().toIso8601String(),
        'actor': actor,
        'mode': Wire.mode(mode),
        'payload': payload,
        'untrusted': const <String, Object?>{},
        'server_now': now.toUtc().toIso8601String(),
      });
    }
    return seq;
  }

  /// `update_strategy` semantics: rev check (STRATEGY_REV_CONFLICT, P0409 + 409 body),
  /// patch keys must be v1.1 snake_case (`SettingsKeys.*.current`), else SETTINGS_SCHEMA_INVALID.
  Future<Strategy> updateStrategy(String strategyId,
      {required int expectedRev, Map<String, Object?> patch = const {}, String? name, StrategyStatus? status}) async {
    await Future<void>.delayed(const Duration(milliseconds: 50));
    final i = _strategies.indexWhere((s) => s.id == strategyId);
    if (i < 0) throw ApiException.fromCode('NOT_FOUND');
    final s = _strategies[i];
    if (s.rev != expectedRev) {
      throw ApiException(ApiErrorCode.fromWire('STRATEGY_REV_CONFLICT'),
          sqlState: 'P0409',
          details: {
            'current_rev': s.rev,
            'base_rev': expectedRev,
            'changed_fields': const <String>[],
            'changed_by': 'mock',
            'changed_at': _clock().toUtc().toIso8601String(),
          });
    }
    final known = {for (final k in SettingsKeys.all) k.current};
    final bad = patch.keys.where((k) => !known.contains(k)).toList();
    if (bad.isNotEmpty) throw ApiException.fromCode('SETTINGS_SCHEMA_INVALID', details: {'unknown_keys': bad});
    if (status == StrategyStatus.running && s.mode == TradeMode.real && !realSolEnabled) {
      throw ApiException.fromCode('REAL_SOL_DISABLED');
    }
    final mode = patch[SettingsKeys.approvalMode.current];
    final ticket = patch[SettingsKeys.ticketLamports.current];
    final updated = s.copyWith(
      rev: s.rev + 1,
      name: name,
      status: status,
      approvalMode: mode == null ? null : Wire.approvalModeOf('$mode'),
      ticketLamports: ticket == null ? null : Lamports.parse('$ticket'),
      maxOpen: (patch[SettingsKeys.maxConcurrentPositions.current] as num?)?.toInt(),
      exitPlan: patch[SettingsKeys.exitPreset.current] as String?,
    );
    _strategies[i] = updated;
    _emitEnvelope('strategy.updated', s.id, {'strategy_id': s.id, 'rev': updated.rev, 'changed_fields': patch.keys.toList()},
        mode: s.mode, strategyId: s.id, actor: 'user');
    _notify();
    return updated;
  }

  /// exit_stats(): closed positions of the current epoch grouped by exit reason.
  List<Map<String, Object?>> exitStatsRows({String? strategyId}) {
    final by = <String, List<Position>>{};
    for (final p in _positions.where((p) => !p.isOpen && (strategyId == null || p.strategyId == strategyId))) {
      by.putIfAbsent(_exitReasonWire(p.exitReason), () => []).add(p);
    }
    return [
      for (final e in by.entries)
        {
          'reason': e.key,
          'count': e.value.length,
          'pnl_lamports': sumLamports(e.value.map((p) => p.pnlLamports)).toWire(),
          'win_rate_pct': e.value.where((p) => p.pnlLamports > Lamports.zero).length * 100 / e.value.length,
        },
    ];
  }

  static String _exitReasonWire(String? display) {
    final d = (display ?? '').toLowerCase();
    if (d.startsWith('took profit') || d.contains('exit plan complete')) return ExitReasons.profitTarget.current;
    if (d.startsWith('stop loss')) return ExitReasons.lossGuard.current;
    if (d.startsWith('trailing')) return ExitReasons.peakTrail.current;
    if (d.startsWith('time stop')) return ExitReasons.maxHold.current;
    if (d.contains('manual')) return 'manual';
    return 'manual';
  }

  /// portfolio_latest row for Practice (current epoch).
  Map<String, Object?> portfolioLatestRow() {
    final s = _summary();
    final value = sumLamports(_positions.where((p) => p.isOpen).map((p) => p.valueLamports));
    final cost = sumLamports(_positions.where((p) => p.isOpen).map((p) => p.sizeLamports));
    final peak = _history.isEmpty
        ? s.equityLamports
        : _history.map((h) => h.equityLamports).reduce((a, b) => a > b ? a : b);
    final ddBps = peak.isZero || s.equityLamports > peak ? 0 : ((peak - s.equityLamports).ratioTo(peak) * 10000).round();
    return {
      'mode': 'practice',
      'epoch': _epoch,
      'cash_lamports': s.cashLamports.toWire(),
      'positions_cost_lamports': cost.toWire(),
      'positions_value_lamports': value.toWire(),
      'equity_lamports': s.equityLamports.toWire(),
      'peak_equity_lamports': (s.equityLamports > peak ? s.equityLamports : peak).toWire(),
      'drawdown_bps': ddBps,
      'drawdown_pct': ddBps / 100,
      'realized_pnl_lamports': s.realizedPnlLamports.toWire(),
      'unrealized_pnl_lamports': s.unrealizedPnlLamports.toWire(),
      'open_positions': s.openPositions,
      'as_of_seq': _eventSeq,
      'server_now': _clock().toUtc().toIso8601String(),
    };
  }

  @override
  Stream<MarksMessage> watchMarks(String workspaceId, TradeMode mode) =>
      _marks.stream.where((m) => m is ClockMessage || _positions.any((p) =>
          p.mode == mode && (m as MarkMessage).positionIds.contains(p.id)));

  void _emitMark(Position p, DateTime now) {
    if (_marks.isClosed) return;
    _marks.add(MarksMessage.fromBroadcast({
      'event': 'mark',
      'payload': {
        'mint': p.mint,
        'price_usd': p.markPriceUsd.toStringAsFixed(12),
        'ts': now.toUtc().toIso8601String(),
        'position_ids': [p.id],
        'server_now': now.toUtc().toIso8601String(),
      },
    })!);
  }

  @override
  Future<PracticeResetResult> resetPractice({required String idempotencyKey}) async {
    await Future<void>.delayed(const Duration(milliseconds: 150));
    final now = _clock();
    final last = _lastResetAt;
    if (last != null && now.difference(last) < resetCooldown) {
      throw ApiException.fromCode('RESET_COOLDOWN',
          details: {'next_allowed_at': last.add(resetCooldown).toUtc().toIso8601String()});
    }
    final archivedPositions = _positions.where((p) => p.mode == TradeMode.practice).length;
    _positions.removeWhere((p) => p.mode == TradeMode.practice);
    var archivedApprovals = 0;
    for (var i = 0; i < _approvals.length; i++) {
      final a = _approvals[i];
      if (a.mode == TradeMode.practice && a.isPending) {
        archivedApprovals++;
        _approvals[i] = a.copyWith(status: ApprovalStatus.expired, expireReason: ExpireReason.practiceReset, decidedAt: now);
      }
    }
    for (var i = 0; i < _strategies.length; i++) {
      final s = _strategies[i];
      if (s.mode == TradeMode.practice) _strategies[i] = s.copyWith(realizedPnlLamports: Lamports.zero);
    }
    _history
      ..clear()
      ..add(PnlPoint(now, startLamports));
    _epoch++;
    _lastResetAt = now;
    _emitEnvelope('practice.reset', workspaceId, {
      'epoch': _epoch,
      'starting_balance_lamports': startLamports.toWire(),
    }, actor: 'user');
    _emitEvent(ActivityKind.resumed, Actor.you, 'Practice reset to 30 paper SOL (epoch $_epoch)');
    _notify();
    return PracticeResetResult.fromJson({
      'epoch': _epoch,
      'starting_balance_lamports': startLamports.toWire(),
      'archived': {'positions': archivedPositions, 'approvals': archivedApprovals},
      'next_allowed_at': now.add(resetCooldown).toUtc().toIso8601String(),
      'server_now': now.toUtc().toIso8601String(),
    });
  }

  /// Test hook: synchronous snapshot (avoids awaiting streams in fake-async widget tests).
  List<Position> get debugPositions => List.unmodifiable(_positions);
  List<Approval> get debugApprovals => List.unmodifiable(_approvals);

  /// Test hooks: inject fixtures (e.g. Real SOL items, which the Practice seed has none of).
  void debugAddPosition(Position p) {
    _positions.add(p);
    _notify();
  }

  void debugAddApproval(Approval a) {
    _approvals.add(a);
    _notify();
  }

  /// Test hook: move a position's mark to [changePct] vs entry and run the
  /// exit plan once (TP rungs → stop loss → trailing → time stop).
  void debugSetChange(String positionId, double changePct) {
    final i = _positions.indexWhere((p) => p.id == positionId);
    final p = _positions[i];
    _positions[i] = _runExitPlan(p, scaleDecimal(p.entryPriceUsd, 1 + changePct / 100), _clock());
    _notify();
  }

  /// Emits a PushPayload v1 (EVENTS_SCHEMA §6) in canonical JSON shape.
  /// Real SOL: never a token, actions = ["open"].
  void _push(String event, String type, TradeMode mode,
      {String? approvalId, String? positionId, String? token, DateTime? exp, Map<String, Object?> vars = const {}}) {
    if (_pushes.isClosed) return;
    final real = mode == TradeMode.real;
    final pick = event == 'N-01' || event == 'N-02';
    _pushes.add({
      'v': 1,
      'event': event,
      'type': type,
      'mode': Wire.mode(mode),
      'workspace_id': workspaceId,
      'seq': _emitEnvelope(type, approvalId ?? positionId ?? event, {
        'approval_id': approvalId,
        'position_id': positionId,
      }, mode: mode),
      'deep_link': approvalId != null ? 'sentra://approvals/$approvalId' : 'sentra://positions/${positionId ?? ''}',
      'approval_id': ?approvalId,
      'position_id': ?positionId,
      if (!real && pick) 'token': ?token,
      if (exp != null) 'exp': exp.toUtc().toIso8601String(),
      'actions': real || !pick ? ['open'] : ['approve', 'skip', 'open'],
      'vars': vars,
      'server_now': _clock().toUtc().toIso8601String(),
    });
  }

  @override
  Stream<List<ActivityEvent>> watchFeed({String? strategyId}) => _watch(() => List.unmodifiable(
      _events.reversed.where((e) => strategyId == null || e.strategyId == strategyId).take(200)));

  @override
  Stream<List<Strategy>> watchStrategies() => _watch(() => List.unmodifiable(_strategies));

  /// Sorted soonest-expiry first (SPEC §3 default sort).
  @override
  Stream<List<Approval>> watchPending() => _watch(() => List.unmodifiable(
      _approvals.where((a) => a.isPending).toList()..sort((a, b) => a.expiresAt.compareTo(b.expiresAt))));

  @override
  Stream<List<Approval>> watchAll() => _watch(() => List.unmodifiable(_approvals.reversed));

  /// `set_strategy_status` (wraps update_strategy).
  @override
  Future<Strategy> setPaused(String strategyId, {required bool paused, required int expectedRev}) async {
    await Future<void>.delayed(const Duration(milliseconds: 100));
    final updated = await updateStrategy(strategyId,
        expectedRev: expectedRev, status: paused ? StrategyStatus.paused : StrategyStatus.running);
    _emitEvent(paused ? ActivityKind.paused : ActivityKind.resumed, Actor.you,
        '${paused ? 'Paused' : 'Resumed'} ${updated.name}',
        strategyId: updated.id);
    _notify();
    return updated;
  }

  /// Mirrors `decide_approval` (API §4.5): idempotency replay, token check,
  /// version check, expiry, Real gate. Errors are typed [ApiException]s.
  @override
  Future<DecideApprovalResult> decide(DecideApprovalRequest r) async {
    await Future<void>.delayed(const Duration(milliseconds: 150));
    final key = r.idempotencyKey;
    final prior = key == null ? null : _idempotent[key];
    if (prior != null) {
      return DecideApprovalResult(
          proposalId: prior.proposalId, status: prior.status, version: prior.version, replayed: true, serverNow: _clock());
    }
    final i = _approvals.indexWhere((a) => a.id == r.approvalId);
    if (i < 0) throw ApiException.fromCode('NOT_FOUND');
    final a = _approvals[i];
    if (a.token != r.token) throw ApiException.fromCode('APPROVAL_TOKEN_INVALID');
    if (a.status == ApprovalStatus.expired) throw ApiException.fromCode('APPROVAL_EXPIRED');
    if (a.status != ApprovalStatus.pending) {
      throw ApiException.fromCode('APPROVAL_ALREADY_DECIDED', details: {'status': Wire.approvalStatus(a.status)});
    }
    if (r.expectedRev != null && r.expectedRev != a.version) {
      throw ApiException.fromCode('VERSION_CONFLICT', details: {'current_rev': a.version, 'base_rev': r.expectedRev});
    }
    if (a.isExpiredAt(_clock())) {
      _approvals[i] = a.copyWith(status: ApprovalStatus.expired, expireReason: ExpireReason.timedOut, decidedAt: _clock());
      _notify();
      throw ApiException.fromCode('APPROVAL_EXPIRED');
    }
    if (a.mode == TradeMode.real && r.approve && !realSolEnabled) throw ApiException.fromCode('REAL_SOL_DISABLED');
    final status = r.approve ? ApprovalStatus.approved : ApprovalStatus.skipped;
    _approvals[i] = a.copyWith(status: status, decidedAt: _clock(), version: a.version + 1);
    _emitEnvelope(r.approve ? 'proposal.approved' : 'proposal.rejected', a.id, {
      'proposal_id': a.id,
      'kind': Wire.approvalKind(a.kind),
      'version': a.version + 1,
      'decided_by': 'mock_user',
      'decided_via': r.client,
      'reason': null,
    }, mode: a.mode, strategyId: a.strategyId, actor: 'user');
    _applyDecision(a, r.approve);
    _notify();
    final result = DecideApprovalResult(
        proposalId: a.id, status: status, version: a.version + 1, replayed: false, serverNow: _clock());
    if (key != null) _idempotent[key] = result;
    return result;
  }

  // ---------------------------------------------------------------- internals
  /// Current value on listen, then a fresh snapshot after every change
  /// (same semantics as a Supabase Realtime-backed stream).
  Stream<T> _watch<T>(T Function() read) {
    StreamSubscription<void>? sub;
    late final StreamController<T> c;
    c = StreamController<T>(
      onListen: () {
        c.add(read());
        sub = _changes.stream.listen((_) => c.add(read()), onDone: c.close);
      },
      onCancel: () => sub?.cancel(),
    );
    return c.stream;
  }

  void _notify() {
    if (!_changes.isClosed) _changes.add(null);
  }

  String _id(String prefix) => '$prefix${(++_seq).toString().padLeft(4, '0')}';

  void _emitEvent(ActivityKind kind, Actor actor, String msg,
      {String? strategyId, String? symbol, Lamports? pnlLamports}) {
    final now = _clock();
    _events.add(ActivityEvent(
      id: '${symbol ?? 'sys'}:${now.millisecondsSinceEpoch}:${kind.name}:${_seq++}',
      at: now,
      kind: kind,
      actor: actor,
      message: msg,
      strategyId: strategyId,
      symbol: symbol,
      pnlLamports: pnlLamports,
    ));
    if (_events.length > 500) _events.removeAt(0);
  }

  /// Exit preset id (current or v1.0 alias, see [ExitPresets]) → simulated plan.
  static ExitPlanState planFor(String presetId, DateTime openedAt) => switch (ExitPresets.normalize(presetId)) {
        final id when id == ExitPresets.fastHalf.current => ExitPlanState(
            name: 'Quick scalp',
            stopLossPct: -15,
            trailPct: 10,
            rungs: const [TpRung(gainPct: 20, sellPct: 50), TpRung(gainPct: 45, sellPct: 50)],
            timeStopAt: openedAt.add(const Duration(minutes: 5)),
          ),
        _ => ExitPlanState(
            name: 'Ladder 3-rung',
            stopLossPct: -35,
            trailPct: 20,
            rungs: const [
              TpRung(gainPct: 50, sellPct: 33),
              TpRung(gainPct: 100, sellPct: 33),
              TpRung(gainPct: 200, sellPct: 34),
            ],
            timeStopAt: openedAt.add(const Duration(minutes: 30)),
          ),
      };

  /// Applies mark → TP rungs → trailing → stop loss, in that order.
  Position _runExitPlan(Position p, Decimal mark, DateTime now) {
    var next = p.copyWith(markPriceUsd: mark, peakPriceUsd: mark > p.peakPriceUsd ? mark : p.peakPriceUsd);
    final plan = next.exitPlan;
    if (plan == null) return next;
    final r = ratio(mark, p.entryPriceUsd);
    Lamports sellAt(int bps) => p.costLamports.bps(bps).times(r).bps(10000 - p.feeBps);
    // Take-profit rungs.
    final rungs = [...plan.rungs];
    for (var k = 0; k < rungs.length; k++) {
      final rung = rungs[k];
      if (rung.filled || next.changePct < rung.gainPct) continue;
      final sellBps = min((rung.sellPct * 100).round(), next.remainingBps);
      final proceeds = sellAt(sellBps);
      final pnl = proceeds - p.costLamports.bps(sellBps);
      rungs[k] = rung.fill(now);
      next = next.copyWith(
        proceedsLamports: next.proceedsLamports + proceeds,
        soldBps: next.soldBps + sellBps,
        exitPlan: plan.copyWith(rungs: rungs, trailArmed: true),
      );
      final msg = 'Took profit: ${(sellBps / 100).round()}% at +${rung.gainPct.round()}%';
      _emitEvent(ActivityKind.sold, Actor.exit, '${p.symbol}: $msg',
          strategyId: p.strategyId, symbol: p.symbol, pnlLamports: pnl);
      _push('N-08', 'exit.triggered', p.mode, positionId: p.id, vars: {
        'coin': p.symbol,
        'pct_sold': (sellBps / 100).round(),
        'pct': rung.gainPct.round(),
        'pnl': pnl.toSol().toString(),
      });
    }
    String? stop;
    final armed = next.exitPlan!.trailArmed;
    if (next.soldBps >= 10000) {
      stop = 'Exit plan complete';
    } else if (next.changePct <= plan.stopLossPct) {
      stop = 'Stop loss ${plan.stopLossPct.round()}%';
    } else if (armed && next.fromPeakPct >= plan.trailPct) {
      stop = 'Trailing stop: ${plan.trailPct.round()}% below the high';
    } else if (plan.timeStopAt != null && !now.isBefore(plan.timeStopAt!) && next.exitPlan!.filledCount == 0) {
      stop = 'Time stop: no TP by ${plan.timeStopAt!.difference(p.openedAt).inMinutes} min';
    }
    if (stop != null) {
      final rest = next.remainingBps;
      next = next.copyWith(
        state: PositionState.closed,
        proceedsLamports: next.proceedsLamports + sellAt(rest),
        soldBps: 10000,
        closedAt: now,
        exitReason: stop,
      );
      _emitEvent(ActivityKind.sold, Actor.exit, '${p.symbol}: $stop',
          strategyId: p.strategyId, symbol: p.symbol, pnlLamports: next.pnlLamports);
      if (rest > 0) {
        _push('N-09', 'exit.triggered', p.mode, positionId: p.id, vars: {
          'coin': p.symbol,
          'stop_type': stop,
          'pnl': next.pnlLamports.toSol().toString(),
          'pct': double.parse(next.pnlPct.toStringAsFixed(1)),
        });
      }
    }
    return next;
  }

  PortfolioSummary _summary() {
    var cost = Lamports.zero, proceeds = Lamports.zero, remainderValue = Lamports.zero, remainderCost = Lamports.zero;
    var open = 0;
    for (final p in _positions) {
      cost += p.costLamports;
      proceeds += p.proceedsLamports;
      if (p.isOpen) {
        open++;
        remainderValue += p.valueLamports;
        remainderCost += p.sizeLamports;
      }
    }
    final soldCost = cost - remainderCost;
    return PortfolioSummary(
      mode: TradeMode.practice,
      cashLamports: startLamports - cost + proceeds,
      startLamports: startLamports,
      realizedPnlLamports: proceeds - soldCost,
      unrealizedPnlLamports: remainderValue - remainderCost,
      openPositions: open,
      history: List.unmodifiable(_history),
    );
  }

  static const _symbols = ['GLOW', 'MOTH', 'KEPL', 'RIVR', 'ZINC', 'TUSK', 'FERN', 'ORBI', 'PUDL', 'VOLT'];

  String _fakeMint() {
    const chars = '123456789ABCDEFGHJKLMNPQRSTUVWXYZabcdefghijkmnopqrstuvwxyz';
    return List.generate(44, (_) => chars[_rng.nextInt(chars.length)]).join();
  }

  void _newPick(DateTime now) {
    final running = _strategies.where((s) => s.isRunning && s.askFirst).toList();
    if (running.isEmpty) return;
    final s = running[_rng.nextInt(running.length)];
    final sym = _symbols[_rng.nextInt(_symbols.length)];
    final score = 70 + _rng.nextInt(40);
    _emitEvent(ActivityKind.passed, Actor.screener, '$sym passed screening · fit $score/70',
        strategyId: s.id, symbol: sym);
    _emitEvent(ActivityKind.proposal, Actor.entry, '$sym waiting for your approval',
        strategyId: s.id, symbol: sym);
    final id = _id('apv_');
    final pickType = _rng.nextBool() ? PickType.firstBuy : PickType.buy;
    final token = 'tok_${_fakeMint().substring(0, 16)}';
    final exp = now.add(const Duration(minutes: 10));
    _push(pickType == PickType.firstBuy ? 'N-01' : 'N-02', 'proposal.created', s.mode,
        approvalId: id,
        token: token,
        exp: exp,
        vars: {'coin': sym, 'strategy': s.name, 'sol': s.ticketLamports.toSol().toString(), 'reason': 'fit $score/70'});
    _approvals.add(Approval(
      id: id,
      kind: ApprovalKind.buyPick,
      status: ApprovalStatus.pending,
      title: 'Buy $sym',
      detail: '${s.name} · fit $score/70 · guard ${6 + _rng.nextInt(3)}/8 · mcap \$${(40 + _rng.nextInt(400))}k',
      pickType: pickType,
      mode: s.mode,
      createdAt: now,
      expiresAt: exp,
      token: token,
      strategyId: s.id,
      amountLamports: s.ticketLamports,
    ));
  }

  void _applyDecision(Approval a, bool approve) {
    final sym = a.title.split(' ').last;
    switch (a.kind) {
      case ApprovalKind.buyPick:
        if (approve) {
          final price = scaleDecimal(_d('0.0001'), 1 + _rng.nextDouble() * 10);
          final amount = a.amountLamports ?? _sol('0.25');
          final stg = _strategies.where((s) => s.id == a.strategyId).firstOrNull;
          final opened = _clock();
          final pid = '${_id('ck')}.0';
          final preset = stg?.exitPlan ?? ExitPresets.threeStepLadder.current;
          _push('N-04', 'position.opened', a.mode, positionId: pid, vars: {
            'coin': sym,
            'sol': amount.toSol().toString(),
            'price': price.toString(),
            'exit_plan': planFor(preset, opened).name,
          });
          _positions.add(Position(
            id: pid,
            exitPlan: planFor(preset, opened),
            strategyId: a.strategyId!,
            symbol: sym,
            mint: _fakeMint(),
            mode: TradeMode.practice,
            state: PositionState.open,
            costLamports: amount,
            entryPriceUsd: price,
            markPriceUsd: price,
            peakPriceUsd: price,
            openedAt: opened,
          ));
          _emitEvent(ActivityKind.bought, Actor.executor, 'Bought $sym for ${amount.toSol()} SOL',
              strategyId: a.strategyId, symbol: sym);
        } else {
          _emitEvent(ActivityKind.skipped, Actor.you, 'You skipped $sym',
              strategyId: a.strategyId, symbol: sym);
        }
      case ApprovalKind.guardChange:
        final i = _strategies.indexWhere((s) => s.id == a.strategyId);
        if (approve && i >= 0) _strategies[i] = _strategies[i].copyWith(rev: _strategies[i].rev + 1);
        _emitEvent(approve ? ActivityKind.approved : ActivityKind.skipped, Actor.you,
            '${approve ? 'Approved' : 'Rejected'} guard change: ${a.title}',
            strategyId: a.strategyId);
      case ApprovalKind.teamAction:
        _emitEvent(ActivityKind.proposal, Actor.you,
            '${approve ? 'Approved' : 'Rejected'} ${a.title}');
    }
  }

  void _seed() {
    final now = _clock();
    _strategies.addAll([
      Strategy(
          id: 'stg_pullback',
          name: 'Pullback v2',
          mode: TradeMode.practice,
          status: StrategyStatus.running,
          rev: 4,
          exitPlan: ExitPresets.threeStepLadder.current,
          ticketLamports: _sol('0.25'),
          maxOpen: 5,
          realizedPnlLamports: _sol('0.412'),
          winRatePct: 58,
          maxDrawdownPct: 6.1,
          avgHold: const Duration(minutes: 4)),
      Strategy(
          id: 'stg_newpairs',
          name: 'New Pairs Scout',
          mode: TradeMode.practice,
          status: StrategyStatus.running,
          rev: 11,
          exitPlan: ExitPresets.fastHalf.current,
          ticketLamports: _sol('0.2'),
          maxOpen: 3,
          realizedPnlLamports: _sol('-0.118'),
          approvalMode: ApprovalMode.askEveryBuy,
          winRatePct: 41,
          maxDrawdownPct: 12.4,
          avgHold: const Duration(minutes: 1)),
      Strategy(
          id: 'stg_grad',
          name: 'Graduated Momentum',
          mode: TradeMode.real,
          status: StrategyStatus.paused,
          rev: 2,
          exitPlan: ExitPresets.ratchet.current,
          ticketLamports: _sol('0.1'),
          maxOpen: 2,
          realizedPnlLamports: Lamports.zero,
          approvalMode: ApprovalMode.askEveryBuy),
    ]);
    // Seeds mirror wireframe 12: one with TP1 filled + trail armed, one red
    // near SL, one green before TP1, one fresh scalp.
    final ladder = ExitPresets.threeStepLadder.current, scalp = ExitPresets.fastHalf.current;
    final seeds = [
      // symbol, strategy, preset, cost SOL, change%, peak%, minutesAgo, tp1Filled
      ('GLOW', 'stg_pullback', ladder, '0.36', 68.0, 74.0, 26, true),
      ('MOTH', 'stg_pullback', ladder, '0.25', -9.5, 4.0, 19, false),
      ('TUSK', 'stg_newpairs', scalp, '0.20', 12.0, 14.0, 2, false),
      ('ORBI', 'stg_pullback', ladder, '0.25', 31.0, 33.0, 8, false),
    ];
    for (var i = 0; i < seeds.length; i++) {
      final (sym, stg, plan, costSol, chg, peak, ago, tp1) = seeds[i];
      final cost = _sol(costSol);
      final price = scaleDecimal(_d('0.0002'), 1 + _rng.nextDouble() * 4);
      final opened = now.subtract(Duration(minutes: ago));
      var ep = planFor(plan, opened);
      var soldBps = 0;
      var proceeds = Lamports.zero;
      if (tp1) {
        final r0 = ep.rungs.first;
        ep = ep.copyWith(rungs: [r0.fill(opened.add(const Duration(minutes: 9))), ...ep.rungs.skip(1)], trailArmed: true);
        soldBps = (r0.sellPct * 100).round();
        proceeds = cost.bps(soldBps).times(_d('${1 + r0.gainPct / 100}')).bps(10000 - 125);
      }
      _positions.add(Position(
        id: 'ck${100 + i}.0',
        strategyId: stg,
        symbol: sym,
        mint: _fakeMint(),
        mode: TradeMode.practice,
        state: PositionState.open,
        costLamports: cost,
        entryPriceUsd: price,
        markPriceUsd: scaleDecimal(price, 1 + chg / 100),
        peakPriceUsd: scaleDecimal(price, 1 + peak / 100),
        openedAt: opened,
        exitPlan: ep,
        soldBps: soldBps,
        proceedsLamports: proceeds,
      ));
    }
    _positions.add(Position(
      id: 'ck099.0',
      strategyId: 'stg_newpairs',
      symbol: 'FERN',
      mint: _fakeMint(),
      mode: TradeMode.practice,
      state: PositionState.closed,
      costLamports: _sol('0.2'),
      proceedsLamports: _sol('0.262'),
      soldBps: 10000,
      entryPriceUsd: _d('0.0004'),
      markPriceUsd: _d('0.00053'),
      peakPriceUsd: _d('0.00058'),
      openedAt: now.subtract(const Duration(hours: 1)),
      closedAt: now.subtract(const Duration(minutes: 41)),
      exitReason: 'Took profit: 40% at +20%',
    ));
    var equity = startLamports;
    for (var i = 60; i > 0; i--) {
      equity += Lamports.fromInt(((_rng.nextDouble() - 0.48) * 50000000).round());
      _history.add(PnlPoint(now.subtract(Duration(minutes: i)), equity));
    }
    _emitEvent(ActivityKind.found, Actor.screener, 'Screener checked 312 coins in the last hour');
    _emitEvent(ActivityKind.sold, Actor.executor, 'FERN: Took profit: 40% at +20%',
        strategyId: 'stg_newpairs', symbol: 'FERN', pnlLamports: _sol('0.062'));
    _emitEvent(ActivityKind.blocked, Actor.guard, 'MOTH blocked: bundled launch (31% supply)',
        strategyId: 'stg_pullback', symbol: 'MOTH');
    _approvals.addAll([
      Approval(
        id: 'apv_seed1',
        kind: ApprovalKind.buyPick,
        pickType: PickType.firstBuy,
        status: ApprovalStatus.pending,
        title: 'Buy KEPL',
        detail: 'Pullback v2 · fit 86/70 · guard 8/8 · −8% dip hit',
        createdAt: now.subtract(const Duration(minutes: 8)),
        expiresAt: now.add(const Duration(seconds: 102)),
        token: 'tok_seed_kepl',
        strategyId: 'stg_pullback',
        amountLamports: _sol('0.25'),
      ),
      Approval(
        id: 'apv_seed3',
        kind: ApprovalKind.buyPick,
        pickType: PickType.buy,
        status: ApprovalStatus.pending,
        title: 'Buy RIVR',
        detail: 'New Pairs Scout · fit 78/70 · guard 7/8 · top10 41%',
        createdAt: now.subtract(const Duration(minutes: 3)),
        expiresAt: now.add(const Duration(minutes: 7, seconds: 15)),
        token: 'tok_seed_rivr',
        strategyId: 'stg_newpairs',
        amountLamports: _sol('0.2'),
      ),
      Approval(
        id: 'apv_seed2',
        kind: ApprovalKind.guardChange,
        status: ApprovalStatus.pending,
        title: 'Loosen guard on New Pairs Scout',
        detail: 'Weakening the guard requires your review.',
        createdAt: now.subtract(const Duration(minutes: 3)),
        expiresAt: now.add(const Duration(hours: 24)),
        token: 'tok_seed_setting',
        strategyId: 'stg_newpairs',
        baseRev: 11,
        riskLevel: RiskLevel.medium,
        riskImpact: const {'Coins passing guard': '+22%', 'Rug (est.)': '+1.6×', 'Max DD (est.)': '−9%'},
        diff: {
          SettingsKeys.bundledSharePctMax.current: [20, 35],
          SettingsKeys.holderCountMin.current: [150, 80],
        },
      ),
      Approval(
        id: 'apv_seed4',
        kind: ApprovalKind.guardChange,
        mode: TradeMode.real,
        status: ApprovalStatus.pending,
        title: 'Loosen guard on Graduated Momentum',
        detail: 'Real SOL · typed confirm + biometric + hold required.',
        createdAt: now.subtract(const Duration(minutes: 1)),
        expiresAt: now.add(const Duration(hours: 24)),
        token: 'tok_seed_real_guard',
        strategyId: 'stg_grad',
        baseRev: 2,
        riskLevel: RiskLevel.high,
        riskImpact: const {'Coins passing guard': '+38%', 'Rug (est.)': '+2.4×', 'Max DD (est.)': '−19%'},
        diff: {
          SettingsKeys.bundledSharePctMax.current: [20, 30],
          '${SettingsKeys.guardChecks.current}.wash_trading': ['on', 'off'],
        },
      ),
      Approval(
        id: 'apv_seed5',
        kind: ApprovalKind.buyPick,
        pickType: PickType.buy,
        status: ApprovalStatus.expired,
        expireReason: ExpireReason.strategyDeleted,
        title: 'Buy ZINC',
        detail: 'Scalp Launch · strategy deleted',
        createdAt: now.subtract(const Duration(minutes: 20)),
        expiresAt: now.subtract(const Duration(minutes: 10)),
        decidedAt: now.subtract(const Duration(minutes: 12)),
        token: 'tok_seed_zinc',
        amountLamports: _sol('0.2'),
      ),
    ]);
  }
}
