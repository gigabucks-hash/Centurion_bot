import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';

import '../../core/format.dart';
import '../../core/theme/solbot_theme.dart';
import '../../core/widgets/common.dart';
import '../../data/models/models.dart';
import '../../data/providers.dart';

/// Optimistic pause/resume state: strategyId -> desired running flag.
class StrategyToggleController extends Notifier<Map<String, bool>> {
  @override
  Map<String, bool> build() => const {};

  Future<String?> toggle(Strategy s, {required bool run}) async {
    state = {...state, s.id: run};
    try {
      await ref.read(strategyRepositoryProvider).setPaused(s.id, paused: !run, expectedRev: s.rev);
      return null;
    } on ConflictException catch (e) {
      return e.message;
    } catch (e) {
      return 'Gagal: $e';
    } finally {
      state = {...state}..remove(s.id);
    }
  }
}

final strategyToggleProvider =
    NotifierProvider<StrategyToggleController, Map<String, bool>>(StrategyToggleController.new);

String approvalModeLabel(ApprovalMode m) => switch (m) {
      ApprovalMode.off => 'Auto',
      ApprovalMode.askFirstBuy => 'Tanya buy pertama',
      ApprovalMode.askEveryBuy => 'Tanya tiap buy',
    };

class StatusChip extends StatelessWidget {
  const StatusChip(this.running, {super.key});
  final bool running;
  @override
  Widget build(BuildContext context) {
    final t = context.tradeColors;
    return running
        ? TagChip('Running', color: t.profit, container: t.profitContainer, icon: Icons.play_arrow)
        : TagChip('Paused', color: t.warning, container: t.warningContainer, icon: Icons.pause);
  }
}

/// Compact card used on the dashboard (wireframe 02).
class StrategySummaryCard extends StatelessWidget {
  const StrategySummaryCard(this.s, {super.key, this.onTap});
  final Strategy s;
  final VoidCallback? onTap;
  @override
  Widget build(BuildContext context) {
    final text = Theme.of(context).textTheme;
    return Card(
      margin: EdgeInsets.zero,
      clipBehavior: Clip.antiAlias,
      child: InkWell(
        onTap: onTap,
        child: Padding(
          padding: const EdgeInsets.all(AppSpace.s4),
          child: Column(crossAxisAlignment: CrossAxisAlignment.start, children: [
            Row(children: [
              Expanded(child: Text(s.name, style: text.titleMedium, overflow: TextOverflow.ellipsis)),
              PnlText(s.realizedPnlSol, size: 15),
            ]),
            const SizedBox(height: AppSpace.s2),
            Row(children: [
              StatusChip(s.isRunning),
              const SizedBox(width: AppSpace.s2),
              Expanded(
                child: Text(
                  'WR ${s.winRatePct.round()}% · DD −${s.maxDrawdownPct.toStringAsFixed(1).replaceAll('.', ',')}% · hold ${s.avgHold.inMinutes}m',
                  style: text.bodySmall!.copyWith(color: Theme.of(context).colorScheme.onSurfaceVariant),
                  overflow: TextOverflow.ellipsis,
                ),
              ),
            ]),
          ]),
        ),
      ),
    );
  }
}

class StrategiesScreen extends ConsumerWidget {
  const StrategiesScreen({super.key});

  Future<void> _onToggle(BuildContext context, WidgetRef ref, Strategy s, bool run) async {
    // Resuming a Real SOL strategy = Real SOL action → biometric gate.
    if (run && s.mode == TradeMode.real) {
      final ok = await ref.read(approvalGuardProvider).confirm(context, action: 'Resume ${s.name} (Real SOL)');
      if (!ok) return;
    }
    final err = await ref.read(strategyToggleProvider.notifier).toggle(s, run: run);
    if (err != null && context.mounted) {
      ScaffoldMessenger.of(context).showSnackBar(SnackBar(content: Text(err)));
    }
  }

  @override
  Widget build(BuildContext context, WidgetRef ref) {
    final strategies = ref.watch(strategiesProvider);
    final pendingToggles = ref.watch(strategyToggleProvider);
    final text = Theme.of(context).textTheme;
    final muted = Theme.of(context).colorScheme.onSurfaceVariant;
    return Scaffold(
      appBar: AppBar(title: const Text('Strategi')),
      body: AsyncBody(
        value: strategies,
        data: (list) => ListView.separated(
          padding: const EdgeInsets.all(AppSpace.s4),
          itemCount: list.length,
          separatorBuilder: (_, __) => const SizedBox(height: AppSpace.s3),
          itemBuilder: (_, i) {
            final s = list[i];
            final optimistic = pendingToggles[s.id];
            final running = optimistic ?? s.isRunning;
            final busy = optimistic != null;
            return Card(
              margin: EdgeInsets.zero,
              clipBehavior: Clip.antiAlias,
              child: Column(crossAxisAlignment: CrossAxisAlignment.start, children: [
                Padding(
                  padding: const EdgeInsets.fromLTRB(AppSpace.s4, AppSpace.s4, AppSpace.s4, AppSpace.s2),
                  child: Column(crossAxisAlignment: CrossAxisAlignment.start, children: [
                    Row(children: [
                      Expanded(child: Text(s.name, style: text.titleMedium, overflow: TextOverflow.ellipsis)),
                      ModeChip(s.mode),
                    ]),
                    const SizedBox(height: AppSpace.s1),
                    Wrap(crossAxisAlignment: WrapCrossAlignment.center, children: [
                      Text('Realized ', style: text.bodySmall!.copyWith(color: muted)),
                      PnlText(s.realizedPnlSol, size: 13),
                      Text('  ·  rev ${s.rev}', style: text.bodySmall!.copyWith(color: muted)),
                    ]),
                    const SizedBox(height: AppSpace.s1),
                    Text(
                      '${fmtSol(s.tradeSol, unit: true)}/coin · max ${s.maxOpen} · exit ${s.exitPlan} · ${approvalModeLabel(s.approvalMode)}',
                      style: text.bodySmall!.copyWith(color: muted),
                    ),
                  ]),
                ),
                const Divider(height: 1),
                // SPEC: toggle row is fully tappable, 48dp, with a status label.
                MergeSemantics(
                  child: ListTile(
                    minTileHeight: AppSize.tapMin,
                    enabled: !busy,
                    onTap: busy ? null : () => _onToggle(context, ref, s, !running),
                    leading: StatusChip(running),
                    title: Text(running ? 'Strategi berjalan' : 'Strategi dijeda', style: text.bodyMedium),
                    trailing: Switch(
                      key: Key('toggle_${s.id}'),
                      value: running,
                      onChanged: busy ? null : (v) => _onToggle(context, ref, s, v),
                    ),
                  ),
                ),
              ]),
            );
          },
        ),
      ),
    );
  }
}
