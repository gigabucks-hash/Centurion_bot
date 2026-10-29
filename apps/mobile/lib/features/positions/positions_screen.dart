import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:go_router/go_router.dart';

import '../../core/theme/solbot_theme.dart';
import '../../core/format.dart';
import '../../core/widgets/common.dart';
import '../../data/models/models.dart';
import '../../data/providers.dart';

class PositionsScreen extends ConsumerWidget {
  const PositionsScreen({super.key});

  @override
  Widget build(BuildContext context, WidgetRef ref) {
    final positions = ref.watch(positionsProvider);
    return Scaffold(
      appBar: AppBar(title: const Text('Posisi')),
      body: AsyncBody(
        value: positions,
        data: (list) {
          if (list.isEmpty) return const EmptyState(icon: Icons.inventory_2_outlined, text: 'No positions');
          return ListView.separated(
            padding: const EdgeInsets.all(12),
            itemCount: list.length,
            separatorBuilder: (_, __) => const SizedBox(height: 8),
            itemBuilder: (_, i) => _PositionTile(list[i]),
          );
        },
      ),
    );
  }
}

class _PositionTile extends StatelessWidget {
  const _PositionTile(this.p);
  final Position p;

  @override
  Widget build(BuildContext context) {
    final open = p.state == PositionState.open;
    return Card(
      child: ListTile(
        onTap: () => context.go('/positions/${Uri.encodeComponent(p.id)}'),
        leading: CircleAvatar(child: Text(p.symbol.substring(0, 1))),
        title: Row(children: [
          Text(p.symbol, style: const TextStyle(fontWeight: FontWeight.w600)),
          const SizedBox(width: 8),
          if (!open) Text('closed', style: Theme.of(context).textTheme.labelSmall),
        ]),
        subtitle: Text('${fmtSol(p.solIn, unit: true)} in · ${shortMint(p.mint)}'),
        trailing: Column(
          mainAxisAlignment: MainAxisAlignment.center,
          crossAxisAlignment: CrossAxisAlignment.end,
          children: [
            PnlText(p.pnlSol),
            PnlText(p.changePct, pct: true, size: 12),
          ],
        ),
      ),
    );
  }
}

class PositionDetailScreen extends ConsumerWidget {
  const PositionDetailScreen({super.key, required this.positionId});
  final String positionId;

  @override
  Widget build(BuildContext context, WidgetRef ref) {
    final pos = ref.watch(positionByIdProvider(positionId));
    return Scaffold(
      appBar: AppBar(title: const Text('Position')),
      body: AsyncBody(
        value: pos,
        data: (p) {
          if (p == null) return const EmptyState(icon: Icons.search_off, text: 'Position not found');
          final rows = <(String, Widget)>[
            ('Status', Text(p.state.name)),
            ('Mode', ModeChip(p.mode)),
            ('Mint', SelectableText(shortMint(p.mint))),
            ('SOL in', Text(fmtSol(p.solIn, unit: true), style: numStyle(14))),
            if (p.solOut != null) ('SOL out', Text(fmtSol(p.solOut!, unit: true), style: numStyle(14))),
            ('Entry', Text('\$${p.entryPriceUsd.toStringAsPrecision(4)}')),
            ('Mark', Text('\$${p.markPriceUsd.toStringAsPrecision(4)}')),
            ('Peak', Text('\$${p.peakPriceUsd.toStringAsPrecision(4)}')),
            ('Opened', Text(fmtTime(p.openedAt))),
            if (p.closedAt != null) ('Closed', Text(fmtTime(p.closedAt!))),
            if (p.exitReason != null) ('Exit reason', Flexible(child: Text(p.exitReason!, textAlign: TextAlign.end))),
          ];
          return ListView(padding: const EdgeInsets.all(16), children: [
            Text(p.symbol, style: Theme.of(context).textTheme.headlineSmall),
            const SizedBox(height: 4),
            Row(children: [
              PnlText(p.pnlSol, size: 22, unit: true),
              const SizedBox(width: 12),
              PnlText(p.changePct, pct: true),
            ]),
            const SizedBox(height: AppSpace.s3),
            Card(
              child: Padding(
                padding: const EdgeInsets.symmetric(horizontal: 16, vertical: 8),
                child: Column(
                  children: [
                    for (final (label, value) in rows)
                      Padding(
                        padding: const EdgeInsets.symmetric(vertical: 8),
                        child: Row(children: [Text(label), const Spacer(), value]),
                      ),
                  ],
                ),
              ),
            ),
            const SizedBox(height: 12),
            const Text(
              'Manual sell is intentionally not in the prototype: it will go through the same approval + biometric path as other Real SOL actions.',
              
            ),
          ]);
        },
      ),
    );
  }
}
