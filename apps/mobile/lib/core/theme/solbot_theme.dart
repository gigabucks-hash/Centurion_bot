import 'package:flutter/material.dart';

import 'app_tokens.dart';

export 'app_tokens.dart';

/// Adapter over the designer's generated tokens. Patches known gaps from
/// TOKENS_REVIEW.md here instead of editing the generated file, so a new
/// token drop is a straight file replace.
abstract final class SolbotTheme {
  static ThemeData dark() => _patch(AppTheme.dark(), AppColorsDark.textSecondary, AppColorsDark.borderStrong);
  static ThemeData light() => _patch(AppTheme.light(), AppColorsLight.textSecondary, AppColorsLight.borderStrong);

  static ThemeData _patch(ThemeData base, Color secondaryText, Color strongBorder) {
    final t = base.textTheme;
    final cs = base.colorScheme;
    return base.copyWith(
      // T-08: styles missing from the generated TextTheme (fell back to M3/Roboto).
      textTheme: t.copyWith(
        titleSmall: t.titleMedium!.copyWith(fontSize: 14, height: 20 / 14),
        labelMedium: t.labelLarge!.copyWith(fontSize: 12, color: secondaryText),
      ),
      // T-10: OutlinedButton/Switch use `outline`; keep it at the AA-for-UI value.
      outlinedButtonTheme: OutlinedButtonThemeData(
        style: OutlinedButton.styleFrom(
          minimumSize: const Size(64, AppSize.tapMin),
          side: BorderSide(color: strongBorder),
          shape: RoundedRectangleBorder(borderRadius: BorderRadius.circular(AppRadius.sm)),
        ),
      ),
      navigationBarTheme: NavigationBarThemeData(
        backgroundColor: cs.surfaceContainer,
        indicatorColor: cs.primaryContainer,
      ),
      snackBarTheme: const SnackBarThemeData(behavior: SnackBarBehavior.floating),
      appBarTheme: AppBarTheme(backgroundColor: base.scaffoldBackgroundColor, centerTitle: false),
    );
  }
}

extension TradeColorsPnl on TradeColors {
  /// T-07: no neutral PnL color in TradeColors; caller passes onSurfaceVariant.
  Color pnl(double v, {required Color neutral}) => v > 0 ? profit : (v < 0 ? loss : neutral);
}

extension SafeTradeColorsX on BuildContext {
  /// T-06: null-safe accessor (the generated `context.trade` uses `!`).
  TradeColors get tradeColors => Theme.of(this).extension<TradeColors>() ?? TradeColors.dark;
  Color pnlColor(double v) => tradeColors.pnl(v, neutral: Theme.of(this).colorScheme.onSurfaceVariant);
}
