import 'package:flutter/material.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:solbot_mobile/core/format.dart';
import 'package:solbot_mobile/core/theme/solbot_theme.dart';

void main() {
  test('dark theme carries TradeColors and patched text styles', () {
    final t = SolbotTheme.dark();
    expect(t.extension<TradeColors>(), isNotNull);
    expect(t.colorScheme.primary, AppColorsDark.brandPrimary);
    expect(t.textTheme.labelMedium!.fontFamily, 'Inter');
    expect(t.scaffoldBackgroundColor, AppColorsDark.bgCanvas);
  });

  test('TradeColors.lerp interpolates between dark and light', () {
    final mid = TradeColors.dark.lerp(TradeColors.light, 0.5);
    expect(mid.profit, Color.lerp(AppColorsDark.semanticProfit, AppColorsLight.semanticProfit, 0.5));
    expect(TradeColors.dark.lerp(null, 0.5), same(TradeColors.dark));
  });

  test('pnl color + format never rely on color alone', () {
    const neutral = Color(0xFF000000);
    expect(TradeColors.dark.pnl(0, neutral: neutral), neutral);
    expect(TradeColors.dark.pnl(1, neutral: neutral), AppColorsDark.semanticProfit);
    expect(fmtPnl(0), '±0');
    expect(fmtPnl(0.412), '▲ +0,412');
    expect(fmtPnl(-2.506), '▼ −2,506');
    expect(fmtCountdown(const Duration(minutes: 1, seconds: 42)), '01:42');
  });
}
