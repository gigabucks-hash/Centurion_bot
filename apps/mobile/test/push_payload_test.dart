import 'package:flutter_test/flutter_test.dart';
import 'package:solbot_mobile/core/notifications/notification_catalog.dart';
import 'package:solbot_mobile/core/push/push_payload.dart';

void main() {
  test('parses a valid N-01 Practice pick payload', () {
    final p = PushMessage.tryParse({
      'v': '1',
      'event': 'N-01',
      'approval_id': 'apv_0012',
      'mode': 'practice',
      'token': 'tok_abc',
      'exp': '1793260000',
      'coin': r'$KEPL',
      'sol': '0.25',
    });
    expect(p, isNotNull);
    expect(p!.event, NotifEvent.n01PickPending);
    expect(p.route, '/approvals/apv_0012');
    expect(p.vars, {'coin': r'$KEPL', 'sol': '0.25'});
    expect(p.tokenValidAt(DateTime.utc(2026, 10, 29)), isTrue);
    expect(p.tokenValidAt(DateTime.utc(2027, 1, 1)), isFalse);
  });

  test('routes: guard review, positions, modeless banner', () {
    final g = PushMessage.tryParse({'v': '1', 'event': 'N-10', 'mode': 'real', 'approval_id': 'a'})!;
    expect(g.route, '/approvals/a/review');
    final tp = PushMessage.tryParse({'v': '1', 'event': 'N-08', 'mode': 'practice', 'position_id': 'ck1.0'})!;
    expect(tp.route, '/positions/ck1.0');
    final err = PushMessage.tryParse({'v': '1', 'event': 'N-16'})!;
    expect(err.mode, isNull);
    expect(err.route, isNull);
  });

  test('missing or unknown mode fails closed for mode-bound events', () {
    expect(PushMessage.tryParse({'v': '1', 'event': 'N-01', 'approval_id': 'a', 'token': 't', 'exp': '1'}), isNull);
    expect(PushMessage.tryParse({'v': '1', 'event': 'N-01', 'mode': 'REAL', 'approval_id': 'a'}), isNull);
    // Real-only events refuse a Practice mode.
    expect(PushMessage.tryParse({'v': '1', 'event': 'N-11', 'mode': 'practice'}), isNull);
  });

  test('rejects malformed payloads', () {
    expect(PushMessage.tryParse({'event': 'N-01'}), isNull);
    expect(PushMessage.tryParse({'v': '2', 'event': 'N-01', 'mode': 'practice', 'approval_id': 'a'}), isNull);
    expect(PushMessage.tryParse({'v': '1', 'event': 'N-99', 'mode': 'practice'}), isNull);
    // A pick without approval id cannot be acted on.
    expect(PushMessage.tryParse({'v': '1', 'event': 'N-02', 'mode': 'practice'}), isNull);
  });
}
