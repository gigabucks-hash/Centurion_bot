import 'package:flutter_test/flutter_test.dart';
import 'package:solbot_mobile/core/push/push_payload.dart';

void main() {
  test('parses a valid approval payload', () {
    final p = ApprovalPush.tryParse({
      'v': '1',
      'type': 'approval',
      'approval_id': 'apv_0012',
      'kind': 'buyPick',
      'mode': 'practice',
      'token': 'tok_abc',
      'exp': '1793260000',
    });
    expect(p, isNotNull);
    expect(p!.route, '/approvals/apv_0012');
    expect(p.inlineActions, [PushAction.skip, PushAction.approve]);
  });

  test('guard change and Real SOL picks never get inline approve', () {
    final g = ApprovalPush.tryParse({
      'v': '1', 'type': 'approval', 'approval_id': 'a', 'kind': 'guardChange', 'mode': 'practice', 'token': 't', 'exp': '1',
    })!;
    expect(g.inlineActions, [PushAction.open]);
    expect(g.route, '/approvals/a/review');
    expect(g.isExpired(DateTime.utc(2026)), isTrue);
    final r = ApprovalPush.tryParse({
      'v': '1', 'type': 'approval', 'approval_id': 'b', 'kind': 'buyPick', 'mode': 'real', 'token': 't', 'exp': '1',
    })!;
    expect(r.inlineActions, [PushAction.open]);
    expect(r.titlePrefix, '[REAL SOL]');
  });

  test('missing mode fails closed', () {
    expect(
        ApprovalPush.tryParse({'v': '1', 'type': 'approval', 'approval_id': 'a', 'kind': 'buyPick', 'token': 't', 'exp': '1'}),
        isNull);
  });

  test('rejects malformed payloads', () {
    expect(ApprovalPush.tryParse({'type': 'approval'}), isNull);
    expect(ApprovalPush.tryParse({'v': '2', 'type': 'approval', 'approval_id': 'a', 'token': 't', 'exp': '1'}), isNull);
  });
}
