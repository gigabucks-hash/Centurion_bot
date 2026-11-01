import 'dart:typed_data';

import 'package:flutter/foundation.dart' show visibleForTesting;
import 'package:pinenacl/tweetnacl.dart' show TweetNaCl;
import 'package:pinenacl/x25519.dart' show Box, EncryptedMessage, PrivateKey, PublicKey;

import 'base58.dart';

/// Thin wrapper over pinenacl 0.6.0 for the Phantom deeplink session
/// (x25519 + XSalsa20-Poly1305 `Box` ONLY; SIWS_LOGIN_REVIEW §11.3 conditions):
/// - (b) only `PrivateKey.generate()`, `Box`, `EncryptedMessage` are used;
/// - (c) their public key must be exactly 32 bytes and the X25519 shared point must
///   not be all-zero (pinenacl, like TweetNaCl, does not reject low-order points);
/// - (e) a fresh keypair per login, memory only (never serialized or stored);
/// - pinenacl throws plain Strings: every call is wrapped in `catch (_)`.
class PhantomBoxException implements Exception {
  const PhantomBoxException(this.reason);

  /// `bad_public_key` | `low_order_point` | `decrypt_failed` | `encrypt_failed` | `bad_input`.
  final String reason;
  @override
  String toString() => 'PhantomBoxException($reason)';
}

/// Ephemeral x25519 keypair for ONE login attempt. Not serializable on purpose.
class PhantomKeyPair {
  PhantomKeyPair._(this._secret);
  factory PhantomKeyPair.generate() => PhantomKeyPair._(PrivateKey.generate());

  /// Tests only (fixed RFC 7748 / interop keys). Production code uses [generate].
  @visibleForTesting
  factory PhantomKeyPair.fromSecretForTest(Uint8List secret) => PhantomKeyPair._(PrivateKey(secret));

  final PrivateKey _secret;
  Uint8List get publicKey => Uint8List.fromList(_secret.publicKey);

  /// `dapp_encryption_public_key` query parameter.
  String get publicKeyBase58 => Base58.encode(publicKey);

  @override
  String toString() => 'PhantomKeyPair(pub ${publicKeyBase58.substring(0, 6)}…)';
}

class PhantomBox {
  PhantomBox._(this._box);
  final Box _box;

  static const keyLength = 32;
  static const nonceLength = 24;

  /// Raw X25519 (RFC 7748). Exposed for the RFC vector test.
  static Uint8List x25519(Uint8List scalar, Uint8List uCoordinate) {
    if (scalar.length != keyLength || uCoordinate.length != keyLength) {
      throw const PhantomBoxException('bad_input');
    }
    try {
      final q = Uint8List(keyLength);
      TweetNaCl.crypto_scalarmult(q, Uint8List.fromList(scalar), Uint8List.fromList(uCoordinate));
      return q;
    } catch (_) {
      throw const PhantomBoxException('bad_input');
    }
  }

  static bool _allZero(Uint8List b) {
    var acc = 0;
    for (final x in b) {
      acc |= x;
    }
    return acc == 0;
  }

  /// Opens the shared box with Phantom's `phantom_encryption_public_key`.
  /// Throws [PhantomBoxException] for a malformed or low-order public key.
  factory PhantomBox.open(PhantomKeyPair mine, Uint8List theirPublicKey) {
    if (theirPublicKey.length != keyLength) throw const PhantomBoxException('bad_public_key');
    final Uint8List shared;
    try {
      shared = x25519(Uint8List.fromList(mine._secret), theirPublicKey);
    } on PhantomBoxException {
      throw const PhantomBoxException('bad_public_key');
    }
    if (_allZero(shared)) throw const PhantomBoxException('low_order_point');
    try {
      return PhantomBox._(Box(myPrivateKey: mine._secret, theirPublicKey: PublicKey(theirPublicKey)));
    } catch (_) {
      throw const PhantomBoxException('bad_public_key');
    }
  }

  factory PhantomBox.openBase58(PhantomKeyPair mine, String theirPublicKeyBase58) {
    final pk = Base58.tryDecodeLength(theirPublicKeyBase58, keyLength);
    if (pk == null) throw const PhantomBoxException('bad_public_key');
    return PhantomBox.open(mine, pk);
  }

  /// Authenticated decrypt; MAC is checked before plaintext is released.
  Uint8List decrypt(Uint8List nonce, Uint8List cipherText) {
    if (nonce.length != nonceLength || cipherText.length < 16) throw const PhantomBoxException('bad_input');
    try {
      return _box.decrypt(EncryptedMessage(nonce: nonce, cipherText: cipherText));
    } catch (_) {
      throw const PhantomBoxException('decrypt_failed');
    }
  }

  /// Decrypt Phantom's base58 `nonce` + `data`.
  Uint8List decryptBase58(String nonceB58, String dataB58) {
    final n = Base58.tryDecodeLength(nonceB58, nonceLength);
    if (n == null) throw const PhantomBoxException('bad_input');
    final Uint8List d;
    try {
      d = Base58.decode(dataB58);
    } on FormatException {
      throw const PhantomBoxException('bad_input');
    }
    return decrypt(n, d);
  }

  /// Encrypt with a fresh random 24-byte nonce (CSPRNG).
  ({Uint8List nonce, Uint8List cipherText}) encrypt(Uint8List plainText) {
    try {
      final m = _box.encrypt(plainText);
      return (nonce: Uint8List.fromList(m.nonce), cipherText: Uint8List.fromList(m.cipherText));
    } catch (_) {
      throw const PhantomBoxException('encrypt_failed');
    }
  }
}
