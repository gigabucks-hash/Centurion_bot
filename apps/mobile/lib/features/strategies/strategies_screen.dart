import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';

import '../../core/feature_flags.dart';
import '../../core/format.dart';
import '../../core/theme/centurion_theme.dart';
import '../../core/widgets/app_icons.dart';
import '../../core/widgets/common.dart';
import '../../data/api/api_exception.dart';
import '../../data/api/settings_keys.dart';
import '../../data/models/models.dart';
import '../../data/providers.dart';
import '../../l10n/gen/app_localizations.dart';
import 'package:go_router/go_router.dart';
import 'strategy_mode.dart';

/// Optimistic pause/resume state: strategyId -> desired running flag.
class StrategyToggleController extends Notifier<Map<String, bool>> {
  @override
  Map<String, bool> build() => const {};

  Future<String?> toggle(Strategy s, {required bool run}) async {
    // Pausing Real is always allowed (safe direction); resuming needs Phase 7.
    if (run && s.mode == TradeMode.real && !ref.read(featureFlagsProvider).realSolEnabled) return realSolDisabledText;
    state = {...state, s.id: run};
    try {
      await ref.read(strategyRepositoryProvider).setPaused(s.id, paused: !run, expectedRev: s.rev);
      return null;
    } on ApiException catch (e) {
      return e.message;
    } catch (e) {
      return 'Gagal: $e';
    } finally {
      state = {...state}..remove(s.id);
    }
  }
}

final strategyToggleProvider = NotifierProvider<StrategyToggleController, Map<String, bool>>(
  StrategyToggleController.new,
);

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
        ? TagChip('Running', color: t.profit, container: t.profitContainer, icon: AppIcons.play)
        : TagChip('Paused', color: t.warning, container: t.warningContainer, icon: AppIcons.pause);
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
          child: Column(
            crossAxisAlignment: CrossAxisAlignment.start,
            children: [
              Row(
                children: [
                  Expanded(
                    child: Text(s.name, style: text.titleMedium, overflow: TextOverflow.ellipsis),
                  ),
                  PnlText(s.realizedPnlLamports, size: 15),
                ],
              ),
              const SizedBox(height: AppSpace.s2),
              Row(
                children: [
                  StatusChip(s.isRunning),
                  const SizedBox(width: AppSpace.s2),
                  Expanded(
                    child: Text(
                      'WR ${s.winRatePct.round()}% · '
                      'DD −${s.maxDrawdownPct.toStringAsFixed(1).replaceAll('.', ',')}% · '
                      'hold ${s.avgHold.inMinutes}m',
                      style: text.bodySmall!.copyWith(color: Theme.of(context).colorScheme.onSurfaceVariant),
                      overflow: TextOverflow.ellipsis,
                    ),
                  ),
                ],
              ),
            ],
          ),
        ),
      ),
    );
  }
}

/// List filter (i18n `strategy.list.filter.*`).
final strategyModeFilterProvider = StateProvider.autoDispose<TradeMode?>((_) => null);

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
    final l = AppLocalizations.of(context);
    final filter = ref.watch(strategyModeFilterProvider);
    return Scaffold(
      appBar: AppBar(title: const Text('Bots')),
      body: AsyncBody(
        value: strategies,
        data: (all) {
          final list = filter == null ? all : all.where((s) => s.mode == filter).toList();
          int count(TradeMode m) => all.where((s) => s.mode == m).length;
          Widget chip(TradeMode? m, String label) => Padding(
            padding: const EdgeInsets.only(right: AppSpace.s2),
            child: ChoiceChip(
              key: Key('strategy_filter_${m?.name ?? 'all'}'),
              label: Text(label),
              selected: filter == m,
              onSelected: (_) => ref.read(strategyModeFilterProvider.notifier).state = m,
            ),
          );
          return ListView.separated(
            padding: const EdgeInsets.all(AppSpace.s4),
            itemCount: list.length + 1,
            separatorBuilder: (_, _) => const SizedBox(height: AppSpace.s3),
            itemBuilder: (_, i) {
              if (i == 0) {
                return SingleChildScrollView(
                  scrollDirection: Axis.horizontal,
                  child: Row(
                    children: [
                      chip(null, l.strategyListFilterAll(all.length)),
                      chip(TradeMode.practice, l.strategyListFilterPaper(count(TradeMode.practice))),
                      chip(TradeMode.real, l.strategyListFilterReal(count(TradeMode.real))),
                    ],
                  ),
                );
              }
              final s = list[i - 1];
              final optimistic = pendingToggles[s.id];
              final running = optimistic ?? s.isRunning;
              final busy = optimistic != null;
              return Card(
                margin: EdgeInsets.zero,
                clipBehavior: Clip.antiAlias,
                child: Column(
                  crossAxisAlignment: CrossAxisAlignment.start,
                  children: [
                    Padding(
                      padding: const EdgeInsets.fromLTRB(AppSpace.s4, AppSpace.s4, AppSpace.s4, AppSpace.s2),
                      child: Column(
                        crossAxisAlignment: CrossAxisAlignment.start,
                        children: [
                          InkWell(
                            key: Key('strategy_open_${s.id}'),
                            onTap: () => context.go('/strategies/${s.id}'),
                            child: Row(
                              children: [
                                Expanded(
                                  child: Text(s.name, style: text.titleMedium, overflow: TextOverflow.ellipsis),
                                ),
                                ModeChip(s.mode),
                                const Icon(AppIcons.chevronRight),
                              ],
                            ),
                          ),
                          if (s.mode == TradeMode.practice && s.realLocked) ...[
                            const SizedBox(height: AppSpace.s1),
                            Wrap(
                              spacing: AppSpace.s2,
                              crossAxisAlignment: WrapCrossAlignment.center,
                              children: [
                                RealLockedChip(s.realLockedReason),
                                if (s.paperProgress case final p?)
                                  Text(
                                    paperProgressLines(l, p).take(2).join(' · '),
                                    style: text.bodySmall!.copyWith(color: muted),
                                  ),
                              ],
                            ),
                          ],
                          const SizedBox(height: AppSpace.s1),
                          Wrap(
                            crossAxisAlignment: WrapCrossAlignment.center,
                            children: [
                              Text('Realized ', style: text.bodySmall!.copyWith(color: muted)),
                              PnlText(s.realizedPnlLamports, size: 13),
                              Text('  ·  rev ${s.rev}', style: text.bodySmall!.copyWith(color: muted)),
                            ],
                          ),
                          const SizedBox(height: AppSpace.s1),
                          Text(
                            '${fmtSol(s.ticketLamports, unit: true)}/coin · max ${s.maxOpen} · '
                            'exit ${ExitPresets.label(s.exitPlan)} · ${approvalModeLabel(s.approvalMode)}',
                            style: text.bodySmall!.copyWith(color: muted),
                          ),
                        ],
                      ),
                    ),
                    const Divider(height: 1),
                    // SPEC: toggle row is fully tappable, 48dp, with a status label.
                    MergeSemantics(
                      child: ListTile(
                        minTileHeight: AppDensity.tapMin,
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
                  ],
                ),
              );
            },
          );
        },
      ),
    );
  }
}
