import 'dart:async';
import 'dart:convert';
import 'dart:math' as math;

import 'package:flutter/foundation.dart';
import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';

import '../../data/api/api_exception.dart';
import '../../data/models/models.dart';
import '../theme/app_tokens.dart';

/// API base for the logo proxy (`{base}/v1/img/coin/{mint}`). Null in the mock build → identicons only.
final apiBaseUrlProvider = Provider<Uri?>((_) => null);

/// How a proxy URL becomes pixels. Tests swap in memory images or failures; production decodes the
/// network image at [decodePx] (≤ 96, [CoinLogo.decodeCap]) so a logo never sits in memory at full size.
typedef CoinLogoImageFactory = ImageProvider Function(Uri uri, int decodePx);

final coinLogoImageFactoryProvider = Provider<CoinLogoImageFactory>(
  (_) =>
      (uri, px) => ResizeImage(NetworkImage(uri.toString()), width: px, height: px, policy: ResizeImagePolicy.fit),
);

/// Per-session logo bookkeeping (COIN_LOGO §2 "Retry"): LOGO_NOT_FOUND / LOGO_REJECTED (and any other
/// 4xx or decode error) are not retried for that `mint+v`; network errors, 5xx and the 4 s timeout are
/// retried at most once per mint per session.
class CoinLogoSession {
  final _negative = <String>{};
  final _transient = <String, int>{};

  /// Which [ApiErrorCode] the last negative answer was, per `mint|v` (for tests/diagnostics).
  final lastError = <String, ApiErrorCode>{};

  static String key(String mint, String v) => '$mint|$v';

  bool canLoad(String mint, String v) => !_negative.contains(key(mint, v)) && (_transient[mint] ?? 0) < 2;

  void fail(String mint, String v, {int? status}) {
    if (status != null && status >= 400 && status < 500) {
      _negative.add(key(mint, v));
      lastError[key(mint, v)] = switch (status) {
        404 => ApiErrorCode.fromWire('LOGO_NOT_FOUND'),
        422 => ApiErrorCode.fromWire('LOGO_REJECTED'),
        _ => ApiErrorCode.fromWire('VALIDATION_FAILED'),
      };
    } else if (status == -1) {
      _negative.add(key(mint, v)); // decode error: same bytes would fail again
    } else {
      _transient[mint] = (_transient[mint] ?? 0) + 1;
    }
  }
}

final coinLogoSessionProvider = Provider<CoinLogoSession>((_) => CoinLogoSession());

/// Coin logo (UX COIN_LOGO.md Rev 6.0): proxy image with a 1 px ring, or the deterministic identicon.
///
/// States: no `logo_hash` / no API base → identicon at once (no request, no skeleton) · loading → empty
/// slot for 150 ms, then a STATIC skeleton circle shown ≥ 300 ms (no shimmer) · cache hit → shown at once
/// · loaded → 150 ms fade-in (none with reduced motion) · 404/422/other failure/4 s timeout → identicon.
/// Decorative by default (the symbol sits next to it): pass [semanticLabel] only when it stands alone.
class CoinAvatar extends ConsumerStatefulWidget {
  const CoinAvatar({
    super.key,
    required this.mint,
    required this.symbol,
    this.logoHash,
    this.logoUrl,
    this.size = lg,
    this.notTradeable = false,
    this.semanticLabel,
  });

  /// Display sizes (COIN_LOGO §1): activity feed / chips / in-app notifications.
  static const double sm = 20;

  /// Dense tables, compact approval rows.
  static const double md = 24;

  /// Standard list rows and cards: strategies, approvals, positions, coins.
  static const double lg = 32;

  static const timeout = Duration(seconds: 4);

  /// Mint (base58). Null only for legacy mock rows: the identicon then hashes the symbol.
  final String? mint;
  final String symbol;
  final String? logoHash;

  /// 1.1.6 `logo_url`: never loaded as given. A non-proxy URL is ignored (debug log); the request is
  /// always rebuilt from [mint] + [logoHash] against the API base.
  final String? logoUrl;
  final double size;
  final bool notTradeable;
  final String? semanticLabel;

  @override
  ConsumerState<CoinAvatar> createState() => _CoinAvatarState();
}

enum _Phase { none, blank, skeleton, loaded, failed }

class _CoinAvatarState extends ConsumerState<CoinAvatar> {
  _Phase _phase = _Phase.none;
  Uri? _uri;
  ImageStream? _stream;
  ImageStreamListener? _listener;
  ImageInfo? _info;
  bool _fade = false;
  VoidCallback? _pending;
  Timer? _delay, _timeout, _min;
  bool _inSync = false;

  @override
  void didChangeDependencies() {
    super.didChangeDependencies();
    _sync();
  }

  @override
  void didUpdateWidget(CoinAvatar old) {
    super.didUpdateWidget(old);
    if (old.mint != widget.mint || old.logoHash != widget.logoHash || old.size != widget.size) _sync();
  }

  void _sync() {
    final base = ref.read(apiBaseUrlProvider);
    final dpr = MediaQuery.maybeDevicePixelRatioOf(context) ?? 1;
    final mint = widget.mint;
    if (kDebugMode && base != null && mint != null && widget.logoUrl != null) {
      if (!CoinLogo.isProxyUrl(widget.logoUrl, apiBase: base, mint: mint)) {
        debugPrint('CoinAvatar: ignoring non-proxy logo_url for $mint');
      }
    }
    final uri = CoinLogo.proxyUri(
      apiBase: base,
      mint: mint,
      logoHash: widget.logoHash,
      size: CoinLogo.requestSize(widget.size, dpr),
    );
    if (uri == _uri && _phase != _Phase.none) return;
    _stop();
    _uri = uri;
    _info?.dispose();
    _info = null;
    if (uri == null || !ref.read(coinLogoSessionProvider).canLoad(mint!, widget.logoHash!)) {
      _phase = _Phase.failed;
      return;
    }
    final provider = ref.read(coinLogoImageFactoryProvider)(uri, CoinLogo.decodePx(widget.size, dpr));
    final stream = provider.resolve(createLocalImageConfiguration(context));
    _phase = _Phase.blank;
    final listener = ImageStreamListener(
      _loaded,
      onError: (e, _) => _failed(e is NetworkImageLoadException ? e.statusCode : -1),
    );
    _stream = stream;
    _listener = listener;
    _inSync = true; // a cache hit (or a cached failure) is delivered inside addListener
    stream.addListener(listener);
    _inSync = false;
    if (_phase == _Phase.blank) {
      _delay = Timer(AppMotion.skeletonDelayBase, () {
        if (!mounted || _phase != _Phase.blank) return;
        setState(() => _phase = _Phase.skeleton);
        _min = Timer(AppMotion.skeletonMinBase, () {
          _min = null;
          final next = _pending;
          _pending = null;
          if (next != null && mounted) setState(next);
        });
      });
      _timeout = Timer(CoinAvatar.timeout, () => _failed(null));
    }
  }

  /// Applies a final state, but keeps a visible skeleton up for at least 300 ms (anti-flicker).
  void _settle(VoidCallback apply) {
    _delay?.cancel();
    _timeout?.cancel();
    if (_inSync) {
      apply(); // still inside _sync(): the coming build picks it up
    } else if (_min != null) {
      _pending = apply; // skeleton visible < 300 ms: run when the min timer fires
    } else if (mounted) {
      setState(apply);
    }
  }

  void _loaded(ImageInfo info, bool _) {
    if (_phase == _Phase.loaded || _phase == _Phase.failed) {
      info.dispose();
      return;
    }
    _info?.dispose();
    _info = info;
    final cacheHit = _inSync; // no skeleton, no fade
    _settle(() {
      _phase = _Phase.loaded;
      _fade = !cacheHit;
    });
  }

  void _failed(int? status) {
    if (_phase == _Phase.failed || _phase == _Phase.loaded) return;
    final mint = widget.mint, v = widget.logoHash;
    if (mint != null && v != null) ref.read(coinLogoSessionProvider).fail(mint, v, status: status);
    _detach();
    _settle(() => _phase = _Phase.failed);
  }

  void _detach() {
    final s = _stream, l = _listener;
    if (s != null && l != null) s.removeListener(l);
    _stream = null;
    _listener = null;
  }

  void _stop() {
    _delay?.cancel();
    _timeout?.cancel();
    _min?.cancel();
    _delay = _timeout = _min = null;
    _pending = null;
    _detach();
  }

  @override
  void dispose() {
    _stop();
    _info?.dispose();
    super.dispose();
  }

  @override
  Widget build(BuildContext context) {
    final size = widget.size;
    final dark = Theme.of(context).brightness == Brightness.dark;
    final ring = dark ? const Color(0x1FFFFFFF) : const Color(0x1A0F1420); // coin.logo.ring 0.12 / 0.10
    final Widget content = switch (_phase) {
      _Phase.blank => const SizedBox.shrink(),
      _Phase.skeleton => DecoratedBox(
        key: const ValueKey('coinLogoSkeleton'),
        decoration: BoxDecoration(
          shape: BoxShape.circle,
          color: dark ? AppColorsDark.skeletonBase : AppColorsLight.skeletonBase,
        ),
      ),
      _Phase.loaded => _Fade(
        enabled: _fade,
        duration: AppMotion.of(context).fast,
        child: ClipOval(
          key: ValueKey('coinLogo_$_uri'),
          child: RawImage(image: _info?.image, width: size, height: size, fit: BoxFit.cover),
        ),
      ),
      _ => CoinIdenticon(mint: widget.mint, symbol: widget.symbol, size: size),
    };
    final showRing = _phase == _Phase.loaded || _phase == _Phase.failed || _phase == _Phase.none;
    Widget out = SizedBox.square(
      dimension: size,
      child: Stack(
        fit: StackFit.expand,
        children: [
          if (widget.notTradeable)
            ColorFiltered(
              colorFilter: const ColorFilter.matrix(_grayscale),
              child: Opacity(opacity: 0.55, child: content),
            )
          else
            content,
          if (showRing || widget.notTradeable)
            IgnorePointer(
              child: CustomPaint(
                painter: _RingPainter(
                  color: widget.notTradeable ? context.tradeColors.neutral : ring,
                  dashed: widget.notTradeable,
                ),
              ),
            ),
        ],
      ),
    );
    final label = widget.semanticLabel;
    out = label == null ? ExcludeSemantics(child: out) : Semantics(label: label, image: true, child: out);
    return out;
  }
}

const _grayscale = <double>[
  0.2126, 0.7152, 0.0722, 0, 0, //
  0.2126, 0.7152, 0.0722, 0, 0, //
  0.2126, 0.7152, 0.0722, 0, 0, //
  0, 0, 0, 1, 0,
];

class _Fade extends StatelessWidget {
  const _Fade({required this.enabled, required this.duration, required this.child});
  final bool enabled;
  final Duration duration;
  final Widget child;

  @override
  Widget build(BuildContext context) {
    if (!enabled || duration == Duration.zero) return child;
    return TweenAnimationBuilder<double>(
      tween: Tween(begin: 0, end: 1),
      duration: duration,
      builder: (_, v, c) => Opacity(opacity: v, child: c),
      child: child,
    );
  }
}

class _RingPainter extends CustomPainter {
  const _RingPainter({required this.color, required this.dashed});
  final Color color;
  final bool dashed;

  @override
  void paint(Canvas canvas, Size size) {
    final paint = Paint()
      ..color = color
      ..style = PaintingStyle.stroke
      ..strokeWidth = 1;
    final rect = (Offset.zero & size).deflate(0.5); // 1 px inside the edge
    if (!dashed) {
      canvas.drawOval(rect, paint);
      return;
    }
    final r = rect.width / 2;
    final dashes = math.max(8, (2 * math.pi * r / 5).round()); // ~3 px dash + 2 px gap
    final step = 2 * math.pi / dashes;
    for (var i = 0; i < dashes; i++) {
      canvas.drawArc(rect, i * step, step * 0.6, false, paint);
    }
  }

  @override
  bool shouldRepaint(_RingPainter old) => old.color != color || old.dashed != dashed;
}

/// Deterministic identicon (COIN_LOGO §4): background = palette[fnv1a32(utf8(mint.trim())) % 12],
/// 1–2 ASCII initials (or `•`) in #F4F6FB, Inter 700, 42 % (2 letters) / 50 % (1) of the diameter.
class CoinIdenticon extends StatelessWidget {
  const CoinIdenticon({super.key, required this.mint, required this.symbol, this.size = CoinAvatar.lg});

  final String? mint;
  final String symbol;
  final double size;

  @override
  Widget build(BuildContext context) {
    final seed = mint ?? symbol;
    final idx = Identicon.paletteIndex(seed);
    final text = Identicon.initials(symbol);
    final base = Theme.of(context).textTheme.labelSmall ?? const TextStyle();
    return SizedBox.square(
      key: ValueKey('identicon_${idx}_$text'),
      dimension: size,
      child: DecoratedBox(
        decoration: BoxDecoration(shape: BoxShape.circle, color: Color(Identicon.palette[idx])),
        child: Center(
          child: Text(
            text,
            maxLines: 1,
            textScaler: TextScaler.noScaling, // sized to the circle, not to body text
            style: base.copyWith(
              color: const Color(Identicon.fg),
              fontWeight: FontWeight.w700,
              fontSize: size * (text.length == 2 ? 0.42 : 0.5),
              height: 1,
              letterSpacing: 0,
            ),
          ),
        ),
      ),
    );
  }
}

/// COIN_LOGO §4 reference implementation (the doc's Dart pseudocode, verbatim semantics).
abstract final class Identicon {
  /// `coin.identicon.palette.0..11` (design-tokens 0.3.0 values; the app's token copy is pinned to 0.2.5,
  /// which has no identicon tokens, so the spec palette lives here).
  static const palette = [
    0xFF8A2E3B, 0xFF8A4A1F, 0xFF6E5A12, 0xFF4C6A1A, 0xFF1F6B3A, 0xFF146560, //
    0xFF16607E, 0xFF2A4F94, 0xFF4A3F9C, 0xFF6A3592, 0xFF86306F, 0xFF5A5F6E,
  ];

  /// `coin.identicon.fg`.
  static const fg = 0xFFF4F6FB;

  /// FNV-1a 32-bit over the UTF-8 bytes. 16-bit split multiply so it is exact on the web too
  /// (JS numbers have 53-bit precision; the doc's 64-bit `h * prime` is not).
  static int fnv1a32(String s) {
    var h = 0x811C9DC5;
    for (final b in utf8.encode(s)) {
      h ^= b;
      h = ((h & 0xFFFF) * 0x01000193 + (((h >>> 16) * 0x01000193 & 0xFFFF) << 16)) & 0xFFFFFFFF;
    }
    return h;
  }

  static int paletteIndex(String mint) => fnv1a32(mint.trim()) % 12;

  static final _alnum = RegExp(r'^[A-Za-z0-9]$');

  static String initials(String symbol) {
    final s = symbol.replaceFirst(RegExp(r'^\$+'), '');
    final out = s.runes.map(String.fromCharCode).where(_alnum.hasMatch).take(2).join();
    return out.isEmpty ? '\u2022' : out.toUpperCase();
  }
}
