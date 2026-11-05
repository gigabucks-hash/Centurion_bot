import 'dart:async';
import 'dart:convert';
import 'dart:math';

import 'package:decimal/decimal.dart';

import '../../core/app_identity.dart';
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
        ScreenerRepository,
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
  BigInt get lastSeq => BigInt.from(_eventSeq);
  int get epoch => _epoch;
  Timer? _timer;
  int _seq = 0;
  int _eventSeq = 18000;

  /// Server-side Real SOL gate (REAL_SOL_DISABLED until Phase 7). Tests may enable.
  bool realSolEnabled;

  static const workspaceId = 'ws_mock';

  /// SPL Token program id (mock coins; Token-2022 coins carry `TokenzQd…`).
  static const splTokenProgram = 'TokenkegQfeZyiNwAJbNbGKPFXCWuBvf9Ss623VQ5DA';

  /// Quote mints (screener `quote_mint`): wrapped SOL (tradeable) and USDC (not tradeable).
  static const wsolMint = 'So11111111111111111111111111111111111111112';
  static const usdcMint = 'EPjFWdd5AufqSSqeM2qN1xzybapC8G4wEGGkZwyTDt1v';

  /// Prototype coin identity (contracts 1.1.6 logo fields): every mock coin gets a deterministic
  /// base58 mint derived from its symbol and a `logo_hash` (`mocklogo0..4`), so the app shows a logo
  /// for every coin instead of the symbol-initials identicon. Served from `assets/mock_logo/`.
  static const mockLogoCount = 5;
  static const _base58 = '123456789ABCDEFGHJKLMNPQRSTUVWXYZabcdefghijkmnopqrstuvwxyz';

  /// FNV-1a 32-bit (16-bit split multiply so it is exact on the web too).
  static int _fnv1a32(String s) {
    var h = 0x811C9DC5;
    for (final b in utf8.encode(s)) {
      h ^= b;
      h = ((h & 0xFFFF) * 0x01000193 + (((h >>> 16) * 0x01000193 & 0xFFFF) << 16)) & 0xFFFFFFFF;
    }
    return h;
  }

  /// Stable 44-char base58 mint for a mock symbol (valid for [CoinLogo.isMint]).
  static String mockMint(String symbol) {
    var h = _fnv1a32('mock:$symbol');
    final out = StringBuffer();
    for (var i = 0; i < 44; i++) {
      h = ((h & 0xFFFF) * 0x01000193 + (((h >>> 16) * 0x01000193 & 0xFFFF) << 16)) & 0xFFFFFFFF;
      out.write(_base58[h % _base58.length]);
    }
    return out.toString();
  }

  /// `logo_hash` for a mock mint; every hash has a bundled mark.
  static String mockLogoHash(String mint) => 'mocklogo${_fnv1a32(mint) % mockLogoCount}';

  /// Mock raw token qty for [cost] at [priceUsd] (SOL = 180 USD), scaled by [decimals].
  static BigInt _qtyRaw(Lamports cost, Decimal priceUsd, int decimals) {
    final usd = cost.toSol() * Decimal.fromInt(180);
    final scaled = usd * Decimal.ten.pow(decimals).toDecimal();
    return (scaled / priceUsd).truncate();
  }

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
  /// Idempotency store: key → (request body, response). Same key + same body →
  /// replay (`replayed: true`); same key + different body → 422 IDEMPOTENCY_KEY_REUSED.
  final Map<String, (String, Object)> _idempotent = {};

  T? _replay<T>(String? key, Map<String, Object?> body) {
    if (key == null) return null;
    final prior = _idempotent[key];
    if (prior == null) return null;
    if (prior.$1 != jsonEncode(body)) {
      throw ApiException.fromCode('IDEMPOTENCY_KEY_REUSED', details: {'idempotency_key': key});
    }
    return prior.$2 as T;
  }

  void _remember(String? key, Map<String, Object?> body, Object result) {
    if (key != null) _idempotent[key] = (jsonEncode(body), result);
  }

  /// Mock server clock (`server_now`).
  DateTime get serverNow => _clock();

  // ---------------------------------------------------------------- lifecycle
  /// Whether the 2 s tick runs (started after the first frame by deferred init).
  bool get isTicking => _timer?.isActive ?? false;

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
        _approvals[i] = a.copyWith(status: ApprovalStatus.expired, expireReason: ExpireReason.timedOut, decidedAt: now);
      }
    }
    for (final a in [..._approvals]) {
      if (a.isPending && a.kind == ApprovalKind.buyPick && a.quote?.stateAt(now) == QuoteState.stale) {
        refreshQuote(a.id);
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
    final list = [..._positions]
      ..sort((a, b) {
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
      for (var i = 0; i < ordered.length; i++) PnlPoint(now.subtract(step * (ordered.length - 1 - i)), ordered[i]),
    ];
  }

  /// `close_position` (1.1.2 §6): practice only, If-Match on the position `rev`,
  /// `fraction_bps` 1–10000 of the CURRENT remainder, idempotent. Mock fills
  /// synchronously (`status: filled`, `fill` present); prod may return `queued`.
  @override
  Future<ClosePositionResult> closePosition(ClosePositionRequest r) async {
    await Future<void>.delayed(const Duration(milliseconds: 150));
    final prior = _replay<ClosePositionResult>(r.idempotencyKey, r.body);
    if (prior != null) return ClosePositionResult.fromJson({...prior.toJson(), 'replayed': true});
    if (!r.validFraction) {
      throw ApiException.fromCode('INVALID_FRACTION', details: {'fraction_bps': r.fractionBps, 'range': '1-10000'});
    }
    final i = _positions.indexWhere((p) => p.id == r.positionId);
    if (i < 0) throw ApiException.fromCode('NOT_FOUND');
    final p = _positions[i];
    if (p.mode == TradeMode.real) {
      throw ApiException.fromCode(realSolEnabled ? 'MODE_NOT_ALLOWED' : 'REAL_SOL_DISABLED');
    }
    if (!p.isOpen) throw ApiException.fromCode('POSITION_ALREADY_CLOSED', details: {'position_id': p.id});
    if (r.expectedRev != p.rev) {
      throw ApiException.fromCode(
        'VERSION_CONFLICT',
        details: {
          'current_rev': p.rev,
          'base_rev': r.expectedRev,
          'current': {'id': p.id, 'rev': p.rev},
        },
      );
    }
    final full = r.fractionBps >= 10000;
    final soldNowBps = p.remainingBps * r.fractionBps ~/ 10000;
    final proceeds = p.estimateSell(r.fractionBps ~/ 100 == 0 ? 1 : r.fractionBps ~/ 100);
    final qtyLeft = p.qtyRaw == null
        ? null
        : (full ? BigInt.zero : p.qtyRaw! - p.qtyRaw! * BigInt.from(r.fractionBps) ~/ BigInt.from(10000));
    final rev = p.rev + 1;
    _positions[i] = p.copyWith(
      proceedsLamports: p.proceedsLamports + proceeds,
      soldBps: full ? 10000 : p.soldBps + soldNowBps,
      state: full ? PositionState.closed : null,
      closedAt: full ? _clock() : null,
      exitReason: full ? 'You sold 100% manually' : null,
      rev: rev,
      qtyRaw: qtyLeft,
    );
    final orderId = _id('ord_');
    final jobId = '${_eventSeq + 1}';
    _emitEnvelope('order.submitted', orderId, {
      'order_id': orderId,
      'position_id': p.id,
      'side': 'sell',
      'fraction_bps': r.fractionBps,
    });
    _emitEnvelope('fill.simulated', orderId, {
      'order_id': orderId,
      'position_id': p.id,
      'practice_epoch': p.practiceEpoch,
      'proceeds_lamports': proceeds.toWire(),
    });
    _emitEnvelope(full ? 'position.closed' : 'position.updated', p.id, {
      'position_id': p.id,
      'rev': rev,
      'practice_epoch': p.practiceEpoch,
      if (full) 'exit_reason': 'manual',
      if (!full && qtyLeft != null) 'qty_raw': qtyLeft.toString(),
    });
    _emitEnvelope('order.filled', orderId, {'order_id': orderId, 'proceeds_lamports': proceeds.toWire()});
    _emitEvent(
      ActivityKind.sold,
      Actor.you,
      '${p.symbol}: you sold ${r.fractionBps / 100}%',
      strategyId: p.strategyId,
      symbol: p.symbol,
      pnlLamports: proceeds - p.costLamports.bps(soldNowBps),
    );
    _notify();
    final result = ClosePositionResult.fromJson({
      'position': {
        'id': p.id,
        'rev': rev,
        'practice_epoch': p.practiceEpoch,
        'qty_raw': ?qtyLeft?.toString(),
        'decimals': ?p.decimals,
      },
      'order': {'id': orderId, 'status': 'filled', 'fraction_bps': r.fractionBps, 'job_id': jobId},
      'order_id': orderId,
      'fill': {'proceeds_lamports': proceeds.toWire()},
      'job_id': jobId,
      'status': 'filled',
      'replayed': false,
      'server_now': _clock().toUtc().toIso8601String(),
    });
    _remember(r.idempotencyKey, r.body, result);
    return result;
  }

  @override
  Stream<Map<String, Object?>> watchPushPayloads() => _pushes.stream;

  /// Raw envelopes (as Realtime would deliver them).
  Stream<Map<String, Object?>> get rawEvents => _envelopes.stream;

  @override
  Stream<EventEnvelope> watchEvents(String workspaceId, TradeMode mode, {BigInt? afterSeq}) => _envelopes.stream
      .map(EventEnvelope.tryParse)
      .where((e) => e != null && e.mode == mode && e.seq > (afterSeq ?? BigInt.zero))
      .cast<EventEnvelope>();

  /// Emits an EVENTS_SCHEMA §2 envelope; returns its seq.
  int _emitEnvelope(
    String type,
    String subject,
    Map<String, Object?> payload, {
    TradeMode mode = TradeMode.practice,
    String? strategyId,
    String actor = 'system',
  }) {
    final now = _clock();
    final seq = ++_eventSeq;
    if (!_envelopes.isClosed) {
      _envelopes.add({
        'id': '$subject:${now.millisecondsSinceEpoch}:$type',
        'seq': '$seq', // int64 integer string (1.1.2)
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
  Future<Strategy> updateStrategy(
    String strategyId, {
    required int expectedRev,
    Map<String, Object?> patch = const {},
    String? name,
    StrategyStatus? status,
  }) async {
    await Future<void>.delayed(const Duration(milliseconds: 50));
    final i = _strategies.indexWhere((s) => s.id == strategyId);
    if (i < 0) throw ApiException.fromCode('NOT_FOUND');
    final s = _strategies[i];
    if (s.rev != expectedRev) {
      throw ApiException(
        ApiErrorCode.fromWire('STRATEGY_REV_CONFLICT'),
        sqlState: 'P0409',
        details: {
          'current_rev': s.rev,
          'base_rev': expectedRev,
          'changed_fields': const <String>[],
          'changed_by': 'mock',
          'changed_at': _clock().toUtc().toIso8601String(),
        },
      );
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
    _emitEnvelope(
      'strategy.updated',
      s.id,
      {'strategy_id': s.id, 'rev': updated.rev, 'changed_fields': patch.keys.toList()},
      mode: s.mode,
      strategyId: s.id,
      actor: 'user',
    );
    _notify();
    return updated;
  }

  /// exit_stats(): closed positions of the current epoch grouped by exit reason.
  /// `from`/`to` (0022) narrow the range the same way the report does.
  List<Map<String, Object?>> exitStatsRows({String? strategyId, DateTime? from, DateTime? to}) {
    final by = <String, List<Position>>{};
    for (final p in _positions.where(
      (p) =>
          !p.isOpen &&
          (strategyId == null || p.strategyId == strategyId) &&
          _inRange(p.closedAt ?? p.openedAt, from, to),
    )) {
      by.putIfAbsent(_exitReasonWire(p.exitReason), () => []).add(p);
    }
    return [
      for (final e in by.entries)
        {
          'exit_reason': e.key,
          'count': e.value.length,
          'pnl_lamports': sumLamports(e.value.map((p) => p.pnlLamports)).toWire(),
          'avg_pnl_pct': e.value.map((p) => p.pnlPct).reduce((a, b) => a + b) / e.value.length,
          'win_rate_pct': e.value.where((p) => p.pnlLamports > Lamports.zero).length * 100 / e.value.length,
          'avg_hold_s':
              e.value.map((p) => (p.closedAt ?? _clock()).difference(p.openedAt).inSeconds).reduce((a, b) => a + b) ~/
              e.value.length,
        },
    ];
  }

  static String _exitReasonWire(String? display) {
    final d = (display ?? '').toLowerCase();
    if (d.startsWith('took profit') || d.contains('exit plan complete')) return ExitReasons.profitTarget.current;
    if (d.startsWith('stop loss')) return ExitReasons.lossGuard.current;
    if (d.startsWith('trailing')) return ExitReasons.peakTrail.current;
    if (d.startsWith('time stop')) return ExitReasons.maxHold.current;
    if (d.startsWith('stall exit')) return ExitReasons.stall.current;
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
    final ddBps = peak.isZero || s.equityLamports > peak
        ? 0
        : ((peak - s.equityLamports).ratioTo(peak) * 10000).round();
    return {
      'mode': 'practice',
      'workspace_id': workspaceId,
      'practice_epoch': _epoch,
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
      'as_of_seq': '$_eventSeq',
      'server_now': _clock().toUtc().toIso8601String(),
    };
  }

  /// 0022 `GET /stats/pnl`: snapshot (all-time) + range aggregates. The report
  /// reads this instead of summing a page of ledger rows.
  Map<String, Object?> pnlSummaryRow({PnlWindow window = PnlWindow.d7, String? strategyId}) {
    final now = _clock();
    final from = switch (window) {
      PnlWindow.d1 => now.subtract(const Duration(hours: 24)),
      PnlWindow.d7 => now.subtract(const Duration(days: 7)),
      PnlWindow.d30 => now.subtract(const Duration(days: 30)),
      PnlWindow.all => null,
    };
    final closed = _positions
        .where(
          (p) =>
              !p.isOpen &&
              (strategyId == null || p.strategyId == strategyId) &&
              _inRange(p.closedAt ?? p.openedAt, from, null),
        )
        .toList();
    final s = _summary();
    final pnls = closed.map((p) => p.pnlLamports).toList();
    final holds = closed.map((p) => (p.closedAt ?? now).difference(p.openedAt).inSeconds).toList();
    final wins = pnls.where((p) => p > Lamports.zero).length;
    final fees = sumLamports(closed.map((p) => p.costLamports.bps(p.soldBps).bps(p.feeBps)));
    return {
      'mode': 'practice',
      'practice_epoch': _epoch,
      'window': window.wire,
      'from': from?.toUtc().toIso8601String(),
      'to': null,
      'unrealized_pnl_lamports': s.unrealizedPnlLamports.toWire(),
      'realized_pnl_lamports': s.realizedPnlLamports.toWire(),
      'total_pnl_lamports': s.totalPnlLamports.toWire(),
      'realized_pnl_window_lamports': sumLamports(pnls).toWire(),
      'closed_count': closed.length,
      'win_count': wins,
      'win_rate_pct': closed.isEmpty ? null : wins * 100 / closed.length,
      'avg_hold_s': holds.isEmpty ? null : holds.reduce((a, b) => a + b) ~/ holds.length,
      'fees_lamports': fees.toWire(),
      'best_pnl_lamports': pnls.isEmpty ? null : pnls.reduce((a, b) => a > b ? a : b).toWire(),
      'worst_pnl_lamports': pnls.isEmpty ? null : pnls.reduce((a, b) => a < b ? a : b).toWire(),
      'as_of_seq': '$_eventSeq',
      'ts': now.toUtc().toIso8601String(),
    };
  }

  /// Half-open range `[from, to)` like the server (`>= from`, `< to`).
  static bool _inRange(DateTime t, DateTime? from, DateTime? to) =>
      (from == null || !t.isBefore(from)) && (to == null || t.isBefore(to));

  @override
  Stream<MarksMessage> watchMarks(String workspaceId, TradeMode mode) => _marks.stream.where(
    (m) => m is ClockMessage || _positions.any((p) => p.mode == mode && (m as MarkMessage).positionIds.contains(p.id)),
  );

  void _emitMark(Position p, DateTime now) {
    if (_marks.isClosed) return;
    _marks.add(
      MarksMessage.fromBroadcast({
        'event': 'mark',
        'payload': {
          'mint': p.mint,
          'price_usd': p.markPriceUsd.toStringAsFixed(12),
          'ts': now.toUtc().toIso8601String(),
          'position_ids': [p.id],
          'server_now': now.toUtc().toIso8601String(),
        },
      })!,
    );
  }

  @override
  Future<PracticeResetResult> resetPractice(ResetPracticeRequest r) async {
    if (r.workspaceId != workspaceId) throw ApiException.fromCode('NOT_FOUND');
    await Future<void>.delayed(const Duration(milliseconds: 150));
    final now = _clock();
    final last = _lastResetAt;
    if (last != null && now.difference(last) < resetCooldown) {
      throw ApiException.fromCode(
        'RESET_COOLDOWN',
        details: {'next_allowed_at': last.add(resetCooldown).toUtc().toIso8601String()},
      );
    }
    final archivedPositions = _positions.where((p) => p.mode == TradeMode.practice).length;
    _positions.removeWhere((p) => p.mode == TradeMode.practice);
    var archivedApprovals = 0;
    for (var i = 0; i < _approvals.length; i++) {
      final a = _approvals[i];
      if (a.mode == TradeMode.practice && a.isPending) {
        archivedApprovals++;
        _approvals[i] = a.copyWith(
          status: ApprovalStatus.expired,
          expireReason: ExpireReason.practiceReset,
          decidedAt: now,
        );
      }
    }
    for (var i = 0; i < _strategies.length; i++) {
      final s = _strategies[i];
      if (s.mode == TradeMode.practice) _strategies[i] = s.copyWith(realizedPnlLamports: Lamports.zero);
    }
    _history
      ..clear()
      ..add(PnlPoint(now, startLamports));
    final previous = _epoch;
    _epoch++;
    _lastResetAt = now;
    _emitEnvelope('practice.reset', workspaceId, {
      'epoch': _epoch,
      'previous_epoch': previous,
      'starting_balance_lamports': startLamports.toWire(),
      'archived': {'positions': archivedPositions, 'expired_proposals': archivedApprovals},
      'next_allowed_at': now.add(resetCooldown).toUtc().toIso8601String(),
      'at': now.toUtc().toIso8601String(),
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
  List<Strategy> get debugStrategies => List.unmodifiable(_strategies);
  List<ScreenerCoin> get debugScreener => List.unmodifiable(_screener);

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
  void _push(
    String event,
    String type,
    TradeMode mode, {
    String? approvalId,
    String? positionId,
    String? token,
    DateTime? exp,
    Map<String, Object?> vars = const {},
  }) {
    if (_pushes.isClosed) return;
    final real = mode == TradeMode.real;
    final pick = event == 'N-01' || event == 'N-02';
    // FCM data (1.1.2): EVERY value is a string; v/seq/version are integer
    // strings, actions/vars are JSON strings. No vars.sol / vars.mm_ss.
    final seq = _emitEnvelope(type, approvalId ?? positionId ?? event, {
      'approval_id': approvalId,
      'position_id': positionId,
    }, mode: mode);
    // 1.1.6 push data: optional mint + logo_hash so the in-app notification shows the coin logo.
    final pushSymbol = vars['symbol'];
    final pushMint = pushSymbol is String ? mockMint(pushSymbol) : null;
    final pushLogo = pushMint == null ? null : mockLogoHash(pushMint);
    _pushes.add({
      'v': '1',
      'event': event,
      'type': type,
      'mode': Wire.mode(mode),
      'workspace_id': workspaceId,
      'seq': '$seq',
      'deep_link': approvalId != null
          ? '${AppIdentity.scheme}://approvals/$approvalId'
          : '${AppIdentity.scheme}://positions/${positionId ?? ''}',
      'approval_id': ?approvalId,
      'position_id': ?positionId,
      'mint': ?pushMint,
      'logo_hash': ?pushLogo,
      if (approvalId != null) 'version': '${_approvals.where((a) => a.id == approvalId).firstOrNull?.rev ?? 1}',
      if (!real && pick) 'token': ?token,
      if (exp != null) 'exp': exp.toUtc().toIso8601String(),
      'actions': jsonEncode(real || !pick ? ['open'] : ['approve', 'skip', 'open']),
      'vars': jsonEncode({for (final e in vars.entries) e.key: '${e.value}'}),
      'server_now': _clock().toUtc().toIso8601String(),
    });
  }

  @override
  Stream<List<ActivityEvent>> watchFeed({String? strategyId}) => _watch(
    () => List.unmodifiable(_events.reversed.where((e) => strategyId == null || e.strategyId == strategyId).take(200)),
  );

  // ------------------------------------------------ 1.1.4 cursor paging (mock)
  /// Opaque keyset cursor: base64url of `list:micros:id`; foreign/malformed → CURSOR_INVALID.
  static String _cursor(String list, DateTime at, String id) =>
      base64Url.encode(utf8.encode('$list:${at.microsecondsSinceEpoch}:$id'));

  static (int, String) _decodeCursor(String list, String cursor) {
    try {
      final parts = utf8.decode(base64Url.decode(cursor)).split(':');
      if (parts.length < 3 || parts[0] != list) throw const FormatException('foreign cursor');
      return (int.parse(parts[1]), parts.sublist(2).join(':'));
    } catch (_) {
      throw ApiException.fromCode('CURSOR_INVALID');
    }
  }

  CursorPage<T> _page<T>(
    String list,
    List<T> all,
    DateTime Function(T) at,
    String Function(T) id, {
    String? cursor,
    int limit = defaultPageLimit,
  }) {
    if (limit < 1 || limit > maxPageLimit) {
      throw ApiException.fromCode('VALIDATION_FAILED', details: {'field': 'limit'});
    }
    int cmp(T a, T b) {
      final c = at(b).compareTo(at(a)); // newest first
      return c != 0 ? c : id(b).compareTo(id(a));
    }

    final sorted = [...all]..sort(cmp);
    var rest = sorted;
    if (cursor != null) {
      final (micros, cid) = _decodeCursor(list, cursor);
      rest = sorted.where((x) {
        final m = at(x).microsecondsSinceEpoch;
        return m < micros || (m == micros && id(x).compareTo(cid) < 0);
      }).toList();
    }
    final items = rest.take(limit).toList();
    final more = rest.length > limit;
    return CursorPage(items: items, nextCursor: more ? _cursor(list, at(items.last), id(items.last)) : null);
  }

  @override
  Future<CursorPage<ActivityEvent>> fetchFeedPage({
    String? strategyId,
    String? cursor,
    int limit = defaultPageLimit,
  }) async {
    await Future<void>.value(); // microtask: no timers left behind in widget tests
    final all = _events.where((e) => strategyId == null || e.strategyId == strategyId).toList();
    return _page('activity', all, (e) => e.at, (e) => e.id, cursor: cursor, limit: limit);
  }

  @override
  Future<CursorPage<Position>> fetchPositionsPage({
    PositionState? state,
    String? cursor,
    int limit = defaultPageLimit,
    DateTime? from,
    DateTime? to,
  }) async {
    await Future<void>.value(); // microtask: no timers left behind in widget tests
    final closed = state == PositionState.closed;
    final all = _positions
        .where((p) => (state == null || p.state == state) && (!closed || _inRange(p.closedAt ?? p.openedAt, from, to)))
        .toList();
    // A closed report is newest by close time, not open time (0022).
    final range = '${from?.toUtc().toIso8601String() ?? 'all'}:${to?.toUtc().toIso8601String() ?? 'now'}';
    return _page(
      'positions:${state?.name ?? 'all'}:$range',
      all,
      (p) => closed ? (p.closedAt ?? p.openedAt) : p.openedAt,
      (p) => p.id,
      cursor: cursor,
      limit: limit,
    );
  }

  // ------------------------------------------------ 1.1.4 proposal quote (mock papersim)
  /// `papersim::quote::estimate_buy`-like estimate, valid 15 s.
  static ProposalQuote estimateQuote(Lamports amount, DateTime now) {
    final fee = Lamports.fromInt(5000), prio = Lamports.fromInt(20000);
    return ProposalQuote(
      estNetworkFee: fee + prio,
      priorityFee: prio,
      swapFeeBps: 100,
      maxSlippageBps: 300,
      minOutRaw: amount.raw * BigInt.from(1000),
      totalMax: amount + fee + prio,
      quoteTs: now,
      quoteExpiresAt: now.add(quoteValidity),
    );
  }

  static const quoteValidity = Duration(seconds: 15);

  /// Mock `stall_exit {window_s: 600, min_move_pct: 0.5}`.
  static const mockStallWindow = Duration(minutes: 10);
  static const mockStallMinMovePct = 0.5;

  /// Backend-only `set_approval_quote`: refresh a pending quote, rev + 1, silent
  /// `proposal.updated` (no push). Decided approvals are frozen.
  Approval? refreshQuote(String id) {
    final i = _approvals.indexWhere((a) => a.id == id);
    if (i < 0) return null;
    final a = _approvals[i];
    if (!a.isPending || a.kind != ApprovalKind.buyPick) return a;
    final now = _clock();
    final q = estimateQuote(a.amountLamports ?? _sol('0.25'), now);
    final updated = a.copyWith(quote: q, rev: a.rev + 1);
    _approvals[i] = updated;
    _emitEnvelope(
      'proposal.updated',
      a.id,
      {
        'proposal_id': a.id,
        'kind': Wire.approvalKind(a.kind),
        'rev': updated.rev,
        'est_network_fee_lamports': q.estNetworkFee!.toWire(),
        'priority_fee_lamports': q.priorityFee!.toWire(),
        'swap_fee_bps': q.swapFeeBps,
        'max_slippage_bps': q.maxSlippageBps,
        'min_out_raw': q.minOutRaw.toString(),
        'total_max_lamports': q.totalMax!.toWire(),
        'quote_ts': now.toUtc().toIso8601String(),
        'quote_expires_at': q.quoteExpiresAt!.toUtc().toIso8601String(),
      },
      mode: a.mode,
      strategyId: a.strategyId,
    );
    _notify();
    return updated;
  }

  @override
  Future<Approval> refreshApproval(String id) async {
    await Future<void>.delayed(const Duration(milliseconds: 50));
    final a = _approvals.where((x) => x.id == id).firstOrNull;
    if (a == null) throw ApiException.fromCode('NOT_FOUND');
    // The mock stands in for the backend, which refreshes stale quotes on its own.
    final stale = a.quote == null || a.quote!.stateAt(_clock()) != QuoteState.fresh;
    return (stale ? refreshQuote(id) : null) ?? a;
  }

  // ------------------------------------------------ 1.1.4 guard weakening → proposal
  /// Mock effective guard settings per strategy (server: `guard_config_defaults()` + settings).
  final Map<String, Map<String, Object?>> _guardSettings = {};

  /// Tests: effective mock guard settings of a strategy.
  Map<String, Object?> debugGuards(String strategyId) => Map.unmodifiable(_guardsOf(strategyId));

  Map<String, Object?> _guardsOf(String strategyId) => _guardSettings.putIfAbsent(
    strategyId,
    () => {
      SettingsKeys.topHoldersSharePctMax.current: 30,
      SettingsKeys.creatorSharePctMax.current: 10,
      SettingsKeys.bundledSharePctMax.current: 20,
      SettingsKeys.sniperSharePctMax.current: 15,
      SettingsKeys.lpBurnedPctMin.current: 90,
      SettingsKeys.requiredChecks.current: ['mint_authority', 'freeze_authority', 'lp_burned'],
    },
  );

  /// Mirrors SQL `guard_weakened_fields(old, new)` settings-level keys (CHANGELOG 1.1.4):
  /// `*_share_pct_max` raised or turned off (0 / null), `lp_burned_pct_min` lowered or
  /// removed, any `required_checks` entry removed. Screener keys are not guards.
  /// (The nested `guard_checks` GuardConfig half of the classifier is server-only.)
  static List<String> guardWeakenedFields(Map<String, Object?> old, Map<String, Object?> patch) {
    final out = <String>[];
    for (final e in patch.entries) {
      final k = e.key, v = e.value, o = old[k];
      if (k == SettingsKeys.requiredChecks.current) {
        final before = {...?(o as List?)?.cast<String>()};
        final after = {...?(v as List?)?.cast<String>()};
        if (before.difference(after).isNotEmpty) out.add(k);
      } else if (k.endsWith('_share_pct_max') && o is num) {
        if (v == null || (v is num && (v == 0 || v > o))) out.add(k);
      } else if (k == SettingsKeys.lpBurnedPctMin.current && o is num) {
        if (v == null || (v is num && v < o)) out.add(k);
      }
    }
    return out;
  }

  /// REST PATCH semantics (1.1.4): weakening → 202 proposal, nothing applied.
  @override
  Future<StrategyPatchOutcome> patchSettings(
    String strategyId, {
    required int expectedRev,
    required Map<String, Object?> settingsPatch,
  }) async {
    await Future<void>.delayed(const Duration(milliseconds: 50));
    final s = _strategies.where((x) => x.id == strategyId).firstOrNull;
    if (s == null) throw ApiException.fromCode('NOT_FOUND');
    if (s.rev != expectedRev) {
      throw ApiException.fromCode('STRATEGY_REV_CONFLICT', details: {'current_rev': s.rev, 'base_rev': expectedRev});
    }
    final guards = _guardsOf(strategyId);
    final weakened = guardWeakenedFields(guards, settingsPatch);
    if (weakened.isEmpty) {
      guards.addAll({for (final e in settingsPatch.entries) e.key: e.value});
      final updated = await updateStrategy(strategyId, expectedRev: expectedRev);
      return StrategyPatchApplied(updated);
    }
    final now = _clock();
    final proposal = Approval(
      id: _id('apv_'),
      kind: ApprovalKind.guardChange,
      status: ApprovalStatus.pending,
      title: 'Loosen guards · ${s.name}',
      detail: weakened.join(', '),
      createdAt: now,
      expiresAt: now.add(const Duration(hours: 24)),
      token: 'tok_${_fakeMint().substring(0, 16)}',
      strategyId: strategyId,
      baseRev: s.rev,
      diff: {
        for (final k in weakened) k: [guards[k], settingsPatch[k]],
      },
      mode: s.mode,
      riskLevel: RiskLevel.high,
      weakening: true,
    );
    _approvals.add(proposal);
    final gcId = _id('gc_');
    _emitEnvelope(
      'proposal.created',
      proposal.id,
      {
        'proposal_id': proposal.id,
        'kind': 'guard_change',
        'rev': 1,
        'weakening': true,
        'base_rev': s.rev,
        'guard_change_id': gcId,
      },
      mode: s.mode,
      strategyId: strategyId,
      actor: 'user',
    );
    _notify();
    return StrategyPatchPendingApproval(proposal: proposal, guardChangeId: gcId, weakenedFields: weakened);
  }

  @override
  Stream<List<Strategy>> watchStrategies() => _watch(() => List.unmodifiable(_strategies));

  /// Sorted soonest-expiry first (SPEC §3 default sort).
  @override
  Stream<List<Approval>> watchPending() => _watch(
    () => List.unmodifiable(
      _approvals.where((a) => a.isPending).toList()..sort((a, b) => a.expiresAt.compareTo(b.expiresAt)),
    ),
  );

  /// Screener seed per WF-21: passed picks, a guard reject, and one coin with
  /// no SOL quote pair (USDC) that never enters the queue.
  final _screener = <ScreenerCoin>[
    ScreenerCoin(
      symbol: 'MOON',
      mint: mockMint('MOON'),
      logoHash: mockLogoHash(mockMint('MOON')),
      strategyId: 'stg_pull',
      marketCap: MarketCap(
        lamports: Lamports.parse('1200000000000'),
        usd: Decimal.parse('186000.5'),
        asOf: DateTime.utc(2026, 10, 29, 9),
      ),
      score: 82,
      outcome: ScreenerOutcome.passed,
      decimals: 6,
      tokenProgram: splTokenProgram,
      quoteMint: wsolMint,
    ),
    ScreenerCoin(
      symbol: 'USDX',
      mint: mockMint('USDX'),
      logoHash: mockLogoHash(mockMint('USDX')),
      strategyId: 'stg_pull',
      score: 71,
      outcome: ScreenerOutcome.notTradeable,
      reasonCode: unsupportedQuoteMint,
      quoteSymbol: 'USDC',
      decimals: 9,
      tokenProgram: splTokenProgram,
      quoteMint: usdcMint,
    ),
    ScreenerCoin(
      symbol: 'RUGZ',
      mint: mockMint('RUGZ'),
      logoHash: mockLogoHash(mockMint('RUGZ')),
      strategyId: 'stg_pull',
      score: 64,
      outcome: ScreenerOutcome.rejected,
      reasonCode: 'GUARD_FAILED',
      decimals: 6,
      tokenProgram: splTokenProgram,
      quoteMint: wsolMint,
    ),
    ScreenerCoin(
      symbol: 'KIRA',
      mint: mockMint('KIRA'),
      logoHash: mockLogoHash(mockMint('KIRA')),
      strategyId: 'stg_pull',
      marketCap: MarketCap(lamports: Lamports.parse('640000000000'), asOf: DateTime.utc(2026, 10, 29, 9)),
      score: 77,
      outcome: ScreenerOutcome.passed,
      decimals: 6,
      tokenProgram: splTokenProgram,
      quoteMint: wsolMint,
    ),
  ];

  @override
  Stream<List<ScreenerCoin>> watchScreener() => _watch(() => List.unmodifiable(_screener));

  @override
  Stream<List<Approval>> watchAll() => _watch(() => List.unmodifiable(_approvals.reversed));

  /// `set_strategy_status` (wraps update_strategy).
  @override
  Future<Strategy> setPaused(String strategyId, {required bool paused, required int expectedRev}) async {
    await Future<void>.delayed(const Duration(milliseconds: 100));
    final updated = await updateStrategy(
      strategyId,
      expectedRev: expectedRev,
      status: paused ? StrategyStatus.paused : StrategyStatus.running,
    );
    _emitEvent(
      paused ? ActivityKind.paused : ActivityKind.resumed,
      Actor.you,
      '${paused ? 'Paused' : 'Resumed'} ${updated.name}',
      strategyId: updated.id,
    );
    _notify();
    return updated;
  }

  /// Last decide request received (tests: wire `reason` of a skip).
  DecideApprovalRequest? debugLastDecide;

  /// Mirrors `decide_approval` (1.1.4): `p_expected_rev` required, idempotency
  /// replay / 422 reuse (incl. a different reject_reason), token check, rev check,
  /// expiry, Real gate, Real quote gate (QUOTE_MISSING_OR_STALE), weakening hold
  /// proof (428/422), reject_reason default `user_declined`. Typed [ApiException]s.
  @override
  Future<DecideApprovalResult> decide(DecideApprovalRequest r) async {
    debugLastDecide = r;
    await Future<void>.delayed(const Duration(milliseconds: 150));
    final body = {
      'approval_id': r.approvalId,
      'token': r.token,
      'decision': Wire.decision(approve: r.approve),
      'expected_rev': r.expectedRev,
      'reason': r.reasonDetail,
      'reject_reason': r.rejectReason?.wire,
      'hold_ms': r.holdMs,
    };
    final prior = _replay<DecideApprovalResult>(r.idempotencyKey, body);
    if (prior != null) {
      return DecideApprovalResult(
        proposalId: prior.proposalId,
        status: prior.status,
        rev: prior.rev,
        replayed: true,
        serverNow: _clock(),
        rejectReason: prior.rejectReason,
      );
    }
    final i = _approvals.indexWhere((a) => a.id == r.approvalId);
    if (i < 0) throw ApiException.fromCode('NOT_FOUND');
    final a = _approvals[i];
    if (a.token != r.token) throw ApiException.fromCode('APPROVAL_TOKEN_INVALID');
    if (a.status == ApprovalStatus.expired) throw ApiException.fromCode('APPROVAL_EXPIRED');
    if (a.status != ApprovalStatus.pending) {
      throw ApiException.fromCode('APPROVAL_ALREADY_DECIDED', details: {'status': Wire.approvalStatus(a.status)});
    }
    if (r.expectedRev != a.rev) {
      throw ApiException.fromCode('VERSION_CONFLICT', details: {'current_rev': a.rev, 'base_rev': r.expectedRev});
    }
    if (a.isExpiredAt(_clock())) {
      _approvals[i] = a.copyWith(
        status: ApprovalStatus.expired,
        expireReason: ExpireReason.timedOut,
        decidedAt: _clock(),
      );
      _notify();
      throw ApiException.fromCode('APPROVAL_EXPIRED');
    }
    if (a.mode == TradeMode.real && r.approve && !realSolEnabled) throw ApiException.fromCode('REAL_SOL_DISABLED');
    // Not tradeable (no SOL quote pair): approve → UNSUPPORTED_QUOTE_MINT; skip/reject is
    // allowed (Apex decision, i18n 0.4.4), reason defaults to `not_tradeable`.
    if (a.notTradeable && r.approve) {
      throw ApiException.fromCode(unsupportedQuoteMint, details: {'reason_code': unsupportedQuoteMint});
    }
    // 1.1.4 `approval_quote_check`: Real approve needs a fresh quote; Practice never blocked.
    if (r.approve && quoteBlocksApprove(a, _clock())) {
      throw ApiException.fromCode(
        'QUOTE_MISSING_OR_STALE',
        details: {
          'quote_ts': a.quote?.quoteTs?.toUtc().toIso8601String(),
          'quote_expires_at': a.quote?.quoteExpiresAt?.toUtc().toIso8601String(),
          'missing': a.quote == null,
          'hint': 'refresh the quote, review, approve with the new rev',
        },
      );
    }
    // 1.1.4 guard-weakening proposal: 1,200 ms press-and-hold proof on approve.
    if (r.approve && a.weakening) {
      if (r.holdMs == null) {
        throw ApiException.fromCode(
          'CONFIRMATION_REQUIRED',
          details: {
            'required': {'hold_ms': 1200},
          },
        );
      }
      if (r.holdMs! < 1200) throw ApiException.fromCode('HOLD_TOO_SHORT', details: {'min_hold_ms': 1200});
    }
    final rejectReason = r.approve ? null : (r.rejectReason ?? RejectReason.userDeclined);
    final status = r.approve ? ApprovalStatus.approved : ApprovalStatus.skipped;
    final rev = a.rev + 1;
    _approvals[i] = a.copyWith(status: status, decidedAt: _clock(), rev: rev, rejectReason: rejectReason);
    _emitEnvelope(
      r.approve ? 'proposal.approved' : 'proposal.rejected',
      a.id,
      {
        'proposal_id': a.id,
        'kind': Wire.approvalKind(a.kind),
        'rev': rev,
        'decided_by': 'mock_user',
        // From the JWT `centurion_client` claim on the server; never a client param.
        'decided_via': Wire.clientMobile,
        'reason': r.approve ? null : r.reasonDetail,
        'reject_reason': rejectReason?.wire,
      },
      mode: a.mode,
      strategyId: a.strategyId,
      actor: 'user',
    );
    _applyDecision(a, r.approve);
    _notify();
    final result = DecideApprovalResult(
      proposalId: a.id,
      status: status,
      rev: rev,
      replayed: false,
      serverNow: _clock(),
      rejectReason: rejectReason,
    );
    _remember(r.idempotencyKey, body, result);
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

  void _emitEvent(
    ActivityKind kind,
    Actor actor,
    String msg, {
    String? strategyId,
    String? symbol,
    Lamports? pnlLamports,
  }) {
    final now = _clock();
    _events.add(
      ActivityEvent(
        id: '${symbol ?? 'sys'}:${now.millisecondsSinceEpoch}:${kind.name}:${_seq++}',
        at: now,
        kind: kind,
        actor: actor,
        message: msg,
        strategyId: strategyId,
        symbol: symbol,
        mint: symbol == null ? null : mockMint(symbol),
        logoHash: symbol == null ? null : mockLogoHash(mockMint(symbol)),
        pnlLamports: pnlLamports,
      ),
    );
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
      _emitEvent(
        ActivityKind.sold,
        Actor.exit,
        '${p.symbol}: $msg',
        strategyId: p.strategyId,
        symbol: p.symbol,
        pnlLamports: pnl,
      );
      _push(
        'N-08',
        'exit.triggered',
        p.mode,
        positionId: p.id,
        vars: {
          'symbol': p.symbol,
          'pct_sold': (sellBps / 100).round(),
          'pct': rung.gainPct.round(),
          'pnl': pnl.toWire(), // lamports integer string (i18n 0.4.3 var_format)
        },
      );
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
    } else if (next.exitPlan!.filledCount == 0 &&
        now.difference(p.openedAt) >= mockStallWindow &&
        next.changePct.abs() < mockStallMinMovePct) {
      // 1.1.4 stall_exit stand-in: flat for a full window since entry → exit_reason `stall`.
      stop = 'Stall exit: moved <$mockStallMinMovePct% in ${mockStallWindow.inSeconds} s';
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
      _emitEvent(
        ActivityKind.sold,
        Actor.exit,
        '${p.symbol}: $stop',
        strategyId: p.strategyId,
        symbol: p.symbol,
        pnlLamports: next.pnlLamports,
      );
      if (rest > 0) {
        _push(
          'N-09',
          'exit.triggered',
          p.mode,
          positionId: p.id,
          vars: {
            'symbol': p.symbol,
            'stop_type': stop,
            'pnl': next.pnlLamports.toWire(),
            'pct': double.parse(next.pnlPct.toStringAsFixed(1)),
          },
        );
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
    _emitEvent(
      ActivityKind.passed,
      Actor.screener,
      '$sym passed screening · fit $score/70',
      strategyId: s.id,
      symbol: sym,
    );
    _emitEvent(ActivityKind.proposal, Actor.entry, '$sym waiting for your approval', strategyId: s.id, symbol: sym);
    final id = _id('apv_');
    final pickType = _rng.nextBool() ? PickType.firstBuy : PickType.buy;
    final token = 'tok_${_fakeMint().substring(0, 16)}';
    final exp = now.add(const Duration(minutes: 10));
    // notifications.map.json: N-02 = first_buy=true, N-01 otherwise.
    _push(
      pickType == PickType.firstBuy ? 'N-02' : 'N-01',
      'proposal.created',
      s.mode,
      approvalId: id,
      token: token,
      exp: exp,
      vars: {
        'symbol': sym,
        'strategy': s.name,
        'amount_lamports': s.ticketLamports.toWire(),
        'reason': 'fit $score/70',
      },
    );
    _approvals.add(
      Approval(
        id: id,
        kind: ApprovalKind.buyPick,
        status: ApprovalStatus.pending,
        title: 'Buy $sym',
        symbol: sym,
        mint: mockMint(sym),
        logoHash: mockLogoHash(mockMint(sym)),
        detail: '${s.name} · fit $score/70 · guard ${6 + _rng.nextInt(3)}/8 · mcap \$${(40 + _rng.nextInt(400))}k',
        pickType: pickType,
        mode: s.mode,
        createdAt: now,
        expiresAt: exp,
        token: token,
        strategyId: s.id,
        amountLamports: s.ticketLamports,
        quote: estimateQuote(s.ticketLamports, now),
      ),
    );
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
          _push(
            'N-04',
            'position.opened',
            a.mode,
            positionId: pid,
            vars: {
              'symbol': sym,
              'amount_lamports': amount.toWire(),
              'price': price.toString(),
              'exit_plan': planFor(preset, opened).name,
            },
          );
          _positions.add(
            Position(
              id: pid,
              exitPlan: planFor(preset, opened),
              strategyId: a.strategyId!,
              symbol: sym,
              mint: a.mint ?? mockMint(sym),
              logoHash: mockLogoHash(a.mint ?? mockMint(sym)),
              mode: TradeMode.practice,
              state: PositionState.open,
              costLamports: amount,
              entryPriceUsd: price,
              markPriceUsd: price,
              peakPriceUsd: price,
              openedAt: opened,
              practiceEpoch: _epoch,
              decimals: 6, // mock coin facts; real values come from the mint account
              tokenProgram: splTokenProgram,
              qtyRaw: _qtyRaw(amount, price, 6),
            ),
          );
          _emitEvent(
            ActivityKind.bought,
            Actor.executor,
            'Bought $sym for ${amount.toSol()} SOL',
            strategyId: a.strategyId,
            symbol: sym,
          );
        } else {
          _emitEvent(ActivityKind.skipped, Actor.you, 'You skipped $sym', strategyId: a.strategyId, symbol: sym);
        }
      case ApprovalKind.guardChange:
        final i = _strategies.indexWhere((s) => s.id == a.strategyId);
        if (approve && i >= 0) {
          // 1.1.4 weakening proposal: applied on exactly base_rev (else the change is stale).
          if (a.weakening && a.strategyId != null && (a.baseRev == null || a.baseRev == _strategies[i].rev)) {
            final g = _guardsOf(a.strategyId!);
            for (final e in a.diff.entries) {
              if (e.value.length == 2) g[e.key] = e.value[1];
            }
          }
          _strategies[i] = _strategies[i].copyWith(rev: _strategies[i].rev + 1);
        }
        _emitEvent(
          approve ? ActivityKind.approved : ActivityKind.skipped,
          Actor.you,
          '${approve ? 'Approved' : 'Rejected'} guard change: ${a.title}',
          strategyId: a.strategyId,
        );
      case ApprovalKind.teamAction:
        _emitEvent(ActivityKind.proposal, Actor.you, '${approve ? 'Approved' : 'Rejected'} ${a.title}');
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
        avgHold: const Duration(minutes: 4),
        paperProgress: const PaperProgress(daysDone: 4, tradesDone: 23), // 1.1.6: rules not set (required = null)
      ),
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
        avgHold: const Duration(minutes: 1),
        paperProgress: const PaperProgress(daysDone: 1, tradesDone: 5),
      ),
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
        approvalMode: ApprovalMode.askEveryBuy,
      ),
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
        ep = ep.copyWith(
          rungs: [r0.fill(opened.add(const Duration(minutes: 9))), ...ep.rungs.skip(1)],
          trailArmed: true,
        );
        soldBps = (r0.sellPct * 100).round();
        proceeds = cost.bps(soldBps).times(_d('${1 + r0.gainPct / 100}')).bps(10000 - 125);
      }
      _positions.add(
        Position(
          id: 'ck${100 + i}.0',
          strategyId: stg,
          symbol: sym,
          mint: mockMint(sym),
          logoHash: mockLogoHash(mockMint(sym)),
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
          practiceEpoch: _epoch,
          decimals: i.isEven ? 6 : 9,
          tokenProgram: splTokenProgram,
          qtyRaw: _qtyRaw(cost.bps(10000 - soldBps), price, i.isEven ? 6 : 9),
        ),
      );
    }
    _positions.add(
      Position(
        id: 'ck099.0',
        strategyId: 'stg_newpairs',
        symbol: 'FERN',
        mint: mockMint('FERN'),
        logoHash: mockLogoHash(mockMint('FERN')),
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
        lockedPnlLamports: _sol('0.062'),
        lockedPnlPct: 31,
        practiceEpoch: _epoch,
        decimals: 6,
        tokenProgram: splTokenProgram,
        qtyRaw: BigInt.zero,
      ),
    );
    var equity = startLamports;
    for (var i = 60; i > 0; i--) {
      equity += Lamports.fromInt(((_rng.nextDouble() - 0.48) * 50000000).round());
      _history.add(PnlPoint(now.subtract(Duration(minutes: i)), equity));
    }
    _emitEvent(ActivityKind.found, Actor.screener, 'Screener checked 312 coins in the last hour');
    _emitEvent(
      ActivityKind.sold,
      Actor.executor,
      'FERN: Took profit: 40% at +20%',
      strategyId: 'stg_newpairs',
      symbol: 'FERN',
      pnlLamports: _sol('0.062'),
    );
    _emitEvent(
      ActivityKind.blocked,
      Actor.guard,
      'MOTH blocked: bundled launch (31% supply)',
      strategyId: 'stg_pullback',
      symbol: 'MOTH',
    );
    _approvals.addAll([
      Approval(
        id: 'apv_seed1',
        kind: ApprovalKind.buyPick,
        pickType: PickType.firstBuy,
        status: ApprovalStatus.pending,
        title: 'Buy KEPL',
        symbol: 'KEPL',
        mint: mockMint('KEPL'),
        logoHash: mockLogoHash(mockMint('KEPL')),
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
        symbol: 'RIVR',
        mint: mockMint('RIVR'),
        logoHash: mockLogoHash(mockMint('RIVR')),
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
        symbol: 'ZINC',
        mint: mockMint('ZINC'),
        logoHash: mockLogoHash(mockMint('ZINC')),
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
