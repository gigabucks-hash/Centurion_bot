import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';

import '../../core/format.dart';
import '../../core/theme/solbot_theme.dart';
import '../../core/widgets/common.dart';
import '../../data/models/models.dart';
import '../../data/providers.dart';

final _actorFilterProvider = StateProvider<Actor?>((_) => null);

String actorLabel(Actor a) => switch (a) {
      Actor.screener => 'Screener',
      Actor.guard => 'Guard',
      Actor.entry => 'Entry',
      Actor.executor => 'Executor',
      Actor.exit => 'Exit',
      Actor.you => 'You',
      Actor.system => 'System',
    };

class ActivityScreen extends ConsumerWidget {
  const ActivityScreen({super.key});

  @override
  Widget build(BuildContext context, WidgetRef ref) {
    final feed = ref.watch(activityFeedProvider(null));
    final filter = ref.watch(_actorFilterProvider);
    return Scaffold(
      appBar: AppBar(title: const Text('Activity')),
      body: Column(children: [
        SizedBox(
          height: 48,
          child: ListView(
            scrollDirection: Axis.horizontal,
            padding: const EdgeInsets.symmetric(horizontal: AppSpace.s4),
            children: [
              for (final a in <Actor?>[null, ...Actor.values])
                Padding(
                  padding: const EdgeInsets.only(right: AppSpace.s2),
                  child: FilterChip(
                    label: Text(a == null ? 'Semua' : actorLabel(a)),
                    selected: filter == a,
                    onSelected: (_) => ref.read(_actorFilterProvider.notifier).state = a,
                  ),
                ),
            ],
          ),
        ),
        Expanded(
          child: AsyncBody(
            value: feed,
            data: (events) {
              final list = filter == null ? events : events.where((e) => e.actor == filter).toList();
              if (list.isEmpty) return const EmptyState(icon: Icons.bolt_outlined, text: 'Belum ada aktivitas');
              final now = DateTime.now();
              return ListView.builder(
                itemCount: list.length,
                itemBuilder: (_, i) => ActivityTile(list[i], now: now),
              );
            },
          ),
        ),
      ]),
    );
  }
}

class ActivityTile extends StatelessWidget {
  const ActivityTile(this.e, {super.key, required this.now, this.dense = false});
  final ActivityEvent e;
  final DateTime now;
  final bool dense;

  static IconData iconFor(ActivityKind k) => switch (k) {
        ActivityKind.found => Icons.radar,
        ActivityKind.passed => Icons.check_circle_outline,
        ActivityKind.armed => Icons.gps_fixed,
        ActivityKind.expired => Icons.timer_off_outlined,
        ActivityKind.blocked => Icons.shield_outlined,
        ActivityKind.bought => Icons.south_west,
        ActivityKind.sold => Icons.north_east,
        ActivityKind.proposal => Icons.how_to_vote_outlined,
        ActivityKind.skipped => Icons.redo,
        ActivityKind.approved => Icons.task_alt,
        ActivityKind.paused => Icons.pause_circle_outline,
        ActivityKind.resumed => Icons.play_circle_outline,
      };

  @override
  Widget build(BuildContext context) {
    final t = context.tradeColors;
    final muted = Theme.of(context).colorScheme.onSurfaceVariant;
    final color = switch (e.kind) {
      ActivityKind.bought || ActivityKind.passed || ActivityKind.resumed || ActivityKind.approved => t.profit,
      ActivityKind.sold => context.lamportsColor(e.pnlLamports ?? Lamports.zero),
      ActivityKind.blocked => t.guard,
      ActivityKind.expired || ActivityKind.skipped => muted,
      ActivityKind.proposal || ActivityKind.paused => t.warning,
      _ => t.info,
    };
    return ListTile(
      dense: dense,
      leading: Icon(iconFor(e.kind), color: color, size: 20),
      title: Text.rich(TextSpan(children: [
        TextSpan(
            text: '${e.kind.name.toUpperCase()}  ',
            style: TextStyle(color: color, fontWeight: FontWeight.w700, fontSize: 12)),
        TextSpan(text: e.message),
      ])),
      subtitle: Text('${actorLabel(e.actor)} · ${fmtTime(e.at)}', style: TextStyle(color: muted)),
      trailing: e.pnlLamports == null ? null : PnlText(e.pnlLamports!, size: 13),
    );
  }
}
