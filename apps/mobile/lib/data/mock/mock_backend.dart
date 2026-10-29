import 'dart:async';
import 'dart:math';

import '../models/models.dart';
import '../repositories/repositories.dart';

/// In-memory simulator standing in for Supabase (tables + Realtime + RPC).
///
/// One instance implements every repository so state stays consistent
/// (e.g. approving a buy pick creates a position and an activity event).
/// Call [start] for a periodic tick (UI demo) or [tick] manually (tests).
class MockBackend
    implements PortfolioRepository, ActivityRepository, StrategyRepository, ApprovalRepository, PushSource {
  MockBackend({int seed = 7, DateTime Function()? clock})
      : _rng = Random(seed),
        _clock = clock ?? DateTime.now {
    _seed();
  }

  final Random _rng;
  final DateTime Function() _clock;
  final _changes = StreamController<void>.broadcast();
  final _pushes = StreamController<Map<String, String>>.broadcast();
  Timer? _timer;
  int _seq = 0;

  static const double startSol = 30;
  final List<Strategy> _strategies = [];
  final List<Position> _positions = [];
  final List<ActivityEvent> _events = [];
  final List<Approval> _approvals = [];
  final List<PnlPoint> _history = [];
  final Map<String, ApprovalStatus> _usedTokens = {};

  // ---------------------------------------------------------------- lifecycle
  void start({Duration every = const Duration(seconds: 2)}) {
    _timer ??= Timer.periodic(every, (_) => tick());
  }

  void dispose() {
    _timer?.cancel();
    _changes.close();
    _pushes.close();
  }

  /// Advance the simulation by one step: move marks, maybe close a position,
  /// maybe emit a new pick that needs approval.
  void tick() {
    final now = _clock();
    for (var i = 0; i < _positions.length; i++) {
      final p = _positions[i];
      if (!p.isOpen) continue;
      final drift = 1 + (_rng.nextDouble() - 0.47) * 0.08;
      _positions[i] = _runExitPlan(p, p.markPriceUsd * drift, now);
    }
    for (var i = 0; i < _approvals.length; i++) {
      final a = _approvals[i];
      if (a.status == ApprovalStatus.pending && a.isExpiredAt(now)) {
        _approvals[i] = a.copyWith(
            status: ApprovalStatus.expired, expireReason: ExpireReason.timedOut, decidedAt: now);
      }
    }
    if (_rng.nextDouble() < 0.25) _newPick(now);
    _history.add(PnlPoint(now, _summary().equitySol));
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
    final end = _summary().equitySol;
    final pts = <double>[end];
    for (var i = 1; i < count; i++) {
      pts.add(pts.last - (r.nextDouble() - 0.46) * 0.06);
    }
    final ordered = pts.reversed.toList();
    return [
      for (var i = 0; i < ordered.length; i++)
        PnlPoint(now.subtract(step * (ordered.length - 1 - i)), ordered[i]),
    ];
  }

  @override
  Future<double> sellPosition(String positionId, {required double pct}) async {
    await Future<void>.delayed(const Duration(milliseconds: 150));
    final i = _positions.indexWhere((p) => p.id == positionId);
    if (i < 0) throw StateError('Unknown position $positionId');
    final p = _positions[i];
    if (!p.isOpen) throw ConflictException('Position already closed');
    final share = pct.clamp(1, 100).toDouble();
    final proceeds = p.estimateSellSol(share);
    final soldNow = (100 - p.soldPct) * share / 100;
    final full = share >= 100;
    _positions[i] = p.copyWith(
      solOut: (p.solOut ?? 0) + proceeds,
      soldPct: full ? 100 : p.soldPct + soldNow,
      state: full ? PositionState.closed : null,
      closedAt: full ? _clock() : null,
      exitReason: full ? 'You sold 100% manually' : null,
    );
    _emitEvent(ActivityKind.sold, Actor.you, '${p.symbol}: you sold ${share.round()}%',
        strategyId: p.strategyId, symbol: p.symbol, pnlSol: proceeds - p.solIn * soldNow / 100);
    _notify();
    return proceeds;
  }

  @override
  Stream<Map<String, String>> watchPushPayloads() => _pushes.stream;

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
    _positions[i] = _runExitPlan(p, p.entryPriceUsd * (1 + changePct / 100), _clock());
    _notify();
  }

  void _push(Map<String, String> data) {
    if (!_pushes.isClosed) _pushes.add({'v': '1', ...data});
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

  @override
  Future<Strategy> setPaused(String strategyId, {required bool paused, required int expectedRev}) async {
    await Future<void>.delayed(const Duration(milliseconds: 150));
    final i = _strategies.indexWhere((s) => s.id == strategyId);
    if (i < 0) throw StateError('Unknown strategy $strategyId');
    final s = _strategies[i];
    if (s.rev != expectedRev) {
      throw ConflictException('Strategy changed on server (rev ${s.rev}); refresh and retry.');
    }
    final updated = s.copyWith(
      status: paused ? StrategyStatus.paused : StrategyStatus.running,
      rev: s.rev + 1,
    );
    _strategies[i] = updated;
    _emitEvent(paused ? ActivityKind.paused : ActivityKind.resumed, Actor.you,
        '${paused ? 'Paused' : 'Resumed'} ${s.name}',
        strategyId: s.id);
    _notify();
    return updated;
  }

  @override
  Future<ApprovalStatus> decide(String approvalId, {required bool approve, required String token}) async {
    await Future<void>.delayed(const Duration(milliseconds: 150));
    final prior = _usedTokens[token];
    if (prior != null) return prior; // idempotent replay
    final i = _approvals.indexWhere((a) => a.id == approvalId);
    if (i < 0) throw StateError('Unknown approval $approvalId');
    final a = _approvals[i];
    if (a.token != token) throw ConflictException('Token does not match approval');
    if (a.status != ApprovalStatus.pending) return a.status;
    if (a.isExpiredAt(_clock())) {
      _approvals[i] = a.copyWith(
          status: ApprovalStatus.expired, expireReason: ExpireReason.timedOut, decidedAt: _clock());
      _notify();
      return ApprovalStatus.expired;
    }
    final status = approve ? ApprovalStatus.approved : ApprovalStatus.skipped;
    _approvals[i] = a.copyWith(status: status, decidedAt: _clock());
    _usedTokens[token] = status;
    _applyDecision(a, approve);
    _notify();
    return status;
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
      {String? strategyId, String? symbol, double? pnlSol}) {
    final now = _clock();
    _events.add(ActivityEvent(
      id: '${symbol ?? 'sys'}:${now.millisecondsSinceEpoch}:${kind.name}:${_seq++}',
      at: now,
      kind: kind,
      actor: actor,
      message: msg,
      strategyId: strategyId,
      symbol: symbol,
      pnlSol: pnlSol,
    ));
    if (_events.length > 500) _events.removeAt(0);
  }

  static ExitPlanState planFor(String name, DateTime openedAt) => switch (name) {
        'scalp' => ExitPlanState(
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
  Position _runExitPlan(Position p, double mark, DateTime now) {
    var next = p.copyWith(markPriceUsd: mark, peakPriceUsd: max(p.peakPriceUsd, mark));
    final plan = next.exitPlan;
    if (plan == null) return next;
    final mode = p.mode == TradeMode.real ? 'real' : 'practice';
    // Take-profit rungs.
    final rungs = [...plan.rungs];
    for (var r = 0; r < rungs.length; r++) {
      final rung = rungs[r];
      if (rung.filled || next.changePct < rung.gainPct) continue;
      final sellOfOriginal = min(rung.sellPct, 100 - next.soldPct);
      final proceeds = p.solIn * sellOfOriginal / 100 * mark / p.entryPriceUsd * (1 - p.feeBps / 10000);
      rungs[r] = rung.fill(now);
      next = next.copyWith(
        solOut: (next.solOut ?? 0) + proceeds,
        soldPct: next.soldPct + sellOfOriginal,
        exitPlan: plan.copyWith(rungs: rungs, trailArmed: true),
      );
      final msg = 'Took profit: ${sellOfOriginal.round()}% at +${rung.gainPct.round()}%';
      _emitEvent(ActivityKind.sold, Actor.exit, '${p.symbol}: $msg',
          strategyId: p.strategyId, symbol: p.symbol, pnlSol: proceeds - p.solIn * sellOfOriginal / 100);
      _push({
        'event': 'N-08', 'mode': mode, 'position_id': p.id, 'coin': '\$${p.symbol}',
        'pct_sold': '${sellOfOriginal.round()}', 'pct': '${rung.gainPct.round()}',
        'pnl': (proceeds - p.solIn * sellOfOriginal / 100).toStringAsFixed(4),
      });
    }
    String? stop;
    final armed = next.exitPlan!.trailArmed;
    if (next.soldPct >= 100) {
      stop = 'Exit plan complete';
    } else if (next.changePct <= plan.stopLossPct) {
      stop = 'Stop loss ${plan.stopLossPct.round()}%';
    } else if (armed && next.fromPeakPct >= plan.trailPct) {
      stop = 'Trailing stop: ${plan.trailPct.round()}% below the high';
    } else if (plan.timeStopAt != null && !now.isBefore(plan.timeStopAt!) && next.exitPlan!.filledCount == 0) {
      stop = 'Time stop: no TP by ${plan.timeStopAt!.difference(p.openedAt).inMinutes} min';
    }
    if (stop != null) {
      final rest = 100 - next.soldPct;
      final proceeds = p.solIn * rest / 100 * mark / p.entryPriceUsd * (1 - p.feeBps / 10000);
      next = next.copyWith(
        state: PositionState.closed,
        solOut: (next.solOut ?? 0) + proceeds,
        soldPct: 100,
        closedAt: now,
        exitReason: stop,
      );
      _emitEvent(ActivityKind.sold, Actor.exit, '${p.symbol}: $stop',
          strategyId: p.strategyId, symbol: p.symbol, pnlSol: next.pnlSol);
      if (rest > 0) {
        _push({
          'event': 'N-09', 'mode': mode, 'position_id': p.id, 'coin': '\$${p.symbol}',
          'stop_type': stop, 'pnl': next.pnlSol.toStringAsFixed(4), 'pct': next.pnlPct.toStringAsFixed(1),
        });
      }
    }
    return next;
  }

  PortfolioSummary _summary() {
    var cost = 0.0, proceeds = 0.0, remainderValue = 0.0, remainderCost = 0.0, soldCost = 0.0;
    var open = 0;
    for (final p in _positions) {
      cost += p.solIn;
      proceeds += p.solOut ?? 0;
      if (p.isOpen) {
        open++;
        remainderValue += p.sizeSol * p.markPriceUsd / p.entryPriceUsd;
        remainderCost += p.sizeSol;
        soldCost += p.solIn - p.sizeSol;
      } else {
        soldCost += p.solIn;
      }
    }
    return PortfolioSummary(
      mode: TradeMode.practice,
      cashSol: startSol - cost + proceeds,
      startSol: startSol,
      realizedPnlSol: proceeds - soldCost,
      unrealizedPnlSol: remainderValue - remainderCost,
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
    _push({
      'event': pickType == PickType.firstBuy ? 'N-01' : 'N-02',
      'mode': s.mode == TradeMode.real ? 'real' : 'practice',
      'approval_id': id,
      'token': token,
      'exp': '${exp.millisecondsSinceEpoch ~/ 1000}',
      'coin': '\$$sym',
      'strategy': s.name,
      'sol': '${s.tradeSol}',
      'reason': 'fit $score/70',
    });
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
      amountSol: s.tradeSol,
    ));
  }

  void _applyDecision(Approval a, bool approve) {
    final sym = a.title.split(' ').last;
    switch (a.kind) {
      case ApprovalKind.buyPick:
        if (approve) {
          final price = 0.0001 + _rng.nextDouble() * 0.001;
          final stg = _strategies.where((s) => s.id == a.strategyId).firstOrNull;
          final opened = _clock();
          final pid = '${_id('ck')}.0';
          _push({
            'event': 'N-04', 'mode': a.mode == TradeMode.real ? 'real' : 'practice', 'position_id': pid,
            'coin': '\$$sym', 'sol': '${a.amountSol ?? 0.25}', 'price': price.toStringAsPrecision(3),
            'exit_plan': stg == null ? 'ladder' : planFor(stg.exitPlan, opened).name,
          });
          _positions.add(Position(
            id: pid,
            exitPlan: planFor(stg?.exitPlan ?? 'ladder', opened),
            strategyId: a.strategyId!,
            symbol: sym,
            mint: _fakeMint(),
            mode: TradeMode.practice,
            state: PositionState.open,
            solIn: a.amountSol ?? 0.25,
            entryPriceUsd: price,
            markPriceUsd: price,
            peakPriceUsd: price,
            openedAt: opened,
          ));
          _emitEvent(ActivityKind.bought, Actor.executor, 'Bought $sym for ${a.amountSol} SOL',
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
    _strategies.addAll(const [
      Strategy(
          id: 'stg_pullback',
          name: 'Pullback v2',
          mode: TradeMode.practice,
          status: StrategyStatus.running,
          rev: 4,
          exitPlan: 'ladder',
          tradeSol: 0.25,
          maxOpen: 5,
          askFirst: true,
          realizedPnlSol: 0.412,
          winRatePct: 58,
          maxDrawdownPct: 6.1,
          avgHold: Duration(minutes: 4)),
      Strategy(
          id: 'stg_newpairs',
          name: 'New Pairs Scout',
          mode: TradeMode.practice,
          status: StrategyStatus.running,
          rev: 11,
          exitPlan: 'scalp',
          tradeSol: 0.2,
          maxOpen: 3,
          askFirst: true,
          realizedPnlSol: -0.118,
          approvalMode: ApprovalMode.askEveryBuy,
          winRatePct: 41,
          maxDrawdownPct: 12.4,
          avgHold: Duration(minutes: 1)),
      Strategy(
          id: 'stg_grad',
          name: 'Graduated Momentum',
          mode: TradeMode.real,
          status: StrategyStatus.paused,
          rev: 2,
          exitPlan: 'stepLock',
          tradeSol: 0.1,
          maxOpen: 2,
          askFirst: true,
          realizedPnlSol: 0,
          approvalMode: ApprovalMode.askEveryBuy),
    ]);
    // Seeds mirror wireframe 12: one with TP1 filled + trail armed, one red
    // near SL, one green before TP1, one fresh scalp.
    const seeds = [
      // symbol, strategy, plan, solIn, change%, peak%, minutesAgo, tp1Filled
      ('GLOW', 'stg_pullback', 'ladder', 0.36, 68.0, 74.0, 26, true),
      ('MOTH', 'stg_pullback', 'ladder', 0.25, -9.5, 4.0, 19, false),
      ('TUSK', 'stg_newpairs', 'scalp', 0.20, 12.0, 14.0, 2, false),
      ('ORBI', 'stg_pullback', 'ladder', 0.25, 31.0, 33.0, 8, false),
    ];
    for (var i = 0; i < seeds.length; i++) {
      final (sym, stg, plan, solIn, chg, peak, ago, tp1) = seeds[i];
      final price = 0.0002 + _rng.nextDouble() * 0.0008;
      final opened = now.subtract(Duration(minutes: ago));
      var ep = planFor(plan, opened);
      var soldPct = 0.0;
      double? solOut;
      if (tp1) {
        final r0 = ep.rungs.first;
        ep = ep.copyWith(rungs: [r0.fill(opened.add(const Duration(minutes: 9))), ...ep.rungs.skip(1)], trailArmed: true);
        soldPct = r0.sellPct;
        solOut = solIn * r0.sellPct / 100 * (1 + r0.gainPct / 100) * 0.9875;
      }
      _positions.add(Position(
        id: 'ck${100 + i}.0',
        strategyId: stg,
        symbol: sym,
        mint: _fakeMint(),
        mode: TradeMode.practice,
        state: PositionState.open,
        solIn: solIn,
        entryPriceUsd: price,
        markPriceUsd: price * (1 + chg / 100),
        peakPriceUsd: price * (1 + peak / 100),
        openedAt: opened,
        exitPlan: ep,
        soldPct: soldPct,
        solOut: solOut,
      ));
    }
    _positions.add(Position(
      id: 'ck099.0',
      strategyId: 'stg_newpairs',
      symbol: 'FERN',
      mint: _fakeMint(),
      mode: TradeMode.practice,
      state: PositionState.closed,
      solIn: 0.2,
      solOut: 0.262,
      entryPriceUsd: 0.0004,
      markPriceUsd: 0.00053,
      peakPriceUsd: 0.00058,
      openedAt: now.subtract(const Duration(hours: 1)),
      closedAt: now.subtract(const Duration(minutes: 41)),
      exitReason: 'Took profit: 40% at +20%',
    ));
    var equity = startSol;
    for (var i = 60; i > 0; i--) {
      equity += (_rng.nextDouble() - 0.48) * 0.05;
      _history.add(PnlPoint(now.subtract(Duration(minutes: i)), equity));
    }
    _emitEvent(ActivityKind.found, Actor.screener, 'Screener checked 312 coins in the last hour');
    _emitEvent(ActivityKind.sold, Actor.executor, 'FERN: Took profit: 40% at +20%',
        strategyId: 'stg_newpairs', symbol: 'FERN', pnlSol: 0.062);
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
        amountSol: 0.25,
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
        amountSol: 0.2,
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
        diff: const {
          'maxBundlersPercent': [20, 35],
          'minHolders': [150, 80],
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
        diff: const {
          'maxBundlersPercent': [20, 30],
          'shield.washTrading': ['on', 'off'],
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
        amountSol: 0.2,
      ),
    ]);
  }
}
