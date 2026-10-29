/// REST `PATCH /workspaces/{ws}/strategies/{id}` outcome (contracts 1.1.4). A patch
/// that loosens any guard is NOT applied: `202 {data: {proposal, guard_change}}`
/// creates a guard_change approval (24 h, `base_rev`). The UI must show it as
/// "waiting for approval" (i18n `guard.weaken.pending.*`, tone pending), never as
/// success. The RPC `update_strategy` keeps refusing weakening with
/// `409 GUARD_WEAKEN_REQUIRES_APPROVAL`, so weakening edits go through REST.
library;

import '../models/models.dart';

sealed class StrategyPatchOutcome {
  const StrategyPatchOutcome();
}

/// 200: applied, `rev + 1`.
class StrategyPatchApplied extends StrategyPatchOutcome {
  const StrategyPatchApplied(this.strategy);
  final Strategy strategy;
}

/// 202: proposal created, nothing applied.
class StrategyPatchPendingApproval extends StrategyPatchOutcome {
  const StrategyPatchPendingApproval({
    required this.proposal,
    required this.guardChangeId,
    required this.weakenedFields,
  });
  final Approval proposal;
  final String guardChangeId;
  final List<String> weakenedFields;
  DateTime get expiresAt => proposal.expiresAt;
}
