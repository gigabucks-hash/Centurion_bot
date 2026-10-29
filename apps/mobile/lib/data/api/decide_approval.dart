/// `decide_approval` RPC, contracts 1.1.4 (FLUTTER_INTEGRATION_ANSWERS §2):
/// `supabase.rpc('decide_approval', {p_approval_id, p_token, p_decision,
/// p_expected_rev, p_idempotency_key?, p_reject_reason?, p_hold_ms?})` →
/// `{proposal_id, status, rev, reject_reason, replayed, server_now}`. Actor/channel come from the JWT (`auth.uid()` +
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
    this.rejectReason,
    this.reasonDetail,
    this.holdMs,
  }) : assert(rejectReason == null || !approve, 'reject_reason only with decision=reject'),
       assert(holdMs == null || approve, 'hold proof only with decision=approve');
  final String approvalId;
  final String token;
  final bool approve;

  /// The approval `rev` (never null; a missing rev is `428 PRECONDITION_REQUIRED`).
  final int expectedRev;
  final String? idempotencyKey;

  /// 1.1.3 closed enum, reject only (server default `user_declined`; unknown → 422).
  final RejectReason? rejectReason;

  /// Free-text detail (REST `reason`, e.g. a skip chip id). The RPC has no
  /// `p_reason`, so over RPC only [rejectReason] travels (gap reported).
  final String? reasonDetail;

  /// 1.1.4 guard-weakening approve: press-and-hold duration (>= 1200 ms) →
  /// REST `confirmation.hold_duration_ms` / RPC `p_hold_ms`.
  final int? holdMs;

  /// REST `POST …/approvals/{id}/decision` body (If-Match carries the rev).
  Map<String, Object?> toRestBody() => {
    'decision': Wire.decision(approve: approve),
    'token': token,
    'expected_rev': expectedRev,
    'reason': ?reasonDetail,
    if (!approve && rejectReason != null) 'reject_reason': rejectReason!.wire,
    if (approve && holdMs != null) 'confirmation': {'hold_duration_ms': holdMs},
  };

  Map<String, Object?> toRpcParams() => {
    'p_approval_id': approvalId,
    'p_token': token,
    'p_decision': Wire.decision(approve: approve),
    'p_expected_rev': expectedRev,
    'p_idempotency_key': ?idempotencyKey,
    if (!approve && rejectReason != null) 'p_reject_reason': rejectReason!.wire,
    if (approve && holdMs != null) 'p_hold_ms': holdMs,
  };
}

class DecideApprovalResult {
  const DecideApprovalResult({
    required this.proposalId,
    required this.status,
    required this.rev,
    required this.replayed,
    required this.serverNow,
    this.rejectReason,
  });
  final String proposalId;

  /// 1.1.3: echoed on reject, null on approve.
  final RejectReason? rejectReason;

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
      rejectReason: RejectReason.fromWire(j['reject_reason'] as String?),
    );
  }

  Map<String, Object?> toJson() => {
    'proposal_id': proposalId,
    'status': Wire.approvalStatus(status),
    'rev': rev,
    'reject_reason': rejectReason?.wire,
    'replayed': replayed,
    'server_now': serverNow.toUtc().toIso8601String(),
  };
}
