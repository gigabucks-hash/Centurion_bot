// "Coins" screener list + coin detail, per UX wireframes WF-20 (desktop) /
// WF-21 (mobile). A not-tradeable coin (`UNSUPPORTED_QUOTE_MINT`, no SOL quote
// pair) is NOT an error: neutral card (dashed border, grey text, ⊘ chip), no
// action buttons, not swipeable, tap → detail with a disabled, labelled CTA. (Queue cards
// for such coins CAN be skipped since i18n 0.4.4; see approvals_screen.dart.)
// It never enters the approval queue, so there is no Skip either.
import 'dart:ui' show PathMetric;

import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:go_router/go_router.dart';

import '../../core/l10n_format.dart';
import '../../core/theme/sentra_theme.dart';
import '../../core/widgets/common.dart';
import '../../data/models/models.dart';
import '../../data/providers.dart';
import '../../l10n/gen/app_localizations.dart';
import '../../core/widgets/coin_avatar.dart';

class CoinsScreen extends ConsumerWidget {
  const CoinsScreen({super.key});

  @override
  Widget build(BuildContext context, WidgetRef ref) {
    final coins = ref.watch(screenerProvider).valueOrNull ?? const <ScreenerCoin>[];
    final names = {for (final s in ref.watch(strategiesProvider).valueOrNull ?? const <Strategy>[]) s.id: s.name};
    final strategy = coins.isEmpty ? '' : names[coins.first.strategyId] ?? coins.first.strategyId;
    final l10n = AppLocalizations.of(context);
    return Scaffold(
      appBar: AppBar(title: Text(l10n.screenerTitle)),
      // Slivers: the screener can list many coins; only visible cards are built.
      body: CustomScrollView(
        slivers: [
          SliverPadding(
            padding: const EdgeInsets.all(AppSpace.s4),
            sliver: SliverMainAxisGroup(
              slivers: [
                SliverList.list(
                  children: [
                    if (strategy.isNotEmpty)
                      Padding(
                        padding: const EdgeInsets.only(bottom: AppSpace.s3),
                        // GAP (UX): no ARB key for the "<strategy> · live" caption; strategy name only.
                        child: Text(strategy, style: Theme.of(context).textTheme.bodySmall),
                      ),
                    if (coins.isEmpty) Text(l10n.screenerEmpty, key: const Key('screenerEmpty')),
                  ],
                ),
                SliverList.builder(
                  itemCount: coins.length,
                  itemBuilder: (context, i) {
                    final c = coins[i];
                    return Padding(
                      key: ValueKey('coinRow_${c.mint}'),
                      padding: const EdgeInsets.only(bottom: AppSpace.s3),
                      // Live score/price row: repaint isolated from its neighbours.
                      child: RepaintBoundary(child: c.notTradeable ? NotTradeableCoinCard(c) : _CoinCard(c)),
                    );
                  },
                ),
                if (coins.any((c) => c.notTradeable))
                  SliverToBoxAdapter(
                    // i18n 0.4.4 legend: grey = no SOL pair, can't be approved but can be skipped.
                    child: Text(
                      l10n.screenerLegend,
                      key: const Key('screenerLegend'),
                      style: Theme.of(context).textTheme.bodySmall,
                    ),
                  ),
              ],
            ),
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
    final l10n = AppLocalizations.of(context);
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
              CoinAvatar(seed: c.mint ?? c.symbol, logoUrl: c.logoUrl),
              const SizedBox(width: AppSpace.s3),
              Expanded(
                child: Column(
                  crossAxisAlignment: CrossAxisAlignment.start,
                  children: [
                    Text('\$${c.symbol}', style: text.titleMedium),
                    Text(
                      passed ? l10n.screenerCardPassed('${c.score}') : l10n.screenerCardGuardFailed('${c.score}'),
                      style: text.bodySmall!.copyWith(color: cs.onSurfaceVariant),
                    ),
                  ],
                ),
              ),
              if (passed)
                TextButton(onPressed: () => context.go('/approvals'), child: Text('${l10n.screenerActionOpenQueue} ›'))
              else
                TagChip(l10n.screenerStatusRejected, color: t.loss),
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
                Opacity(
                  opacity: 0.6,
                  child: CoinAvatar(seed: c.mint ?? c.symbol, logoUrl: c.logoUrl),
                ),
                const SizedBox(width: AppSpace.s3),
                Expanded(
                  child: Column(
                    crossAxisAlignment: CrossAxisAlignment.start,
                    children: [
                      Text('\$${c.symbol}', style: text.titleMedium!.copyWith(color: t.neutral)),
                      Text(
                        l10n.screenerCardNotTradeable('${c.score}'),
                        style: text.bodySmall!.copyWith(color: t.neutral),
                      ),
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

  /// `screener.scored.max_score` (mock: the strategy score scale is 0–100).
  static const maxScore = 100;

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
        body: Center(child: Text(l10n.errorCodeNotFound)),
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
    final loc = Localizations.localeOf(context).languageCode;
    // contracts 1.1.4 market cap: lamports (BigInt) primary, USD indicative, as-of time; null → "—".
    List<Widget> mcapRows() {
      final m = c.marketCap;
      return [
        row(l10n.mcapLabel, m?.lamports == null ? l10n.commonValueUnavailable : formatMcapSol(m!.lamports, loc)),
        if (m?.usd != null) row(l10n.mcapUsdIndicative, formatMcapUsd(m!.usd, loc)),
        if (m?.asOf != null) row('', l10n.mcapAsOf(formatTime(m!.asOf!.toLocal(), loc))),
      ];
    }

    return Scaffold(
      appBar: AppBar(
        title: Row(
          children: [
            CoinAvatar(seed: c.mint ?? c.symbol, logoUrl: c.logoUrl, size: 28),
            const SizedBox(width: AppSpace.s2),
            Flexible(child: Text('\$${c.symbol}')),
          ],
        ),
      ),
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
            // WF-21 detail rows (i18n 0.4.3 `screener.detail.*`).
            row(l10n.screenerDetailQuotePair, l10n.screenerDetailQuoteNotSol(c.quoteSymbol)),
            row(l10n.screenerDetailSolPair, l10n.screenerDetailNone),
            row(l10n.screenerDetailScore, l10n.screenerDetailScoreValueInfo('$maxScore', '${c.score}')),
            row(l10n.screenerDetailGuard, l10n.screenerDetailGuardNotRun),
            row(l10n.screenerDetailReasonCode, c.reasonCode ?? ''),
            ...mcapRows(),
            const SizedBox(height: AppSpace.s4),
            // Disabled, labelled CTA; no Skip (it never entered the queue).
            FilledButton(
              key: const Key('approve_disabled'),
              onPressed: null,
              child: Text(l10n.screenerDetailApproveUnavailable),
            ),
            const SizedBox(height: AppSpace.s2),
            Text(l10n.screenerDetailChartNote, style: text.bodySmall!.copyWith(color: cs.onSurfaceVariant)),
          ] else ...[
            row(l10n.screenerDetailQuotePair, c.quoteSymbol),
            row(l10n.screenerDetailScore, l10n.screenerDetailScoreValue('$maxScore', '${c.score}')),
            ...mcapRows(),
            row(
              l10n.screenerColStatus,
              c.outcome == ScreenerOutcome.passed ? l10n.screenerStatusPassed : l10n.screenerStatusRejectedGuard,
            ),
            if (c.outcome == ScreenerOutcome.passed) ...[
              const SizedBox(height: AppSpace.s4),
              OutlinedButton(onPressed: () => context.go('/approvals'), child: Text(l10n.screenerActionOpenQueue)),
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
