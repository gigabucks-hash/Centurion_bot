import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:centurion_mobile/app/app.dart';
import 'package:centurion_mobile/core/approval_guard.dart';
import 'package:centurion_mobile/core/startup/deferred_init.dart';
import 'package:centurion_mobile/data/mock/mock_backend.dart';
import 'package:centurion_mobile/data/providers.dart';
import 'package:centurion_mobile/core/theme/centurion_theme.dart';
import 'package:centurion_mobile/core/widgets/coin_avatar.dart';
import 'package:centurion_mobile/data/models/models.dart';

const wsol = 'So11111111111111111111111111111111111111112';

Widget _host(Widget child, {Uri? apiBase}) => ProviderScope(
  overrides: [apiBaseUrlProvider.overrideWithValue(apiBase)],
  child: MaterialApp(
    theme: CenturionTheme.dark(),
    home: Scaffold(
      body: Center(child: RepaintBoundary(child: child)),
    ),
  ),
);

void main() {
  group('IdenticonSpec (deterministic, pure Dart)', () {
    test('fixed vector: same mint → same hash, cells and color on every run', () {
      final a = IdenticonSpec.of(wsol);
      // Cross-checked with an independent Python FNV-1a implementation.
      expect(a.hash, 2971079099);
      expect(a.fg, AppColorsDark.semanticWarning); // 2971079099 % 5 == 4
      final b = IdenticonSpec.of(wsol);
      expect(b.cells, a.cells);
      for (var r = 0; r < 5; r++) {
        for (var c = 0; c < 5; c++) {
          expect(a.cells[r * 5 + c], a.cells[r * 5 + 4 - c], reason: 'mirrored');
        }
      }
    });

    test('different mints differ; colors come from the token palette', () {
      final seeds = List.generate(50, (i) => '${wsol.substring(0, 40)}${i.toString().padLeft(3, '0')}');
      final specs = seeds.map(IdenticonSpec.of).toList();
      expect(specs.map((s) => s.hash).toSet(), hasLength(50));
      expect(specs.map((s) => s.cells.join()).toSet().length, greaterThan(40));
      final palette = {
        AppColorsDark.brandPrimary,
        AppColorsDark.semanticInfo,
        AppColorsDark.semanticGuard,
        AppColorsDark.modePractice,
        AppColorsDark.semanticWarning,
      };
      expect(specs.every((s) => palette.contains(s.fg)), isTrue);
      expect(IdenticonSpec.of(wsol, dark: false).bg, AppColorsLight.bgSunken);
    });
  });

  group('CoinLogo', () {
    final api = Uri.parse('https://api.example.com/');
    test('parse logo_url only when it is a non-empty string', () {
      expect(CoinLogo.fromJson({'logo_url': '/v1/logos/$wsol/64.webp'}), '/v1/logos/$wsol/64.webp');
      expect(CoinLogo.fromJson({'logo_url': null}), isNull);
      expect(CoinLogo.fromJson({'logo_url': 5}), isNull);
      expect(CoinLogo.fromJson({}), isNull);
    });

    test('resolve: http(s) only, relative against the API base, no SVG, no userinfo', () {
      expect(
        CoinLogo.resolve('/v1/logos/$wsol/64.webp', apiBase: api).toString(),
        'https://api.example.com/v1/logos/$wsol/64.webp',
      );
      expect(CoinLogo.resolve('/v1/logos/x/64.webp'), isNull, reason: 'no API base → identicon');
      expect(CoinLogo.resolve('https://cdn.example.com/a.png').toString(), 'https://cdn.example.com/a.png');
      for (final bad in [
        'ipfs://bafy',
        'data:image/png;base64,AAAA',
        'file:///etc/passwd',
        'javascript:alert(1)',
        'https://x.example/logo.SVG',
        'https://user:pw@x.example/a.png',
        'logo.png',
        '',
      ]) {
        expect(CoinLogo.resolve(bad, apiBase: api), isNull, reason: bad);
      }
    });
  });

  group('CoinAvatar widget', () {
    testWidgets('no logo → identicon with the stable key', (tester) async {
      await tester.pumpWidget(_host(const CoinAvatar(seed: wsol)));
      expect(find.byKey(const ValueKey('identicon_2971079099')), findsOneWidget);
      expect(find.byType(Image), findsNothing);
    });

    testWidgets('logo → Image decoded at display size; network error → identicon', (tester) async {
      await tester.pumpWidget(
        _host(
          const CoinAvatar(seed: wsol, logoUrl: '/v1/logos/x/64.webp', size: 32),
          apiBase: Uri.parse('https://api.example.com'),
        ),
      );
      final img = tester.widget<Image>(find.byType(Image));
      final provider = img.image as ResizeImage;
      final dpr = tester.view.devicePixelRatio;
      expect(provider.width, (32 * dpr).round());
      expect(provider.height, (32 * dpr).round());
      expect((provider.imageProvider as NetworkImage).url, 'https://api.example.com/v1/logos/x/64.webp');
      // While loading, and after the (test-env) HTTP failure, the identicon shows.
      expect(find.byKey(const ValueKey('identicon_2971079099')), findsOneWidget);
      await tester.pumpAndSettle();
      expect(find.byKey(const ValueKey('identicon_2971079099')), findsOneWidget);
    });

    testWidgets('golden: identicons are pixel-stable', (tester) async {
      await tester.pumpWidget(
        _host(
          const Row(
            mainAxisSize: MainAxisSize.min,
            children: [
              CoinIdenticon(seed: wsol, size: 48),
              CoinIdenticon(seed: 'EPjFWdd5AufqSSqeM2qN1xzybapC8G4wEGGkZwyTDt1v', size: 48),
              CoinIdenticon(seed: 'DezXAZ8z7PnrnRJjz3wXBoRgixCa6xjnB7YaB1pPB263', size: 48),
              CoinIdenticon(seed: 'BONK', size: 48),
            ],
          ),
        ),
      );
      await expectLater(find.byType(Row), matchesGoldenFile('goldens/coin_identicons.png'));
    });
  });

  group('used in every coin row/card', () {
    for (final route in ['/coins', '/positions', '/approvals', '/activity']) {
      testWidgets('$route shows coin avatars', (tester) async {
        tester.view.physicalSize = const Size(412 * 3, 915 * 3);
        tester.view.devicePixelRatio = 3;
        addTearDown(tester.view.reset);
        final b = MockBackend();
        await tester.pumpWidget(
          ProviderScope(
            overrides: [
              mockBackendProvider.overrideWithValue(b),
              deferredInitProvider.overrideWithValue(DeferredInit(const [])),
              approvalGuardProvider.overrideWithValue(const AlwaysAllowGuard()),
            ],
            child: CenturionApp(initialLocation: route),
          ),
        );
        await tester.pump();
        expect(find.byType(CoinAvatar), findsWidgets);
        expect(find.byType(CoinIdenticon), findsWidgets);
        b.dispose();
      });
    }
  });
}
