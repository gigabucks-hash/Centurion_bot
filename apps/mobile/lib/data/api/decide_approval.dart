/// `decide_approval` RPC, contracts 1.1.2 (FLUTTER_INTEGRATION_ANSWERS §2):
/// `supabase.rpc('decide_approval', {p_approval_id, p_token, p_decision,
/// p_expected_rev, p_idempotency_key?})` → `{proposal_id, status, rev,
/// replayed, server_now}`. Actor/channel come from the JWT (`auth.uid()` +
/// `sentra_client` claim): no `p_client`/`p_actor`/`p_via`. `p_expected_rev`
/// is REQUIRED on every channel, push included (push `version` = approval rev).
library;

import '../models/models.dart';
import 'wire.dart';

class DecideApprovalRequest {
  const DecideApprovalRequest({
    required this.approvalId,
    required this.token,
    required this.approve,
    required this.expectedRev,
    this.idempotencyKey,
    this.reason,
  });
  final String approvalId;
  final String token;
  final bool approve;

  /// The approval `rev` (never null; a missing rev is `428 PRECONDITION_REQUIRED`).
  final int expectedRev;
  final String? idempotencyKey;

  /// Skip reason (wire value, e.g. `not_tradeable`). REST body `reason` only:
  /// the `decide_approval` RPC (1.1.2, migration 0005) has no `p_reason`, so it
  /// is NOT sent as an RPC param (reported to Backend).
  final String? reason;

  /// REST `POST …/approvals/{id}/decision` body (If-Match carries the rev).
  Map<String, Object?> toRestBody() => {'decision': Wire.decision(approve: approve), 'token': token, 'reason': reason};

  Map<String, Object?> toRpcParams() => {
    'p_approval_id': approvalId,
    'p_token': token,
    'p_decision': Wire.decision(approve: approve),
    'p_expected_rev': expectedRev,
    'p_idempotency_key': ?idempotencyKey,
  };
}

class DecideApprovalResult {
  const DecideApprovalResult({
    required this.proposalId,
    required this.status,
    required this.rev,
    required this.replayed,
    required this.serverNow,
  });
  final String proposalId;

  /// Domain status (`rejected` on the wire → [ApprovalStatus.skipped]).
  final ApprovalStatus status;
  final int rev;
  final bool replayed;
  final DateTime serverNow;

  static DecideApprovalResult fromJson(Map<String, Object?> j) {
    final status = Wire.approvalStatusOf(j['status'] as String?);
    if (status == null) throw FormatException('unknown approval status ${j['status']}');
    return DecideApprovalResult(
      proposalId: j['proposal_id']! as String,
      status: status,
      rev: Wire.intOf(j['rev'])!,
      replayed: j['replayed'] as bool? ?? false,
      serverNow: DateTime.parse(j['server_now']! as String),
    );
  }

  Map<String, Object?> toJson() => {
    'proposal_id': proposalId,
    'status': Wire.approvalStatus(status),
    'rev': rev,
    'replayed': replayed,
    'server_now': serverNow.toUtc().toIso8601String(),
  };
}
