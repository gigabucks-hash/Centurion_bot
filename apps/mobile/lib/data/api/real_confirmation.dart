/// Real SOL proof-of-confirmation (API §4.6): server challenge → passkey
/// (WebAuthn, platform biometric) + TOTP + typed strategy name + 2,5 s hold.
/// DISABLED until Phase 7: [FeatureFlags.realSolEnabled] is false and the
/// server answers REAL_SOL_DISABLED anyway. Interface only.
library;

class ConfirmationChallenge {
  const ConfirmationChallenge({
    required this.challengeId,
    required this.challenge,
    required this.expiresAt,
    required this.rpId,
    required this.typedName,
    required this.holdMs,
  });
  final String challengeId;
  final String challenge;
  final DateTime expiresAt;
  final String rpId;
  final String typedName;

  /// 2500 for Real (1200 for Practice hold-only flows).
  final int holdMs;
}

class ProofOfConfirmation {
  const ProofOfConfirmation({
    required this.challengeId,
    required this.challenge,
    required this.webauthnAssertion,
    required this.typedConfirmation,
    required this.holdDuration,
    required this.totpCode,
    required this.device,
  });
  final String challengeId;
  final String challenge;

  /// credential_id, client_data_json, authenticator_data, signature, user_handle (base64url).
  final Map<String, String?> webauthnAssertion;
  final String typedConfirmation;
  final Duration holdDuration;
  final String totpCode;
  final Map<String, String?> device;

  Map<String, Object?> toJson() => {
    'challenge_id': challengeId,
    'challenge': challenge,
    'webauthn': webauthnAssertion,
    'typed_confirmation': typedConfirmation,
    'hold_duration_ms': holdDuration.inMilliseconds,
    'device': device,
  };
}

abstract interface class RealConfirmationService {
  /// Errors REAL_SOL_DISABLED (until Phase 7), CONFIRMATION_INVALID.
  Future<ConfirmationChallenge> challenge({
    required String action,
    required String target,
    required String payloadHash,
  });

  /// Runs passkey assertion (local_auth/passkeys) + TOTP prompt; never stores secrets.
  Future<ProofOfConfirmation> confirm(ConfirmationChallenge c, {required String typedName, required Duration held});
}
