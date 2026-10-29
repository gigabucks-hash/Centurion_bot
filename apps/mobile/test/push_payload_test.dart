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
      'symbol': 'KEPL',
      'amount_lamports': '250000000',
    });
    expect(p, isNotNull);
    expect(p!.event, NotifEvent.n01PickPending);
    expect(p.route, '/approvals/apv_0012');
    expect(p.vars, {'symbol': 'KEPL', 'amount_lamports': '250000000'});
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

  group('PushPayload v1 (contracts 1.1.2, FLUTTER_INTEGRATION_ANSWERS §9)', () {
    /// Verbatim shape of the 1.1.2 FCM data example: EVERY value is a string.
    Map<String, Object?> canonical({
      String mode = 'practice',
      List<String> actions = const ['approve', 'skip', 'open'],
      String? version = '3',
    }) => {
      'v': '1',
      'event': 'N-01',
      'type': 'proposal.created',
      'mode': mode,
      'workspace_id': 'ws1',
      'seq': '18301',
      'deep_link': 'sentra://approvals/apv1',
      'approval_id': 'apv1',
      'version': ?version,
      'token': 'apt_Q2x',
      'exp': '2026-10-29T08:52:00.000Z',
      'actions': jsonEncode(actions),
      'vars': jsonEncode({'symbol': 'EXM', 'strategy': 'Yumi · AMM', 'amount_lamports': '250000000'}),
      'server_now': '2026-10-29T08:42:00.151Z',
    };

    test('FCM all-string data: v/seq/version integer strings, actions/vars JSON strings', () {
      final c = canonical();
      expect(c.values.every((v) => v is String), isTrue, reason: 'fixture mirrors the contract');
      final p = PushMessage.tryParse(c)!;
      expect(p.seq, BigInt.from(18301));
      expect(p.version, 3);
      expect(p.workspaceId, 'ws1');
      expect(p.deepLink, 'sentra://approvals/apv1');
      expect(p.type, 'proposal.created');
      expect(p.expiresAt, DateTime.utc(2026, 10, 29, 8, 52));
      expect(p.serverNow, DateTime.utc(2026, 10, 29, 8, 42, 0, 151));
      expect(p.serverActions, {'approve', 'skip', 'open'});
      expect(p.vars, {'symbol': 'EXM', 'strategy': 'Yumi · AMM', 'amount_lamports': '250000000'});
      expect(p.vars.containsKey('version'), isFalse, reason: 'envelope keys are not display vars');
      expect(p.token, 'apt_Q2x');
    });

    test('int64 seq beyond 2^53 stays exact (BigInt)', () {
      final p = PushMessage.tryParse({...canonical(), 'seq': '9007199254740993'})!;
      expect(p.seq.toString(), '9007199254740993');
    });

    test('legacy JSON numbers / lists / maps still parse', () {
      final p = PushMessage.tryParse({
        ...canonical(),
        'v': 1,
        'seq': 18301,
        'version': 3,
        'actions': ['approve', 'skip', 'open'],
        'vars': {'symbol': 'EXM', 'amount_lamports': '250000000'},
      })!;
      expect(p.seq, BigInt.from(18301));
      expect(p.version, 3);
      expect(p.vars['amount_lamports'], '250000000');
    });

    test('Real: token dropped, no buttons; client narrows server actions; no version → no buttons', () {
      final r = PushMessage.tryParse(canonical(mode: 'real', actions: ['open']))!;
      expect(r.token, isNull);
      const renderer = NotificationRenderer();
      final at = DateTime.utc(2026, 10, 29, 8, 43);
      expect(renderer.actionsFor(r, at), isEmpty);
      final onlyOpen = PushMessage.tryParse(canonical(actions: ['open']))!;
      expect(renderer.actionsFor(onlyOpen, at), isEmpty, reason: 'server offered no approve/skip');
      final full = PushMessage.tryParse(canonical())!;
      expect(renderer.actionsFor(full, at), [NotifAction.approve, NotifAction.skip]);
      final noRev = PushMessage.tryParse(canonical(version: null))!;
      expect(renderer.actionsFor(noRev, at), isEmpty, reason: 'p_expected_rev is required (1.1.2)');
    });

    test('renderer: wire vars go straight into the ARB (symbol, amount_lamports); mm_ss computed', () {
      final p = PushMessage.tryParse(canonical())!;
      final r = const NotificationRenderer().render(p, NotifLocale.en, DateTime.utc(2026, 10, 29, 8, 50));
      expect(r.title, contains(r'$EXM'));
      expect(r.body, contains('0.25\u00A0paper SOL'));
      expect(r.body, contains('02:00'), reason: 'mm_ss is computed on device (no vars.mm_ss in 1.1.2)');
    });

    test('expire_reason uses wire values', () {
      PushMessage m(String reason) => PushMessage.tryParse({
        'v': 1,
        'event': 'N-07',
        'mode': 'practice',
        'approval_id': 'a',
        'expire_reason': reason,
      })!;
      expect(NotificationRenderer.copyKeyFor(m('timeout')), 'N-07.timeout');
      expect(NotificationRenderer.copyKeyFor(m('price_moved')), 'N-07.price_moved');
      expect(NotificationRenderer.copyKeyFor(m('strategy_archived')), 'N-07.strategy_archived');
      // i18n 0.4.0+ has copy for every wire value (no more generic fallback).
      expect(NotificationRenderer.copyKeyFor(m('practice_reset')), 'N-07.practice_reset');
      expect(NotificationRenderer.copyKeyFor(m('account_deleted')), 'N-07.account_deleted');
      expect(NotificationRenderer.copyKeyFor(m('nope')), 'N-07.timeout');
    });
  });
}
