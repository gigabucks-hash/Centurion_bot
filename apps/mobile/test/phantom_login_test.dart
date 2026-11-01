import 'dart:async';
import 'dart:convert';
import 'dart:typed_data';

import 'package:flutter/widgets.dart' show Locale;
import 'package:flutter_test/flutter_test.dart';
import 'package:sentra_mobile/core/auth/base58.dart';
import 'package:sentra_mobile/core/auth/deep_link_channel.dart';
import 'package:sentra_mobile/core/auth/phantom_box.dart';
import 'package:sentra_mobile/core/auth/phantom_deeplink.dart';
import 'package:sentra_mobile/core/auth/secure_token_store.dart';
import 'package:sentra_mobile/core/error_l10n.g.dart';
import 'package:sentra_mobile/data/api/api_exception.dart';
import 'package:sentra_mobile/data/api/auth.dart';
import 'package:sentra_mobile/data/api/auth_http.dart';
import 'package:sentra_mobile/l10n/gen/app_localizations.dart';

const owner = '451rpun8ivZ7knpEnMs7HkurvtoUFE8u8ZFvNERWk7hG';
const domain = 'app.sentra.local';

/// Plays Phantom: answers /connect and /signMessage via the redirect, Box-encrypted.
class FakePhantom implements DeepLinkPlatform {
  FakePhantom({this.address = owner});
  String address;
  final _links = StreamController<Uri>.broadcast(sync: false);
  final opened = <Uri>[];
  final wallet = PhantomKeyPair.generate();
  PhantomBox? _box;
  String? signedText;

  bool installed = true;
  bool declineSign = false;
  bool silent = false;
  Uint8List? lowOrderKey;
  int signatureBytes = 64;

  /// Runs before the genuine answer (e.g. an attacker's injected redirect).
  void Function(Uri request)? beforeAnswer;

  @override
  Stream<Uri> get links => _links.stream;

  void inject(Uri u) => _links.add(u);

  Uri _redirect(Uri req, Map<String, String> extra) {
    final r = Uri.parse(req.queryParameters['redirect_link']!);
    return r.replace(queryParameters: {...r.queryParameters, ...extra});
  }

  @override
  Future<bool> openExternal(Uri uri) async {
    if (!installed) return false;
    opened.add(uri);
    scheduleMicrotask(() {
      beforeAnswer?.call(uri);
      if (silent) return;
      final dappPk = Base58.decode(uri.queryParameters['dapp_encryption_public_key']!);
      if (uri.path.endsWith('/connect')) {
        expect(uri.queryParameters['cluster'], 'mainnet-beta');
        expect(uri.queryParameters['app_url'], startsWith('https://'));
        _box = PhantomBox.open(wallet, dappPk);
        final enc = _box!.encrypt(
          Uint8List.fromList(utf8.encode(jsonEncode({'public_key': address, 'session': 'sess-1'}))),
        );
        _links.add(
          _redirect(uri, {
            'phantom_encryption_public_key': lowOrderKey != null ? Base58.encode(lowOrderKey!) : wallet.publicKeyBase58,
            'nonce': Base58.encode(enc.nonce),
            'data': Base58.encode(enc.cipherText),
          }),
        );
      } else {
        if (declineSign) {
          _links.add(_redirect(uri, {'errorCode': '4001', 'errorMessage': 'User rejected the request.'}));
          return;
        }
        final payload =
            jsonDecode(utf8.decode(_box!.decryptBase58(uri.queryParameters['nonce']!, uri.queryParameters['payload']!)))
                as Map<String, Object?>;
        expect(payload['session'], 'sess-1');
        expect(payload['display'], 'utf8');
        signedText = utf8.decode(Base58.decode(payload['message']! as String));
        var sig = MockSiwsAuth.fakeSignature(address, signedText!);
        if (signatureBytes != 64) sig = Base58.encode(List.filled(signatureBytes, 7));
        final enc = _box!.encrypt(Uint8List.fromList(utf8.encode(jsonEncode({'signature': sig}))));
        _links.add(_redirect(uri, {'nonce': Base58.encode(enc.nonce), 'data': Base58.encode(enc.cipherText)}));
      }
    });
    return true;
  }
}

class FakeKv implements SecureKeyValue {
  final map = <String, String>{};
  @override
  Future<String?> read(String key) async => map[key];
  @override
  Future<void> write(String key, String value) async => map[key] = value;
  @override
  Future<void> delete(String key) async => map.remove(key);
  @override
  Future<void> deleteAll() async => map.clear();
}

class FakeTransport implements JsonTransport {
  final requests = <(String, Map<String, Object?>)>[];
  JsonResponse Function(String path, Map<String, Object?> body)? reply;
  @override
  Future<JsonResponse> postJson(String path, Map<String, Object?> body, {String? bearer}) async {
    requests.add((path, body));
    return reply!(path, body);
  }
}

JsonResponse _err(int status, String code, [Map<String, Object?> extra = const {}, Map<String, String> h = const {}]) =>
    JsonResponse(status, {
      'error': {'code': code, 'message': code, ...extra},
    }, headers: h);

void main() {
  late DateTime now;
  late MockSiwsAuth server;
  late FakePhantom phantom;
  late PhantomDeeplinkSigner signer;

  setUp(() {
    now = DateTime.utc(2026, 11, 1, 6);
    server = MockSiwsAuth(ownerWallets: {owner}, clock: () => now);
    phantom = FakePhantom();
    signer = PhantomDeeplinkSigner(phantom, clock: () => now);
  });
  tearDown(() => signer.dispose());

  AuthController controller({SessionStore? store, SiwsAuthRepository? repo}) =>
      AuthController(repo: repo ?? server, signer: signer, domain: domain, clock: () => now, store: store);

  group('Phantom deeplink SIWS', () {
    test('connect → nonce → signMessage(exact server bytes) → verify(client mobile) → SignedIn', () async {
      final c = controller();
      final s = await c.signIn();
      expect(c.state, isA<SignedIn>());
      expect(s.address, owner);
      expect(server.lastClient, 'mobile');
      expect(phantom.opened.map((u) => u.path), ['/ul/v1/connect', '/ul/v1/signMessage']);
      expect(phantom.signedText, contains('$domain wants you to sign in with your Solana account:\n$owner\n'));
      expect(phantom.signedText, contains(MockSiwsAuth.statementV1));
      final redirect = Uri.parse(phantom.opened.first.queryParameters['redirect_link']!);
      expect('${redirect.scheme}://${redirect.host}', 'centurion://auth');
      expect(redirect.queryParameters['state'], hasLength(greaterThanOrEqualTo(16)));
      expect(signer.pending, isNull, reason: 'keypair/session dropped after the attempt');
      c.dispose();
    });

    test('injected redirects with a wrong/missing state or step are ignored; the genuine one wins', () async {
      phantom.beforeAnswer = (req) {
        if (!req.path.endsWith('/connect')) return;
        final r = Uri.parse(req.queryParameters['redirect_link']!);
        phantom.inject(Uri.parse('centurion://auth?state=forged&step=connect&data=x&nonce=y'));
        phantom.inject(Uri.parse('centurion://auth?step=connect'));
        phantom.inject(r.replace(queryParameters: {...r.queryParameters, 'step': 'sign'}));
        phantom.inject(Uri.parse('evil://auth?${r.query}'));
      };
      final c = controller();
      await c.signIn();
      expect(c.state, isA<SignedIn>());
      expect(signer.rejectedRedirects, greaterThanOrEqualTo(4));
      c.dispose();
    });

    test('a replayed redirect for a consumed step is rejected (single use)', () async {
      Uri? first;
      phantom.beforeAnswer = (req) => first ??= Uri.parse(req.queryParameters['redirect_link']!);
      final c = controller();
      await c.signIn();
      final before = signer.rejectedRedirects;
      signer.handleRedirect(first!.replace(queryParameters: {...first!.queryParameters, 'data': 'x', 'nonce': 'y'}));
      expect(signer.rejectedRedirects, before + 1);
      c.dispose();
    });

    test('pending login expires after 5 min (TTL)', () async {
      phantom.silent = true;
      final f = signer.connect();
      await Future<void>.delayed(Duration.zero);
      final st = signer.pending!.state;
      now = now.add(const Duration(minutes: 6));
      signer.handleRedirect(Uri.parse('centurion://auth?state=$st&step=connect'));
      expect(signer.rejectedRedirects, 1);
      signer.cancel();
      await expectLater(f, throwsA(isA<PhantomLoginException>()));
    });

    test('low-order phantom_encryption_public_key → crypto failure, nothing sent to the API', () async {
      phantom.lowOrderKey = Uint8List(32);
      final c = controller();
      await expectLater(c.signIn(), throwsA(isA<PhantomLoginException>().having((e) => e.reason, 'reason', 'crypto')));
      expect(c.state, isA<SignedOut>());
      c.dispose();
    });

    test('a non-32-byte connected address is refused before /nonce', () async {
      phantom.address = Base58.encode(List.filled(31, 9));
      await expectLater(controller().signIn(), throwsA(isA<PhantomLoginException>()));
    });

    test('a 63-byte signature is refused before /verify', () async {
      phantom.signatureBytes = 63;
      await expectLater(controller().signIn(), throwsA(isA<PhantomLoginException>()));
      expect(server.lastClient, isNull, reason: 'verify never called');
    });

    test('user declines in Phantom (4001) → WalletSignatureDeclined, signed out', () async {
      phantom.declineSign = true;
      final c = controller();
      await expectLater(c.signIn(), throwsA(isA<WalletSignatureDeclined>()));
      expect(c.state, isA<SignedOut>());
      c.dispose();
    });

    test('Phantom not installed → not_installed', () async {
      phantom.installed = false;
      await expectLater(
        signer.connect(),
        throwsA(isA<PhantomLoginException>().having((e) => e.reason, 'r', 'not_installed')),
      );
    });

    test('server message for another domain or wallet is never signed', () async {
      final evil = _RewritingRepo(server, (m) => m.replaceFirst(domain, 'evil.example'));
      await expectLater(
        controller(repo: evil).signIn(),
        throwsA(isA<SiwsPayloadRejected>().having((e) => e.reason, 'r', 'message_header')),
      );
      expect(phantom.opened.where((u) => u.path.endsWith('signMessage')), isEmpty);
    });
  });

  group('session storage', () {
    test('only the refresh token is persisted; cold start restores via /refresh', () async {
      final kv = FakeKv();
      final c = controller(store: SecureSessionStore(SecureTokenStore(kv)));
      final s = await c.signIn();
      expect(kv.map.values, [s.refreshToken]);
      expect(kv.map.values.join(), isNot(contains(s.accessToken)));
      c.dispose();

      final c2 = controller(store: SecureSessionStore(SecureTokenStore(kv)));
      await c2.restore();
      final st = c2.state as SignedIn;
      expect(st.session.refreshToken, isNot(s.refreshToken), reason: 'rotated');
      expect(kv.map.values, [st.session.refreshToken]);
      c2.dispose();
    });

    test('reuse of a rotated token → forced logout and storage wiped', () async {
      final kv = FakeKv();
      final c = controller(store: SecureSessionStore(SecureTokenStore(kv)));
      final s1 = await c.signIn();
      await c.refreshNow();
      await expectLater(server.refresh(s1.refreshToken), throwsA(isA<ApiException>()));
      await c.refreshNow();
      expect(c.state, isA<ForcedLogout>());
      expect(kv.map, isEmpty);
      c.dispose();
    });

    test('logout clears storage', () async {
      final kv = FakeKv();
      final c = controller(store: SecureSessionStore(SecureTokenStore(kv)));
      await c.signIn();
      await c.signOut();
      expect(kv.map, isEmpty);
      c.dispose();
    });
  });

  group('HttpSiwsAuthRepository wire shapes', () {
    final sessionJson = {
      'access_token': 'at',
      'token_type': 'bearer',
      'expires_in': 900,
      'expires_at': '2026-11-01T06:15:00Z',
      'refresh_token': 'srt_x',
      'refresh_expires_in': 2592000,
      'session_id': 'ses_1',
      'user_id': 'u1',
      'address': owner,
      'workspace_id': 'ws_1',
    };

    test('nonce / verify / refresh / logout bodies', () async {
      final t = FakeTransport()
        ..reply = (path, _) => switch (path) {
          '/v1/auth/siws/nonce' => const JsonResponse(200, {
            'data': {
              'nonce': 'n1',
              'message': 'm',
              'issued_at': '2026-11-01T06:00:00Z',
              'expires_at': '2026-11-01T06:05:00Z',
              'statement_version': 1,
            },
          }),
          '/v1/auth/session/logout' => const JsonResponse(200, {
            'data': {'revoked': true},
          }),
          _ => JsonResponse(200, {'data': sessionJson}),
        };
      final r = HttpSiwsAuthRepository(t, clock: () => now);
      final ch = await r.nonce(address: owner, domain: domain);
      expect(ch.statementVersion, 1);
      final s = await r.verify(address: owner, message: 'm', signatureBase58: 'sig');
      expect(s.workspaceId, 'ws_1');
      await r.refresh('srt_x');
      await r.logout('srt_x');
      expect(t.requests.map((e) => e.$1), [
        '/v1/auth/siws/nonce',
        '/v1/auth/siws/verify',
        '/v1/auth/session/refresh',
        '/v1/auth/session/logout',
      ]);
      expect(t.requests[0].$2, {
        'address': owner,
        'domain': domain,
        'chain_id': 'solana:mainnet',
        'statement_version': 1,
      });
      expect(t.requests[1].$2, {'address': owner, 'message': 'm', 'signature': 'sig', 'client': 'mobile'});
      expect(t.requests[2].$2, {'refresh_token': 'srt_x'});
    });

    test('error envelope → typed ApiException with localized copy', () async {
      final l = lookupAppLocalizations(const Locale('id'));
      final cases = <String, (int, ApiErrorCode)>{
        'SIWS_NONCE_INVALID': (401, ApiErrorCode.siwsNonceInvalid),
        'SIWS_SIGNATURE_INVALID': (401, ApiErrorCode.siwsSignatureInvalid),
        'FORBIDDEN_ROLE': (403, ApiErrorCode.forbiddenRole),
        'RATE_LIMITED': (429, ApiErrorCode.rateLimited),
        'UNAVAILABLE': (503, ApiErrorCode.unavailable),
        'VALIDATION_FAILED': (422, ApiErrorCode.validationFailed),
        'UNAUTHENTICATED': (401, ApiErrorCode.unauthenticated),
      };
      for (final MapEntry(key: code, value: (status, expected)) in cases.entries) {
        final t = FakeTransport()..reply = (_, _) => _err(status, code, {}, {'retry-after': '7'});
        final r = HttpSiwsAuthRepository(t);
        try {
          await r.nonce(address: owner, domain: domain);
          fail('no throw for $code');
        } on ApiException catch (e) {
          expect(e.code, expected, reason: code);
          expect(errorText(l, e.code, e.details), isNotEmpty);
          if (code == 'RATE_LIMITED') expect(e.details['retry_after_s'], 7);
        }
      }
    });

    test('a 404 without envelope (disabled route / proxy) → UNAVAILABLE; logout never throws', () async {
      final t = FakeTransport()..reply = (_, _) => const JsonResponse(404, {});
      final r = HttpSiwsAuthRepository(t);
      await expectLater(
        r.nonce(address: owner, domain: domain),
        throwsA(isA<ApiException>().having((e) => e.code, 'c', ApiErrorCode.unavailable)),
      );
      await r.logout('srt_x');
    });

    test('IoJsonTransport refuses non-https base URLs', () {
      expect(() => IoJsonTransport(Uri.parse('http://api.example')), throwsArgumentError);
    });
  });
}

class _RewritingRepo implements SiwsAuthRepository {
  _RewritingRepo(this.inner, this.rewrite);
  final SiwsAuthRepository inner;
  final String Function(String) rewrite;

  @override
  Future<SiwsChallenge> nonce({
    required String address,
    required String domain,
    String? uri,
    String? chainId,
    int statementVersion = SiwsChallenge.currentStatementVersion,
  }) async {
    final c = await inner.nonce(address: address, domain: domain, uri: uri, chainId: chainId);
    return SiwsChallenge(nonce: c.nonce, message: rewrite(c.message), issuedAt: c.issuedAt, expiresAt: c.expiresAt);
  }

  @override
  Future<Session> verify({
    required String address,
    required String message,
    required String signatureBase58,
    String client = 'mobile',
  }) => inner.verify(address: address, message: message, signatureBase58: signatureBase58, client: client);

  @override
  Future<Session> refresh(String refreshToken) => inner.refresh(refreshToken);

  @override
  Future<void> logout(String refreshToken) => inner.logout(refreshToken);
}
