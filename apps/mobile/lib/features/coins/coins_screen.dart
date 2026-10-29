// "Coins" screener list + coin detail, per UX wireframes WF-20 (desktop) /
// WF-21 (mobile). A not-tradeable coin (`UNSUPPORTED_QUOTE_MINT`, no SOL quote
// pair) is NOT an error: neutral card (dashed border, grey text, ⊘ chip), no
// action buttons, not swipeable, tap → detail with a disabled, labelled CTA.
// It never enters the approval queue, so there is no Skip either.
import 'dart:ui' show PathMetric;

import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:go_router/go_router.dart';

import '../../core/theme/solbot_theme.dart';
import '../../core/widgets/common.dart';
import '../../data/models/models.dart';
import '../../data/providers.dart';
import '../../l10n/gen/app_localizations.dart';

class CoinsScreen extends ConsumerWidget {
  const CoinsScreen({super.key});

  @override
  Widget build(BuildContext context, WidgetRef ref) {
    final coins = ref.watch(screenerProvider).valueOrNull ?? const <ScreenerCoin>[];
    final names = {for (final s in ref.watch(strategiesProvider).valueOrNull ?? const <Strategy>[]) s.id: s.name};
    final strategy = coins.isEmpty ? '' : names[coins.first.strategyId] ?? coins.first.strategyId;
    return Scaffold(
      appBar: AppBar(title: const Text('Coins')),
      body: ListView(
        padding: const EdgeInsets.all(AppSpace.s4),
        children: [
          if (strategy.isNotEmpty)
            Padding(
              padding: const EdgeInsets.only(bottom: AppSpace.s3),
              child: Text('$strategy · live', style: Theme.of(context).textTheme.bodySmall),
            ),
          for (final c in coins)
            Padding(
              padding: const EdgeInsets.only(bottom: AppSpace.s3),
              child: c.notTradeable ? NotTradeableCoinCard(c) : _CoinCard(c),
            ),
        ],
      ),
    );
  }
}

class _CoinCard extends StatelessWidget {
  const _CoinCard(this.c);
  final ScreenerCoin c;

  @override
  Widget build(BuildContext context) {
    final t = context.tradeColors;
    final cs = Theme.of(context).colorScheme;
    final text = Theme.of(context).textTheme;
    final passed = c.outcome == ScreenerOutcome.passed;
    return Card(
      key: Key('coin_${c.symbol}'),
      margin: EdgeInsets.zero,
      child: InkWell(
        borderRadius: BorderRadius.circular(AppRadius.md),
        onTap: () => context.go('/coins/${c.symbol}'),
        child: Padding(
          padding: const EdgeInsets.all(AppSpace.s4),
          child: Row(
            children: [
              Expanded(
                child: Column(
                  crossAxisAlignment: CrossAxisAlignment.start,
                  children: [
                    Text('\$${c.symbol}', style: text.titleMedium),
                    Text(
                      passed ? 'Lolos · skor ${c.score}' : 'Guard gagal · skor ${c.score}',
                      style: text.bodySmall!.copyWith(color: cs.onSurfaceVariant),
                    ),
                  ],
                ),
              ),
              if (passed)
                TextButton(onPressed: () => context.go('/approvals'), child: const Text('Buka antrean ›'))
              else
                TagChip('Ditolak', color: t.loss),
            ],
          ),
        ),
      ),
    );
  }
}

/// WF-21 A: neutral card, dashed border, grey text, ⊘ chip, chevron; no
/// buttons and deliberately no Dismissible (cannot be swiped).
class NotTradeableCoinCard extends StatelessWidget {
  const NotTradeableCoinCard(this.c, {super.key});
  final ScreenerCoin c;

  @override
  Widget build(BuildContext context) {
    final t = context.tradeColors;
    final text = Theme.of(context).textTheme;
    final l10n = AppLocalizations.of(context);
    return Semantics(
      button: true,
      label: '\$${c.symbol}, ${l10n.screenerNotTradeableBadge}',
      child: InkWell(
        key: Key('coin_${c.symbol}'),
        borderRadius: BorderRadius.circular(AppRadius.md),
        onTap: () => context.go('/coins/${c.symbol}'),
        child: CustomPaint(
          painter: DashedBorderPainter(color: t.neutral, radius: AppRadius.md),
          child: Padding(
            padding: const EdgeInsets.all(AppSpace.s4),
            child: Row(
              children: [
                Expanded(
                  child: Column(
                    crossAxisAlignment: CrossAxisAlignment.start,
                    children: [
                      Text('\$${c.symbol}', style: text.titleMedium!.copyWith(color: t.neutral)),
                      Text('Skor ${c.score} · tanpa pair SOL', style: text.bodySmall!.copyWith(color: t.neutral)),
                      const SizedBox(height: AppSpace.s2),
                      NotTradeableChip(key: Key('notTradeable_${c.symbol}')),
                    ],
                  ),
                ),
                Icon(Icons.chevron_right, color: t.neutral),
              ],
            ),
          ),
        ),
      ),
    );
  }
}

/// `⊘ Tidak bisa ditradingkan` in the neutral color (never red: it is not an error).
class NotTradeableChip extends StatelessWidget {
  const NotTradeableChip({super.key});
  @override
  Widget build(BuildContext context) => TagChip(
    AppLocalizations.of(context).screenerNotTradeableBadge,
    color: context.tradeColors.neutral,
    icon: Icons.block,
  );
}

class CoinDetailScreen extends ConsumerWidget {
  const CoinDetailScreen(this.symbol, {super.key});
  final String symbol;

  @override
  Widget build(BuildContext context, WidgetRef ref) {
    final coins = ref.watch(screenerProvider).valueOrNull ?? const <ScreenerCoin>[];
    final c = coins.where((x) => x.symbol == symbol).firstOrNull;
    final t = context.tradeColors;
    final cs = Theme.of(context).colorScheme;
    final text = Theme.of(context).textTheme;
    final l10n = AppLocalizations.of(context);
    if (c == null) {
      return Scaffold(
        appBar: AppBar(title: Text('\$$symbol')),
        body: const Center(child: Text('Coin tidak ditemukan')),
      );
    }
    Widget row(String k, String v) => Card(
      margin: const EdgeInsets.only(bottom: AppSpace.s2),
      child: ListTile(
        dense: true,
        title: Text(k, style: text.bodyMedium),
        trailing: Text(v, style: text.bodySmall!.copyWith(color: cs.onSurfaceVariant)),
      ),
    );
    return Scaffold(
      appBar: AppBar(title: Text('\$${c.symbol}')),
      body: ListView(
        padding: const EdgeInsets.all(AppSpace.s4),
        children: [
          if (c.notTradeable) ...[
            const Align(
              alignment: Alignment.centerLeft,
              child: NotTradeableChip(key: Key('detail_notTradeable')),
            ),
            const SizedBox(height: AppSpace.s3),
            Container(
              padding: const EdgeInsets.all(AppSpace.s4),
              decoration: BoxDecoration(
                color: cs.surfaceContainerHigh,
                borderRadius: BorderRadius.circular(AppRadius.md),
                border: Border.all(color: t.neutral.withValues(alpha: 0.5)),
              ),
              child: Row(
                crossAxisAlignment: CrossAxisAlignment.start,
                children: [
                  Icon(Icons.info_outline, size: 18, color: t.neutral),
                  const SizedBox(width: AppSpace.s2),
                  Expanded(child: Text(l10n.screenerNotTradeableDetail, style: text.bodyMedium)),
                ],
              ),
            ),
            const SizedBox(height: AppSpace.s4),
            // GAP (reported to UX): these WF-21 labels have no ARB keys yet.
            row('Pair quote', '${c.quoteSymbol} · bukan SOL'),
            row('Pair SOL', 'tidak ada'),
            row('Skor screener', '${c.score} / 100'),
            row('Guard', 'tidak dijalankan'),
            const SizedBox(height: AppSpace.s4),
            // Disabled, labelled CTA; no Skip (it never entered the queue).
            const FilledButton(key: Key('approve_disabled'), onPressed: null, child: Text('Approve — tidak tersedia')),
          ] else ...[
            row('Pair quote', c.quoteSymbol),
            row('Skor screener', '${c.score} / 100'),
            row('Status', c.outcome == ScreenerOutcome.passed ? 'Lolos' : 'Ditolak'),
            if (c.outcome == ScreenerOutcome.passed) ...[
              const SizedBox(height: AppSpace.s4),
              OutlinedButton(onPressed: () => context.go('/approvals'), child: const Text('Buka antrean')),
            ],
          ],
        ],
      ),
    );
  }
}

/// Dashed rounded-rect outline (WF-21 "garis putus").
class DashedBorderPainter extends CustomPainter {
  DashedBorderPainter({required this.color, this.radius = 8, this.dash = 5, this.gap = 4});
  final Color color;
  final double radius, dash, gap;

  @override
  void paint(Canvas canvas, Size size) {
    final paint = Paint()
      ..color = color
      ..style = PaintingStyle.stroke
      ..strokeWidth = 1;
    final path = Path()..addRRect(RRect.fromRectAndRadius(Offset.zero & size, Radius.circular(radius)));
    for (final PathMetric m in path.computeMetrics()) {
      for (var d = 0.0; d < m.length; d += dash + gap) {
        canvas.drawPath(m.extractPath(d, d + dash), paint);
      }
    }
  }

  @override
  bool shouldRepaint(DashedBorderPainter old) => old.color != color;
}
