import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:centurion_mobile/app/app.dart';
import 'package:centurion_mobile/core/approval_guard.dart';
import 'package:centurion_mobile/core/feature_flags.dart';
import 'package:centurion_mobile/core/startup/deferred_init.dart';
import 'package:centurion_mobile/data/api/auth.dart';
import 'package:centurion_mobile/data/mock/mock_backend.dart';
import 'package:centurion_mobile/data/providers.dart';

Widget _app(MockBackend b, WalletSigner signer) => ProviderScope(
  overrides: [
    mockBackendProvider.overrideWithValue(b),
    deferredInitProvider.overrideWithValue(DeferredInit(const [])),
    featureFlagsProvider.overrideWithValue(const FeatureFlags(authGateEnabled: true)),
    approvalGuardProvider.overrideWithValue(const AlwaysAllowGuard()),
    walletSignerProvider.overrideWithValue(signer),
  ],
  child: const CenturionApp(),
);

Future<void> _phone(WidgetTester tester) async {
  tester.view.physicalSize = const Size(412 * 3, 915 * 3);
  tester.view.devicePixelRatio = 3;
  addTearDown(tester.view.reset);
}

void main() {
  testWidgets('gate ON: login screen first, "Masuk dengan Phantom" → home tabs', (tester) async {
    await _phone(tester);
    final b = MockBackend();
    await tester.pumpWidget(_app(b, MockWalletSigner(mockOwnerWallet)));
    await tester.pumpAndSettle();
    expect(find.byKey(const Key('loginPhantom')), findsOneWidget);
    expect(find.text('Masuk dengan Phantom'), findsOneWidget);
    expect(find.textContaining('Telegram'), findsNothing);
    expect(find.textContaining('kode'), findsNothing, reason: 'no email OTP');
    await tester.tap(find.byKey(const Key('loginPhantom')));
    await tester.pumpAndSettle();
    expect(find.byKey(const Key('loginPhantom')), findsNothing);
    expect(find.text('Team overview'), findsOneWidget);
    b.dispose();
  });

  testWidgets('declined in the wallet → localized "declined" banner, still on login', (tester) async {
    await _phone(tester);
    final b = MockBackend();
    await tester.pumpWidget(_app(b, MockWalletSigner(mockOwnerWallet, decline: true)));
    await tester.pumpAndSettle();
    await tester.tap(find.byKey(const Key('loginPhantom')));
    await tester.pumpAndSettle();
    expect(find.byKey(const Key('loginError')), findsOneWidget);
    expect(find.text('Tanda tangan ditolak. Tidak ada yang ditandatangani.'), findsOneWidget);
    b.dispose();
  });

  testWidgets('a non-allow-listed wallet → FORBIDDEN_ROLE copy', (tester) async {
    await _phone(tester);
    final b = MockBackend();
    await tester.pumpWidget(_app(b, MockWalletSigner('HNahkrkFQ2oGJNdHXxfecChYoj6PiHZko7HWPivyvBg')));
    await tester.pumpAndSettle();
    await tester.tap(find.byKey(const Key('loginPhantom')));
    await tester.pumpAndSettle();
    expect(find.byKey(const Key('loginError')), findsOneWidget);
    expect(find.byKey(const Key('loginPhantom')), findsOneWidget);
    b.dispose();
  });
}
