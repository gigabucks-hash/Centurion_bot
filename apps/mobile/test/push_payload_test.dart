import 'package:flutter_test/flutter_test.dart';
import 'dart:convert';

import 'package:solbot_mobile/core/notifications/notification_catalog.dart';
import 'package:solbot_mobile/core/notifications/notification_renderer.dart';
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

  group('PushPayload v1 (contract v1.1, EVENTS_SCHEMA §6)', () {
    Map<String, Object?> canonical({String mode = 'practice', List<String> actions = const ['approve', 'skip', 'open']}) => {
          'v': 1,
          'event': 'N-01',
          'type': 'proposal.created',
          'mode': mode,
          'workspace_id': 'ws1',
          'seq': 18301,
          'deep_link': 'sentra://approvals/apv1',
          'approval_id': 'apv1',
          'token': 'apt_Q2x',
          'exp': '2026-10-29T08:52:00.000Z',
          'actions': actions,
          'vars': {'coin': 'EXM', 'strategy': 'Yumi · AMM', 'sol': '0.25', 'mm_ss': '09:58'},
          'server_now': '2026-10-29T08:42:00.151Z',
        };

    test('canonical JSON: numeric v/seq, nested vars, ISO exp, server_now, actions, deep_link', () {
      final p = PushMessage.tryParse(canonical())!;
      expect(p.seq, 18301);
      expect(p.workspaceId, 'ws1');
      expect(p.deepLink, 'sentra://approvals/apv1');
      expect(p.type, 'proposal.created');
      expect(p.expiresAt, DateTime.utc(2026, 10, 29, 8, 52));
      expect(p.serverNow, DateTime.utc(2026, 10, 29, 8, 42, 0, 151));
      expect(p.serverActions, {'approve', 'skip', 'open'});
      expect(p.vars['coin'], 'EXM');
      expect(p.token, 'apt_Q2x');
    });

    test('FCM data form (all strings, JSON-encoded actions/vars) parses identically', () {
      final c = canonical();
      final fcm = <String, Object?>{
        for (final e in c.entries) e.key: e.value is String ? e.value : jsonEncode(e.value),
      };
      fcm['v'] = '1';
      fcm['seq'] = '18301';
      final p = PushMessage.tryParse(fcm)!;
      expect(p.seq, 18301);
      expect(p.serverActions, {'approve', 'skip', 'open'});
      expect(p.vars['sol'], '0.25');
    });

    test('Real: token dropped even if present, no buttons; client narrows server actions', () {
      final r = PushMessage.tryParse(canonical(mode: 'real', actions: ['open']))!;
      expect(r.token, isNull);
      const renderer = NotificationRenderer();
      final at = DateTime.utc(2026, 10, 29, 8, 43);
      expect(renderer.actionsFor(r, at), isEmpty);
      final onlyOpen = PushMessage.tryParse(canonical(actions: ['open']))!;
      expect(renderer.actionsFor(onlyOpen, at), isEmpty, reason: 'server offered no approve/skip');
      final full = PushMessage.tryParse(canonical())!;
      expect(renderer.actionsFor(full, at), [NotifAction.approve, NotifAction.skip]);
    });

    test('renderer: lamport-exact sol, client-side countdown (vars.mm_ss ignored)', () {
      final p = PushMessage.tryParse(canonical())!;
      final r = const NotificationRenderer().render(p, NotifLocale.en, DateTime.utc(2026, 10, 29, 8, 50));
      expect(r.title, contains(r'$EXM'));
      expect(r.body, contains('0.25\u00A0paper SOL'));
      expect(r.body, contains('02:00'));
      expect(r.body, isNot(contains('09:58')));
    });

    test('expire_reason uses wire values', () {
      PushMessage m(String reason) => PushMessage.tryParse(
          {'v': 1, 'event': 'N-07', 'mode': 'practice', 'approval_id': 'a', 'expire_reason': reason})!;
      expect(NotificationRenderer.copyKeyFor(m('timeout')), 'N-07a');
      expect(NotificationRenderer.copyKeyFor(m('price_moved')), 'N-07d');
      expect(NotificationRenderer.copyKeyFor(m('strategy_archived')), 'N-07e');
      expect(NotificationRenderer.copyKeyFor(m('practice_reset')), 'N-07a');
    });
  });
}
