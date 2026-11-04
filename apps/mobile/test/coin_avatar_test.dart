import 'dart:async';
import 'dart:convert';
import 'dart:io';
import 'dart:math' as math;

import 'package:flutter/foundation.dart';
import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:google_fonts/google_fonts.dart';
import 'package:centurion_mobile/app/app.dart';
import 'package:centurion_mobile/core/approval_guard.dart';
import 'package:centurion_mobile/core/startup/deferred_init.dart';
import 'package:centurion_mobile/core/theme/centurion_theme.dart';
import 'package:centurion_mobile/core/widgets/coin_avatar.dart';
import 'package:centurion_mobile/data/api/api_exception.dart';
import 'package:centurion_mobile/data/mock/mock_backend.dart';
import 'package:centurion_mobile/data/models/models.dart';
import 'package:centurion_mobile/data/providers.dart';

/// UX COIN_LOGO.md §4 test vectors (also produced by ux-solbot/visual/src/vectors.mjs; "verified Python +
/// Node"). All mints are fictitious.
const vectors = [
  (mint: 'tUS1YuHKJDnzQddko3sTDKq1F7v58ZPsvkwRHBTGN844', symbol: r'$TESSA', hash: 0xeeb2707f, idx: 7, ini: 'TE'),
  (mint: 'dYrhdkDmtC88oyRfDMCPgQbxc2y8p5fhc95zgjSYZo2d', symbol: r'$z3phy', hash: 0x70e7f8fb, idx: 11, ini: 'Z3'),
  (mint: 'HnYTsD1BUDsPCBFXnbgxn8bYfejYYxJUgLVaHFPunvLy', symbol: '🚀🚀', hash: 0xa810ce07, idx: 7, ini: '\u2022'),
  (mint: 'CTvec4mint1111111111111111111111111111111111', symbol: r'$_9lives', hash: 0x1580013a, idx: 10, ini: '9L'),
];

const mint = 'tUS1YuHKJDnzQddko3sTDKq1F7v58ZPsvkwRHBTGN844';
const hash = 'abcdef0123456789';
final api = Uri.parse('https://api.example.com');

/// Skia text anti-aliasing differs between Linux CI and Windows, so the reference
/// PNG is kept per platform (Windows differs from the Linux baseline by 3.91% of
/// pixels). Same widget and same assertions on both; only the file path changes.
String goldenPath(String name) => Platform.isWindows ? 'goldens/windows/$name' : 'goldens/$name';

/// Image provider whose result the test controls (keyed by URL so the ImageCache can hit).
class _Logo extends ImageProvider<String> {
  _Logo(this.url, this.result);
  final String url;
  final Future<ImageInfo> result;
  @override
  Future<String> obtainKey(ImageConfiguration configuration) => SynchronousFuture(url);
  @override
  ImageStreamCompleter loadImage(String key, ImageDecoderCallback decode) => OneFrameImageStreamCompleter(result);
}

class _Factory {
  final requested = <Uri>[];
  final decodePx = <int>[];
  Future<ImageInfo> Function(Uri) answer = (_) => Completer<ImageInfo>().future; // never completes
  ImageProvider call(Uri uri, int px) {
    requested.add(uri);
    decodePx.add(px);
    return _Logo(uri.toString(), answer(uri));
  }
}

Widget _host(Widget child, {Uri? apiBase, _Factory? factory, CoinLogoSession? session, bool reduced = false}) =>
    ProviderScope(
      overrides: [
        apiBaseUrlProvider.overrideWithValue(apiBase),
        if (factory != null) coinLogoImageFactoryProvider.overrideWithValue(factory.call),
        if (session != null) coinLogoSessionProvider.overrideWithValue(session),
      ],
      child: MaterialApp(
        theme: CenturionTheme.dark(),
        home: MediaQuery(
          data: MediaQueryData(devicePixelRatio: 3, disableAnimations: reduced),
          child: Scaffold(
            body: Center(child: RepaintBoundary(child: child)),
          ),
        ),
      ),
    );

const _avatar = CoinAvatar(mint: mint, symbol: r'$TESSA', logoHash: hash);
final _identicon = find.byKey(const ValueKey('identicon_7_TE'));
final _skeleton = find.byKey(const ValueKey('coinLogoSkeleton'));

void main() {
  setUp(() => imageCache.clear());

  group('identicon (COIN_LOGO §4)', () {
    test('test vectors: fnv1a32, palette index and initials match vectors.mjs', () {
      for (final v in vectors) {
        expect(Identicon.fnv1a32(v.mint), v.hash, reason: v.mint);
        expect(Identicon.paletteIndex(v.mint), v.idx, reason: v.mint);
        expect(Identicon.paletteIndex('  ${v.mint}\n'), v.idx, reason: 'mint is trimmed');
        expect(Identicon.initials(v.symbol), v.ini, reason: v.symbol);
      }
    });

    test('palette and fg are the spec values, in order', () {
      expect(Identicon.palette, const [
        0xFF8A2E3B, 0xFF8A4A1F, 0xFF6E5A12, 0xFF4C6A1A, 0xFF1F6B3A, 0xFF146560, //
        0xFF16607E, 0xFF2A4F94, 0xFF4A3F9C, 0xFF6A3592, 0xFF86306F, 0xFF5A5F6E,
      ]);
      expect(Identicon.fg, 0xFFF4F6FB);
    });

    test('web-safe 16-bit split multiply == the doc 64-bit formula', () {
      int doc(String s) {
        var h = 0x811C9DC5;
        for (final b in utf8.encode(s)) {
          h ^= b;
          h = (h * 0x01000193) & 0xFFFFFFFF;
        }
        return h;
      }

      final r = math.Random(7);
      for (var i = 0; i < 500; i++) {
        final s = String.fromCharCodes(List.generate(r.nextInt(60), (_) => 0x20 + r.nextInt(0x2000)));
        expect(Identicon.fnv1a32(s), doc(s), reason: s);
      }
      expect(Identicon.fnv1a32(''), 0x811C9DC5);
    });

    test(r'initials: strip leading $, first 2 ASCII alnum, uppercase, else •', () {
      expect(Identicon.initials(''), '\u2022');
      expect(Identicon.initials(r'$$$'), '\u2022');
      expect(Identicon.initials('猫猫'), '\u2022');
      expect(Identicon.initials('ab'), 'AB');
      expect(Identicon.initials(r'$é1x2'), '1X');
      expect(Identicon.initials(r'a$b'), 'AB');
      expect(Identicon.initials('w'), 'W');
    });
  });

  group('CoinLogo (proxy only)', () {
    test('request size s: smallest of 48/64/96/128/192 ≥ ceil(px × dpr), max 192; decode = s', () {
      final table = {
        (20.0, 1.0): 48, (20.0, 2.0): 48, (20.0, 3.0): 64, //
        (24.0, 1.0): 48, (24.0, 2.0): 48, (24.0, 2.75): 96, (24.0, 3.0): 96,
        (32.0, 1.0): 48, (32.0, 2.0): 64, (32.0, 3.0): 96,
        (40.0, 3.0): 128, (48.0, 3.0): 192, (64.0, 2.0): 128, (64.0, 3.0): 192, (96.0, 3.0): 192,
        (16.0, 3.0): 48, (21.4, 3.0): 96, // ceil(64.2) = 65 → 96
      };
      table.forEach((k, s) => expect(CoinLogo.requestSize(k.$1, k.$2), s, reason: '$k'));
      expect(CoinLogo.requestSize(64, 3, cap: CoinLogo.safeSize), 96, reason: 'session cap after a refused 192');
      expect(CoinLogo.fileSizes, [48, 64, 96, 128, 192], reason: 'backend transcode.ts LOGO_SIZES @ d4dcc51');
    });

    test('logo_url origin allowlist: API origin by default; an allowed LOGO_PUBLIC_BASE_URL origin is used', () {
      const cdn = 'https://img.example.net';
      final u = '$cdn/v1/img/coin/$mint?s=96&v=old';
      expect(CoinLogo.isProxyUrl(u, apiBase: api, mint: mint), isFalse);
      expect(
        CoinLogo.proxyUri(apiBase: api, mint: mint, logoHash: hash, size: 48, logoUrl: u).toString(),
        'https://api.example.com/v1/img/coin/$mint?s=48&v=$hash',
        reason: 'not allowlisted → API origin',
      );
      expect(
        CoinLogo.proxyUri(
          apiBase: api,
          mint: mint,
          logoHash: hash,
          size: 48,
          logoUrl: u,
          allowedOrigins: {cdn},
        ).toString(),
        '$cdn/v1/img/coin/$mint?s=48&v=$hash',
        reason: 'allowlisted proxy origin; v = logo_hash, s rebuilt',
      );
      expect(
        CoinLogo.isProxyUrl(
          'http://img.example.net/v1/img/coin/$mint',
          apiBase: api,
          mint: mint,
          allowedOrigins: {cdn},
        ),
        isFalse,
      );
      expect(CoinLogo.isProxyUrl('$cdn/logo.svg', apiBase: api, mint: mint, allowedOrigins: {cdn}), isFalse);
    });

    test('proxyUri: built from mint + logo_hash; null without hash, base, valid mint or https', () {
      expect(
        CoinLogo.proxyUri(apiBase: api, mint: mint, logoHash: hash, size: 64).toString(),
        'https://api.example.com/v1/img/coin/$mint?s=64&v=$hash',
      );
      expect(CoinLogo.proxyUri(apiBase: null, mint: mint, logoHash: hash, size: 48), isNull);
      expect(
        CoinLogo.proxyUri(apiBase: api, mint: mint, logoHash: null, size: 48),
        isNull,
        reason: 'no guess w/o v',
      );
      expect(CoinLogo.proxyUri(apiBase: api, mint: mint, logoHash: 'x&s=1', size: 48), isNull);
      expect(CoinLogo.proxyUri(apiBase: api, mint: 'BONK', logoHash: hash, size: 48), isNull);
      expect(
        CoinLogo.proxyUri(apiBase: Uri.parse('http://api.example.com'), mint: mint, logoHash: hash, size: 48),
        isNull,
      );
      expect(
        CoinLogo.proxyUri(apiBase: Uri.parse('http://localhost:8787'), mint: mint, logoHash: hash, size: 48).toString(),
        'http://localhost:8787/v1/img/coin/$mint?s=48&v=$hash',
      );
    });

    test('isProxyUrl: only our origin + /v1/img/coin/{same mint}', () {
      bool ok(String u) => CoinLogo.isProxyUrl(u, apiBase: api, mint: mint);
      expect(ok('/v1/img/coin/$mint?s=96&v=$hash'), isTrue);
      expect(ok('https://api.example.com/v1/img/coin/$mint?s=96'), isTrue);
      for (final bad in [
        'https://cdn.example.com/v1/img/coin/$mint?s=96',
        'https://api.example.com.evil.io/v1/img/coin/$mint',
        '//evil.io/v1/img/coin/$mint',
        'http://api.example.com/v1/img/coin/$mint',
        'https://user:pw@api.example.com/v1/img/coin/$mint',
        'https://api.example.com/v1/img/coin/OTHERmint1111111111111111111111111111111111',
        'https://api.example.com/v1/logos/$mint/64.webp',
        'https://api.example.com/v1/img/coin/$mint#x',
        'ipfs://bafy',
        'ar://abc',
        'data:image/png;base64,AAAA',
        'javascript:alert(1)',
        'v1/img/coin/$mint',
        '',
      ]) {
        expect(ok(bad), isFalse, reason: bad);
      }
      expect(CoinLogo.hashFromJson({'logo_hash': hash}), hash);
      expect(CoinLogo.hashFromJson({'logo_hash': 'short'}), isNull);
      expect(CoinLogo.hashFromJson({}), isNull);
    });
  });

  group('CoinAvatar states', () {
    testWidgets('logo_hash null → identicon at once, no request, no skeleton', (tester) async {
      final f = _Factory();
      await tester.pumpWidget(
        _host(
          const CoinAvatar(mint: mint, symbol: r'$TESSA'),
          apiBase: api,
          factory: f,
        ),
      );
      expect(_identicon, findsOneWidget);
      expect(_skeleton, findsNothing);
      expect(f.requested, isEmpty);
    });

    testWidgets('a foreign logo_url is never requested: URL rebuilt on our proxy', (tester) async {
      final f = _Factory();
      await tester.pumpWidget(
        _host(
          const CoinAvatar(mint: mint, symbol: 'X', logoHash: hash, logoUrl: 'https://evil.io/logo.png'),
          apiBase: api,
          factory: f,
        ),
      );
      expect(f.requested.single.toString(), 'https://api.example.com/v1/img/coin/$mint?s=96&v=$hash');
      expect(f.decodePx.single, 96, reason: '32 px × dpr 3 → s = 96 = cacheWidth/cacheHeight');
      await tester.pump(const Duration(seconds: 5));
    });

    testWidgets('loading: empty slot < 150 ms, static skeleton after, ≥ 300 ms, then fade-in', (tester) async {
      final img = (await tester.runAsync(() => createTestImage(width: 4, height: 4)))!;
      final done = Completer<ImageInfo>();
      final f = _Factory()..answer = (_) => done.future;
      await tester.pumpWidget(_host(_avatar, apiBase: api, factory: f));
      expect(_skeleton, findsNothing);
      expect(_identicon, findsNothing, reason: 'identicon is for failure only');
      await tester.pump(const Duration(milliseconds: 149));
      expect(_skeleton, findsNothing);
      await tester.pump(const Duration(milliseconds: 2));
      expect(_skeleton, findsOneWidget);
      final box = tester.widget<DecoratedBox>(_skeleton).decoration as BoxDecoration;
      expect(box.color, AppColorsDark.skeletonBase);
      done.complete(ImageInfo(image: img));
      await tester.pump(const Duration(milliseconds: 50)); // 200 ms in: skeleton shown 50 ms only
      expect(_skeleton, findsOneWidget, reason: 'min 300 ms on screen');
      await tester.pump(const Duration(milliseconds: 260));
      expect(_skeleton, findsNothing);
      expect(find.byType(RawImage), findsOneWidget);
      expect(find.byType(TweenAnimationBuilder<double>), findsOneWidget, reason: '150 ms fade');
      await tester.pumpAndSettle();
    });

    testWidgets('cache hit: shown at once, no skeleton, no fade', (tester) async {
      final img = (await tester.runAsync(() => createTestImage(width: 4, height: 4)))!;
      final f = _Factory()..answer = (_) => SynchronousFuture(ImageInfo(image: img.clone()));
      await tester.pumpWidget(_host(_avatar, apiBase: api, factory: f));
      await tester.pump();
      await tester.pumpWidget(_host(const SizedBox(), apiBase: api, factory: f));
      await tester.pumpWidget(_host(_avatar, apiBase: api, factory: f));
      expect(find.byType(RawImage), findsOneWidget);
      expect(_skeleton, findsNothing);
      expect(find.byType(TweenAnimationBuilder<double>), findsNothing);
    });

    testWidgets('404 LOGO_NOT_FOUND → identicon; not retried for that mint+v this session', (tester) async {
      final session = CoinLogoSession();
      final f = _Factory()..answer = (u) => Future.error(NetworkImageLoadException(statusCode: 404, uri: u));
      await tester.pumpWidget(_host(_avatar, apiBase: api, factory: f, session: session));
      await tester.pump();
      await tester.pump();
      expect(_identicon, findsOneWidget);
      expect(session.lastError[CoinLogoSession.key(mint, hash)], ApiErrorCode.fromWire('LOGO_NOT_FOUND'));
      await tester.pumpWidget(_host(const SizedBox(), apiBase: api, factory: f, session: session));
      imageCache.clear();
      await tester.pumpWidget(_host(_avatar, apiBase: api, factory: f, session: session));
      expect(_identicon, findsOneWidget);
      expect(f.requested, hasLength(1), reason: 'negative cache per mint+v');
    });

    testWidgets('422 LOGO_REJECTED → identicon', (tester) async {
      final session = CoinLogoSession();
      final f = _Factory()..answer = (u) => Future.error(NetworkImageLoadException(statusCode: 422, uri: u));
      await tester.pumpWidget(_host(_avatar, apiBase: api, factory: f, session: session));
      await tester.pump();
      await tester.pump();
      expect(_identicon, findsOneWidget);
      expect(session.lastError.values.single, ApiErrorCode.fromWire('LOGO_REJECTED'));
    });

    testWidgets('4 s timeout → identicon; network failures retried at most once per mint', (tester) async {
      final session = CoinLogoSession();
      final f = _Factory();
      for (var i = 0; i < 3; i++) {
        imageCache.clear();
        await tester.pumpWidget(_host(_avatar, apiBase: api, factory: f, session: session));
        if (i < 2) {
          await tester.pump(const Duration(milliseconds: 3999));
          expect(_skeleton, findsOneWidget);
          await tester.pump(const Duration(milliseconds: 2));
        }
        expect(_identicon, findsOneWidget, reason: 'iteration $i');
        await tester.pumpWidget(_host(const SizedBox(), apiBase: api, factory: f, session: session));
      }
      expect(f.requested, hasLength(2), reason: 'first try + one retry');
    });

    testWidgets('192 refused with 422 VALIDATION_FAILED → retry at 96 (not identicon), session capped at 96', (
      tester,
    ) async {
      final img = (await tester.runAsync(() => createTestImage(width: 4, height: 4)))!;
      final session = CoinLogoSession();
      final f = _Factory()
        ..answer = (u) => u.queryParameters['s'] == '192'
            ? Future.error(NetworkImageLoadException(statusCode: 422, uri: u))
            : Future.value(ImageInfo(image: img.clone()));
      const big = CoinAvatar(mint: mint, symbol: r'$TESSA', logoHash: hash, size: 64); // 64 × 3 → 192
      await tester.pumpWidget(_host(big, apiBase: api, factory: f, session: session));
      await tester.pump();
      await tester.pump();
      await tester.pump(const Duration(milliseconds: 500));
      expect(f.requested.map((u) => u.queryParameters['s']), ['192', '96']);
      expect(f.decodePx.last, 96);
      expect(find.byType(RawImage), findsOneWidget);
      expect(_identicon, findsNothing);
      expect(session.sizeCap, 96);
      expect(session.lastError, isEmpty, reason: 'a refused size is not a negative logo');
      // The next large avatar this session asks for 96 directly.
      await tester.pumpWidget(_host(const SizedBox(), apiBase: api, factory: f, session: session));
      imageCache.clear();
      await tester.pumpWidget(
        _host(
          const CoinAvatar(mint: 'dYrhdkDmtC88oyRfDMCPgQbxc2y8p5fhc95zgjSYZo2d', symbol: 'Z', logoHash: hash, size: 64),
          apiBase: api,
          factory: f,
          session: session,
        ),
      );
      expect(f.requested.last.queryParameters['s'], '96');
      await tester.pump(const Duration(milliseconds: 500));
    });

    testWidgets('422 at 192 AND at 96 = LOGO_REJECTED → identicon; size cap restored', (tester) async {
      final session = CoinLogoSession();
      final f = _Factory()..answer = (u) => Future.error(NetworkImageLoadException(statusCode: 422, uri: u));
      await tester.pumpWidget(
        _host(
          const CoinAvatar(mint: mint, symbol: r'$TESSA', logoHash: hash, size: 64),
          apiBase: api,
          factory: f,
          session: session,
        ),
      );
      for (var i = 0; i < 4; i++) {
        await tester.pump();
      }
      await tester.pump(const Duration(milliseconds: 500));
      expect(f.requested.map((u) => u.queryParameters['s']), ['192', '96']);
      expect(_identicon, findsOneWidget);
      expect(session.sizeCap, 192);
      expect(session.lastError.values.single, ApiErrorCode.fromWire('LOGO_REJECTED'));
    });

    testWidgets('404 at 192 → identicon at once (no size retry)', (tester) async {
      final f = _Factory()..answer = (u) => Future.error(NetworkImageLoadException(statusCode: 404, uri: u));
      await tester.pumpWidget(
        _host(
          const CoinAvatar(mint: mint, symbol: r'$TESSA', logoHash: hash, size: 64),
          apiBase: api,
          factory: f,
        ),
      );
      await tester.pump();
      await tester.pump();
      expect(f.requested, hasLength(1));
      expect(_identicon, findsOneWidget);
    });

    testWidgets('not tradeable: grayscale + 0.55 opacity + dashed ring; decorative by default', (tester) async {
      await tester.pumpWidget(_host(const CoinAvatar(mint: mint, symbol: r'$TESSA', notTradeable: true)));
      expect(find.byType(ColorFiltered), findsOneWidget);
      expect(tester.widget<Opacity>(find.byType(Opacity)).opacity, 0.55);
      expect(find.byType(ExcludeSemantics), findsWidgets);
    });

    testWidgets('golden: vector identicons at 20/24/32 + not tradeable', (tester) async {
      await tester.runAsync(() => GoogleFonts.pendingFonts());
      await tester.pumpWidget(
        _host(
          Column(
            mainAxisSize: MainAxisSize.min,
            children: [
              for (final s in const [CoinAvatar.sm, CoinAvatar.md, CoinAvatar.lg])
                Row(
                  mainAxisSize: MainAxisSize.min,
                  children: [
                    for (final v in vectors)
                      Padding(
                        padding: const EdgeInsets.all(4),
                        child: CoinAvatar(mint: v.mint, symbol: v.symbol, size: s),
                      ),
                    Padding(
                      padding: const EdgeInsets.all(4),
                      child: CoinAvatar(mint: vectors[1].mint, symbol: vectors[1].symbol, size: s, notTradeable: true),
                    ),
                  ],
                ),
            ],
          ),
        ),
      );
      await tester.runAsync(() => GoogleFonts.pendingFonts());
      await tester.pump();
      await expectLater(find.byType(Column).first, matchesGoldenFile(goldenPath('coin_identicons.png')));
    });
  });

  group('used in every coin row/card', () {
    for (final (route, size) in [('/coins', 32.0), ('/positions', 32.0), ('/approvals', 32.0), ('/activity', 20.0)]) {
      testWidgets('$route shows $size px coin avatars', (tester) async {
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
        final avatars = tester.widgetList<CoinAvatar>(find.byType(CoinAvatar));
        expect(avatars, isNotEmpty);
        expect(avatars.map((a) => a.size).toSet(), {size});
        expect(
          avatars.every((a) => a.logoHash != null && CoinLogo.isMint(a.mint)),
          isTrue,
          reason: 'every mock coin carries a mint + logo_hash',
        );
        expect(find.byType(CoinIdenticon), findsNothing, reason: 'logos, not identicons');
        b.dispose();
      });
    }
  });

  group('mock backend: a logo for every coin', () {
    test('screener, positions and buy approvals: valid mint + hash with a shipped asset', () {
      final b = MockBackend();
      addTearDown(b.dispose);
      final coins = [
        for (final c in b.debugScreener) (c.symbol, c.mint, c.logoHash),
        for (final p in b.debugPositions) (p.symbol, p.mint, p.logoHash),
        for (final a in b.debugApprovals.where((a) => a.kind == ApprovalKind.buyPick))
          (a.symbol ?? '', a.mint, a.logoHash),
      ];
      expect(coins, isNotEmpty);
      for (final (symbol, mint, hash) in coins) {
        expect(CoinLogo.isMint(mint), isTrue, reason: '$symbol mint');
        expect(hash, isNotNull, reason: '$symbol logo_hash');
        expect(File('assets/mock_logo/$hash.webp').existsSync(), isTrue, reason: '$symbol → $hash');
      }
    });

    test('activity coins carry a logo too', () async {
      final b = MockBackend();
      addTearDown(b.dispose);
      final feed = await b.watchFeed().first;
      final coinEvents = feed.where((e) => e.symbol != null);
      expect(coinEvents, isNotEmpty);
      for (final e in coinEvents) {
        expect(CoinLogo.isMint(e.mint), isTrue, reason: e.message);
        expect(File('assets/mock_logo/${e.logoHash}.webp').existsSync(), isTrue, reason: e.message);
      }
    });

    test('mock origin maps to the bundled asset, never the network', () {
      final container = ProviderContainer();
      addTearDown(container.dispose);
      final m = MockBackend.mockMint('KEPL');
      final uri = CoinLogo.proxyUri(
        apiBase: Uri.parse(CoinLogo.mockOrigin),
        mint: m,
        logoHash: MockBackend.mockLogoHash(m),
        size: 48,
      )!;
      expect(uri.toString(), startsWith('https://logo.mock.invalid/v1/img/coin/'));
      final image = container.read(coinLogoImageFactoryProvider)(uri, 48);
      expect(image, isA<AssetImage>());
      expect((image as AssetImage).assetName, startsWith('assets/mock_logo/mocklogo'));
    });

    testWidgets('a mock coin renders its bundled logo instead of the identicon', (tester) async {
      final m = MockBackend.mockMint('KEPL');
      final hash = MockBackend.mockLogoHash(m);
      await tester.pumpWidget(
        _host(
          CoinAvatar(mint: m, symbol: 'KEPL', logoHash: hash),
          apiBase: Uri.parse(CoinLogo.mockOrigin),
        ),
      );
      await tester.runAsync(() async {
        await precacheImage(AssetImage('assets/mock_logo/$hash.webp'), tester.element(find.byType(CoinAvatar)));
      });
      await tester.pump();
      expect(find.byType(RawImage), findsOneWidget);
      expect(find.byType(CoinIdenticon), findsNothing);
    });
  });
}
