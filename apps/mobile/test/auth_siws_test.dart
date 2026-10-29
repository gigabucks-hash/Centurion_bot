import 'package:flutter_test/flutter_test.dart';
import 'package:sentra_mobile/data/api/api_exception.dart';
import 'package:sentra_mobile/data/api/auth.dart';

const owner = 'Own3rWa11etDemo1111111111111111111111111111';
const stranger = 'Str4ngerWa11et11111111111111111111111111111';

Matcher _api(String code, [String? reason]) => throwsA(
  isA<ApiException>()
      .having((e) => e.rawCode, 'code', code)
      .having((e) => reason == null || e.details['reason'] == reason, 'reason $reason', isTrue),
);

void main() {
  late DateTime now;
  late MockSiwsAuth server;
  setUp(() {
    now = DateTime.utc(2026, 10, 29, 8);
    server = MockSiwsAuth(ownerWallets: {owner}, clock: () => now);
  });

  AuthController controller({WalletSigner? signer}) => AuthController(
    repo: server,
    signer: signer ?? MockWalletSigner(owner),
    domain: 'app.sentra.local',
    clock: () => now,
  );

  test('wallet-only SIWS: nonce → sign exact message → verify → Session (15 min access, srt_ refresh)', () async {
    final c = controller();
    final s = await c.signIn();
    expect(c.state, isA<SignedIn>());
    expect(s.address, owner);
    expect(s.refreshToken, startsWith('srt_'));
    expect(s.expiresAt.difference(now), const Duration(minutes: 15));
    expect(s.workspaceId, 'ws_practice');
    expect(s.toString(), isNot(contains(s.accessToken)), reason: 'tokens never logged');
    expect(await c.store.read(), isNotNull);
    c.dispose();
  });

  test('allowlist: a stranger wallet gets 403 FORBIDDEN_ROLE wallet_not_allowed', () async {
    await expectLater(
      () => server.nonce(address: stranger, domain: 'app.sentra.local'),
      _api('FORBIDDEN_ROLE', 'wallet_not_allowed'),
    );
  });

  test('nonce is single-use and expires after 5 min; bad signature → SIWS_SIGNATURE_INVALID', () async {
    final ch = await server.nonce(address: owner, domain: 'app.sentra.local');
    final sig = MockSiwsAuth.fakeSignature(owner, ch.message);
    await expectLater(
      () => server.verify(address: owner, message: ch.message, signatureBase58: 'bad'),
      _api('SIWS_SIGNATURE_INVALID'),
    );
    await expectLater(
      () => server.verify(address: owner, message: ch.message, signatureBase58: sig),
      _api('SIWS_NONCE_INVALID'),
      reason: 'consumed even by a bad signature',
    );
    final ch2 = await server.nonce(address: owner, domain: 'app.sentra.local');
    now = now.add(const Duration(minutes: 6));
    await expectLater(
      () => server.verify(
        address: owner,
        message: ch2.message,
        signatureBase58: MockSiwsAuth.fakeSignature(owner, ch2.message),
      ),
      _api('SIWS_NONCE_INVALID'),
    );
  });

  test('declined signature leaves the user signed out', () async {
    final c = controller(signer: MockWalletSigner(owner, decline: true));
    await expectLater(c.signIn(), throwsA(isA<WalletSignatureDeclined>()));
    expect(c.state, isA<SignedOut>());
    c.dispose();
  });

  test('refresh rotates the token; reusing a rotated token revokes the family → forced logout', () async {
    final c = controller();
    final s1 = await c.signIn();
    final s2 = (await c.refreshNow())!;
    expect(s2.refreshToken, isNot(s1.refreshToken));
    expect(s2.sessionId, s1.sessionId);
    // An attacker (or a buggy second client) replays the old token.
    await expectLater(() => server.refresh(s1.refreshToken), _api('UNAUTHENTICATED', 'refresh_reused'));
    // Our next refresh hits the revoked family → forced logout, tokens wiped.
    expect(await c.refreshNow(), isNull);
    expect(c.state, isA<ForcedLogout>().having((f) => f.reason, 'reason', 'refresh_revoked'));
    expect(await c.store.read(), isNull);
    c.dispose();
  });

  test('concurrent refreshes are single-flight (no self-inflicted reuse)', () async {
    final c = controller();
    await c.signIn();
    final r = await Future.wait([c.refreshNow(), c.refreshNow(), c.onUnauthorized()]);
    expect(r.map((s) => s!.refreshToken).toSet(), hasLength(1));
    expect(await c.refreshNow(), isNotNull);
    expect(c.state, isA<SignedIn>());
    c.dispose();
  });

  test('wallet removed from OWNER_WALLETS → 403 on refresh → forced logout wallet_not_allowed', () async {
    final c = controller();
    await c.signIn();
    server.debugRemoveOwner(owner);
    await c.refreshNow();
    expect(c.state, isA<ForcedLogout>().having((f) => f.reason, 'reason', 'wallet_not_allowed'));
    c.dispose();
  });

  test('logout revokes server-side and clears the store', () async {
    final c = controller();
    final s = await c.signIn();
    await c.signOut();
    expect(c.state, isA<SignedOut>());
    expect(await c.store.read(), isNull);
    await expectLater(() => server.refresh(s.refreshToken), _api('UNAUTHENTICATED', 'refresh_revoked'));
    c.dispose();
  });

  testWidgets('proactive refresh fires 60 s before the 15 min access token expires', (tester) async {
    final c = controller();
    final s1 = await c.signIn(); // mock: microtasks only, so the refresh Timer is fake-clocked
    expect(s1.refreshAt, s1.expiresAt.subtract(const Duration(seconds: 60)));
    now = now.add(const Duration(minutes: 14));
    await tester.pump(const Duration(minutes: 14));
    await tester.pump();
    final st = c.state as SignedIn;
    expect(st.session.refreshToken, isNot(s1.refreshToken));
    c.dispose();
  });

  test('Telegram stays a stub behind the OFF flag; no email OTP route', () async {
    await expectLater(const TelegramAuthStub().signIn(), throwsA(isA<TelegramLoginDisabled>()));
    expect(AuthPaths.siwsNonce, '/v1/auth/siws/nonce');
    expect(AuthPaths.sessionRefresh, '/v1/auth/session/refresh');
  });
}
