/// Contract for push notification data payloads (FCM `data` block; APNs via
/// FCM). Kept pure-Dart so it is unit-testable and shared with the backend
/// spec. Example payload:
/// {"v":"1","type":"approval","approval_id":"apv_0012","kind":"buyPick",
///  "mode":"practice","token":"tok_…","exp":"1793260000"}
library;

enum PushAction { open, approve, skip }

class ApprovalPush {
  const ApprovalPush({
    required this.approvalId,
    required this.kind,
    required this.mode,
    required this.token,
    required this.expiresAt,
  });

  final String approvalId;
  final String kind;
  final String mode;
  final String token;
  final DateTime expiresAt;

  /// Deep link handled by go_router (also used for `solbot://approvals/<id>`).
  String get route => kind == 'guardChange'
      ? '/approvals/${Uri.encodeComponent(approvalId)}/review'
      : '/approvals/${Uri.encodeComponent(approvalId)}';

  /// SPEC §3: inline notification actions only for Practice picks.
  /// Real SOL and guard changes always open the app (+ biometric).
  List<PushAction> get inlineActions => kind == 'buyPick' && mode == 'practice'
      ? const [PushAction.skip, PushAction.approve]
      : const [PushAction.open];

  /// Notification title prefix, mirrors the desktop rule `[PRACTICE]`/`[REAL SOL]`.
  String get titlePrefix => mode == 'real' ? '[REAL SOL]' : '[PRACTICE]';

  static ApprovalPush? tryParse(Map<String, dynamic> data) {
    if (data['v'] != '1' || data['type'] != 'approval') return null;
    final id = data['approval_id'];
    final token = data['token'];
    final exp = int.tryParse('${data['exp']}');
    final mode = data['mode'];
    if (id is! String || token is! String || exp == null || id.isEmpty) return null;
    if (mode != 'practice' && mode != 'real') return null; // fail closed
    return ApprovalPush(
      approvalId: id,
      kind: '${data['kind'] ?? 'unknown'}',
      mode: mode as String,
      token: token,
      expiresAt: DateTime.fromMillisecondsSinceEpoch(exp * 1000, isUtc: true),
    );
  }

  bool isExpired(DateTime now) => now.toUtc().isAfter(expiresAt);
}
