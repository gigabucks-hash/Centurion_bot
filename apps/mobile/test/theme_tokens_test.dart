import 'package:flutter/material.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:centurion_mobile/data/money.dart';
import 'package:centurion_mobile/core/format.dart';
import 'package:centurion_mobile/core/theme/centurion_theme.dart';

void main() {
  test('dark theme carries TradeColors v0.2.0 and Google Fonts families', () {
    final t = CenturionTheme.dark();
    final tc = t.extension<TradeColors>()!;
    expect(tc.neutral, AppColorsDark.semanticNeutralPnl);
    expect(t.colorScheme.outline, const Color(0xFF6C7590)); // T-03 fix; design-tokens 0.3.4 borderStrong
    expect(t.colorScheme.surfaceTint, const Color(0x00000000)); // T-08 fix
    expect(t.textTheme.labelMedium!.fontFamily, startsWith('Inter'));
    expect(AppText.num(14).fontFamily, startsWith('JetBrainsMono'));
    expect(AppText.num(14).fontFeatures, AppFonts.numericFeatures);
    expect(t.scaffoldBackgroundColor, AppColorsDark.bgCanvas);
  });

  test('TradeColors copyWith + lerp (T-02, T-14)', () {
    final c = TradeColors.dark.copyWith(profit: const Color(0xFF000001));
    expect(c.profit, const Color(0xFF000001));
    expect(c.loss, TradeColors.dark.loss);
    final mid = TradeColors.dark.lerp(TradeColors.light, 0.5);
    expect(mid.profit, Color.lerp(AppColorsDark.semanticProfit, AppColorsLight.semanticProfit, 0.5));
    expect(TradeColors.dark.lerp(null, 0.5), same(TradeColors.dark));
  });

  test('pnl color + format never rely on color alone', () {
    expect(TradeColors.dark.pnl(0), AppColorsDark.semanticNeutralPnl);
    expect(TradeColors.dark.pnl(1), AppColorsDark.semanticProfit);
    expect(fmtPnl(Lamports.zero), '0,00'); // T-15: exact zero, no arrow/sign
    expect(fmtPnl(Lamports.fromInt(400000)), '▲ +0,0004'); // non-zero always signed
    expect(fmtPnl(Lamports.fromSol('0.412')), '▲ +0,412');
    expect(fmtPnl(Lamports.fromSol('-2.506')), '▼ −2,51');
    expect(fmtCountdown(const Duration(minutes: 1, seconds: 42)), '01:42');
  });
}
