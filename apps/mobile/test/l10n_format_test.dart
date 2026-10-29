import 'package:flutter_test/flutter_test.dart';
import 'package:solbot_mobile/core/l10n_format.dart';
import 'package:solbot_mobile/data/money.dart';

/// Mirrors the examples in ux-solbot/locales/format.mjs.
void main() {
  const nb = '\u00A0';
  Lamports sol(String v) => Lamports.fromSol(v);
  test('formatSol: dp rules, true minus, NBSP, paper unit', () {
    expect(formatSol(sol('0.24'), 'id', paper: true), '0,24${nb}paper SOL');
    expect(formatSol(sol('0.24'), 'en'), '0.24${nb}SOL');
    expect(formatSol(sol('27.533'), 'en'), '27.53${nb}SOL');
    expect(formatSol(sol('27.533'), 'id'), '27,53${nb}SOL');
    expect(formatSol(sol('-0.066'), 'en', pnl: true), '−0.066${nb}SOL');
    expect(formatSol(sol('0.031'), 'id', pnl: true, paper: true), '+0,031${nb}paper SOL');
    expect(formatSol(sol('0'), 'en', pnl: true), '0.000${nb}SOL');
    expect(formatSol(sol('0.004123'), 'en'), '0.004123${nb}SOL');
  });
  test('formatPct / formatUsd / formatTime / countdown', () {
    expect(formatPct(12.5, 'id'), '12,5%');
    expect(formatPct(-20, 'en'), '−20%');
    expect(formatPct(8.4, 'en', signed: true), '+8.4%');
    expect(formatUsd(Decimal.parse('0.000412'), 'en'), r'$0.000412');
    expect(formatUsd(Decimal.parse('1234.5'), 'id'), r'$1.235'); // 4 significant digits
    expect(formatTime(DateTime(2026, 10, 29, 16, 5), 'id'), '16.05 WIB');
    expect(formatTime(DateTime(2026, 10, 29, 16, 5), 'en'), '4:05${nb}PM WIB');
    expect(formatCountdown(const Duration(seconds: 102)), '01:42');
    expect(formatCountdown(const Duration(seconds: -3)), '00:00');
  });
  test('money is exact: lamports + decimal, no float drift', () {
    expect(sol('0.1') + sol('0.2'), sol('0.3')); // 0.1 + 0.2 != 0.3 in double
    expect(Lamports.parse('250000000').toSol(), Decimal.parse('0.25'));
    expect(sol('0.25').toWire(), '250000000');
    expect(formatSol(Lamports.parse('123456789012345678'), 'en'), '123,456,789.01${nb}SOL');
    expect(formatUsd(Decimal.parse('0.000041230000'), 'id'), r'$0,00004123');
  });
}
