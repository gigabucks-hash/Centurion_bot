/// Auth (contracts 1.1.4 private single-owner MVP, API_ENDPOINTS §4.1).
///
/// **Wallet-only SIWS** (Phantom): `POST /v1/auth/siws/nonce` → the wallet signs the
/// exact message → `POST /v1/auth/siws/verify` → [Session]. Only `OWNER_WALLETS`
/// (allowlist) may log in (`403 FORBIDDEN_ROLE {reason: wallet_not_allowed}`).
/// Access token 15 min (`AUTH_ACCESS_TTL_S`=900); refresh tokens ROTATE on every
/// `/v1/auth/session/refresh`; presenting a rotated one again revokes the whole
/// family (`401 UNAUTHENTICATED {reason: refresh_reused}`) → forced logout.
/// Scopes `read`, `trade` only (never `trade:real`). Login wallet ≠ trading wallet.
///
/// Dropped from the MVP: email OTP and Google/Apple (no client code, server 404).
/// Telegram OIDC stays a stub behind `FeatureFlags.telegramOidcEnabled=false`
/// ([TelegramAuthStub]); no Telegram SDK installed.
///
/// No wallet SDK is installed (separate review): [WalletSigner] is an interface;
/// the only implementation is the test/mock signer. Tokens live in memory
/// ([InMemorySessionStore]) until the secure-storage package is approved.
library;

import 'dart:async';
import 'dart:convert';
import 'dart:math';

import 'api_exception.dart';

/// REST paths (single place).
abstract final class AuthPaths {
  static const siwsNonce = '/v1/auth/siws/nonce';
  static const siwsVerify = '/v1/auth/siws/verify';
  static const sessionRefresh = '/v1/auth/session/refresh';
  static const sessionLogout = '/v1/auth/session/logout';

  /// Flag-gated stubs (server answers 404 while AUTH_TELEGRAM_OIDC_ENABLED=false).
  static const telegramNonce = '/auth/telegram/nonce';
  static const telegramVerify = '/auth/telegram/verify';
}

/// `Session` (API_ENDPOINTS §4.1). Tokens are never logged ([toString] redacts).
class Session {
  const Session({
    required this.accessToken,
    required this.expiresAt,
    required this.refreshToken,
    required this.refreshExpiresAt,
    required this.sessionId,
    required this.userId,
    required this.address,
    this.workspaceId,
    this.tokenType = 'bearer',
  });

  final String accessToken;
  final String tokenType;
  final DateTime expiresAt;

  /// Opaque `srt_...`; single use (rotation).
  final String refreshToken;
  final DateTime refreshExpiresAt;
  final String sessionId;
  final String userId;
  final String address;

  /// Only on verify (owner's workspace, created on first login).
  final String? workspaceId;

  static Session fromJson(Map<String, Object?> j, {DateTime? now, String? workspaceIdFallback}) {
    final at = now ?? DateTime.now().toUtc();
    final exp = j['expires_at'];
    return Session(
      accessToken: j['access_token']! as String,
      tokenType: (j['token_type'] as String?) ?? 'bearer',
      expiresAt: exp is String ? DateTime.parse(exp) : at.add(Duration(seconds: (j['expires_in']! as num).toInt())),
      refreshToken: j['refresh_token']! as String,
      refreshExpiresAt: at.add(Duration(seconds: ((j['refresh_expires_in'] as num?) ?? 0).toInt())),
      sessionId: j['session_id']! as String,
      userId: j['user_id']! as String,
      address: j['address']! as String,
      workspaceId: (j['workspace_id'] as String?) ?? workspaceIdFallback,
    );
  }

  /// Refresh this long before the access token expires.
  static const refreshLeeway = Duration(seconds: 60);
  DateTime get refreshAt => expiresAt.subtract(refreshLeeway);

  @override
  String toString() => 'Session($sessionId, $address, exp $expiresAt)';
}

class SiwsChallenge {
  const SiwsChallenge({required this.nonce, required this.message, required this.issuedAt, required this.expiresAt});
  final String nonce;

  /// Exact UTF-8 bytes the wallet must sign (send back unchanged).
  final String message;
  final DateTime issuedAt;
  final DateTime expiresAt;

  static SiwsChallenge fromJson(Map<String, Object?> j) => SiwsChallenge(
    nonce: j['nonce']! as String,
    message: j['message']! as String,
    issuedAt: DateTime.parse(j['issued_at']! as String),
    expiresAt: DateTime.parse(j['expires_at']! as String),
  );
}

/// REST contract for `/v1/auth/*`. Errors are typed [ApiException]s:
/// nonce → FORBIDDEN_ROLE / RATE_LIMITED / VALIDATION_FAILED; verify →
/// SIWS_NONCE_INVALID / SIWS_SIGNATURE_INVALID / FORBIDDEN_ROLE; refresh →
/// UNAUTHENTICATED {reason: refresh_reused|refresh_revoked|refresh_expired|refresh_invalid}
/// / FORBIDDEN_ROLE.
abstract interface class SiwsAuthRepository {
  Future<SiwsChallenge> nonce({required String address, required String domain, String? uri, String? chainId});
  Future<Session> verify({required String address, required String message, required String signatureBase58});
  Future<Session> refresh(String refreshToken);

  /// Always succeeds (`{revoked: true}`).
  Future<void> logout(String refreshToken);
}

/// Wallet app boundary (Phantom deeplink / MWA). Signs a MESSAGE, never a
/// transaction. Throws [WalletSignatureDeclined] when the user cancels.
abstract interface class WalletSigner {
  Future<String> connect();
  Future<String> signMessageBase58(String address, String message);
}

class WalletSignatureDeclined implements Exception {
  const WalletSignatureDeclined();
}

class TelegramLoginDisabled implements Exception {
  const TelegramLoginDisabled();
  @override
  String toString() => 'Telegram login is disabled (AUTH_TELEGRAM_OIDC_ENABLED=false)';
}

/// Telegram OIDC: out of the MVP. Kept as a stub behind the flag (OFF).
class TelegramAuthStub {
  const TelegramAuthStub({this.enabled = false});
  final bool enabled;
  Future<Session> signIn() async =>
      enabled ? throw UnimplementedError('Telegram OIDC not in MVP') : throw const TelegramLoginDisabled();
}

/// Token persistence. Production: Keychain/Keystore adapter (pending review of
/// the secure-storage package); until then memory only (re-login after restart).
abstract interface class SessionStore {
  Future<Session?> read();
  Future<void> write(Session? s);
}

class InMemorySessionStore implements SessionStore {
  Session? _s;
  @override
  Future<Session?> read() async => _s;
  @override
  Future<void> write(Session? s) async => _s = s;
}

// ------------------------------------------------------------------ state

sealed class AuthState {
  const AuthState();
}

class SignedOut extends AuthState {
  const SignedOut();
}

class SignedIn extends AuthState {
  const SignedIn(this.session);
  final Session session;
}

/// The server revoked the session (refresh reuse, wallet removed from the
/// allowlist, revoked/expired refresh). Tokens are already wiped; the UI shows
/// why and returns to the wallet login.
class ForcedLogout extends AuthState {
  const ForcedLogout(this.reason);

  /// `refresh_reused` | `refresh_revoked` | `refresh_expired` | `refresh_invalid` | `wallet_not_allowed`.
  final String reason;
}

/// Owns the session: login, proactive refresh ([Session.refreshAt]), one
/// refresh in flight at a time (a second concurrent refresh would present a
/// rotated token = reuse = family revoked), logout, forced logout.
class AuthController {
  AuthController({
    required this.repo,
    required this.signer,
    required this.domain,
    SessionStore? store,
    DateTime Function()? clock,
  }) : store = store ?? InMemorySessionStore(),
       _clock = clock ?? (() => DateTime.now().toUtc());

  final SiwsAuthRepository repo;
  final WalletSigner signer;
  final String domain;
  final SessionStore store;
  final DateTime Function() _clock;

  final _states = StreamController<AuthState>.broadcast();
  AuthState _state = const SignedOut();
  AuthState get state => _state;
  Stream<AuthState> get states => _states.stream;
  Timer? _timer;
  Future<Session?>? _inflight;

  void _set(AuthState s) {
    _state = s;
    if (!_states.isClosed) _states.add(s);
  }

  Future<void> restore() async {
    final s = await store.read();
    if (s == null) return;
    _set(SignedIn(s));
    if (!_clock().isBefore(s.refreshAt)) {
      await refreshNow();
    } else {
      _schedule(s);
    }
  }

  Future<Session> signIn() async {
    final address = await signer.connect();
    final ch = await repo.nonce(address: address, domain: domain, chainId: 'solana:mainnet');
    final sig = await signer.signMessageBase58(address, ch.message);
    final s = await repo.verify(address: address, message: ch.message, signatureBase58: sig);
    await _accept(s);
    return s;
  }

  /// Single-flight refresh. Returns null after a forced logout.
  Future<Session?> refreshNow() => _inflight ??= _doRefresh().whenComplete(() => _inflight = null);

  Future<Session?> _doRefresh() async {
    final cur = _state;
    if (cur is! SignedIn) return null;
    try {
      final s = await repo.refresh(cur.session.refreshToken);
      await _accept(s);
      return s;
    } on ApiException catch (e) {
      if (e.code == ApiErrorCode.unauthenticated || e.code == ApiErrorCode.forbiddenRole) {
        await _force(
          '${e.details['reason'] ?? (e.code == ApiErrorCode.forbiddenRole ? 'wallet_not_allowed' : 'refresh_invalid')}',
        );
        return null;
      }
      rethrow; // network / 5xx: keep the session, retry on the next request
    }
  }

  /// A request answered 401 UNAUTHENTICATED with an otherwise valid session:
  /// try one refresh; the caller retries the request with the new token.
  Future<Session?> onUnauthorized() => refreshNow();

  Future<void> signOut() async {
    final cur = _state;
    _timer?.cancel();
    await store.write(null);
    _set(const SignedOut());
    if (cur is SignedIn) {
      try {
        await repo.logout(cur.session.refreshToken);
      } on Object {
        // logout is best effort; tokens are already gone locally
      }
    }
  }

  Future<void> _accept(Session s) async {
    await store.write(s);
    _set(SignedIn(s));
    _schedule(s);
  }

  Future<void> _force(String reason) async {
    _timer?.cancel();
    await store.write(null);
    _set(ForcedLogout(reason));
  }

  void _schedule(Session s) {
    _timer?.cancel();
    final wait = s.refreshAt.difference(_clock());
    _timer = Timer(wait.isNegative ? Duration.zero : wait, () => unawaited(refreshNow().catchError((_) => null)));
  }

  void dispose() {
    _timer?.cancel();
    _states.close();
  }
}

// ------------------------------------------------------------------ mock

/// In-memory stand-in for the API's SIWS + session routes (allowlist,
/// single-use 5-min nonces bound to address+domain, 15-min access tokens,
/// rotating refresh tokens with family revocation on reuse).
class MockSiwsAuth implements SiwsAuthRepository {
  MockSiwsAuth({required Set<String> ownerWallets, DateTime Function()? clock, int seed = 1})
    : _owners = ownerWallets,
      _clock = clock ?? (() => DateTime.now().toUtc()),
      _rng = Random(seed);

  final Set<String> _owners;
  final DateTime Function() _clock;
  final Random _rng;

  static const accessTtl = Duration(minutes: 15);
  static const refreshTtl = Duration(days: 30);
  static const nonceTtl = Duration(minutes: 5);

  final _nonces = <String, ({String address, String domain, DateTime exp})>{};
  // refresh token → family (session id); rotated tokens stay known to detect reuse.
  final _refresh = <String, ({String family, bool used, DateTime exp})>{};
  final _revokedFamilies = <String>{};
  final _families = <String, String>{}; // session id → address
  int _seq = 0;

  String _rand(int n) {
    const a = 'ABCDEFGHJKLMNPQRSTUVWXYZabcdefghijkmnopqrstuvwxyz0123456789';
    return List.generate(n, (_) => a[_rng.nextInt(a.length)]).join();
  }

  void _allow(String address) {
    if (!_owners.contains(address)) {
      throw ApiException.fromCode('FORBIDDEN_ROLE', details: {'reason': 'wallet_not_allowed'});
    }
  }

  @override
  Future<SiwsChallenge> nonce({required String address, required String domain, String? uri, String? chainId}) async {
    _allow(address);
    final now = _clock();
    final n = _rand(32);
    _nonces[n] = (address: address, domain: domain, exp: now.add(nonceTtl));
    final message = [
      '$domain wants you to sign in with your Solana account:',
      address,
      '',
      'Sign in to Centurion Trade',
      '',
      'URI: ${uri ?? 'https://$domain'}',
      'Version: 1',
      'Chain ID: ${chainId ?? 'solana:mainnet'}',
      'Nonce: $n',
      'Issued At: ${now.toIso8601String()}',
      'Expiration Time: ${now.add(nonceTtl).toIso8601String()}',
    ].join('\n');
    return SiwsChallenge(nonce: n, message: message, issuedAt: now, expiresAt: now.add(nonceTtl));
  }

  /// Mock "signature": base64url of `address|message` (the real server checks ed25519).
  static String fakeSignature(String address, String message) =>
      base64Url.encode(utf8.encode('$address|$message')).replaceAll('=', '');

  @override
  Future<Session> verify({required String address, required String message, required String signatureBase58}) async {
    final m = RegExp(r'^Nonce: (\w+)$', multiLine: true).firstMatch(message);
    final rec = m == null ? null : _nonces.remove(m.group(1)); // consumed even if the signature is bad
    if (rec == null || rec.address != address || _clock().isAfter(rec.exp)) {
      throw ApiException.fromCode('SIWS_NONCE_INVALID', details: {'reason': rec == null ? 'nonce' : 'expired'});
    }
    _allow(address);
    if (signatureBase58 != fakeSignature(address, message)) throw ApiException.fromCode('SIWS_SIGNATURE_INVALID');
    final sid = 'ses_${++_seq}';
    _families[sid] = address;
    return _mint(sid, workspaceId: 'ws_practice');
  }

  Session _mint(String sid, {String? workspaceId}) {
    final now = _clock();
    final rt = 'srt_${_rand(40)}';
    _refresh[rt] = (family: sid, used: false, exp: now.add(refreshTtl));
    return Session(
      accessToken: 'at_${_rand(24)}',
      expiresAt: now.add(accessTtl),
      refreshToken: rt,
      refreshExpiresAt: now.add(refreshTtl),
      sessionId: sid,
      userId: 'usr_${_families[sid]!.substring(0, min(6, _families[sid]!.length))}',
      address: _families[sid]!,
      workspaceId: workspaceId,
    );
  }

  @override
  Future<Session> refresh(String refreshToken) async {
    final rec = _refresh[refreshToken];
    Never fail(String reason) => throw ApiException.fromCode('UNAUTHENTICATED', details: {'reason': reason});
    if (rec == null) fail('refresh_invalid');
    if (_revokedFamilies.contains(rec.family)) fail('refresh_revoked');
    if (rec.used) {
      _revokedFamilies.add(rec.family); // reuse → whole family revoked
      fail('refresh_reused');
    }
    if (_clock().isAfter(rec.exp)) fail('refresh_expired');
    if (!_owners.contains(_families[rec.family])) {
      _revokedFamilies.add(rec.family);
      throw ApiException.fromCode('FORBIDDEN_ROLE', details: {'reason': 'wallet_not_allowed'});
    }
    _refresh[refreshToken] = (family: rec.family, used: true, exp: rec.exp);
    return _mint(rec.family);
  }

  @override
  Future<void> logout(String refreshToken) async {
    final rec = _refresh[refreshToken];
    if (rec != null) _revokedFamilies.add(rec.family);
  }

  /// Tests: drop a wallet from OWNER_WALLETS.
  void debugRemoveOwner(String address) => _owners.remove(address);
}

/// Test/mock signer. NOT a wallet: no keys, no SDK.
class MockWalletSigner implements WalletSigner {
  MockWalletSigner(this.address, {this.decline = false});
  final String address;
  bool decline;
  @override
  Future<String> connect() async => address;
  @override
  Future<String> signMessageBase58(String address, String message) async =>
      decline ? throw const WalletSignatureDeclined() : MockSiwsAuth.fakeSignature(address, message);
}
