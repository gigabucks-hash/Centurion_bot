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
  /// PnL color. T-15 resolved (Apex decision): neutral only for EXACT zero,
  /// matching the formatter (`0,000`, no arrow/sign); any non-zero is profit/loss.
  Color pnlColor(num v) => tradeColors.pnl(v);
}
