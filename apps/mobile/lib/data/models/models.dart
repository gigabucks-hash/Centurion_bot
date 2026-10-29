/// Domain models. Field names mirror the planned Postgres schema
/// (snake_case in DB, camelCase here) so the Supabase mappers stay trivial.
library;

enum TradeMode { practice, real }

enum StrategyStatus { running, paused, stopped }

/// SPEC §2 `approvalMode`. Real SOL never allows [off] in MVP.
enum ApprovalMode { off, askFirstBuy, askEveryBuy }

class Strategy {
  const Strategy({
    required this.id,
    required this.name,
    required this.mode,
    required this.status,
    required this.rev,
    required this.exitPlan,
    required this.tradeSol,
    required this.maxOpen,
    required this.askFirst,
    required this.realizedPnlSol,
    this.approvalMode = ApprovalMode.askFirstBuy,
    this.winRatePct = 0,
    this.maxDrawdownPct = 0,
    this.avgHold = Duration.zero,
  });

  final String id;
  final String name;
  final TradeMode mode;
  final StrategyStatus status;

  /// Optimistic version of the settings document. Every mutation must send
  /// the rev it was based on; the backend rejects stale writes.
  final int rev;
  final String exitPlan;
  final double tradeSol;
  final int maxOpen;
  final bool askFirst;
  final double realizedPnlSol;
  final ApprovalMode approvalMode;
  final double winRatePct;
  final double maxDrawdownPct;
  final Duration avgHold;

  bool get isRunning => status == StrategyStatus.running;

  Strategy copyWith({StrategyStatus? status, int? rev, double? realizedPnlSol}) {
    return Strategy(
      id: id,
      name: name,
      mode: mode,
      status: status ?? this.status,
      rev: rev ?? this.rev,
      exitPlan: exitPlan,
      tradeSol: tradeSol,
      maxOpen: maxOpen,
      askFirst: askFirst,
      realizedPnlSol: realizedPnlSol ?? this.realizedPnlSol,
      approvalMode: approvalMode,
      winRatePct: winRatePct,
      maxDrawdownPct: maxDrawdownPct,
      avgHold: avgHold,
    );
  }
}

enum PositionState { open, closed }

class Position {
  const Position({
    required this.id,
    required this.strategyId,
    required this.symbol,
    required this.mint,
    required this.mode,
    required this.state,
    required this.solIn,
    required this.entryPriceUsd,
    required this.markPriceUsd,
    required this.peakPriceUsd,
    required this.openedAt,
    this.solOut,
    this.closedAt,
    this.exitReason,
  });

  /// `ck.N` style key: coin key + index of the position for that coin.
  final String id;
  final String strategyId;

  /// Untrusted token metadata: display only, never interpreted.
  final String symbol;
  final String mint;
  final TradeMode mode;
  final PositionState state;
  final double solIn;
  final double entryPriceUsd;
  final double markPriceUsd;
  final double peakPriceUsd;
  final DateTime openedAt;
  final double? solOut;
  final DateTime? closedAt;
  final String? exitReason;

  double get changePct => (markPriceUsd / entryPriceUsd - 1) * 100;

  /// PnL in SOL: realized for closed positions, mark-to-market for open.
  double get pnlSol =>
      state == PositionState.closed ? (solOut ?? 0) - solIn : solIn * changePct / 100;

  Position copyWith({
    double? markPriceUsd,
    double? peakPriceUsd,
    PositionState? state,
    double? solOut,
    DateTime? closedAt,
    String? exitReason,
  }) {
    return Position(
      id: id,
      strategyId: strategyId,
      symbol: symbol,
      mint: mint,
      mode: mode,
      state: state ?? this.state,
      solIn: solIn,
      entryPriceUsd: entryPriceUsd,
      markPriceUsd: markPriceUsd ?? this.markPriceUsd,
      peakPriceUsd: peakPriceUsd ?? this.peakPriceUsd,
      openedAt: openedAt,
      solOut: solOut ?? this.solOut,
      closedAt: closedAt ?? this.closedAt,
      exitReason: exitReason ?? this.exitReason,
    );
  }
}

enum ActivityKind { found, passed, armed, expired, blocked, bought, sold, proposal, skipped, approved, paused, resumed }

enum Actor { screener, guard, entry, executor, exit, you, system }

class ActivityEvent {
  const ActivityEvent({
    required this.id,
    required this.at,
    required this.kind,
    required this.actor,
    required this.message,
    this.strategyId,
    this.symbol,
    this.pnlSol,
  });

  /// `<ck>:<epoch ms>:<kind>`; append-only, safe to dedupe on.
  final String id;
  final DateTime at;
  final ActivityKind kind;
  final Actor actor;
  final String message;
  final String? strategyId;
  final String? symbol;
  final double? pnlSol;
}

enum ApprovalKind { buyPick, guardChange, teamAction }

enum PickType { firstBuy, buy, rebuy }

/// SPEC §3 expiry reasons.
enum ExpireReason { timedOut, strategyDeleted, strategyArchived, guardFailedWhileWaiting, priceRanPastLimit }

enum RiskLevel { low, medium, high, critical }

enum ApprovalStatus { pending, approved, skipped, expired }

class Approval {
  const Approval({
    required this.id,
    required this.kind,
    required this.status,
    required this.title,
    required this.detail,
    required this.createdAt,
    required this.expiresAt,
    required this.token,
    this.strategyId,
    this.baseRev,
    this.diff = const {},
    this.amountSol,
    this.mode = TradeMode.practice,
    this.pickType,
    this.expireReason,
    this.riskLevel,
    this.riskImpact = const {},
    this.decidedAt,
  });

  final String id;
  final ApprovalKind kind;
  final ApprovalStatus status;
  final String title;
  final String detail;
  final DateTime createdAt;
  final DateTime expiresAt;

  /// Single-use, server-issued token. Sent back with approve/skip so the
  /// backend can make the decision idempotent and reject replays.
  final String token;
  final String? strategyId;

  /// For setting changes: strategy rev the proposal was built against.
  final int? baseRev;

  /// For setting changes: key -> [old, new].
  final Map<String, List<Object?>> diff;
  final double? amountSol;
  final TradeMode mode;
  final PickType? pickType;
  final ExpireReason? expireReason;
  final RiskLevel? riskLevel;

  /// Replay-based risk estimate for guard changes: label -> display value.
  final Map<String, String> riskImpact;
  final DateTime? decidedAt;

  bool get isPending => status == ApprovalStatus.pending;

  /// SPEC §3: swipe disabled for guard changes and Real SOL.
  bool get swipeable => kind == ApprovalKind.buyPick && mode == TradeMode.practice;

  bool isExpiredAt(DateTime now) => now.isAfter(expiresAt);

  Approval copyWith({ApprovalStatus? status, ExpireReason? expireReason, DateTime? decidedAt}) => Approval(
        id: id,
        kind: kind,
        status: status ?? this.status,
        title: title,
        detail: detail,
        createdAt: createdAt,
        expiresAt: expiresAt,
        token: token,
        strategyId: strategyId,
        baseRev: baseRev,
        diff: diff,
        amountSol: amountSol,
        mode: mode,
        pickType: pickType,
        expireReason: expireReason ?? this.expireReason,
        riskLevel: riskLevel,
        riskImpact: riskImpact,
        decidedAt: decidedAt ?? this.decidedAt,
      );
}

class PnlPoint {
  const PnlPoint(this.at, this.equitySol);
  final DateTime at;
  final double equitySol;
}

class PortfolioSummary {
  const PortfolioSummary({
    required this.mode,
    required this.cashSol,
    required this.startSol,
    required this.realizedPnlSol,
    required this.unrealizedPnlSol,
    required this.openPositions,
    required this.history,
  });

  final TradeMode mode;
  final double cashSol;
  final double startSol;
  final double realizedPnlSol;
  final double unrealizedPnlSol;
  final int openPositions;
  final List<PnlPoint> history;

  double get totalPnlSol => realizedPnlSol + unrealizedPnlSol;
  double get equitySol => startSol + totalPnlSol;
}

/// Thrown when a write is based on an outdated rev or a consumed token.
class ConflictException implements Exception {
  ConflictException(this.message);
  final String message;
  @override
  String toString() => 'ConflictException: $message';
}
