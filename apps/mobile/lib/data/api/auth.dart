/// Auth interface stubs (FLUTTER_INTEGRATION_ANSWERS §1, API §4.1, contract v1.1).
/// - Google / Apple / Email OTP: native Supabase Auth (`supabase_flutter`, PKCE).
/// - Telegram (v1.1): official OIDC id_token. `POST /auth/telegram/nonce
///   {device_id, platform}` → Telegram SDK login (NOT installed; pending Boss's
///   approval) → `POST /auth/telegram/verify {nonce, id_token, device_id}`.
///   Design-only: server `AUTH_TELEGRAM_OIDC_ENABLED=false`, client
///   `FeatureFlags.telegramOidcEnabled=false`; the button is hidden and every
///   call throws [TelegramLoginDisabled]. Do not configure Supabase custom OIDC.
/// - SIWS: `/auth/siws/nonce` → wallet signs (Phantom/Solflare/MWA) → `/auth/siws/verify`;
///   the Edge Function mints the Supabase session JWT. Login wallet ≠ trading wallet.
/// No implementation in Phase 5 prototype (mock app is signed-out/offline).
library;

/// REST paths (single place).
abstract final class AuthPaths {
  static const telegramNonce = '/auth/telegram/nonce';
  static const telegramVerify = '/auth/telegram/verify';
  static const siwsNonce = '/auth/siws/nonce';
  static const siwsVerify = '/auth/siws/verify';
  static const emailOtpRequest = '/auth/email/otp/request';
  static const emailOtpVerify = '/auth/email/otp/verify';
}

class TelegramLoginDisabled implements Exception {
  const TelegramLoginDisabled();
  @override
  String toString() => 'Telegram login is disabled (AUTH_TELEGRAM_OIDC_ENABLED=false)';
}

class AuthSession {
  const AuthSession({required this.userId, required this.accessToken, required this.expiresAt});
  final String userId;

  /// Kept in Keychain/Keystore by the Supabase storage adapter; never logged.
  final String accessToken;
  final DateTime expiresAt;
}

class SiwsChallenge {
  const SiwsChallenge({required this.nonce, required this.message, required this.expiresAt});
  final String nonce;

  /// Exact bytes the wallet must sign.
  final String message;
  final DateTime expiresAt;
}

class OtpRequestResult {
  const OtpRequestResult({required this.resendAfter});
  final Duration resendAfter;
}

abstract interface class AuthRepository {
  Stream<AuthSession?> watchSession();
  Future<AuthSession> signInWithGoogle();
  Future<AuthSession> signInWithApple();

  /// Always "sent" (no account enumeration); errors RATE_LIMITED.
  Future<OtpRequestResult> requestEmailOtp(String email);

  /// Errors OTP_INVALID, OTP_LOCKED.
  Future<AuthSession> verifyEmailOtp(String email, String code);

  /// Errors AUTH_TG_INVALID, AUTH_TG_REPLAY, AUTH_TG_NO_PROFILE (flag-gated server side).
  Future<String> telegramNonce({required String deviceId, required String platform});
  Future<AuthSession> verifyTelegramIdToken({required String nonce, required String idToken, required String deviceId});

  /// Errors SIWS_NONCE_INVALID, SIWS_SIGNATURE_INVALID, WALLET_ROLE_CONFLICT.
  Future<SiwsChallenge> siwsNonce({required String address, required String domain, required String uri});
  Future<AuthSession> siwsVerify({required String address, required String message, required String signatureBase58});

  /// Re-verify for unlink / deletion / Real switches (REAUTH_REQUIRED).
  Future<DateTime> reauth();
  Future<void> signOut();
}

/// Placeholder until D5–6 (Supabase Auth). Every call throws; Telegram calls
/// throw [TelegramLoginDisabled] while [telegramEnabled] is false.
class UnimplementedAuthRepository implements AuthRepository {
  const UnimplementedAuthRepository({this.telegramEnabled = false});
  final bool telegramEnabled;
  Never _todo() => throw UnimplementedError('Auth lands at D5–6 (Supabase)');
  @override
  Stream<AuthSession?> watchSession() => Stream.value(null);
  @override
  Future<AuthSession> signInWithGoogle() async => _todo();
  @override
  Future<AuthSession> signInWithApple() async => _todo();
  @override
  Future<OtpRequestResult> requestEmailOtp(String email) async => _todo();
  @override
  Future<AuthSession> verifyEmailOtp(String email, String code) async => _todo();
  @override
  Future<String> telegramNonce({required String deviceId, required String platform}) async =>
      telegramEnabled ? _todo() : throw const TelegramLoginDisabled();
  @override
  Future<AuthSession> verifyTelegramIdToken({required String nonce, required String idToken, required String deviceId}) async =>
      telegramEnabled ? _todo() : throw const TelegramLoginDisabled();
  @override
  Future<SiwsChallenge> siwsNonce({required String address, required String domain, required String uri}) async => _todo();
  @override
  Future<AuthSession> siwsVerify({required String address, required String message, required String signatureBase58}) async =>
      _todo();
  @override
  Future<DateTime> reauth() async => _todo();
  @override
  Future<void> signOut() async {}
}
