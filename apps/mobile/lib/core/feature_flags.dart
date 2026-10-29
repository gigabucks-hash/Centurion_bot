import 'package:flutter_riverpod/flutter_riverpod.dart';

/// Client feature flags. Server is still the authority (REAL_SOL_DISABLED).
class FeatureFlags {
  const FeatureFlags({this.realSolEnabled = false, this.telegramOidcEnabled = false});

  /// Real SOL execution UI (approve/resume/sell/guard weakening on Real).
  /// OFF until Phase 7 (TOTP + passkey + typed name + 2,5 s hold).
  final bool realSolEnabled;

  /// Telegram OIDC login (mirrors server `AUTH_TELEGRAM_OIDC_ENABLED=false`).
  /// OFF until Boss signs off the security review; no Telegram SDK is installed.
  final bool telegramOidcEnabled;
}

final featureFlagsProvider = Provider<FeatureFlags>((_) => const FeatureFlags());

const realSolDisabledText = 'Real SOL nonaktif sampai Fase 7';
