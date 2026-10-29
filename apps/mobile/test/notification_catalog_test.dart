import 'package:flutter_test/flutter_test.dart';
import 'package:solbot_mobile/core/notifications/notification_catalog.dart';
import 'package:solbot_mobile/core/notifications/notification_renderer.dart';
import 'package:solbot_mobile/core/push/push_payload.dart';

final now = DateTime.utc(2026, 10, 29, 3, 0, 0);
final exp = now.add(const Duration(minutes: 1, seconds: 42));

/// Sample vars covering every placeholder in the spec.
const sampleVars = {
  'coin': r'$KEPL',
  'strategy': 'Pullback v2',
  'sol': '0.24',
  'pnl': '0.031',
  'pct': '12.5',
  'pct_sold': '33',
  'reason': 'Slippage terlalu tinggi',
  'setting': 'Top-10 holders',
  'from': '30%',
  'to': '40%',
  'time': '1793260000',
  'price': '0.000412',
  'stop_type': 'Trailing stop',
};

PushMessage msg(NotifEvent e, NotifMode? mode,
    {String? expireReason, bool validToken = true, Map<String, String> vars = sampleVars}) {
  return PushMessage(
    event: e,
    mode: mode,
    vars: vars,
    approvalId: 'apv_1',
    positionId: 'ck1.0',
    token: validToken ? 'tok_1' : null,
    expiresAt: exp,
    expireReason: expireReason,
  );
}

/// Modes an event can legitimately arrive in.
List<NotifMode?> modesFor(NotifEvent e) {
  if (e.spec.realOnly) return [NotifMode.real];
  if (!e.spec.requiresMode) return [null, NotifMode.practice, NotifMode.real];
  return [NotifMode.practice, NotifMode.real];
}

/// Expected buttons per event, per the spec table + team-lead security rule.
List<NotifAction> expectedActions(NotifEvent e, NotifMode? mode) {
  final real = mode == NotifMode.real;
  return switch (e) {
    NotifEvent.n01PickPending || NotifEvent.n02FirstBuyPending =>
      real ? const [] : const [NotifAction.approve, NotifAction.skip],
    NotifEvent.n04Filled => const [NotifAction.viewPosition],
    NotifEvent.n05Failed => const [NotifAction.detail],
    NotifEvent.n06Skipped => const [NotifAction.undo],
    NotifEvent.n08TpHit || NotifEvent.n09StopHit || NotifEvent.n15LossStopPaused => const [NotifAction.view],
    NotifEvent.n10GuardWeakeningRequested => const [NotifAction.review],
    NotifEvent.n11CooldownStarted => real ? const [NotifAction.cancel] : const [],
    NotifEvent.n12WeakeningActive || NotifEvent.n13AutoRevertDone => real ? const [NotifAction.view] : const [],
    NotifEvent.n16ConnectionError => const [NotifAction.retry],
    NotifEvent.n17TokenInvalid => const [NotifAction.open],
    NotifEvent.n03Approved || NotifEvent.n07Expired || NotifEvent.n14ModeSwitch => const [],
  };
}

void main() {
  const r = NotificationRenderer();

  test('catalog has exactly the 17 spec events N-01…N-17', () {
    expect(NotifEvent.values.length, 17);
    expect(NotifEvent.values.map((e) => e.code),
        [for (var i = 1; i <= 17; i++) 'N-${i.toString().padLeft(2, '0')}']);
  });

  const unprefixed = {'N-03', 'N-06', 'N-14.real', 'N-14.practice', 'N-16', 'N-17'};

  test('every event and variant has non-empty ID and EN copy from the ARB', () {
    final formatted = {for (final k in sampleVars.keys) k: 'x', 'mm:ss': '01:42'};
    for (final e in NotifEvent.values) {
      for (final key in e.copyKeys) {
        for (final mode in ['practice', 'real']) {
          final byLocale = <NotifLocale, Copy>{};
          for (final l in NotifLocale.values) {
            final c = notifCopy(l10nFor(l), key, mode, formatted);
            final label = '$key/$mode/${l.name}';
            expect(c.title.trim(), isNotEmpty, reason: label);
            expect(c.body.trim(), isNotEmpty, reason: label);
            expect('${c.title}${c.body}', isNot(contains('{')), reason: label);
            expect('${c.title}${c.body}', isNot(contains('–')), reason: '$label unfilled var');
            byLocale[l] = c;
          }
          // ID and EN must actually differ (not an untranslated copy).
          expect(byLocale[NotifLocale.id], isNot(byLocale[NotifLocale.en]), reason: key);
        }
      }
    }
    for (final l in NotifLocale.values) {
      for (final a in NotifAction.values) {
        expect(actionLabel(l10nFor(l), a), isNotEmpty);
      }
    }
    expect(actionLabel(l10nFor(NotifLocale.id), NotifAction.approve), 'Setujui');
    expect(actionLabel(l10nFor(NotifLocale.en), NotifAction.approve), 'Approve');
  });

  test('every event renders fully in ID and EN, with mode prefix and correct buttons', () {
    for (final e in NotifEvent.values) {
      for (final mode in modesFor(e)) {
        final reasons = e == NotifEvent.n07Expired ? expireReasonKeys.keys.toList() : [null];
        for (final reason in reasons) {
          for (final l in NotifLocale.values) {
            final n = r.render(msg(e, mode, expireReason: reason), l, now);
            final label = '${e.code}/${mode?.name}/$reason/${l.name}';
            expect('${n.title}${n.body}', isNot(contains('{')), reason: label);
            expect(n.body, isNot(contains('–')), reason: '$label: unfilled var in "${n.body}"');
            if (!unprefixed.contains(n.copyKey)) {
              expect(n.title, startsWith(mode == NotifMode.real ? '[REAL SOL] ' : '[PRACTICE] '), reason: label);
            }
            expect(n.actions, expectedActions(e, mode), reason: label);
            if (!(mode == NotifMode.practice && e.isPick)) {
              expect(n.actions, isNot(contains(NotifAction.approve)), reason: label);
            }
          }
        }
      }
    }
  });

  test('Approve only for Practice picks with a valid token; never for Real', () {
    for (final e in [NotifEvent.n01PickPending, NotifEvent.n02FirstBuyPending]) {
      expect(r.render(msg(e, NotifMode.practice), NotifLocale.id, now).actions,
          [NotifAction.approve, NotifAction.skip]);
      // Expired token → no buttons, tap opens the card.
      final late = r.render(msg(e, NotifMode.practice), NotifLocale.id, exp.add(const Duration(seconds: 1)));
      expect(late.actions, isEmpty);
      expect(r.render(msg(e, NotifMode.practice, validToken: false), NotifLocale.id, now).actions, isEmpty);
      // Real: no Approve, no Skip (team lead), tap → card.
      final real = r.render(msg(e, NotifMode.real), NotifLocale.id, now);
      expect(real.actions, isEmpty);
      expect(real.tapRoute, '/approvals/apv_1');
      // Spec's Real-Skip only behind an explicit policy flag; still never Approve.
      const lenient = NotificationRenderer(policy: NotificationPolicy(realSkipFromNotification: true));
      expect(lenient.render(msg(e, NotifMode.real), NotifLocale.id, now).actions, [NotifAction.skip]);
    }
  });

  test('no event can ever offer a sell button', () {
    expect(NotifAction.values.map((a) => a.name), isNot(contains('sell')));
  });

  test('locale number formats and units (ID 0,24 / EN 0.24), per format.mjs', () {
    final id = r.render(msg(NotifEvent.n01PickPending, NotifMode.practice), NotifLocale.id, now);
    expect(id.title, r'[PRACTICE] $KEPL menunggu approval');
    expect(id.body, 'Pullback v2 · 0,24\u00A0paper SOL · sisa 01:42');
    final en = r.render(msg(NotifEvent.n01PickPending, NotifMode.real), NotifLocale.en, now);
    // Server clock skew (server_now − device now) shifts the countdown.
    final skewed = r.render(msg(NotifEvent.n01PickPending, NotifMode.practice), NotifLocale.id, now,
        clockSkew: const Duration(seconds: 40));
    expect(skewed.body, endsWith('sisa 01:02'));
    expect(en.title, r'[REAL SOL] $KEPL awaits approval');
    expect(en.body, 'Pullback v2 · 0.24\u00A0SOL · 01:42 left');
    final tp = r.render(msg(NotifEvent.n08TpHit, NotifMode.practice), NotifLocale.id, now);
    expect(tp.body, 'Terjual 33% di +12,5% · ▲ +0,031\u00A0paper SOL');
    final stop = r.render(
        msg(NotifEvent.n09StopHit, NotifMode.practice, vars: {...sampleVars, 'pnl': '-0.05', 'pct': '-20'}),
        NotifLocale.en, now);
    expect(stop.body, 'Trailing stop · ▼ −0.050\u00A0paper SOL (−20%)');
  });

  test('variants: N-05 Real fee note, N-07 reasons, N-14 direction + priority', () {
    expect(r.render(msg(NotifEvent.n05Failed, NotifMode.real), NotifLocale.id, now).body,
        endsWith('Biaya jaringan mungkin terpakai.'));
    expect(r.render(msg(NotifEvent.n05Failed, NotifMode.practice), NotifLocale.en, now).body,
        endsWith('No SOL was spent.'));
    expect(r.render(msg(NotifEvent.n07Expired, NotifMode.practice, expireReason: 'strategy_deleted'), NotifLocale.id, now).body,
        'Strategi dihapus');
    final toReal = r.render(msg(NotifEvent.n14ModeSwitch, NotifMode.real), NotifLocale.id, now);
    expect(toReal.title, 'Sekarang di REAL SOL');
    expect(toReal.priority, NotifPriority.high);
    final toPractice = r.render(msg(NotifEvent.n14ModeSwitch, NotifMode.practice), NotifLocale.en, now);
    expect(toPractice.title, 'Back to PRACTICE');
    expect(toPractice.priority, NotifPriority.normal);
  });

  test('grouping: more than 3 picks in 60 s → grouped copy without Approve', () {
    final g = PickGrouper();
    late int count;
    for (var i = 0; i < 4; i++) {
      count = g.record(NotifMode.practice, now.add(Duration(seconds: i * 10)));
    }
    expect(count, 4);
    final n = r.render(msg(NotifEvent.n01PickPending, NotifMode.practice), NotifLocale.id, now, groupCount: count);
    expect(n.grouped, isTrue);
    expect(n.title, '[PRACTICE] 4 pick menunggu approval');
    expect(r.render(msg(NotifEvent.n01PickPending, NotifMode.real), NotifLocale.en, now, groupCount: 5).title,
        '[REAL SOL] 5 picks await approval');
    expect(n.actions, isEmpty);
    expect(n.tapRoute, '/approvals');
    // Window slides: a pick 2 min later starts fresh.
    expect(g.record(NotifMode.practice, now.add(const Duration(minutes: 3))), 1);
  });
}
