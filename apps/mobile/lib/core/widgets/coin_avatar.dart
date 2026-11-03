import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';

import '../../data/models/models.dart';
import '../theme/app_tokens.dart';

/// API base for resolving relative 1.1.6 `logo_url`s (`/v1/logos/...`). Null in the
/// mock build → relative logo URLs fall back to the identicon.
final apiBaseUrlProvider = Provider<Uri?>((_) => null);

/// Coin logo with a deterministic identicon fallback.
///
/// - [logoUrl] (contracts 1.1.6, optional) goes through [CoinLogo.resolve]: http(s)
///   only, no SVG, relative paths against [apiBaseUrlProvider].
/// - Decoded at display size (`cacheWidth/cacheHeight` = size × devicePixelRatio), so a
///   huge image never sits in memory at full resolution.
/// - Loading, 404, decode errors → [CoinIdenticon] from [seed] (mint, else symbol).
class CoinAvatar extends ConsumerWidget {
  const CoinAvatar({super.key, required this.seed, this.logoUrl, this.size = 32});

  /// Mint address when known (stable); symbol otherwise.
  final String seed;
  final String? logoUrl;
  final double size;

  @override
  Widget build(BuildContext context, WidgetRef ref) {
    final fallback = CoinIdenticon(seed: seed, size: size);
    final uri = CoinLogo.resolve(logoUrl, apiBase: ref.watch(apiBaseUrlProvider));
    if (uri == null) return fallback;
    final px = (size * MediaQuery.devicePixelRatioOf(context)).round().clamp(1, 512);
    return ClipOval(
      child: SizedBox.square(
        dimension: size,
        child: Image.network(
          uri.toString(),
          key: ValueKey('coinLogo_$uri'),
          width: size,
          height: size,
          fit: BoxFit.cover,
          cacheWidth: px,
          cacheHeight: px,
          filterQuality: FilterQuality.medium,
          gaplessPlayback: true,
          excludeFromSemantics: true,
          frameBuilder: (_, child, frame, sync) => frame == null && !sync ? fallback : child,
          errorBuilder: (_, _, _) => fallback,
        ),
      ),
    );
  }
}

/// 5×5 mirrored identicon from the seed (FNV-1a, pure Dart): the same mint always
/// draws the same picture on every run/device. Colors come from design tokens.
class CoinIdenticon extends StatelessWidget {
  const CoinIdenticon({super.key, required this.seed, this.size = 32});
  final String seed;
  final double size;

  @override
  Widget build(BuildContext context) {
    final dark = Theme.of(context).brightness == Brightness.dark;
    final spec = IdenticonSpec.of(seed, dark: dark);
    return Semantics(
      excludeSemantics: true,
      child: SizedBox.square(
        key: ValueKey('identicon_${spec.hash}'),
        dimension: size,
        child: CustomPaint(painter: _IdenticonPainter(spec)),
      ),
    );
  }
}

class IdenticonSpec {
  const IdenticonSpec(this.hash, this.cells, this.fg, this.bg);
  final int hash;

  /// 25 cells row-major; columns 3/4 mirror 1/0.
  final List<bool> cells;
  final Color fg;
  final Color bg;

  static const _darkPalette = [
    AppColorsDark.brandPrimary,
    AppColorsDark.semanticInfo,
    AppColorsDark.semanticGuard,
    AppColorsDark.modePractice,
    AppColorsDark.semanticWarning,
  ];
  static const _lightPalette = [
    AppColorsLight.brandPrimary,
    AppColorsLight.semanticInfo,
    AppColorsLight.semanticGuard,
    AppColorsLight.modePractice,
    AppColorsLight.semanticWarning,
  ];

  /// 32-bit FNV-1a over UTF-16 code units (stable, no platform hash).
  static int fnv1a(String s, [int seed = 0x811c9dc5]) {
    var h = seed;
    for (final c in s.codeUnits) {
      h ^= c & 0xff;
      h = (h * 0x01000193) & 0xffffffff;
      h ^= c >> 8;
      h = (h * 0x01000193) & 0xffffffff;
    }
    return h;
  }

  factory IdenticonSpec.of(String seed, {bool dark = true}) {
    final h = fnv1a(seed);
    final h2 = fnv1a(seed, h ^ 0x9e3779b9);
    final cells = List<bool>.filled(25, false);
    for (var row = 0; row < 5; row++) {
      for (var col = 0; col < 3; col++) {
        final bit = row * 3 + col; // 15 bits
        final on = ((h2 >> bit) & 1) == 1;
        cells[row * 5 + col] = on;
        cells[row * 5 + (4 - col)] = on;
      }
    }
    final palette = dark ? _darkPalette : _lightPalette;
    return IdenticonSpec(
      h,
      cells,
      palette[h % palette.length],
      dark ? AppColorsDark.bgOverlay : AppColorsLight.bgSunken,
    );
  }
}

class _IdenticonPainter extends CustomPainter {
  _IdenticonPainter(this.spec);
  final IdenticonSpec spec;

  @override
  void paint(Canvas canvas, Size size) {
    final r = size.shortestSide / 2;
    final center = Offset(size.width / 2, size.height / 2);
    canvas.save();
    canvas.clipPath(Path()..addOval(Rect.fromCircle(center: center, radius: r)));
    canvas.drawRect(Offset.zero & size, Paint()..color = spec.bg);
    final pad = size.shortestSide * 0.18;
    final cell = (size.shortestSide - pad * 2) / 5;
    final fg = Paint()..color = spec.fg;
    for (var i = 0; i < 25; i++) {
      if (!spec.cells[i]) continue;
      final x = pad + (i % 5) * cell;
      final y = pad + (i ~/ 5) * cell;
      canvas.drawRect(Rect.fromLTWH(x, y, cell + 0.25, cell + 0.25), fg);
    }
    canvas.restore();
  }

  @override
  bool shouldRepaint(_IdenticonPainter old) => old.spec.hash != spec.hash || old.spec.fg != spec.fg;
}
