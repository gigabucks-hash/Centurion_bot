/// `decide_approval` RPC contract (FLUTTER_INTEGRATION_ANSWERS §2, API §4.5):
/// `supabase.rpc('decide_approval', {p_approval_id, p_token, p_decision,
/// p_expected_rev, p_client, p_idempotency_key})` →
/// `{proposal_id, status, version, replayed, server_now}`; errors are
/// SQLSTATE P04xx with MESSAGE = errors.json code ([ApiException]).
library;

import '../models/models.dart';
import 'wire.dart';

class DecideApprovalRequest {
  const DecideApprovalRequest({
    required this.approvalId,
    required this.token,
    required this.approve,
    this.expectedRev,
    this.client = Wire.clientMobile,
    this.idempotencyKey,
  });
  final String approvalId;
  final String token;
  final bool approve;

  /// The approval's `version`.
  final int? expectedRev;
  final String client;
  final String? idempotencyKey;

  Map<String, Object?> toRpcParams() => {
        'p_approval_id': approvalId,
        'p_token': token,
        'p_decision': Wire.decision(approve: approve),
        'p_expected_rev': expectedRev,
        'p_client': client,
        'p_idempotency_key': idempotencyKey,
      };
}

class DecideApprovalResult {
  const DecideApprovalResult({
    required this.proposalId,
    required this.status,
    required this.version,
    required this.replayed,
    required this.serverNow,
  });
  final String proposalId;

  /// Domain status (`rejected` on the wire → [ApprovalStatus.skipped]).
  final ApprovalStatus status;
  final int version;
  final bool replayed;
  final DateTime serverNow;

  static DecideApprovalResult fromJson(Map<String, Object?> j) {
    final status = Wire.approvalStatusOf(j['status'] as String?);
    if (status == null) throw FormatException('unknown approval status ${j['status']}');
    return DecideApprovalResult(
      proposalId: j['proposal_id']! as String,
      status: status,
      version: (j['version']! as num).toInt(),
      replayed: j['replayed'] as bool? ?? false,
      serverNow: DateTime.parse(j['server_now']! as String),
    );
  }

  Map<String, Object?> toJson() => {
        'proposal_id': proposalId,
        'status': Wire.approvalStatus(status),
        'version': version,
        'replayed': replayed,
        'server_now': serverNow.toUtc().toIso8601String(),
      };
}
