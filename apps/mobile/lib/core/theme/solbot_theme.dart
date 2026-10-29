import 'package:flutter/material.dart';

import 'app_tokens.dart';

export 'app_tokens.dart';

/// Thin app-level layer over the vendored design tokens (@sentra/design-tokens 0.2.1, copied
/// verbatim from /workspace/sentra/packages/design-tokens/tokens/app_tokens.dart).
/// Token gaps T-01..T-14 are fixed upstream (except font bundling, T-01), so this only adds app-chrome
/// choices that are not design tokens (nav bar, snackbar, app bar).
abstract final class SolbotTheme {
  static ThemeData dark() => _chrome(AppTheme.dark());
  static ThemeData light() => _chrome(AppTheme.light());

  static ThemeData _chrome(ThemeData base) {
    final cs = base.colorScheme;
    return base.copyWith(
      navigationBarTheme: NavigationBarThemeData(
        backgroundColor: cs.surfaceContainer,
        indicatorColor: cs.primaryContainer,
      ),
      snackBarTheme: const SnackBarThemeData(behavior: SnackBarBehavior.floating),
      appBarTheme: AppBarTheme(backgroundColor: base.scaffoldBackgroundColor, centerTitle: false),
    );
  }
}

extension PnlColorX on BuildContext {
  /// Color for a PnL value *as displayed*: values that format to `±0`
  /// get the neutral color (TOKENS_REVIEW T-15: `TradeColors.pnl` compares
  /// with exact 0, so 0.0001 would be green while the label says ±0).
  Color pnlColor(double v, {double epsilon = 0.0005}) => tradeColors.pnl(v.abs() < epsilon ? 0 : v);
}
