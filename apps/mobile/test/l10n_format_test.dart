import 'package:flutter_test/flutter_test.dart';
import 'package:solbot_mobile/core/l10n_format.dart';

/// Mirrors the examples in ux-solbot/locales/format.mjs.
void main() {
  const nb = '\u00A0';
  test('formatSol: dp rules, true minus, NBSP, paper unit', () {
    expect(formatSol(0.24, 'id', paper: true), '0,24${nb}paper SOL');
    expect(formatSol(0.24, 'en'), '0.24${nb}SOL');
    expect(formatSol(27.533, 'en'), '27.53${nb}SOL');
    expect(formatSol(27.533, 'id'), '27,53${nb}SOL');
    expect(formatSol(-0.066, 'en', pnl: true), '−0.066${nb}SOL');
    expect(formatSol(0.031, 'id', pnl: true, paper: true), '+0,031${nb}paper SOL');
    expect(formatSol(0, 'en', pnl: true), '0.000${nb}SOL');
    expect(formatSol(0.004123, 'en'), '0.004123${nb}SOL');
  });
  test('formatPct / formatUsd / formatTime / countdown', () {
    expect(formatPct(12.5, 'id'), '12,5%');
    expect(formatPct(-20, 'en'), '−20%');
    expect(formatPct(8.4, 'en', signed: true), '+8.4%');
    expect(formatUsd(0.000412, 'en'), r'$0.000412');
    expect(formatUsd(1234.5, 'id'), r'$1.235'); // 4 significant digits
    expect(formatTime(DateTime(2026, 10, 29, 16, 5), 'id'), '16.05 WIB');
    expect(formatTime(DateTime(2026, 10, 29, 16, 5), 'en'), '4:05${nb}PM WIB');
    expect(formatCountdown(const Duration(seconds: 102)), '01:42');
    expect(formatCountdown(const Duration(seconds: -3)), '00:00');
  });
}
