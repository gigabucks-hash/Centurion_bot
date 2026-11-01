/// Phantom deeplink wallet login (Android first; no SDK, no MWA).
///
/// Flow (https://docs.phantom.com/phantom-deeplinks):
/// 1. `https://phantom.app/ul/v1/connect?app_url&dapp_encryption_public_key&cluster=mainnet-beta
///    &redirect_link=centurion://auth?state=<S>&step=connect`
///    → redirect with `phantom_encryption_public_key, nonce, data` (Box-encrypted
///    `{public_key, session}`) or `errorCode, errorMessage`.
/// 2. `https://phantom.app/ul/v1/signMessage?dapp_encryption_public_key&nonce&payload
///    &redirect_link=centurion://auth?state=<S>&step=sign`, payload = Box(`{message:
///    base58(exact server bytes), session, display:"utf8"}`) → redirect with `nonce, data`
///    (`{signature}`).
///
/// Hijack defenses for the custom scheme (any app can register `centurion://`):
/// - a [PendingLogin] with a random 128-bit state id, TTL 5 min, single use per step,
///   bound to the in-memory x25519 keypair and the Phantom session; redirects without
///   the matching state/step are ignored ([rejectedRedirects]);
/// - Box decryption authenticates the payload (MAC) and rejects low-order keys;
/// - connect: `public_key` must be base58 of 32 bytes; sign: `signature` base58 of 64
///   bytes (+ `public_key`, when present, equal to the connected wallet);
/// - the key, the session and the shared secret never leave memory.
library;

import 'dart:async';
import 'dart:convert';
import 'dart:math';
import 'dart:typed_data';

import '../../data/api/auth.dart' show WalletSignatureDeclined, WalletSigner;
import '../app_identity.dart';
import 'base58.dart';
import 'deep_link_channel.dart';
import 'phantom_box.dart';

class PhantomConfig {
  const PhantomConfig({
    this.appUrl = appUrlPlaceholder,
    this.cluster = 'mainnet-beta',
    this.baseUrl = 'https://phantom.app/ul/v1',
    this.redirectBase = AppIdentity.authRedirect,
    this.ttl = const Duration(minutes: 5),
  });

  /// Boss: domain later ("Nanti dulu"). Phantom shows this URL's metadata; replace
  /// with the real https domain (= SIWS domain) when it exists.
  static const appUrlPlaceholder = 'https://centurion.trade.invalid';

  final String appUrl;
  final String cluster;
  final String baseUrl;
  final String redirectBase;
  final Duration ttl;
}

/// Why a wallet step failed (UI maps these to copy; never shown raw).
class PhantomLoginException implements Exception {
  const PhantomLoginException(this.reason, [this.walletCode]);

  /// `not_installed` | `expired` | `bad_response` | `crypto` | `wallet_error` | `superseded` | `no_session`.
  final String reason;
  final String? walletCode;
  @override
  String toString() => 'PhantomLoginException($reason${walletCode == null ? '' : ', $walletCode'})';
}

enum PhantomStep { connect, sign }

/// One login attempt. Lives in memory only.
class PendingLogin {
  PendingLogin._(this.state, this.keyPair, this.createdAt, this.ttl);

  final String state;
  final PhantomKeyPair keyPair;
  final DateTime createdAt;
  final Duration ttl;
  PhantomBox? box;
  String? session;
  String? address;
  PhantomStep? awaiting;
  Completer<Map<String, String>>? _waiter;
  final _consumed = <PhantomStep>{};

  bool expired(DateTime now) => now.difference(createdAt) > ttl;
}

class PhantomDeeplinkSigner implements WalletSigner {
  PhantomDeeplinkSigner(
    this.platform, {
    this.config = const PhantomConfig(),
    DateTime Function()? clock,
    Random? random,
    PhantomKeyPair Function()? keyPairFactory,
  }) : _clock = clock ?? (() => DateTime.now().toUtc()),
       _random = random ?? Random.secure(),
       _newKeyPair = keyPairFactory ?? PhantomKeyPair.generate {
    _sub = platform.links.listen(handleRedirect);
  }

  final DeepLinkPlatform platform;
  final PhantomConfig config;
  final DateTime Function() _clock;
  final Random _random;
  final PhantomKeyPair Function() _newKeyPair;
  late final StreamSubscription<Uri> _sub;

  PendingLogin? _pending;

  /// Redirects dropped by the state/step/TTL checks (tests, diagnostics; never logged with params).
  int rejectedRedirects = 0;

  /// Test hook.
  PendingLogin? get pending => _pending;

  String _newState() => Base58.encode(List<int>.generate(16, (_) => _random.nextInt(256)));

  Uri _redirect(PendingLogin p, PhantomStep step) =>
      Uri.parse('${config.redirectBase}?state=${p.state}&step=${step.name}');

  Uri connectUri(PendingLogin p) => Uri.parse('${config.baseUrl}/connect').replace(
    queryParameters: {
      'app_url': config.appUrl,
      'dapp_encryption_public_key': p.keyPair.publicKeyBase58,
      'cluster': config.cluster,
      'redirect_link': _redirect(p, PhantomStep.connect).toString(),
    },
  );

  @override
  Future<String> connect() async {
    _abort(const PhantomLoginException('superseded'));
    final p = PendingLogin._(_newState(), _newKeyPair(), _clock(), config.ttl);
    _pending = p;
    final params = await _roundTrip(p, PhantomStep.connect, connectUri(p));
    final theirKey = params['phantom_encryption_public_key'];
    if (theirKey == null) throw _fail(p, 'bad_response');
    try {
      p.box = PhantomBox.openBase58(p.keyPair, theirKey);
      final data = _decryptJson(p.box!, params);
      final pk = data['public_key'];
      final session = data['session'];
      if (pk is! String || Base58.tryDecodeLength(pk, 32) == null || session is! String || session.isEmpty) {
        throw _fail(p, 'bad_response');
      }
      p.address = pk;
      p.session = session;
      return pk;
    } on PhantomBoxException {
      throw _fail(p, 'crypto');
    }
  }

  @override
  Future<String> signMessageBase58(String address, String message) async {
    final p = _pending;
    if (p == null || p.box == null || p.session == null || p.address == null) {
      throw const PhantomLoginException('no_session');
    }
    if (p.expired(_clock())) throw _fail(p, 'expired');
    if (address != p.address) throw _fail(p, 'bad_response');
    final payload = utf8.encode(
      jsonEncode({'message': Base58.encode(utf8.encode(message)), 'session': p.session, 'display': 'utf8'}),
    );
    final ({Uint8List nonce, Uint8List cipherText}) enc;
    try {
      enc = p.box!.encrypt(Uint8List.fromList(payload));
    } on PhantomBoxException {
      throw _fail(p, 'crypto');
    }
    final uri = Uri.parse('${config.baseUrl}/signMessage').replace(
      queryParameters: {
        'dapp_encryption_public_key': p.keyPair.publicKeyBase58,
        'nonce': Base58.encode(enc.nonce),
        'redirect_link': _redirect(p, PhantomStep.sign).toString(),
        'payload': Base58.encode(enc.cipherText),
      },
    );
    final params = await _roundTrip(p, PhantomStep.sign, uri);
    try {
      final data = _decryptJson(p.box!, params);
      final sig = data['signature'];
      final pk = data['public_key'] ?? data['publicKey'];
      if (sig is! String || Base58.tryDecodeLength(sig, 64) == null) throw _fail(p, 'bad_response');
      if (pk != null && pk != p.address) throw _fail(p, 'bad_response');
      _clear(); // attempt finished: drop keypair, box and session
      return sig;
    } on PhantomBoxException {
      throw _fail(p, 'crypto');
    }
  }

  Map<String, Object?> _decryptJson(PhantomBox box, Map<String, String> params) {
    final nonce = params['nonce'];
    final data = params['data'];
    if (nonce == null || data == null) throw const PhantomBoxException('bad_input');
    final plain = box.decryptBase58(nonce, data);
    try {
      final j = jsonDecode(utf8.decode(plain));
      if (j is Map) return j.cast<String, Object?>();
    } on FormatException {
      // fall through
    }
    throw const PhantomBoxException('bad_input');
  }

  Future<Map<String, String>> _roundTrip(PendingLogin p, PhantomStep step, Uri uri) async {
    p.awaiting = step;
    final w = p._waiter = Completer<Map<String, String>>();
    final opened = await platform.openExternal(uri);
    if (!opened) throw _fail(p, 'not_installed');
    final remaining = p.ttl - _clock().difference(p.createdAt);
    final params = await w.future.timeout(
      remaining.isNegative ? Duration.zero : remaining,
      onTimeout: () => throw _fail(p, 'expired'),
    );
    final code = params['errorCode'];
    if (code != null) {
      _clear();
      if (code == '4001') throw const WalletSignatureDeclined();
      throw PhantomLoginException('wallet_error', code);
    }
    return params;
  }

  /// Every `centurion://auth` redirect lands here. Unknown/expired/replayed → dropped.
  void handleRedirect(Uri uri) {
    final p = _pending;
    final qp = uri.queryParameters;
    final ok =
        uri.scheme == AppIdentity.scheme &&
        uri.host == 'auth' &&
        p != null &&
        qp['state'] == p.state &&
        p.awaiting != null &&
        qp['step'] == p.awaiting!.name &&
        !p._consumed.contains(p.awaiting) &&
        !p.expired(_clock()) &&
        p._waiter != null &&
        !p._waiter!.isCompleted;
    if (!ok) {
      rejectedRedirects++;
      return;
    }
    p._consumed.add(p.awaiting!);
    p.awaiting = null;
    p._waiter!.complete(Map.of(qp));
  }

  PhantomLoginException _fail(PendingLogin p, String reason) {
    if (identical(_pending, p)) _clear();
    return PhantomLoginException(reason);
  }

  void _abort(PhantomLoginException e) {
    final w = _pending?._waiter;
    if (w != null && !w.isCompleted) w.completeError(e);
    _clear();
  }

  void _clear() => _pending = null;

  /// User left the login screen.
  void cancel() => _abort(const PhantomLoginException('superseded'));

  Future<void> dispose() async {
    cancel();
    await _sub.cancel();
  }
}
