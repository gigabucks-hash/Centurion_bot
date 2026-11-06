/// Wire ↔ domain enum mapping (contract v1.1, snake_case). The only place
/// that knows wire spellings of statuses/kinds/modes.
library;

import '../models/models.dart';
import 'cursor_page.dart';

abstract final class Wire {
  static String mode(TradeMode m) => m == TradeMode.real ? 'real' : 'practice';
  static TradeMode? modeOf(String? w) => switch (w) {
    'practice' => TradeMode.practice,
    'real' => TradeMode.real,
    _ => null, // fail closed (paper/live are NOT accepted)
  };

  /// UI keeps "Skip"; the wire says `rejected`.
  static String approvalStatus(ApprovalStatus s) => switch (s) {
    ApprovalStatus.pending => 'pending',
    ApprovalStatus.approved => 'approved',
    ApprovalStatus.skipped => 'rejected',
    ApprovalStatus.expired => 'expired',
  };
  static ApprovalStatus? approvalStatusOf(String? w) => switch (w) {
    'pending' => ApprovalStatus.pending,
    'approved' => ApprovalStatus.approved,
    'rejected' => ApprovalStatus.skipped,
    'expired' => ApprovalStatus.expired,
    _ => null,
  };

  /// `p_decision`: approve | reject.
  static String decision({required bool approve}) => approve ? 'approve' : 'reject';

  static String approvalKind(ApprovalKind k) => switch (k) {
    ApprovalKind.buyPick => 'buy_pick',
    ApprovalKind.guardChange => 'guard_change',
    ApprovalKind.teamAction => 'team_action',
  };
  static ApprovalKind? approvalKindOf(String? w) => ApprovalKind.values.where((k) => approvalKind(k) == w).firstOrNull;

  static String expireReason(ExpireReason r) => switch (r) {
    ExpireReason.timedOut => 'timeout',
    ExpireReason.strategyDeleted => 'strategy_deleted',
    ExpireReason.strategyArchived => 'strategy_archived',
    ExpireReason.guardFailedWhileWaiting => 'guard_failed',
    ExpireReason.priceRanPastLimit => 'price_moved',
    ExpireReason.practiceReset => 'practice_reset',
    ExpireReason.accountDeleted => 'account_deleted',
  };

  /// Wire values only (v1.1). Unknown → null (generic expired copy).
  static ExpireReason? expireReasonOf(String? w) => ExpireReason.values.where((r) => expireReason(r) == w).firstOrNull;

  static String approvalMode(ApprovalMode m) => switch (m) {
    ApprovalMode.off => 'off',
    ApprovalMode.askFirstBuy => 'ask_first_buy',
    ApprovalMode.askEveryBuy => 'ask_every_buy',
  };
  static ApprovalMode? approvalModeOf(String? w) => ApprovalMode.values.where((m) => approvalMode(m) == w).firstOrNull;

  /// `decided_via` / JWT claim `centurion_client`: web | mobile | desktop | mcp | push.
  /// Never sent as an RPC param (1.1.2: actor/channel come from the JWT).
  /// 1.1.6 strategy read: `real_locked_reason`. Unknown or null while locked → other.
  static RealLockedReason? realLockedReasonOf(Object? w, {required bool locked}) => !locked
      ? null
      : switch (w) {
          'needs_owner_approval' => RealLockedReason.needsOwnerApproval,
          'gate_not_met' => RealLockedReason.gateNotMet,
          'policy' => RealLockedReason.policy,
          _ => RealLockedReason.other,
        };

  /// 1.1.6 `paper_progress {days_done, days_required|null, trades_done, trades_required|null}`.
  static PaperProgress? paperProgressOf(Object? w) => w is Map
      ? PaperProgress(
          daysDone: intOf(w['days_done']) ?? 0,
          daysRequired: intOf(w['days_required']),
          tradesDone: intOf(w['trades_done']) ?? 0,
          tradesRequired: intOf(w['trades_required']),
        )
      : null;

  static const clientMobile = 'mobile';
  static const clientPush = 'push';

  /// Small integer (rev, count, bps) from a JSON number OR a base-10 string
  /// (FCM data values are all strings in 1.1.2). Null/invalid → null.
  static int? intOf(Object? v) => switch (v) {
    final num n => n.toInt(),
    final String s => int.tryParse(s.trim()),
    _ => null,
  };

  /// int64 `seq` / ids: integer STRING on the wire (a JSON number is accepted).
  /// Compare as BigInt, never lexicographically ("10" > "9").
  static BigInt? seqOf(Object? v) => switch (v) {
    final int n => BigInt.from(n),
    final num n => BigInt.from(n.toInt()),
    final String s => BigInt.tryParse(s.trim()),
    _ => null,
  };

  /// int64 id as its canonical string (`"18301"`), from string or number.
  static String? idOf(Object? v) => seqOf(v)?.toString();

  // ---- REST: `GET /v1/workspaces/{ws}/positions` (PositionWire, contracts 1.1.6 + 0022) ----

  /// Strict `PositionWire` → [Position] mapping. Required money/time fields that
  /// are missing or malformed throw [FormatException] (the caller turns that into
  /// an `ApiException`-shaped error) instead of rendering an invented number.
  ///
  /// Mapping notes:
  /// - `cost_basis_lamports` is what is LEFT after partial sells; `sol_in_lamports`
  ///   is the original cost. [Position.costLamports] keeps the original (as the
  ///   rest of the app expects) and `soldBps` is (in − basis)/in.
  /// - `pnl_lamports` / `pnl_pct` are the server's locked realized values; they
  ///   are only set on closed rows (null while open).
  /// - `hold_seconds` is the server's hold; [Position.holdAt] uses it when set.
  /// - `PositionWire` carries no `symbol` and no mark price. v1 falls back to the
  ///   short mint (honest, per docs/design/receipt-and-discovery.md A10) and uses
  ///   the entry price as the mark until a marks/portfolio snapshot arrives.
  /// - `avg_entry_price_sol` / `exit_price_sol` are SOL prices; the model fields
  ///   keep their historical `…Usd` names (they have always held SOL).
  static Position positionOf(Map<String, Object?> j) {
    final id = _str(j['id']);
    final mint = _str(j['mint']);
    if (id == null || mint == null) {
      throw const FormatException('PositionWire: id and mint are required');
    }
    final mode = modeOf(_str(j['mode']));
    if (mode == null) {
      throw FormatException('PositionWire: unknown mode ${j['mode']}');
    }
    final state = switch (_str(j['status'])) {
      'open' => PositionState.open,
      'closed' => PositionState.closed,
      final s => throw FormatException('PositionWire: unknown status $s'),
    };
    final solIn = _lamports(j['sol_in_lamports']);
    if (solIn == null) {
      throw const FormatException('PositionWire: sol_in_lamports is required');
    }
    final basis = _lamports(j['cost_basis_lamports']);
    final openedAt = _time(j['opened_at']);
    if (openedAt == null) {
      throw const FormatException('PositionWire: opened_at is required');
    }
    final entry = _decimal(j['avg_entry_price_sol']);
    final peak = _decimal(j['peak_price_sol']);
    // No mark on PositionWire: the entry price is the neutral placeholder until a
    // marks message replaces it; a closed row never shows change/peak anyway.
    final mark = entry ?? peak ?? Decimal.zero;
    final closed = state == PositionState.closed;

    return Position(
      id: id,
      // PositionWire allows a null strategy_id; the model keeps a non-null String,
      // so '' is the "unknown bot" sentinel — the UI must render `—`, never the id.
      strategyId: _str(j['strategy_id']) ?? '',
      symbol: _symbolOf(j, mint),
      mint: mint,
      mode: mode,
      state: state,
      costLamports: solIn,
      entryPriceUsd: entry ?? Decimal.zero,
      markPriceUsd: mark,
      peakPriceUsd: peak ?? mark,
      openedAt: openedAt,
      proceedsLamports: _lamports(j['sol_out_lamports']) ?? Lamports.zero,
      closedAt: _time(j['closed_at']),
      exitReason: _str(j['exit_reason']),
      lockedPnlLamports: closed ? _lamports(j['pnl_lamports']) : null,
      lockedPnlPct: closed ? _double(j['pnl_pct']) : null,
      feesLamports: _lamports(j['fees_lamports']),
      exitPriceUsd: _decimal(j['exit_price_sol']),
      holdSeconds: closed ? intOf(j['hold_seconds']) : null,
      soldBps: _soldBps(solIn, basis),
      rev: intOf(j['rev']) ?? 1,
      practiceEpoch: intOf(j['practice_epoch']) ?? 0,
      decimals: intOf(j['decimals']),
      tokenProgram: _str(j['token_program']),
      qtyRaw: seqOf(j['qty_raw']),
      logoUrl: CoinLogo.fromJson(j),
      logoHash: CoinLogo.hashFromJson(j),
    );
  }

  /// `{items: [PositionWire], next_cursor}` list envelope of
  /// `GET /v1/workspaces/{ws}/positions` (server `pageOf` in wire.ts; the single
  /// position GET is `{data: wire}` and uses [positionOf] on its `data`).
  static CursorPage<Position> positionPageOf(Map<String, Object?> j) {
    final raw = (j['items'] as List?) ?? const [];
    return CursorPage(
      items: [
        for (final r in raw)
          if (r is Map) positionOf(r.cast<String, Object?>()),
      ],
      nextCursor: _str(j['next_cursor']),
    );
  }

  /// Items already sold: 1 − remaining basis / original cost, in bps.
  static int _soldBps(Lamports solIn, Lamports? basis) {
    final inRaw = solIn.raw;
    if (inRaw <= BigInt.zero || basis == null) return 0;
    final sold = (inRaw - basis.raw) * BigInt.from(10000) ~/ inRaw;
    return sold.toInt().clamp(0, 10000).toInt();
  }

  /// Optional symbol from an additive 1.1.7 / demo `symbol` or `untrusted.symbol`
  /// (never trusted for logic); otherwise the short mint, since `PositionWire`
  /// does not carry one.
  static String _symbolOf(Map<String, Object?> j, String mint) {
    final untrusted = j['untrusted'];
    final candidate = _str(j['symbol']) ?? (untrusted is Map ? _str(untrusted['symbol']) : null);
    if (candidate != null && candidate.length <= 16) return candidate;
    return mint.length <= 10 ? mint : '${mint.substring(0, 4)}…${mint.substring(mint.length - 4)}';
  }

  static String? _str(Object? v) => v is String && v.trim().isNotEmpty ? v.trim() : null;

  static Lamports? _lamports(Object? v) {
    final b = seqOf(v);
    return b == null ? null : Lamports(b);
  }

  static Decimal? _decimal(Object? v) => v is String ? Decimal.tryParse(v.trim()) : null;

  static double? _double(Object? v) => switch (v) {
    final num n => n.toDouble(),
    final String s => double.tryParse(s.trim()),
    _ => null,
  };

  static DateTime? _time(Object? v) {
    if (v is! String) return null;
    return DateTime.tryParse(v);
  }
}
