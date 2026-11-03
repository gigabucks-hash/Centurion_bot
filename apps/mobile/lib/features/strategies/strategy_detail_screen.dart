import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';

import '../../core/format.dart';
import '../../core/theme/centurion_theme.dart';
import '../../core/widgets/common.dart';
import '../../data/providers.dart';
import 'strategy_mode.dart';

/// Strategy detail: the strategy's own mode banner (mode is per strategy), mode badge and the read-only mode block.
class StrategyDetailScreen extends ConsumerWidget {
  const StrategyDetailScreen(this.id, {super.key});
  final String id;

  @override
  Widget build(BuildContext context, WidgetRef ref) {
    final text = Theme.of(context).textTheme;
    final value = ref.watch(strategiesProvider);
    final s = value.valueOrNull?.where((e) => e.id == id).firstOrNull;
    if (s == null) {
      return Scaffold(
        appBar: AppBar(),
        body: AsyncBody(value: value, data: (_) => const SizedBox()),
      );
    }
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
                  children: [
                    Text('Realized ', style: text.bodyMedium),
                    PnlText(s.realizedPnlLamports, size: 15),
                  ],
                ),
                const SizedBox(height: AppSpace.s1),
                Text('${fmtSol(s.ticketLamports, unit: true)}/coin · max ${s.maxOpen}', style: text.bodySmall),
                const SizedBox(height: AppSpace.s4),
                StrategyModeSection(s),
              ],
            ),
          ),
        ],
      ),
    );
  }
}
