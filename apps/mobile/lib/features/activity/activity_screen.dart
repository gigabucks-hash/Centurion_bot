import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';

import '../../core/format.dart';
import '../../core/theme/centurion_theme.dart';
import '../../core/widgets/common.dart';
import '../../core/widgets/page_footer.dart';
import '../../data/models/models.dart';
import '../../data/repositories/repositories.dart';
import '../../data/providers.dart';
import '../../core/widgets/coin_avatar.dart';

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

class ActivityScreen extends ConsumerStatefulWidget {
  const ActivityScreen({super.key});
  @override
  ConsumerState<ActivityScreen> createState() => _ActivityScreenState();
}

/// Live head (`watchFeed`) + older history via 1.1.4 keyset paging
/// (`fetchFeedPage`, `next_cursor`; CURSOR_INVALID restarts from page 1).
class _ActivityScreenState extends ConsumerState<ActivityScreen> {
  late final PagedListController<ActivityEvent> _pages = PagedListController(
    ({cursor, limit = defaultPageLimit}) =>
        ref.read(activityRepositoryProvider).fetchFeedPage(cursor: cursor, limit: limit),
    idOf: (e) => e.id,
    onChanged: (_) {
      if (mounted) setState(() {});
    },
  );

  @override
  void initState() {
    super.initState();
    _pages.refresh();
  }

  @override
  void dispose() {
    _pages.dispose();
    super.dispose();
  }

  @override
  Widget build(BuildContext context) {
    final feed = ref.watch(activityFeedProvider(null));
    final filter = ref.watch(_actorFilterProvider);
    final paged = _pages.state;
    return Scaffold(
      appBar: AppBar(title: const Text('Activity')),
      body: Column(
        children: [
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
              data: (head) {
                final events = mergeHeadAndPages(head, paged.items, (e) => e.id, (a, b) {
                  final c = b.at.compareTo(a.at);
                  return c != 0 ? c : b.id.compareTo(a.id);
                });
                final list = filter == null ? events : events.where((e) => e.actor == filter).toList();
                if (list.isEmpty && paged.done) {
                  return const EmptyState(icon: Icons.bolt_outlined, text: 'Belum ada aktivitas');
                }
                final now = DateTime.now();
                return ListView.builder(
                  key: const Key('activityList'),
                  itemCount: list.length + 1,
                  itemBuilder: (_, i) {
                    if (i >= list.length - pagePrefetchDistance && !paged.done && !paged.loading) {
                      WidgetsBinding.instance.addPostFrameCallback((_) => _pages.loadMore());
                    }
                    if (i == list.length) return PageFooter(state: paged, onRetry: _pages.loadMore);
                    return ActivityTile(list[i], now: now);
                  },
                );
              },
            ),
          ),
        ],
      ),
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
      leading: e.mint == null && e.symbol == null
          ? Icon(iconFor(e.kind), color: color, size: 20)
          : SizedBox.square(
              dimension: 36,
              child: Stack(
                clipBehavior: Clip.none,
                children: [
                  CoinAvatar(seed: e.mint ?? e.symbol!, logoUrl: e.logoUrl),
                  Positioned(
                    right: 0,
                    bottom: 0,
                    child: DecoratedBox(
                      decoration: BoxDecoration(color: Theme.of(context).colorScheme.surface, shape: BoxShape.circle),
                      child: Padding(
                        padding: const EdgeInsets.all(1),
                        child: Icon(iconFor(e.kind), color: color, size: 14),
                      ),
                    ),
                  ),
                ],
              ),
            ),
      title: Text.rich(
        TextSpan(
          children: [
            TextSpan(
              text: '${e.kind.name.toUpperCase()}  ',
              style: TextStyle(color: color, fontWeight: FontWeight.w700, fontSize: 12),
            ),
            TextSpan(text: e.message),
          ],
        ),
      ),
      subtitle: Text('${actorLabel(e.actor)} · ${fmtTime(e.at)}', style: TextStyle(color: muted)),
      trailing: e.pnlLamports == null ? null : PnlText(e.pnlLamports!, size: 13),
    );
  }
}
