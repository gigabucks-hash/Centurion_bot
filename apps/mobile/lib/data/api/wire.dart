/// Wire ↔ domain enum mapping (contract v1.1, snake_case). The only place
/// that knows wire spellings of statuses/kinds/modes.
library;

import '../models/models.dart';

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

  /// `decided_via` / JWT claim `sentra_client`: web | mobile | desktop | mcp | push.
  /// Never sent as an RPC param (1.1.2: actor/channel come from the JWT).
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
}
