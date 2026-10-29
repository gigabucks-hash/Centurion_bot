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
    implements PortfolioRepository, ActivityRepository, StrategyRepository, ApprovalRepository {
  MockBackend({int seed = 7, DateTime Function()? clock})
      : _rng = Random(seed),
        _clock = clock ?? DateTime.now {
    _seed();
  }

  final Random _rng;
  final DateTime Function() _clock;
  final _changes = StreamController<void>.broadcast();
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
  }

  /// Advance the simulation by one step: move marks, maybe close a position,
  /// maybe emit a new pick that needs approval.
  void tick() {
    final now = _clock();
    for (var i = 0; i < _positions.length; i++) {
      final p = _positions[i];
      if (p.state != PositionState.open) continue;
      final drift = 1 + (_rng.nextDouble() - 0.47) * 0.08;
      final mark = p.markPriceUsd * drift;
      var next = p.copyWith(markPriceUsd: mark, peakPriceUsd: max(p.peakPriceUsd, mark));
      final fromPeak = (1 - mark / next.peakPriceUsd) * 100;
      if (fromPeak >= 15 || next.changePct >= 60) {
        final reason = fromPeak >= 15 ? 'Trailing stop: 15% below the high' : 'Took profit at +60%';
        next = next.copyWith(
          state: PositionState.closed,
          solOut: p.solIn * mark / p.entryPriceUsd * 0.9875, // 125 bps fee
          closedAt: now,
          exitReason: reason,
        );
        _emitEvent(ActivityKind.sold, Actor.exit, '${p.symbol}: $reason',
            strategyId: p.strategyId, symbol: p.symbol, pnlSol: next.pnlSol);
      }
      _positions[i] = next;
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

  PortfolioSummary _summary() {
    final realized = _positions
        .where((p) => p.state == PositionState.closed)
        .fold<double>(0, (s, p) => s + p.pnlSol);
    final open = _positions.where((p) => p.state == PositionState.open);
    final unrealized = open.fold<double>(0, (s, p) => s + p.pnlSol);
    final locked = open.fold<double>(0, (s, p) => s + p.solIn);
    return PortfolioSummary(
      mode: TradeMode.practice,
      cashSol: startSol + realized - locked,
      startSol: startSol,
      realizedPnlSol: realized,
      unrealizedPnlSol: unrealized,
      openPositions: open.length,
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
    _approvals.add(Approval(
      id: _id('apv_'),
      kind: ApprovalKind.buyPick,
      status: ApprovalStatus.pending,
      title: 'Buy $sym',
      detail: '${s.name} · fit $score/70 · guard ${6 + _rng.nextInt(3)}/8 · mcap \$${(40 + _rng.nextInt(400))}k',
      pickType: _rng.nextBool() ? PickType.firstBuy : PickType.buy,
      mode: s.mode,
      createdAt: now,
      expiresAt: now.add(const Duration(minutes: 10)),
      token: 'tok_${_fakeMint().substring(0, 16)}',
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
          _positions.add(Position(
            id: '${_id('ck')}.0',
            strategyId: a.strategyId!,
            symbol: sym,
            mint: _fakeMint(),
            mode: TradeMode.practice,
            state: PositionState.open,
            solIn: a.amountSol ?? 0.25,
            entryPriceUsd: price,
            markPriceUsd: price,
            peakPriceUsd: price,
            openedAt: _clock(),
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
    for (var i = 0; i < 4; i++) {
      final price = 0.0002 + _rng.nextDouble() * 0.0008;
      final mark = price * (0.85 + _rng.nextDouble() * 0.4);
      _positions.add(Position(
        id: 'ck${100 + i}.0',
        strategyId: i.isEven ? 'stg_pullback' : 'stg_newpairs',
        symbol: _symbols[i],
        mint: _fakeMint(),
        mode: TradeMode.practice,
        state: PositionState.open,
        solIn: 0.25,
        entryPriceUsd: price,
        markPriceUsd: mark,
        peakPriceUsd: max(price, mark),
        openedAt: now.subtract(Duration(minutes: 5 + i * 7)),
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
