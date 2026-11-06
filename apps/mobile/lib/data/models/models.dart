/// Domain models. Wire names (snake_case, contract v1.1) live only in
/// `data/api/` (wire.dart, settings_keys.dart); models are wire-agnostic.
/// Money: [Lamports] (BigInt) and [Decimal] prices, never double.
library;

import '../api/settings_keys.dart';
import '../money.dart';

export '../money.dart';

enum TradeMode { practice, real }

enum StrategyStatus { running, paused, stopped }

/// Contracts 1.1.6 `real_locked_reason`. `null` on the wire while locked → [other] (HANDOFF v2.6).
enum RealLockedReason { needsOwnerApproval, gateNotMet, policy, other }

/// Contracts 1.1.6 `paper_progress`. `*Required == null` = rule not decided yet: show the count + "rule not set",
/// never a ratio or bar for that axis, and never assume a number.
class PaperProgress {
  const PaperProgress({required this.daysDone, required this.tradesDone, this.daysRequired, this.tradesRequired});
  final int daysDone, tradesDone;
  final int? daysRequired, tradesRequired;
  bool get rulesSet => daysRequired != null || tradesRequired != null;
}

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
    required this.ticketLamports,
    required this.maxOpen,
    required this.realizedPnlLamports,
    this.approvalMode = ApprovalMode.askFirstBuy,
    this.winRatePct = 0,
    this.maxDrawdownPct = 0,
    this.avgHold = Duration.zero,
    this.realLocked = true,
    this.realLockedReason = RealLockedReason.needsOwnerApproval,
    this.paperProgress,
  });

  final String id;
  final String name;

  /// Per strategy (contracts 1.1.6). Wire stays `practice|real`; UI says Paper / Real. There is NO mode-switch
  /// endpoint in 1.1.6 (mode is set on create; PATCH takes settings only), so the app shows it read-only.
  final TradeMode mode;

  /// 1.1.6 `real_locked` (always true for now) + reason; Real cannot be chosen while locked.
  final bool realLocked;
  final RealLockedReason? realLockedReason;
  final PaperProgress? paperProgress;
  final StrategyStatus status;

  /// Optimistic version of the settings document. Every mutation must send
  /// the rev it was based on; the backend rejects stale writes.
  final int rev;

  /// Exit preset id (see `SettingsKeys.exitPresets`).
  final String exitPlan;
  final Lamports ticketLamports;
  final int maxOpen;
  final Lamports realizedPnlLamports;
  final ApprovalMode approvalMode;
  final double winRatePct;
  final double maxDrawdownPct;
  final Duration avgHold;

  bool get isRunning => status == StrategyStatus.running;

  /// v1.1 removed `askFirst`; derived from approval mode.
  bool get askFirst => approvalMode != ApprovalMode.off;

  Strategy copyWith({
    StrategyStatus? status,
    int? rev,
    Lamports? realizedPnlLamports,
    String? name,
    String? exitPlan,
    Lamports? ticketLamports,
    int? maxOpen,
    ApprovalMode? approvalMode,
  }) {
    return Strategy(
      id: id,
      name: name ?? this.name,
      mode: mode,
      status: status ?? this.status,
      rev: rev ?? this.rev,
      exitPlan: exitPlan ?? this.exitPlan,
      ticketLamports: ticketLamports ?? this.ticketLamports,
      maxOpen: maxOpen ?? this.maxOpen,
      realizedPnlLamports: realizedPnlLamports ?? this.realizedPnlLamports,
      approvalMode: approvalMode ?? this.approvalMode,
      winRatePct: winRatePct,
      maxDrawdownPct: maxDrawdownPct,
      avgHold: avgHold,
      realLocked: realLocked,
      realLockedReason: realLockedReason,
      paperProgress: paperProgress,
    );
  }
}

enum PositionState { open, closed }

/// One take-profit rung of an exit plan (SPEC §6 ladder).
class TpRung {
  const TpRung({required this.gainPct, required this.sellPct, this.filledAt});
  final double gainPct;

  /// Share of the ORIGINAL size sold at this rung.
  final double sellPct;
  final DateTime? filledAt;
  bool get filled => filledAt != null;
  TpRung fill(DateTime at) => TpRung(gainPct: gainPct, sellPct: sellPct, filledAt: at);
}

/// Exit plan as data (blueprint: "plan sebagai data").
class ExitPlanState {
  const ExitPlanState({
    required this.name,
    required this.stopLossPct,
    required this.trailPct,
    required this.rungs,
    this.trailArmed = false,
    this.timeStopAt,
  });
  final String name;

  /// Negative, relative to entry (e.g. −35).
  final double stopLossPct;

  /// Trailing distance from the high, armed after the first TP.
  final double trailPct;
  final bool trailArmed;
  final List<TpRung> rungs;
  final DateTime? timeStopAt;

  TpRung? get nextRung {
    for (final r in rungs) {
      if (!r.filled) return r;
    }
    return null;
  }

  int get filledCount => rungs.where((r) => r.filled).length;
  double get maxGainPct => rungs.isEmpty ? 100 : rungs.last.gainPct;

  ExitPlanState copyWith({List<TpRung>? rungs, bool? trailArmed}) => ExitPlanState(
    name: name,
    stopLossPct: stopLossPct,
    trailPct: trailPct,
    rungs: rungs ?? this.rungs,
    trailArmed: trailArmed ?? this.trailArmed,
    timeStopAt: timeStopAt,
  );
}

class Position {
  Position({
    required this.id,
    required this.strategyId,
    required this.symbol,
    required this.mint,
    required this.mode,
    required this.state,
    required this.costLamports,
    required this.entryPriceUsd,
    required this.markPriceUsd,
    required this.peakPriceUsd,
    required this.openedAt,
    Lamports? proceedsLamports,
    this.closedAt,
    this.exitReason,
    this.lockedPnlLamports,
    this.lockedPnlPct,
    this.feesLamports,
    this.exitPriceUsd,
    this.holdSeconds,
    this.soldBps = 0,
    this.exitPlan,
    this.feeBps = 125,
    this.rev = 1,
    this.practiceEpoch = 0,
    this.decimals,
    this.tokenProgram,
    this.qtyRaw,
    this.logoUrl,
    this.logoHash,
  }) : proceedsLamports = proceedsLamports ?? Lamports.zero;

  /// Contracts 1.1.6 (not shipped yet; optional): our logo proxy URL, see [CoinLogo].
  final String? logoUrl;

  /// 1.1.6 `logo_hash` (`v` of the proxy URL); null → identicon, no request.
  final String? logoHash;

  /// `ck.N` style key: coin key + index of the position for that coin.
  final String id;
  final String strategyId;

  /// Untrusted token metadata: display only, never interpreted.
  final String symbol;
  final String mint;
  final TradeMode mode;
  final PositionState state;

  /// Original cost (wire `sol_in_lamports`).
  final Lamports costLamports;
  final Decimal entryPriceUsd;
  final Decimal markPriceUsd;
  final Decimal peakPriceUsd;
  final DateTime openedAt;

  /// Cumulative proceeds of all (partial) sells.
  final Lamports proceedsLamports;
  final DateTime? closedAt;
  final String? exitReason;

  /// Closed rows (0022): the server's locked `pnl_lamports` / `pnl_pct`. Null
  /// derives from proceeds − cost (mock/open rows); never re-derive when set.
  final Lamports? lockedPnlLamports;
  final double? lockedPnlPct;

  /// Wire `fees_lamports`: REPORTED context on the closed receipt. The swap fee
  /// is already netted inside `sol_in`/`sol_out`, so it is never subtracted from
  /// PnL again. Null = the row did not carry it → render an em dash.
  final Lamports? feesLamports;

  /// Wire `exit_price_sol` (closed rows): the price the remainder left at.
  final Decimal? exitPriceUsd;

  /// Wire `hold_seconds` (closed rows, contract 1.1.6 / migration 0022): the
  /// server's locked hold. When present it WINS over `closedAt − openedAt`, so a
  /// receipt never depends on the device clock or a rounded timestamp. Null on
  /// open rows and legacy rows → derive from the timestamps.
  final int? holdSeconds;

  /// Share of the original size already sold, in basis points (0–10000).
  final int soldBps;
  final ExitPlanState? exitPlan;
  final int feeBps;

  /// Position `rev` (+1 on every change; `close_position` p_expected_rev / If-Match).
  final int rev;

  /// `practice_epoch` (1.1.2). Rows from an older epoch are dropped after a reset.
  final int practiceEpoch;

  /// Mint decimals from the mint account (1.1.2); null = unknown. NEVER assume 6.
  final int? decimals;

  /// SPL token program id of the mint (`Tokenkeg…` / Token-2022).
  final String? tokenProgram;

  /// Remaining raw token amount (integer string on the wire).
  final BigInt? qtyRaw;

  bool get isOpen => state == PositionState.open;
  double get soldPct => soldBps / 100;
  int get remainingBps => (10000 - soldBps).clamp(0, 10000);

  /// Cost of the remainder, e.g. "0,24 SOL".
  Lamports get sizeLamports => costLamports.bps(remainingBps);

  /// Mark-to-market value of the remainder (exact Decimal ratio, rounded to a lamport).
  Lamports get valueLamports => isOpen ? sizeLamports.times(ratio(markPriceUsd, entryPriceUsd)) : Lamports.zero;
  double get changePct => pctChange(entryPriceUsd, markPriceUsd);
  double get fromPeakPct => -pctChange(peakPriceUsd, markPriceUsd);
  Duration holdAt(DateTime now) {
    final locked = holdSeconds;
    if (locked != null && locked >= 0) return Duration(seconds: locked);
    return (closedAt ?? now).difference(openedAt);
  }

  /// PnL: realized proceeds + mark-to-market of the remainder − cost. A closed
  /// row keeps the server's locked number instead of re-deriving it.
  Lamports get pnlLamports => lockedPnlLamports ?? (proceedsLamports + valueLamports - costLamports);

  /// PnL % of cost basis (display number).
  double get pnlPct => lockedPnlPct ?? pnlLamports.ratioTo(costLamports) * 100;

  /// Estimated SOL received for selling [pct]% of the CURRENT remainder, after fees.
  Lamports estimateSell(int pct) =>
      sizeLamports.bps(pct * 100).times(ratio(markPriceUsd, entryPriceUsd)).bps(10000 - feeBps);

  Position copyWith({
    Decimal? markPriceUsd,
    Decimal? peakPriceUsd,
    PositionState? state,
    Lamports? proceedsLamports,
    DateTime? closedAt,
    String? exitReason,
    Lamports? feesLamports,
    Decimal? exitPriceUsd,
    int? holdSeconds,
    int? soldBps,
    ExitPlanState? exitPlan,
    int? rev,
    BigInt? qtyRaw,
  }) {
    return Position(
      id: id,
      strategyId: strategyId,
      symbol: symbol,
      mint: mint,
      mode: mode,
      state: state ?? this.state,
      costLamports: costLamports,
      entryPriceUsd: entryPriceUsd,
      markPriceUsd: markPriceUsd ?? this.markPriceUsd,
      peakPriceUsd: peakPriceUsd ?? this.peakPriceUsd,
      openedAt: openedAt,
      proceedsLamports: proceedsLamports ?? this.proceedsLamports,
      closedAt: closedAt ?? this.closedAt,
      exitReason: exitReason ?? this.exitReason,
      lockedPnlLamports: lockedPnlLamports,
      lockedPnlPct: lockedPnlPct,
      feesLamports: feesLamports ?? this.feesLamports,
      exitPriceUsd: exitPriceUsd ?? this.exitPriceUsd,
      holdSeconds: holdSeconds ?? this.holdSeconds,
      soldBps: soldBps ?? this.soldBps,
      exitPlan: exitPlan ?? this.exitPlan,
      feeBps: feeBps,
      rev: rev ?? this.rev,
      practiceEpoch: practiceEpoch,
      decimals: decimals,
      tokenProgram: tokenProgram,
      qtyRaw: qtyRaw ?? this.qtyRaw,
      logoUrl: logoUrl,
      logoHash: logoHash,
    );
  }
}

enum EquityRange { d1, d7, d30, all }

/// PnL report range (contracts 0022 `window`): the app's 1D/7D/30D/All choices.
/// The server owns the range numbers; the enum only builds the query.
enum PnlWindow {
  d1('24h'),
  d7('7d'),
  d30('30d'),
  all('all');

  const PnlWindow(this.wire);
  final String wire;
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
    this.pnlLamports,
    this.mint,
    this.logoUrl,
    this.logoHash,
  });

  /// Coin of the event, when it has one (identicon seed; 1.1.6 `logo_url`).
  final String? mint;
  final String? logoUrl;

  /// 1.1.6 `logo_hash` (`v` of the proxy URL); null → identicon, no request.
  final String? logoHash;

  /// `<ck>:<epoch ms>:<kind>`; append-only, safe to dedupe on.
  final String id;
  final DateTime at;
  final ActivityKind kind;
  final Actor actor;
  final String message;
  final String? strategyId;
  final String? symbol;
  final Lamports? pnlLamports;
}

enum ApprovalKind { buyPick, guardChange, teamAction }

enum PickType { firstBuy, buy, rebuy }

/// SPEC §3 expiry reasons.
enum ExpireReason {
  timedOut,
  strategyDeleted,
  strategyArchived,
  guardFailedWhileWaiting,
  priceRanPastLimit,

  /// Contract v1.1 (no UX copy yet → generic expired copy).
  practiceReset,
  accountDeleted,
}

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
    this.amountLamports,
    this.rev = 1,
    this.mode = TradeMode.practice,
    this.pickType,
    this.expireReason,
    this.riskLevel,
    this.riskImpact = const {},
    this.decidedAt,
    this.reasonCode,
    this.quote,
    this.rejectReason,
    this.weakening = false,
    this.symbol,
    this.mint,
    this.logoUrl,
    this.logoHash,
  });

  /// Coin of a buy pick (null for guard/team changes); untrusted, display only.
  final String? symbol;
  final String? mint;

  /// Contracts 1.1.6 (optional) logo proxy URL.
  final String? logoUrl;

  /// 1.1.6 `logo_hash` (`v` of the proxy URL); null → identicon, no request.
  final String? logoHash;

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
  final Lamports? amountLamports;

  /// Approval `rev` (1.1.2 naming; sent as `p_expected_rev` to `decide_approval`).
  final int rev;
  final TradeMode mode;
  final PickType? pickType;
  final ExpireReason? expireReason;
  final RiskLevel? riskLevel;

  /// Replay-based risk estimate for guard changes: label -> display value.
  final Map<String, String> riskImpact;
  final DateTime? decidedAt;

  /// Screener reason code (wire, e.g. `UNSUPPORTED_QUOTE_MINT`), null when tradeable.
  final String? reasonCode;

  /// 1.1.4 quote (`ProposalQuoteFields`); null = none yet.
  final ProposalQuote? quote;

  /// 1.1.3: set only when rejected.
  final RejectReason? rejectReason;

  /// guard_change that loosens a guard (1,200 ms hold; 202 proposal flow).
  final bool weakening;

  bool get isPending => status == ApprovalStatus.pending;

  /// `UNSUPPORTED_QUOTE_MINT` (no SOL quote pair). Apex decision / i18n 0.4.4:
  /// neutral color, Approve off/disabled, excluded from batch approve, but it
  /// CAN be skipped (skipping isn't a trade) with reason `not_tradeable` preselected.
  bool get notTradeable => reasonCode == unsupportedQuoteMint;

  /// Approve possible at all (button, swipe right, notification, batch).
  bool get approvable => !notTradeable;

  /// SPEC §3: swipe disabled for guard changes and Real SOL. A not-tradeable
  /// pick is swipeable LEFT only (skip); swipe right (approve) is a no-op.
  bool get swipeable => kind == ApprovalKind.buyPick && mode == TradeMode.practice;

  /// Skip chip preselected for this item (1.1.3 wire `reject_reason: "not_tradeable"`), else null.
  SkipChip? get defaultSkipChip => notTradeable ? SkipChip.notTradeable : null;

  bool isExpiredAt(DateTime now) => now.isAfter(expiresAt);

  Approval copyWith({
    ApprovalStatus? status,
    ExpireReason? expireReason,
    DateTime? decidedAt,
    int? rev,
    ProposalQuote? quote,
    RejectReason? rejectReason,
  }) => Approval(
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
    amountLamports: amountLamports,
    rev: rev ?? this.rev,
    mode: mode,
    pickType: pickType,
    expireReason: expireReason ?? this.expireReason,
    riskLevel: riskLevel,
    riskImpact: riskImpact,
    decidedAt: decidedAt ?? this.decidedAt,
    reasonCode: reasonCode,
    quote: quote ?? this.quote,
    rejectReason: rejectReason ?? this.rejectReason,
    weakening: weakening,
    symbol: symbol,
    mint: mint,
    logoUrl: logoUrl,
    logoHash: logoHash,
  );
}

/// Wire reason code for coins without a SOL quote pair (screener + `order.failed`).
const unsupportedQuoteMint = 'UNSUPPORTED_QUOTE_MINT';

enum ScreenerOutcome { passed, rejected, notTradeable }

/// One row of the strategy screener ("Coins", WF-20/21).
class ScreenerCoin {
  const ScreenerCoin({
    required this.symbol,
    required this.strategyId,
    required this.score,
    required this.outcome,
    this.reasonCode,
    this.quoteSymbol = 'SOL',
    this.approvalId,
    this.note,
    this.mint,
    this.decimals,
    this.tokenProgram,
    this.quoteMint,
    this.marketCap,
    this.logoUrl,
    this.logoHash,
  });
  final String symbol;
  final String? mint;

  /// Contracts 1.1.6 (optional) logo proxy URL.
  final String? logoUrl;

  /// 1.1.6 `logo_hash` (`v` of the proxy URL); null → identicon, no request.
  final String? logoHash;

  /// 1.1.4 market cap (null = unknown → "—").
  final MarketCap? marketCap;

  /// Coin facts (1.1.2): decimals from the mint account (never assume 6), token program, quote mint.
  final int? decimals;
  final String? tokenProgram;
  final String? quoteMint;
  final String strategyId;

  /// Screener score 0–100.
  final int score;
  final ScreenerOutcome outcome;

  /// Wire reason (e.g. `UNSUPPORTED_QUOTE_MINT`, `GUARD_FAILED`).
  final String? reasonCode;

  /// Quote asset of the coin's pool (`USDC` → not tradeable).
  final String quoteSymbol;

  /// Pending pick in the queue, if the coin passed.
  final String? approvalId;
  final String? note;

  /// No SOL quote pair: never enters the queue, no Approve/Skip anywhere (WF-21).
  bool get notTradeable => outcome == ScreenerOutcome.notTradeable || reasonCode == unsupportedQuoteMint;
}

class PnlPoint {
  const PnlPoint(this.at, this.equityLamports);
  final DateTime at;
  final Lamports equityLamports;
}

class PortfolioSummary {
  const PortfolioSummary({
    required this.mode,
    required this.cashLamports,
    required this.startLamports,
    required this.realizedPnlLamports,
    required this.unrealizedPnlLamports,
    required this.openPositions,
    required this.history,
  });

  final TradeMode mode;
  final Lamports cashLamports;
  final Lamports startLamports;
  final Lamports realizedPnlLamports;
  final Lamports unrealizedPnlLamports;
  final int openPositions;
  final List<PnlPoint> history;

  Lamports get totalPnlLamports => realizedPnlLamports + unrealizedPnlLamports;
  Lamports get equityLamports => startLamports + totalPnlLamports;
}

// Errors: see data/api/api_exception.dart (ApiException, typed by errors.json).

/// Batch approve (`POST /batch-decision`, buy_pick only): not-tradeable picks are
/// left out (i18n 0.4.4 `queue.batch.excluded_not_tradeable`). Returns
/// (approvable picks, number excluded as not tradeable).
({List<Approval> items, int excludedNotTradeable}) batchApprovable(Iterable<Approval> picks) {
  final pending = picks.where((a) => a.isPending && a.kind == ApprovalKind.buyPick).toList();
  final ok = pending.where((a) => a.approvable).toList();
  return (items: ok, excludedNotTradeable: pending.length - ok.length);
}

// ---------------------------------------------------------------- contracts 1.1.3 / 1.1.4

/// 1.1.3 `ApprovalRejectReason` (closed enum, `decision: reject` only, server default `user_declined`).
enum RejectReason {
  userDeclined('user_declined'),
  notTradeable('not_tradeable'),
  priceMoved('price_moved'),
  other('other');

  const RejectReason(this.wire);
  final String wire;
  static RejectReason? fromWire(String? w) => values.where((r) => r.wire == w).firstOrNull;
}

/// Skip chips → wire (`packages/i18n/reject_reasons.map.json`): closed `reject_reason`
/// plus an optional free-text `reason` detail.
enum SkipChip {
  thinLiquidity(RejectReason.userDeclined, 'thin_liquidity'),
  alreadyPumped(RejectReason.userDeclined, 'already_pumped'),
  suspiciousDev(RejectReason.userDeclined, 'suspicious_dev'),
  priceMoved(RejectReason.priceMoved, null),
  other(RejectReason.other, null),
  notTradeable(RejectReason.notTradeable, null);

  const SkipChip(this.rejectReason, this.reasonDetail);
  final RejectReason rejectReason;
  final String? reasonDetail;

  /// Chips offered for a normal pick (not-tradeable picks get [notTradeable] preselected).
  static const userChoices = [thinLiquidity, alreadyPumped, suspiciousDev, priceMoved, other];
}

/// 1.1.4 `MarketCapFields` on coins, picks, `coin.detected`, `screener.scored`, `pick.created`.
/// [lamports]: integer string → [Lamports]; [usd]: decimal string, display-only/indicative.
class MarketCap {
  const MarketCap({this.lamports, this.usd, this.asOf});
  final Lamports? lamports;
  final Decimal? usd;
  final DateTime? asOf;

  bool get isKnown => lamports != null || usd != null;

  static MarketCap? fromJson(Map<String, Object?> j) {
    final m = MarketCap(
      lamports: Lamports.tryParse(j['market_cap_lamports'] as String?),
      usd: Decimal.tryParse('${j['mcap_usd'] ?? ''}'),
      asOf: DateTime.tryParse('${j['mcap_as_of'] ?? ''}'),
    );
    return m.isKnown ? m : null;
  }
}

enum QuoteState { missing, fresh, stale }

/// 1.1.4 `ProposalQuoteFields` (WF-22 review sheet). Integer strings → BigInt/[Lamports],
/// bps → int. Set/refreshed only while pending (`proposal.updated`, rev + 1).
class ProposalQuote {
  const ProposalQuote({
    this.estNetworkFee,
    this.priorityFee,
    this.swapFeeBps,
    this.maxSlippageBps,
    this.minOutRaw,
    this.totalMax,
    this.quoteTs,
    this.quoteExpiresAt,
  });
  final Lamports? estNetworkFee;
  final Lamports? priorityFee;
  final int? swapFeeBps;
  final int? maxSlippageBps;

  /// Minimum tokens out, raw units (use the coin's `decimals`; never assume 6).
  final BigInt? minOutRaw;
  final Lamports? totalMax;
  final DateTime? quoteTs;
  final DateTime? quoteExpiresAt;

  static ProposalQuote? fromJson(Map<String, Object?> j) {
    int? bps(Object? v) => v is num ? v.toInt() : null;
    final q = ProposalQuote(
      estNetworkFee: Lamports.tryParse(j['est_network_fee_lamports'] as String?),
      priorityFee: Lamports.tryParse(j['priority_fee_lamports'] as String?),
      swapFeeBps: bps(j['swap_fee_bps']),
      maxSlippageBps: bps(j['max_slippage_bps']),
      minOutRaw: BigInt.tryParse('${j['min_out_raw'] ?? ''}'),
      totalMax: Lamports.tryParse(j['total_max_lamports'] as String?),
      quoteTs: DateTime.tryParse('${j['quote_ts'] ?? ''}'),
      quoteExpiresAt: DateTime.tryParse('${j['quote_expires_at'] ?? ''}'),
    );
    return q.quoteTs == null && q.quoteExpiresAt == null && q.totalMax == null ? null : q;
  }

  /// Same rule as `approval_quote_check`: fresh while `serverNow < quote_expires_at`.
  QuoteState stateAt(DateTime serverNow) {
    final exp = quoteExpiresAt;
    if (exp == null) return QuoteState.missing;
    return serverNow.isBefore(exp) ? QuoteState.fresh : QuoteState.stale;
  }
}

/// Approve is refused client-side exactly where the server would answer
/// `409 QUOTE_MISSING_OR_STALE`: Real only; Practice is never blocked by a quote.
bool quoteBlocksApprove(Approval a, DateTime serverNow) {
  if (a.mode != TradeMode.real || a.kind != ApprovalKind.buyPick) return false;
  final q = a.quote;
  return q == null || q.stateAt(serverNow) != QuoteState.fresh;
}

/// 1.1.4 time-based exits (strategy settings). Invalid values → null (the server
/// validates too: `SETTINGS_SCHEMA_INVALID`).
class TimeExits {
  const TimeExits({this.timeStopS, this.stallWindowS, this.stallMinMovePct});

  /// `time_stop_s` 1..604800; closes with exit_reason `max_hold`.
  final int? timeStopS;

  /// `stall_exit.window_s` 5..86400 and `min_move_pct` 0.01..100; closes with exit_reason `stall`.
  final int? stallWindowS;
  final double? stallMinMovePct;

  bool get hasStall => stallWindowS != null && stallMinMovePct != null;

  static TimeExits fromSettings(Map<String, Object?> s) {
    final t = s[SettingsKeys.timeStopS.current];
    final timeStop = t is int && t >= 1 && t <= 604800 ? t : null;
    final st = s[SettingsKeys.stallExit.current];
    int? w;
    double? p;
    if (st is Map) {
      final ww = st['window_s'], pp = st['min_move_pct'];
      if (ww is int && ww >= 5 && ww <= 86400 && pp is num && pp >= 0.01 && pp <= 100) {
        w = ww;
        p = pp.toDouble();
      }
    }
    return TimeExits(timeStopS: timeStop, stallWindowS: w, stallMinMovePct: p);
  }

  Map<String, Object?> toPatch() => {
    SettingsKeys.timeStopS.current: timeStopS,
    SettingsKeys.stallExit.current: hasStall ? {'window_s': stallWindowS, 'min_move_pct': stallMinMovePct} : null,
  };
}

/// Contracts 1.1.6 coin logo (pinned 4e0d7f3; API_ENDPOINTS 4.12; docs/COIN_LOGO_CLIENT.md).
///
/// Logos load ONLY through our image proxy `GET /v1/img/coin/{mint}?s={48|64|96|128|192}&v={logo_hash}`
/// (WebP, never SVG; each variant hard-capped at 16 KiB by the proxy; 404 LOGO_NOT_FOUND / 422 LOGO_REJECTED →
/// identicon). Never a token-provided URI (metadata/IPFS/Arweave/third-party CDN).
/// - `logo_hash` null (or malformed) → identicon with no request; no URL is ever guessed without `v`.
/// - The logo host is the API origin by default. `logo_url` is honoured only when it is a proxy URL
///   (`/v1/img/coin/{same mint}`) on the API origin or on an origin in the optional allowlist (Backend's
///   `LOGO_PUBLIC_BASE_URL`); anything else is ignored and the URL is built on the API origin.
abstract final class CoinLogo {
  static const proxyPath = '/v1/img/coin/';

  /// Prototype logo origin: the mock build has no backend, so [CoinAvatar] maps this origin to the
  /// bundled `assets/mock_logo/<logo_hash>.webp` instead of the network. Never used by a real API.
  static const mockOrigin = 'https://logo.mock.invalid';

  /// Proxy sizes the backend accepts (transcode.ts LOGO_SIZES @ d4dcc51; other `s` → 422 VALIDATION_FAILED).
  static const fileSizes = [48, 64, 96, 128, 192];
  static const maxRequestSize = 192;

  /// Session fallback when a size above this is refused (an older proxy without 128/192).
  static const safeSize = 96;

  static final _mint = RegExp(r'^[1-9A-HJ-NP-Za-km-z]{32,44}$');
  static final _hash = RegExp(r'^[A-Za-z0-9_-]{8,64}$');

  static bool isMint(String? s) => s != null && _mint.hasMatch(s);
  static bool isHash(String? s) => s != null && _hash.hasMatch(s);

  /// Reads `logo_url` when present; anything but a non-empty string → null.
  static String? fromJson(Map<String, Object?> j) {
    final v = j['logo_url'];
    return v is String && v.isNotEmpty && v.length <= 2048 ? v : null;
  }

  /// Reads `logo_hash`; null when absent or malformed.
  static String? hashFromJson(Map<String, Object?> j) {
    final v = j['logo_hash'];
    return v is String && isHash(v) ? v : null;
  }

  /// s = smallest proxy size ≥ ceil(px × dpr), capped at [maxRequestSize] (or [cap]).
  /// Also the decode size: `cacheWidth` = `cacheHeight` = s.
  static int requestSize(double px, double dpr, {int cap = maxRequestSize}) {
    final want = (px * dpr).ceil();
    final s = fileSizes.firstWhere((s) => s >= want, orElse: () => fileSizes.last);
    return s > cap ? cap : s;
  }

  /// https, or http only for a loopback dev API; host required; no userinfo.
  static bool _okBase(Uri u) =>
      u.host.isNotEmpty &&
      u.userInfo.isEmpty &&
      (u.scheme == 'https' || (u.scheme == 'http' && (u.host == 'localhost' || u.host == '127.0.0.1')));

  static Uri? _abs(String? raw, Uri apiBase) {
    if (raw == null || raw.isEmpty || !raw.startsWith(RegExp(r'https?://|/'))) return null;
    if (raw.startsWith('//')) return null;
    final u = Uri.tryParse(raw);
    if (u == null) return null;
    final abs = u.hasScheme ? u : apiBase.resolveUri(u);
    return _okBase(abs) && !abs.hasFragment ? abs : null;
  }

  /// True when [raw] (absolute or API-relative) is our proxy URL for [mint] on the API origin or an allowed one.
  static bool isProxyUrl(
    String? raw, {
    required Uri apiBase,
    required String mint,
    Set<String> allowedOrigins = const {},
  }) {
    final abs = _abs(raw, apiBase);
    if (abs == null) return false;
    final originOk = abs.origin == apiBase.origin || allowedOrigins.contains(abs.origin);
    return originOk && abs.path == '$proxyPath$mint';
  }

  /// The proxy URL to load, or null (→ identicon without a request). Origin = the `logo_url` origin when it is an
  /// allowed proxy URL, else the API origin; query is always rebuilt (`s`, and `v` = logo_hash, which wins over a
  /// stale `v` in logo_url: a new hash is a new URL, so the old cache is not reused).
  static Uri? proxyUri({
    required Uri? apiBase,
    required String? mint,
    required String? logoHash,
    required int size,
    String? logoUrl,
    Set<String> allowedOrigins = const {},
  }) {
    if (apiBase == null || !_okBase(apiBase) || !isMint(mint) || !isHash(logoHash)) return null;
    final origin = isProxyUrl(logoUrl, apiBase: apiBase, mint: mint!, allowedOrigins: allowedOrigins)
        ? _abs(logoUrl, apiBase)!
        : apiBase;
    return Uri(
      scheme: origin.scheme,
      host: origin.host,
      port: origin.hasPort ? origin.port : null,
      path: '$proxyPath$mint',
      queryParameters: {'s': '$size', 'v': logoHash!},
    );
  }
}
