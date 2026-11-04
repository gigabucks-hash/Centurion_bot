import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:go_router/go_router.dart';

import '../../core/format.dart';
import '../../core/theme/centurion_theme.dart';
import '../../core/widgets/app_icons.dart';
import '../../core/widgets/common.dart';
import '../../data/models/models.dart';
import '../../data/providers.dart';

/// G1-blue Risk tab: guard state, the limits the bots run under, and guard changes
/// waiting for approval. Read-only; decisions still happen in the approvals queue.
class RiskScreen extends ConsumerWidget {
  const RiskScreen({super.key});

  @override
  Widget build(BuildContext context, WidgetRef ref) {
    final strategies = ref.watch(strategiesProvider).valueOrNull ?? const <Strategy>[];
    final approvals = ref.watch(pendingApprovalsProvider).valueOrNull ?? const <Approval>[];
    final guardChanges = approvals.where((a) => a.kind == ApprovalKind.guardChange).toList();
    return Scaffold(
      appBar: AppBar(
        title: const Text('Risk'),
        actions: const [
          Center(child: _ExampleData()),
          SizedBox(width: AppSpace.s4),
        ],
      ),
      body: ListView(
        padding: const EdgeInsets.all(AppSpace.s4),
        children: [
          _WithinLimits(strategies: strategies, guardChanges: guardChanges.length),
          const SizedBox(height: AppSpace.s4),
          _LimitsStrip(strategies: strategies),
          const SizedBox(height: AppSpace.s5),
          Row(
            children: [
              Expanded(child: Text('Guard per bot', style: Theme.of(context).textTheme.titleMedium)),
              Text(
                '${strategies.where((s) => s.isRunning).length} jalan',
                style: Theme.of(
                  context,
                ).textTheme.labelSmall!.copyWith(color: Theme.of(context).colorScheme.onSurfaceVariant),
              ),
            ],
          ),
          const SizedBox(height: AppSpace.s2),
          if (strategies.isEmpty)
            const _Note('Belum ada bot. Guard berlaku begitu bot pertama dibuat.')
          else
            Card(
              margin: EdgeInsets.zero,
              clipBehavior: Clip.antiAlias,
              child: Column(
                children: [
                  for (var i = 0; i < strategies.length; i++) ...[
                    if (i > 0) Divider(height: 1, thickness: 1, color: Theme.of(context).colorScheme.outlineVariant),
                    _StrategyGuardRow(strategies[i]),
                  ],
                ],
              ),
            ),
          const SizedBox(height: AppSpace.s5),
          Row(
            children: [
              Expanded(child: Text('Menunggu persetujuan', style: Theme.of(context).textTheme.titleMedium)),
              if (guardChanges.isNotEmpty)
                TextButton(onPressed: () => context.go('/approvals'), child: const Text('Antrean')),
            ],
          ),
          const SizedBox(height: AppSpace.s2),
          if (guardChanges.isEmpty)
            const _Note('Tidak ada perubahan guard yang menunggu. Aturan sekarang sudah final.')
          else
            Card(
              margin: EdgeInsets.zero,
              clipBehavior: Clip.antiAlias,
              child: Column(
                children: [
                  for (var i = 0; i < guardChanges.length; i++) ...[
                    if (i > 0) Divider(height: 1, thickness: 1, color: Theme.of(context).colorScheme.outlineVariant),
                    ListTile(
                      key: Key('risk_${guardChanges[i].id}'),
                      title: Text(guardChanges[i].title, maxLines: 2, overflow: TextOverflow.ellipsis),
                      subtitle: Text(guardChanges[i].detail, maxLines: 2, overflow: TextOverflow.ellipsis),
                      trailing: guardChanges[i].riskLevel == null
                          ? const Icon(AppIcons.chevronRight)
                          : RiskBadge(guardChanges[i].riskLevel!),
                      onTap: () => context.go('/approvals'),
                    ),
                  ],
                ],
              ),
            ),
          const SizedBox(height: AppSpace.s5),
          const _Note(
            'Paper only. Tidak ada SOL nyata yang dipakai. Real SOL terkunci sampai Fase 7 dan '
            'setiap aksi Real butuh hold 2,5 detik.',
          ),
        ],
      ),
    );
  }
}

class _ExampleData extends StatelessWidget {
  const _ExampleData();

  @override
  Widget build(BuildContext context) {
    return Container(
      padding: const EdgeInsets.symmetric(horizontal: AppSpace.s2, vertical: AppSpace.sHalf),
      decoration: BoxDecoration(
        borderRadius: BorderRadius.circular(AppRadius.xs),
        border: Border.all(color: Theme.of(context).colorScheme.outline),
      ),
      child: Text(
        'EXAMPLE DATA',
        style: Theme.of(
          context,
        ).textTheme.labelSmall!.copyWith(color: Theme.of(context).colorScheme.onSurfaceVariant, letterSpacing: 0.8),
      ),
    );
  }
}

/// Loss-stop defaults used by the mock/prototype until the app reads the real per-strategy
/// `practice_drawdown_halt_pct` / `real_drawdown_halt_pct` values from the settings document.
const _paperLossStopPct = 50.0;
const _realLossStopPct = 30.0;

double _lossStopFor(Strategy s) => s.mode == TradeMode.real ? _realLossStopPct : _paperLossStopPct;

class _WithinLimits extends StatelessWidget {
  const _WithinLimits({required this.strategies, required this.guardChanges});
  final List<Strategy> strategies;
  final int guardChanges;

  @override
  Widget build(BuildContext context) {
    final t = context.tradeColors;
    final text = Theme.of(context).textTheme;
    final over = strategies.where((s) => s.maxDrawdownPct >= _lossStopFor(s)).length;
    final ok = over == 0;
    final color = ok ? t.profit : t.warning;
    final container = ok ? t.profitContainer : t.warningContainer;
    return Container(
      padding: const EdgeInsets.all(AppSpace.s4),
      decoration: BoxDecoration(
        color: container,
        borderRadius: BorderRadius.circular(AppRadius.md),
        border: Border.all(color: color.withValues(alpha: 0.45)),
      ),
      child: Row(
        children: [
          Icon(ok ? AppIcons.guard : AppIcons.warning, size: 24, color: color),
          const SizedBox(width: AppSpace.s3),
          Expanded(
            child: Column(
              crossAxisAlignment: CrossAxisAlignment.start,
              children: [
                Text(ok ? 'Within limits' : 'Perlu perhatian', style: text.titleMedium!.copyWith(color: color)),
                const SizedBox(height: AppSpace.sHalf),
                Text(
                  guardChanges == 0
                      ? (ok
                            ? 'Drawdown semua bot masih di bawah loss stop. Tidak ada guard change '
                                  'yang menunggu.'
                            : '$over bot sudah menyentuh loss stop. Cek guard per bot di bawah.')
                      : '$guardChanges guard change menunggu persetujuan kamu. Belum ada yang berlaku.',
                  style: text.bodySmall!.copyWith(color: Theme.of(context).colorScheme.onSurfaceVariant),
                ),
              ],
            ),
          ),
        ],
      ),
    );
  }
}

class _LimitsStrip extends StatelessWidget {
  const _LimitsStrip({required this.strategies});
  final List<Strategy> strategies;

  @override
  Widget build(BuildContext context) {
    final cs = Theme.of(context).colorScheme;
    final maxDd = strategies.fold<double>(0, (a, b) => b.maxDrawdownPct > a ? b.maxDrawdownPct : a);
    final maxOpen = strategies.fold<int>(0, (a, b) => a + b.maxOpen);
    final biggest = strategies.isEmpty
        ? Lamports.zero
        : strategies.map((s) => s.ticketLamports).reduce((a, b) => a > b ? a : b);
    return Container(
      key: const Key('riskLimits'),
      decoration: BoxDecoration(
        color: cs.surfaceContainer,
        borderRadius: BorderRadius.circular(AppRadius.md),
        border: Border.all(color: cs.outlineVariant),
      ),
      child: IntrinsicHeight(
        child: Row(
          children: [
            Expanded(
              child: _Cell(
                label: 'MAX DD',
                value: maxDd == 0 ? '—' : '−${maxDd.toStringAsFixed(1).replaceAll('.', ',')}%',
              ),
            ),
            VerticalDivider(width: 1, thickness: 1, color: cs.outlineVariant),
            Expanded(
              child: _Cell(label: 'PER TRADE', value: fmtSol(biggest, unit: true)),
            ),
            VerticalDivider(width: 1, thickness: 1, color: cs.outlineVariant),
            Expanded(
              child: _Cell(label: 'MAX OPEN', value: '$maxOpen'),
            ),
          ],
        ),
      ),
    );
  }
}

class _Cell extends StatelessWidget {
  const _Cell({required this.label, required this.value});
  final String label;
  final String value;

  @override
  Widget build(BuildContext context) {
    return Padding(
      padding: const EdgeInsets.symmetric(horizontal: AppSpace.s3, vertical: AppSpace.s3),
      child: Column(
        crossAxisAlignment: CrossAxisAlignment.start,
        mainAxisAlignment: MainAxisAlignment.center,
        children: [
          Text(
            label,
            style: Theme.of(
              context,
            ).textTheme.labelSmall!.copyWith(color: Theme.of(context).colorScheme.onSurfaceVariant),
          ),
          const SizedBox(height: AppSpace.s1),
          FittedBox(
            fit: BoxFit.scaleDown,
            alignment: Alignment.centerLeft,
            child: Text(value, style: AppText.num(20, weight: FontWeight.w600)),
          ),
        ],
      ),
    );
  }
}

class _StrategyGuardRow extends StatelessWidget {
  const _StrategyGuardRow(this.s);
  final Strategy s;

  @override
  Widget build(BuildContext context) {
    final t = context.tradeColors;
    final text = Theme.of(context).textTheme;
    final muted = Theme.of(context).colorScheme.onSurfaceVariant;
    final mode = switch (s.approvalMode) {
      ApprovalMode.off => 'Auto',
      ApprovalMode.askFirstBuy => 'Ask first buy',
      ApprovalMode.askEveryBuy => 'Ask every buy',
    };
    return Padding(
      padding: const EdgeInsets.symmetric(horizontal: AppSpace.s3, vertical: AppSpace.s3),
      child: Row(
        children: [
          Expanded(
            child: Column(
              crossAxisAlignment: CrossAxisAlignment.start,
              children: [
                Text(s.name, style: text.titleSmall, overflow: TextOverflow.ellipsis),
                const SizedBox(height: AppSpace.sHalf),
                Text(
                  '$mode · max ${s.maxOpen} · ${fmtSol(s.ticketLamports, unit: true)}/coin · '
                  'stop ${_lossStopFor(s).toStringAsFixed(0)}%',
                  style: text.labelSmall!.copyWith(color: muted),
                  overflow: TextOverflow.ellipsis,
                ),
              ],
            ),
          ),
          const SizedBox(width: AppSpace.s2),
          if (s.isRunning)
            TagChip('Running', color: t.profit, container: t.profitContainer, icon: AppIcons.play)
          else
            TagChip('Paused', color: t.warning, container: t.warningContainer, icon: AppIcons.pause),
        ],
      ),
    );
  }
}

class _Note extends StatelessWidget {
  const _Note(this.text);
  final String text;

  @override
  Widget build(BuildContext context) {
    return Text(
      text,
      style: Theme.of(context).textTheme.bodySmall!.copyWith(color: Theme.of(context).colorScheme.onSurfaceVariant),
    );
  }
}
