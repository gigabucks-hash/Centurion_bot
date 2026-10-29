// T-15 (resolved, Apex decision 29 Okt 2026; UX to codify in SPEC):
// exact zero PnL → "0,000"/"0.000 SOL" in the neutral color, no ▲/▼, no +/−.
// Any non-zero value (even 1 lamport) → ▲/▼ + sign + profit/loss color.
import 'package:flutter/material.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:sentra_mobile/core/format.dart';
import 'package:sentra_mobile/core/l10n_format.dart';
import 'package:sentra_mobile/core/notifications/notification_catalog.dart';
import 'package:sentra_mobile/core/notifications/notification_renderer.dart';
import 'package:sentra_mobile/core/push/push_payload.dart';
import 'package:sentra_mobile/core/theme/sentra_theme.dart';
import 'package:sentra_mobile/core/widgets/common.dart';
import 'package:sentra_mobile/data/money.dart';

const nb = '\u00A0';
bool _hasArrowOrSign(String s) => RegExp('[▲▼+−-]').hasMatch(s);

void main() {
  group('fmtPnl / fmtPct (UI, id-ID)', () {
    test('exact zero: 0,00, no arrow, no sign', () {
      expect(fmtPnl(Lamports.zero), '0,00');
      expect(fmtPnl(Lamports.zero, unit: true), '0,00 SOL');
      expect(_hasArrowOrSign(fmtPnl(Lamports.zero)), isFalse);
    });
    test('any non-zero gets ▲/▼ + sign and is never shown as 0', () {
      expect(fmtPnl(Lamports.fromInt(1)), '▲ +<0,000001');
      expect(fmtPnl(Lamports.fromInt(-1)), '▼ −<0,000001');
      expect(fmtPnl(Lamports.fromInt(400000)), '▲ +0,0004');
      expect(fmtPnl(Lamports.fromInt(-500000)), '▼ −0,0005');
      expect(fmtPnl(Lamports.fromSol('0.031')), '▲ +0,031');
      expect(fmtPnl(Lamports.fromSol('-1.5'), unit: true), '▼ −1,50 SOL');
    });
    test('pct: exact 0 → 0,0% unsigned; tiny non-zero → signed <0,1%', () {
      expect(fmtPct(0), '0,0%');
      expect(_hasArrowOrSign(fmtPct(0)), isFalse);
      expect(fmtPct(0.01), '▲ +<0,1%');
      expect(fmtPct(-0.002, arrow: false), '−<0,1%');
      expect(fmtPct(12.5), '▲ +12,5%');
    });
  });

  // Same vectors as @sentra/i18n 0.4.2 format.test.mjs (pnlPct there takes a ratio; ours a percent).
  group('pnlSol / pnlPct parity with format.mjs 0.4.2', () {
    test('T-15 exact zero PnL: 0.00, neutral, no arrow, no sign', () {
      final r = pnlSol(Lamports.zero, 'en');
      expect(r.text, '0.00${nb}SOL');
      expect((r.arrow, r.sign, r.signum), ('', '', 0));
      expect(pnlSol(Lamports.zero, 'id', paper: true).text, '0,00${nb}paper SOL');
      expect(formatSol(Lamports.zero, 'en', pnl: true), '0.00${nb}SOL');
      final p = pnlPct(0, 'id');
      expect((p.text, p.arrow, p.sign, p.signum), ('0,0%', '', '', 0));
      expect(formatPct(-0.0, 'en', signed: true), '0.0%');
    });
    test('non-zero PnL is never shown as zero and tone matches text', () {
      final t = pnlSol(Lamports.fromSol('0.0002'), 'en');
      expect((t.text, t.arrow, t.signum), ('+0.0002${nb}SOL', '▲', 1));
      final l = pnlSol(Lamports.parse('-1'), 'id');
      expect((l.text, l.arrow, l.signum), ('\u2212<0,000001${nb}SOL', '▼', -1));
      expect(pnlSol(Lamports.fromSol('-0.066'), 'en').text, '\u22120.066${nb}SOL');
      expect(pnlSol(Lamports.fromSol('2.506'), 'id').text, '+2,51${nb}SOL');
      expect(pnlPct(0.02, 'en').text, '+<0.1%');
      expect(pnlPct(-8.4, 'id').text, '\u22128,4%');
    });
    test('arrow/sign come from design-tokens 0.2.2 helpers', () {
      for (final n in [-3, 0, 5]) {
        final r = pnlSol(Lamports.fromInt(n), 'en');
        expect(r.arrow, TradeColors.pnlArrow(n));
        expect(r.sign, TradeColors.pnlSign(n));
      }
    });
    test('amounts unchanged', () {
      expect(formatSol(Lamports.fromSol('27.533'), 'id', paper: true), '27,53${nb}paper SOL');
      expect(formatSol(Lamports.fromSol('0.24'), 'en'), '0.24${nb}SOL');
    });
    test('N-08 body: zero pnl has no ▲/+, non-zero has both', () {
      const r = NotificationRenderer();
      PushMessage m(String pnl, String pct) => PushMessage(
        event: NotifEvent.n08TpHit,
        mode: NotifMode.practice,
        vars: {'symbol': 'KEPL', 'pct': pct, 'pct_sold': '33', 'pnl': pnl},
        positionId: 'ck1.0',
      );
      final now = DateTime.utc(2026, 10, 29);
      // i18n 0.4.3: the copy carries the literal '+' and {pct} is unsigned; {pnl}
      // is a lamports string formatted with pnlSol (T-15).
      expect(r.render(m('0', '30'), NotifLocale.en, now).body, 'Sold 33% at +30% · 0.00${nb}paper SOL');
      expect(r.render(m('1', '30'), NotifLocale.en, now).body, 'Sold 33% at +30% · ▲ +<0.000001${nb}paper SOL');
      expect(r.render(m('-1', '30'), NotifLocale.en, now).body, contains('▼ −<0.000001'));
    });
  });

  group('PnlText widget', () {
    Future<(String, Color?)> render(WidgetTester t, Widget w) async {
      await t.pumpWidget(
        MaterialApp(
          theme: SentraTheme.dark(),
          home: Scaffold(body: w),
        ),
      );
      final txt = t.widget<Text>(find.byType(Text));
      return (txt.data!, txt.style?.color);
    }

    testWidgets('exact zero → neutral color, no arrow/sign', (t) async {
      final (s, c) = await render(t, PnlText(Lamports.zero));
      expect(s, '0,00');
      expect(c, TradeColors.dark.neutral);
    });
    testWidgets('1 lamport → profit color + ▲', (t) async {
      final (s, c) = await render(t, PnlText(Lamports.fromInt(1)));
      expect(s, startsWith('▲ +'));
      expect(c, TradeColors.dark.profit);
    });
    testWidgets('−1 lamport → loss color + ▼', (t) async {
      final (s, c) = await render(t, PnlText(Lamports.fromInt(-1)));
      expect(s, startsWith('▼ −'));
      expect(c, TradeColors.dark.loss);
    });
    testWidgets('pct 0 neutral, tiny pct colored', (t) async {
      expect((await render(t, const PnlText.pct(0))).$2, TradeColors.dark.neutral);
      expect((await render(t, const PnlText.pct(-0.01))).$2, TradeColors.dark.loss);
    });
  });
}
