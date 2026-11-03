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
/// No wallet SDK is installed (MWA deferred): [WalletSigner] has the Phantom
/// deeplink implementation (`core/auth/phantom_deeplink.dart`, Android first) and
/// the test/mock signer. Only the refresh token is persisted ([SecureSessionStore]
/// over flutter_secure_storage); the access token stays in memory.
///
/// Before `/verify` the client checks the payload ([SiwsGuard]): address = base58
/// of 32 bytes and equal to the connected wallet, signature = base58 of 64 bytes,
/// and the signed message is byte-identical to the server's (whose header names
/// our domain and that address). The server re-checks everything (ed25519, nonce).
library;

import 'dart:async';
import 'dart:convert';
import 'dart:math';

import '../../core/auth/base58.dart';
import '../../core/auth/secure_token_store.dart';

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
  const SiwsChallenge({
    required this.nonce,
    required this.message,
    required this.issuedAt,
    required this.expiresAt,
    this.statementVersion = SiwsChallenge.currentStatementVersion,
  });

  /// B-7 (CHANGELOG "Unreleased: wallet login"): statement text is versioned.
  static const currentStatementVersion = 1;
  final String nonce;

  /// Statement version the server bound to this nonce (verify accepts only it).
  final int statementVersion;

  /// Exact UTF-8 bytes the wallet must sign (send back unchanged).
  final String message;
  final DateTime issuedAt;
  final DateTime expiresAt;

  static SiwsChallenge fromJson(Map<String, Object?> j) => SiwsChallenge(
    nonce: j['nonce']! as String,
    message: j['message']! as String,
    issuedAt: DateTime.parse(j['issued_at']! as String),
    expiresAt: DateTime.parse(j['expires_at']! as String),
    statementVersion: (j['statement_version'] as num?)?.toInt() ?? currentStatementVersion,
  );
}

/// Client-side payload checks before `/v1/auth/siws/verify` (hijack defense for
/// the custom-scheme redirect; SIWS_LOGIN_REVIEW §12). Throws [SiwsPayloadRejected].
abstract final class SiwsGuard {
  static void checkAddress(String address) {
    if (Base58.tryDecodeLength(address, 32) == null) throw const SiwsPayloadRejected('address_format');
  }

  /// The server's message must be a SIWS message for OUR domain and THIS address.
  /// We never sign text whose header names another domain or wallet.
  static void checkChallenge(SiwsChallenge ch, {required String domain, required String address}) {
    final lines = ch.message.split('\n');
    if (lines.length < 2 ||
        lines[0] != '$domain wants you to sign in with your Solana account:' ||
        lines[1] != address) {
      throw const SiwsPayloadRejected('message_header');
    }
    if (!ch.message.contains('\nNonce: ${ch.nonce}\n') && !ch.message.endsWith('\nNonce: ${ch.nonce}')) {
      throw const SiwsPayloadRejected('message_nonce');
    }
  }

  static void checkSigned({
    required String connectedAddress,
    required String address,
    required String serverMessage,
    required String signedMessage,
    required String signatureBase58,
  }) {
    checkAddress(address);
    if (address != connectedAddress) throw const SiwsPayloadRejected('address_mismatch');
    if (signedMessage != serverMessage) throw const SiwsPayloadRejected('message_mismatch');
    if (Base58.tryDecodeLength(signatureBase58, 64) == null) throw const SiwsPayloadRejected('signature_format');
  }
}

/// Client refused to send a login payload (never reaches the server).
class SiwsPayloadRejected implements Exception {
  const SiwsPayloadRejected(this.reason);
  final String reason;
  @override
  String toString() => 'SiwsPayloadRejected($reason)';
}

/// REST contract for `/v1/auth/*`. Errors are typed [ApiException]s:
/// nonce → FORBIDDEN_ROLE / RATE_LIMITED / VALIDATION_FAILED; verify →
/// SIWS_NONCE_INVALID / SIWS_SIGNATURE_INVALID / FORBIDDEN_ROLE; refresh →
/// UNAUTHENTICATED {reason: refresh_reused|refresh_revoked|refresh_expired|refresh_invalid}
/// / FORBIDDEN_ROLE.
abstract interface class SiwsAuthRepository {
  Future<SiwsChallenge> nonce({
    required String address,
    required String domain,
    String? uri,
    String? chainId,
    int statementVersion = SiwsChallenge.currentStatementVersion,
  });

  /// [client] is always `mobile` from this app (becomes the `centurion_client` claim).
  Future<Session> verify({
    required String address,
    required String message,
    required String signatureBase58,
    String client = 'mobile',
  });
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

/// Production store: the [Session] (incl. the 15-min access token) lives in memory;
/// ONLY the rotating refresh token goes to Keychain/Keystore via [SecureTokenStore].
/// After a cold start [read] is null and [persistedRefreshToken] lets
/// [AuthController.restore] trade it for a fresh session.
class SecureSessionStore implements SessionStore {
  SecureSessionStore(this.tokens);
  final SecureTokenStore tokens;
  Session? _s;

  @override
  Future<Session?> read() async => _s;

  @override
  Future<void> write(Session? s) async {
    _s = s;
    if (s == null) {
      await tokens.clear();
    } else {
      await tokens.save(s.refreshToken);
    }
  }

  Future<String?> persistedRefreshToken() async {
    await tokens.firstRunCleanup();
    return tokens.load();
  }
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
    if (s == null) {
      final st = store;
      if (st is SecureSessionStore) await _restoreFromRefresh(await st.persistedRefreshToken());
      return;
    }
    _set(SignedIn(s));
    if (!_clock().isBefore(s.refreshAt)) {
      await refreshNow();
    } else {
      _schedule(s);
    }
  }

  /// Cold start: only the refresh token survived. Same single-flight path.
  Future<void> _restoreFromRefresh(String? refreshToken) async {
    if (refreshToken == null) return;
    await (_inflight ??= _refreshWith(refreshToken).whenComplete(() => _inflight = null));
  }

  Future<Session> signIn() async {
    final address = await signer.connect();
    SiwsGuard.checkAddress(address);
    final ch = await repo.nonce(address: address, domain: domain, chainId: 'solana:mainnet');
    SiwsGuard.checkChallenge(ch, domain: domain, address: address);
    final message = ch.message; // exact server bytes, never rebuilt
    final sig = await signer.signMessageBase58(address, message);
    SiwsGuard.checkSigned(
      connectedAddress: address,
      address: address,
      serverMessage: ch.message,
      signedMessage: message,
      signatureBase58: sig,
    );
    final s = await repo.verify(address: address, message: message, signatureBase58: sig, client: 'mobile');
    await _accept(s);
    return s;
  }

  /// Single-flight refresh. Returns null after a forced logout.
  Future<Session?> refreshNow() => _inflight ??= _doRefresh().whenComplete(() => _inflight = null);

  Future<Session?> _doRefresh() async {
    final cur = _state;
    if (cur is! SignedIn) return null;
    return _refreshWith(cur.session.refreshToken);
  }

  Future<Session?> _refreshWith(String refreshToken) async {
    try {
      final s = await repo.refresh(refreshToken);
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
  Future<SiwsChallenge> nonce({
    required String address,
    required String domain,
    String? uri,
    String? chainId,
    int statementVersion = SiwsChallenge.currentStatementVersion,
  }) async {
    _allow(address);
    final now = _clock();
    final n = _rand(32);
    _nonces[n] = (address: address, domain: domain, exp: now.add(nonceTtl));
    final message = [
      '$domain wants you to sign in with your Solana account:',
      address,
      '',
      statementV1,
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

  /// API_ENDPOINTS 4.1 B-7, statement_version 1.
  static const statementV1 =
      'Sign in to Centurion (practice). This request does not trigger a transaction or cost any fees.';

  /// Last `client` seen by [verify] (tests).
  String? lastClient;

  /// Mock "signature": 64 deterministic bytes (FNV-1a expansion of `address|message`)
  /// in base58, so it has the wire shape of an ed25519 signature. The real server
  /// checks ed25519; this is NOT a signature.
  static String fakeSignature(String address, String message) {
    final input = utf8.encode('$address|$message');
    final out = <int>[];
    var h = 0x811c9dc5;
    for (var round = 0; out.length < 64; round++) {
      for (final b in [...input, round]) {
        h = ((h ^ b) * 0x01000193) & 0xffffffff;
      }
      out.addAll([h & 0xff, (h >> 8) & 0xff, (h >> 16) & 0xff, (h >> 24) & 0xff]);
    }
    out[0] |= 1; // no leading zero byte → fixed 64-byte decode
    return Base58.encode(out.sublist(0, 64));
  }

  @override
  Future<Session> verify({
    required String address,
    required String message,
    required String signatureBase58,
    String client = 'web',
  }) async {
    lastClient = client;
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
