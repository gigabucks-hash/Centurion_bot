import 'package:flutter/material.dart';

import '../../../core/theme/centurion_theme.dart';
import '../../../core/widgets/app_icons.dart';
import '../../../core/widgets/common.dart';
import '../../../data/models/models.dart';
import '../pnl_strings.dart';

/// PnL card (G1-blue): unrealized vs realized vs total, from the server summary.
///
/// Source of truth is the server portfolio summary — nothing is re-derived:
/// - unrealized = mark-to-market of the open remainder (partial sells included);
/// - realized   = proceeds locked in by take-profits and closed trades;
/// - total      = realized + unrealized (exactly what the equity hero moves by).
///
/// The card is the door to [PnlReportScreen] (closed-trade ledger + per exit
/// reason breakdown). Closed trades keep their realized PnL in the Positions
/// list, so this card never guesses a trade's result after it leaves the open list.
class PnlReportCard extends StatelessWidget {
  const PnlReportCard({super.key, required this.summary, this.onTap});

  final PortfolioSummary summary;

  /// Opens the report. Null keeps the card static (widget tests / embeds).
  final VoidCallback? onTap;

  @override
  Widget build(BuildContext context) {
    final s = PnlStrings.of(Localizations.localeOf(context).languageCode);
    final text = Theme.of(context).textTheme;
    final cs = Theme.of(context).colorScheme;
    final muted = text.labelSmall!.copyWith(color: cs.onSurfaceVariant);
    final card = Padding(
      padding: const EdgeInsets.all(AppSpace.s4),
      child: Column(
        crossAxisAlignment: CrossAxisAlignment.start,
        children: [
          Row(
            children: [
              Expanded(child: Text(s.cardTitle, style: text.titleMedium)),
              Text(s.openCount(summary.openPositions), key: const Key('pnlOpenCount'), style: muted),
              if (onTap != null) ...[
                const SizedBox(width: AppSpace.s1),
                Icon(AppIcons.chevronRight, size: 16, color: cs.primary),
              ],
            ],
          ),
          const SizedBox(height: AppSpace.s3),
          IntrinsicHeight(
            child: Row(
              crossAxisAlignment: CrossAxisAlignment.stretch,
              children: [
                Expanded(
                  child: _Cell(
                    key: const Key('pnlUnrealized'),
                    label: s.unrealized,
                    value: summary.unrealizedPnlLamports,
                  ),
                ),
                VerticalDivider(width: 1, thickness: 1, color: cs.outlineVariant),
                Expanded(
                  child: _Cell(key: const Key('pnlRealized'), label: s.realized, value: summary.realizedPnlLamports),
                ),
              ],
            ),
          ),
          const SizedBox(height: AppSpace.s3),
          Divider(height: 1, thickness: 1, color: cs.outlineVariant),
          const SizedBox(height: AppSpace.s2),
          Row(
            crossAxisAlignment: CrossAxisAlignment.end,
            children: [
              Expanded(
                child: Column(
                  crossAxisAlignment: CrossAxisAlignment.start,
                  children: [
                    Text(s.total, style: text.titleSmall),
                    Text(s.totalHint, style: muted),
                  ],
                ),
              ),
              const SizedBox(width: AppSpace.s2),
              PnlText(summary.totalPnlLamports, key: const Key('pnlTotal'), size: 16, unit: true),
            ],
          ),
          if (onTap != null) ...[
            const SizedBox(height: AppSpace.s2),
            Row(
              children: [
                Text(s.viewReport, style: text.labelLarge!.copyWith(color: cs.primary)),
                const SizedBox(width: AppSpace.sHalf),
                Icon(AppIcons.chevronRight, size: 14, color: cs.primary),
              ],
            ),
          ],
        ],
      ),
    );
    return Card(
      key: const Key('pnlReport'),
      margin: EdgeInsets.zero,
      clipBehavior: onTap == null ? Clip.none : Clip.antiAlias,
      child: onTap == null ? card : InkWell(onTap: onTap, child: card),
    );
  }
}

class _Cell extends StatelessWidget {
  const _Cell({required this.label, required this.value, super.key});

  final String label;
  final Lamports value;

  @override
  Widget build(BuildContext context) {
    final text = Theme.of(context).textTheme;
    return Padding(
      padding: const EdgeInsets.symmetric(horizontal: AppSpace.s2),
      child: Column(
        crossAxisAlignment: CrossAxisAlignment.start,
        children: [
          Text(
            label,
            style: text.labelSmall!.copyWith(color: Theme.of(context).colorScheme.onSurfaceVariant),
            maxLines: 2,
            overflow: TextOverflow.ellipsis,
          ),
          const SizedBox(height: AppSpace.s1),
          FittedBox(
            fit: BoxFit.scaleDown,
            alignment: Alignment.centerLeft,
            child: PnlText(value, size: 19, unit: true),
          ),
        ],
      ),
    );
  }
}
