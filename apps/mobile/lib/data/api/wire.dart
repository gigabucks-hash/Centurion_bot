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

  /// `p_client` / `decided_via`: web | mobile | desktop | mcp | push.
  static const clientMobile = 'mobile';
  static const clientPush = 'push';
}
