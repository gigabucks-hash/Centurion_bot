import 'package:flutter/material.dart';

import '../../../core/theme/centurion_theme.dart';
import '../../../core/widgets/common.dart';
import '../../../data/models/models.dart';

/// PnL report card (G1-blue): one flat card, unrealized vs realized vs total.
///
/// Source of truth is the server portfolio summary — no client-side re-derivation:
/// - unrealized = mark-to-market of the open remainder (partial sells included);
/// - realized   = proceeds locked in by take-profits and closed trades;
/// - total      = realized + unrealized (the number the equity hero moves by).
///
/// Closed trades keep their realized PnL in the Positions list (`PnlText` per row),
/// so this card never has to guess a trade's result after it leaves the open list.
class PnlReportCard extends StatelessWidget {
  const PnlReportCard({super.key, required this.summary});

  final PortfolioSummary summary;

  @override
  Widget build(BuildContext context) {
    final text = Theme.of(context).textTheme;
    final muted = Theme.of(context).colorScheme.onSurfaceVariant;
    return Card(
      key: const Key('pnlReport'),
      margin: EdgeInsets.zero,
      child: Padding(
        padding: const EdgeInsets.all(AppSpace.s4),
        child: Column(
          crossAxisAlignment: CrossAxisAlignment.start,
          children: [
            Row(
              children: [
                Expanded(child: Text('PnL', style: text.titleMedium)),
                Text('${summary.openPositions} posisi terbuka', style: text.labelSmall!.copyWith(color: muted)),
              ],
            ),
            const SizedBox(height: AppSpace.s3),
            _PnlRow(
              label: 'Belum terealisasi',
              hint: 'Mark-to-market posisi terbuka',
              value: summary.unrealizedPnlLamports,
              key: const Key('pnlUnrealized'),
            ),
            const SizedBox(height: AppSpace.s3),
            Divider(height: 1, thickness: 1, color: Theme.of(context).colorScheme.outlineVariant),
            const SizedBox(height: AppSpace.s3),
            _PnlRow(
              label: 'Terealisasi',
              hint: 'Terkunci saat trade ditutup',
              value: summary.realizedPnlLamports,
              key: const Key('pnlRealized'),
            ),
            const SizedBox(height: AppSpace.s3),
            Divider(height: 1, thickness: 1, color: Theme.of(context).colorScheme.outlineVariant),
            const SizedBox(height: AppSpace.s3),
            Row(
              crossAxisAlignment: CrossAxisAlignment.end,
              children: [
                Expanded(
                  child: Column(
                    crossAxisAlignment: CrossAxisAlignment.start,
                    children: [
                      Text('Total PnL', style: text.titleSmall),
                      const SizedBox(height: AppSpace.sHalf),
                      Text('Realized + unrealized', style: text.labelSmall!.copyWith(color: muted)),
                    ],
                  ),
                ),
                PnlText(summary.totalPnlLamports, key: const Key('pnlTotal'), size: 18, unit: true),
              ],
            ),
          ],
        ),
      ),
    );
  }
}

class _PnlRow extends StatelessWidget {
  const _PnlRow({required this.label, required this.hint, required this.value, super.key});

  final String label;
  final String hint;
  final Lamports value;

  @override
  Widget build(BuildContext context) {
    final text = Theme.of(context).textTheme;
    final muted = Theme.of(context).colorScheme.onSurfaceVariant;
    return Row(
      crossAxisAlignment: CrossAxisAlignment.start,
      children: [
        Expanded(
          child: Column(
            crossAxisAlignment: CrossAxisAlignment.start,
            children: [
              Text(label, style: text.bodyMedium),
              const SizedBox(height: AppSpace.sHalf),
              Text(hint, style: text.labelSmall!.copyWith(color: muted)),
            ],
          ),
        ),
        const SizedBox(width: AppSpace.s2),
        PnlText(value, size: 16, unit: true),
      ],
    );
  }
}
