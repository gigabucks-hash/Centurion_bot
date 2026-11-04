import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';

import '../../core/format.dart';
import '../../core/theme/centurion_theme.dart';
import '../../core/widgets/app_icons.dart';
import '../../core/widgets/common.dart';
import '../../data/models/models.dart';
import '../../data/providers.dart';
import 'strategies_screen.dart' show strategyToggleProvider;
import 'strategy_mode.dart';

/// Strategy detail: hero PnL, a partitioned stat strip, the read-only mode block,
/// and a sticky Pause/Stop action bar (G1-blue bot detail).
class StrategyDetailScreen extends ConsumerWidget {
  const StrategyDetailScreen(this.id, {super.key});
  final String id;

  @override
  Widget build(BuildContext context, WidgetRef ref) {
    final text = Theme.of(context).textTheme;
    final muted = Theme.of(context).colorScheme.onSurfaceVariant;
    final value = ref.watch(strategiesProvider);
    final s = value.valueOrNull?.where((e) => e.id == id).firstOrNull;
    if (s == null) {
      return Scaffold(
        appBar: AppBar(),
        body: AsyncBody(value: value, data: (_) => const SizedBox()),
      );
    }
    final optimistic = ref.watch(strategyToggleProvider)[s.id];
    final running = optimistic ?? s.isRunning;
    return Scaffold(
      appBar: AppBar(
        title: Text(s.name, overflow: TextOverflow.ellipsis),
        actions: [
          Center(child: ModeChip(s.mode)),
          const SizedBox(width: AppSpace.s4),
        ],
      ),
      body: Column(
        children: [
          ModeBanner(s.mode, short: true, key: const Key('strategy_mode_banner')),
          Expanded(
            child: ListView(
              padding: const EdgeInsets.all(AppSpace.s4),
              children: [
                Row(
                  crossAxisAlignment: CrossAxisAlignment.end,
                  children: [
                    Expanded(
                      child: Text(
                        'PNL · ${s.mode == TradeMode.real ? 'REAL' : 'PRACTICE'}',
                        style: AppText.eyebrow(muted),
                      ),
                    ),
                    if (running)
                      TagChip(
                        'Running',
                        color: context.tradeColors.profit,
                        container: context.tradeColors.profitContainer,
                      )
                    else
                      TagChip(
                        'Paused',
                        color: context.tradeColors.warning,
                        container: context.tradeColors.warningContainer,
                      ),
                  ],
                ),
                const SizedBox(height: AppSpace.s1),
                FittedBox(
                  fit: BoxFit.scaleDown,
                  alignment: Alignment.centerLeft,
                  child: PnlText(s.realizedPnlLamports, size: 44),
                ),
                const SizedBox(height: AppSpace.s1),
                Text(
                  '${fmtSol(s.ticketLamports, unit: true)}/coin · max ${s.maxOpen} posisi',
                  style: text.bodySmall!.copyWith(color: muted),
                ),
                const SizedBox(height: AppSpace.s4),
                _StatStrip(s),
                const SizedBox(height: AppSpace.s4),
                StrategyModeSection(s),
                const SizedBox(height: AppSpace.s4),
                Text(
                  s.mode == TradeMode.real
                      ? 'Aksi Real SOL butuh konfirmasi hold 2,5 detik dan wallet terhubung.'
                      : 'Practice memakai SOL simulasi. Tidak ada dana nyata yang bergerak.',
                  style: text.labelSmall!.copyWith(color: muted),
                ),
              ],
            ),
          ),
        ],
      ),
      bottomNavigationBar: _StickyActions(strategy: s, running: running),
    );
  }
}

class _StatStrip extends StatelessWidget {
  const _StatStrip(this.s);
  final Strategy s;

  @override
  Widget build(BuildContext context) {
    final cs = Theme.of(context).colorScheme;
    return Container(
      decoration: BoxDecoration(
        color: cs.surfaceContainer,
        borderRadius: BorderRadius.circular(AppRadius.md),
        border: Border.all(color: cs.outlineVariant),
      ),
      child: Column(
        children: [
          IntrinsicHeight(
            child: Row(
              children: [
                Expanded(
                  child: _Stat(label: 'WIN RATE', value: '${s.winRatePct.round()}%'),
                ),
                VerticalDivider(width: 1, thickness: 1, color: cs.outlineVariant),
                Expanded(
                  child: _Stat(
                    label: 'MAX DD',
                    value: '−${s.maxDrawdownPct.toStringAsFixed(1).replaceAll('.', ',')}%',
                    color: context.tradeColors.loss,
                  ),
                ),
              ],
            ),
          ),
          Divider(height: 1, thickness: 1, color: cs.outlineVariant),
          IntrinsicHeight(
            child: Row(
              children: [
                Expanded(
                  child: _Stat(label: 'AVG HOLD', value: '${s.avgHold.inMinutes} mnt'),
                ),
                VerticalDivider(width: 1, thickness: 1, color: cs.outlineVariant),
                Expanded(
                  child: _Stat(label: 'APPROVAL', value: s.askFirst ? 'Ask' : 'Auto'),
                ),
              ],
            ),
          ),
        ],
      ),
    );
  }
}

class _Stat extends StatelessWidget {
  const _Stat({required this.label, required this.value, this.color});
  final String label;
  final String value;
  final Color? color;

  @override
  Widget build(BuildContext context) {
    return Padding(
      padding: const EdgeInsets.symmetric(horizontal: AppSpace.s3, vertical: AppSpace.s3),
      child: Column(
        crossAxisAlignment: CrossAxisAlignment.start,
        children: [
          Text(
            label,
            style: Theme.of(
              context,
            ).textTheme.labelSmall!.copyWith(color: Theme.of(context).colorScheme.onSurfaceVariant),
          ),
          const SizedBox(height: AppSpace.s1),
          Text(
            value,
            style: AppText.num(20, weight: FontWeight.w600, color: color),
          ),
        ],
      ),
    );
  }
}

class _StickyActions extends ConsumerWidget {
  const _StickyActions({required this.strategy, required this.running});
  final Strategy strategy;
  final bool running;

  Future<void> _toggle(BuildContext context, WidgetRef ref) async {
    if (!running && strategy.mode == TradeMode.real) {
      final ok = await ref.read(approvalGuardProvider).confirm(context, action: 'Resume ${strategy.name} (Real SOL)');
      if (!ok) return;
    }
    final err = await ref.read(strategyToggleProvider.notifier).toggle(strategy, run: !running);
    if (err != null && context.mounted) {
      ScaffoldMessenger.of(context).showSnackBar(SnackBar(content: Text(err)));
    }
  }

  Future<void> _stop(BuildContext context, WidgetRef ref) async {
    final ok = await showDialog<bool>(
      context: context,
      builder: (c) => AlertDialog(
        title: Text('Stop ${strategy.name}?'),
        content: const Text(
          'Prototype: Stop menjeda bot supaya tidak ada entry baru. Posisi yang masih terbuka '
          'ditutup dari tab Positions (jual 100%).',
        ),
        actions: [
          TextButton(onPressed: () => Navigator.pop(c, false), child: const Text('Batal')),
          TextButton(onPressed: () => Navigator.pop(c, true), child: const Text('Stop bot')),
        ],
      ),
    );
    if (ok != true) return;
    final err = await ref.read(strategyToggleProvider.notifier).toggle(strategy, run: false);
    if (err != null && context.mounted) {
      ScaffoldMessenger.of(context).showSnackBar(SnackBar(content: Text(err)));
    }
  }

  @override
  Widget build(BuildContext context, WidgetRef ref) {
    final t = context.tradeColors;
    return DecoratedBox(
      decoration: BoxDecoration(
        color: Theme.of(context).colorScheme.surfaceContainer,
        border: Border(top: BorderSide(color: Theme.of(context).colorScheme.outlineVariant)),
      ),
      child: SafeArea(
        top: false,
        child: Padding(
          padding: const EdgeInsets.fromLTRB(AppSpace.s4, AppSpace.s3, AppSpace.s4, AppSpace.s3),
          child: Row(
            children: [
              Expanded(
                child: OutlinedButton.icon(
                  key: const Key('botPause'),
                  onPressed: () => _toggle(context, ref),
                  icon: Icon(running ? AppIcons.pause : AppIcons.play, size: 18),
                  label: Text(running ? 'Pause' : 'Resume'),
                ),
              ),
              const SizedBox(width: AppSpace.s2),
              Expanded(
                child: OutlinedButton.icon(
                  key: const Key('botStop'),
                  onPressed: running ? () => _stop(context, ref) : null,
                  style: OutlinedButton.styleFrom(
                    foregroundColor: t.loss,
                    side: BorderSide(color: t.loss.withValues(alpha: 0.7)),
                  ),
                  icon: const Icon(AppIcons.stop, size: 18),
                  label: const Text('Stop bot'),
                ),
              ),
            ],
          ),
        ),
      ),
    );
  }
}
