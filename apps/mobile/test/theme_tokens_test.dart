import 'package:flutter/material.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:solbot_mobile/data/money.dart';
import 'package:solbot_mobile/core/format.dart';
import 'package:solbot_mobile/core/theme/solbot_theme.dart';

void main() {
  test('dark theme carries TradeColors v0.2.0 and Google Fonts families', () {
    final t = SolbotTheme.dark();
    final tc = t.extension<TradeColors>()!;
    expect(tc.neutral, AppColorsDark.semanticNeutralPnl);
    expect(t.colorScheme.outline, const Color(0xFF6B7995)); // T-03 fix
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
    expect(fmtPnl(Lamports.zero), '±0');
    expect(fmtPnl(Lamports.fromInt(400000)), '±0'); // < 0,0005 SOL
    expect(fmtPnl(Lamports.fromSol('0.412')), '▲ +0,412');
    expect(fmtPnl(Lamports.fromSol('-2.506')), '▼ −2,506');
    expect(fmtCountdown(const Duration(minutes: 1, seconds: 42)), '01:42');
  });
}
