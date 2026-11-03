/// Product identity (Boss decision 29 Okt 2026: "Centurion Trade"). User-facing
/// copy comes from ARB `app.name` (@centurion/i18n 0.4.7); these constants are for
/// non-localized places (platform ids, deep links). The Dart package
/// is `centurion_mobile`.
library;

abstract final class AppIdentity {
  /// Fallback only; UI uses `AppLocalizations.appName`.
  static const displayName = 'Centurion Trade';

  /// Android applicationId / iOS bundle id.
  static const bundleId = 'com.centuriontrade.app';

  /// Custom URL scheme `centurion://`. No domain yet → no App Links / AASA.
  static const scheme = 'centurion';

  /// Phantom redirect target for the wallet login (task f).
  static const authRedirect = '$scheme://auth';
}
