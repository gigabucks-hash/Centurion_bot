import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:go_router/go_router.dart';

import '../../core/exit_reason_l10n.dart';
import '../../core/theme/centurion_theme.dart';
import '../../core/widgets/app_icons.dart';
import '../../core/widgets/common.dart';
import '../../core/widgets/page_footer.dart';
import '../../data/api/centurion_rpc.dart';
import '../../data/api/cursor_page.dart';
import '../../data/models/models.dart';
import '../../data/providers.dart';
import '../../l10n/gen/app_localizations.dart';
import 'pnl_strings.dart';
import 'widgets/closed_trade_row.dart';

/// PnL report: realized (locked at close) vs unrealized (mark-to-market), the
/// per-exit-reason aggregates from `exit_stats()`, and the closed-trade ledger.
///
/// Numbers come from the server, never from re-adding the loaded rows:
/// `portfolio_latest` owns realized/unrealized, `exit_stats()` owns the
/// per-reason aggregates, and each closed row keeps its own locked pnl.
class PnlReportScreen extends ConsumerStatefulWidget {
  const PnlReportScreen({super.key});

  @override
  ConsumerState<PnlReportScreen> createState() => _PnlReportScreenState();
}

class _PnlReportScreenState extends ConsumerState<PnlReportScreen> {
  late final PagedListController<Position> _closedPages = PagedListController(
    ({cursor, limit = defaultPageLimit}) => ref
        .read(portfolioRepositoryProvider)
        .fetchPositionsPage(state: PositionState.closed, cursor: cursor, limit: limit),
    idOf: (p) => p.id,
    onChanged: (_) {
      if (mounted) setState(() {});
    },
  );

  @override
  void initState() {
    super.initState();
    _closedPages.refresh();
  }

  @override
  void dispose() {
    _closedPages.dispose();
    super.dispose();
  }

  @override
  Widget build(BuildContext context) {
    final s = PnlStrings.of(Localizations.localeOf(context).languageCode);
    final positions = ref.watch(positionsProvider);
    final summary = ref.watch(summaryProvider);
    final stats = ref.watch(exitStatsProvider);
    final paged = _closedPages.state;
    return Scaffold(
      appBar: AppBar(
        // Explicit and localized: Material's implicit back button carries the
        // localized tooltip, so tests and screen readers get a stable label.
        // A direct `/pnl` deep link has nothing to pop, so fall back to the shell.
        leading: IconButton(
          key: const Key('pnlBack'),
          icon: const Icon(AppIcons.back),
          tooltip: s.back,
          onPressed: () {
            final nav = Navigator.of(context);
            if (nav.canPop()) {
              nav.pop();
            } else {
              context.go('/');
            }
          },
        ),
        title: Text(s.reportTitle),
      ),
      body: AsyncBody(
        value: positions,
        data: (list) {
          final closed = mergeHeadAndPages(
            list.where((p) => !p.isOpen).toList(),
            ref.read(practiceEpochGateProvider).filter(paged.items).where((p) => !p.isOpen).toList(),
            (p) => p.id,
            (a, b) => (b.closedAt ?? b.openedAt).compareTo(a.closedAt ?? a.openedAt),
          );
          final totalClosed = stats.valueOrNull?.fold<int>(0, (a, b) => a + b.count) ?? closed.length;
          return CustomScrollView(
            slivers: [
              SliverPadding(
                padding: const EdgeInsets.fromLTRB(AppSpace.s4, AppSpace.s2, AppSpace.s4, AppSpace.s6),
                sliver: SliverMainAxisGroup(
                  slivers: [
                    SliverToBoxAdapter(
                      child: _SummaryCard(summary: summary.valueOrNull, strings: s),
                    ),
                    SliverToBoxAdapter(
                      child: _ExitStatsSection(stats: stats, strings: s),
                    ),
                    if (closed.isEmpty)
                      SliverToBoxAdapter(child: _EmptyClosed(strings: s))
                    else ...[
                      SliverToBoxAdapter(
                        child: SectionHeader('${s.closedTrades} · $totalClosed${paged.done ? '' : '+'}'),
                      ),
                      SliverToBoxAdapter(
                        child: Padding(
                          padding: const EdgeInsets.only(bottom: AppSpace.s1),
                          child: Text(
                            s.partialNote,
                            style: Theme.of(
                              context,
                            ).textTheme.bodySmall!.copyWith(color: Theme.of(context).colorScheme.onSurfaceVariant),
                          ),
                        ),
                      ),
                      SliverList.builder(
                        itemCount: closed.length + 1,
                        itemBuilder: (context, i) {
                          if (i >= closed.length - pagePrefetchDistance && !paged.done && !paged.loading) {
                            WidgetsBinding.instance.addPostFrameCallback((_) => _closedPages.loadMore());
                          }
                          if (i == closed.length) return PageFooter(state: paged, onRetry: _closedPages.loadMore);
                          return ClosedTradeRow(position: closed[i], showClosedAt: true);
                        },
                      ),
                    ],
                  ],
                ),
              ),
            ],
          );
        },
      ),
    );
  }
}

class _SummaryCard extends StatelessWidget {
  const _SummaryCard({required this.summary, required this.strings});

  final PortfolioSummary? summary;
  final PnlStrings strings;

  @override
  Widget build(BuildContext context) {
    final s = strings;
    final text = Theme.of(context).textTheme;
    final cs = Theme.of(context).colorScheme;
    final muted = text.bodySmall!.copyWith(color: cs.onSurfaceVariant);
    final label = text.labelSmall!.copyWith(color: cs.onSurfaceVariant);
    return Card(
      key: const Key('pnlReportHeader'),
      margin: EdgeInsets.zero,
      child: Padding(
        padding: const EdgeInsets.all(AppSpace.s4),
        child: Column(
          crossAxisAlignment: CrossAxisAlignment.start,
          children: [
            Row(
              children: [
                Expanded(child: Text(s.reportEyebrow, style: AppText.eyebrow(cs.primary))),
                if (summary != null) ModeChip(summary!.mode),
              ],
            ),
            const SizedBox(height: AppSpace.s3),
            Text(s.realized, style: label),
            const SizedBox(height: AppSpace.s1),
            FittedBox(
              fit: BoxFit.scaleDown,
              alignment: Alignment.centerLeft,
              child: summary == null
                  ? Text(
                      s.unavailable,
                      style: AppText.num(44, weight: FontWeight.w600, color: cs.onSurfaceVariant),
                    )
                  : PnlText(summary!.realizedPnlLamports, key: const Key('pnlReportRealized'), size: 44, unit: true),
            ),
            const SizedBox(height: AppSpace.s1),
            Text(s.realizedHeroHint, style: muted),
            const SizedBox(height: AppSpace.s3),
            Divider(height: 1, thickness: 1, color: cs.outlineVariant),
            const SizedBox(height: AppSpace.s3),
            IntrinsicHeight(
              child: Row(
                crossAxisAlignment: CrossAxisAlignment.stretch,
                children: [
                  Expanded(
                    child: _Mini(
                      label: s.unrealized,
                      value: summary?.unrealizedPnlLamports,
                      valueKey: const Key('pnlReportUnrealized'),
                    ),
                  ),
                  VerticalDivider(width: 1, thickness: 1, color: cs.outlineVariant),
                  Expanded(
                    child: _Mini(
                      label: s.total,
                      value: summary?.totalPnlLamports,
                      valueKey: const Key('pnlReportTotal'),
                    ),
                  ),
                ],
              ),
            ),
          ],
        ),
      ),
    );
  }
}

class _Mini extends StatelessWidget {
  const _Mini({required this.label, required this.value, required this.valueKey});

  final String label;
  final Lamports? value;
  final Key valueKey;

  @override
  Widget build(BuildContext context) {
    final cs = Theme.of(context).colorScheme;
    return Padding(
      padding: const EdgeInsets.symmetric(horizontal: AppSpace.s2),
      child: Column(
        crossAxisAlignment: CrossAxisAlignment.start,
        children: [
          Text(
            label,
            style: Theme.of(context).textTheme.labelSmall!.copyWith(color: cs.onSurfaceVariant),
            maxLines: 2,
            overflow: TextOverflow.ellipsis,
          ),
          const SizedBox(height: AppSpace.s1),
          FittedBox(
            fit: BoxFit.scaleDown,
            alignment: Alignment.centerLeft,
            child: value == null
                ? Text(PnlStrings.of(Localizations.localeOf(context).languageCode).unavailable, style: AppText.num(17))
                : PnlText(value!, key: valueKey, size: 17, unit: true),
          ),
        ],
      ),
    );
  }
}

class _ExitStatsSection extends StatelessWidget {
  const _ExitStatsSection({required this.stats, required this.strings});

  final AsyncValue<List<ExitStat>> stats;
  final PnlStrings strings;

  @override
  Widget build(BuildContext context) {
    final s = strings;
    final rows = stats.valueOrNull;
    if (rows != null && rows.isEmpty) return const SizedBox.shrink();
    return Column(
      crossAxisAlignment: CrossAxisAlignment.start,
      children: [
        SectionHeader(s.byExitReason),
        Card(
          margin: EdgeInsets.zero,
          child: switch (stats) {
            AsyncData(:final value) => Column(
              children: [
                for (var i = 0; i < value.length; i++) ...[
                  if (i > 0) Divider(height: 1, thickness: 1, color: Theme.of(context).colorScheme.outlineVariant),
                  _StatRow(stat: value[i], strings: s),
                ],
              ],
            ),
            AsyncError() => Padding(
              padding: const EdgeInsets.all(AppSpace.s3),
              child: Text(
                s.statsUnavailable,
                style: Theme.of(
                  context,
                ).textTheme.bodySmall!.copyWith(color: Theme.of(context).colorScheme.onSurfaceVariant),
              ),
            ),
            _ => const SizedBox(
              height: 64,
              child: Center(child: SizedBox(width: 20, height: 20, child: CircularProgressIndicator(strokeWidth: 2))),
            ),
          },
        ),
      ],
    );
  }
}

class _StatRow extends StatelessWidget {
  const _StatRow({required this.stat, required this.strings});

  final ExitStat stat;
  final PnlStrings strings;

  @override
  Widget build(BuildContext context) {
    final s = strings;
    final text = Theme.of(context).textTheme;
    final muted = text.labelSmall!.copyWith(color: Theme.of(context).colorScheme.onSurfaceVariant);
    final l = AppLocalizations.of(context);
    return Padding(
      key: Key('exitStat_${stat.exitReason}'),
      padding: const EdgeInsets.symmetric(horizontal: AppSpace.s3, vertical: AppSpace.s3),
      child: Row(
        crossAxisAlignment: CrossAxisAlignment.start,
        children: [
          Expanded(
            child: Column(
              crossAxisAlignment: CrossAxisAlignment.start,
              children: [
                Text(
                  exitReasonLabel(l, stat.exitReason),
                  style: text.titleSmall,
                  maxLines: 1,
                  overflow: TextOverflow.ellipsis,
                ),
                const SizedBox(height: AppSpace.sHalf),
                Text('${s.trades(stat.count)} · ${s.winRate} ${stat.winRatePct.round()}%', style: muted),
              ],
            ),
          ),
          const SizedBox(width: AppSpace.s2),
          Column(
            crossAxisAlignment: CrossAxisAlignment.end,
            children: [
              PnlText(stat.pnl, size: 14, unit: true),
              const SizedBox(height: AppSpace.sHalf),
              Text('${s.avgHold} ${s.hold(stat.avgHoldS)}', style: muted),
            ],
          ),
        ],
      ),
    );
  }
}

class _EmptyClosed extends StatelessWidget {
  const _EmptyClosed({required this.strings});

  final PnlStrings strings;

  @override
  Widget build(BuildContext context) {
    final s = strings;
    final text = Theme.of(context).textTheme;
    final muted = Theme.of(context).colorScheme.onSurfaceVariant;
    return Padding(
      padding: const EdgeInsets.only(top: AppSpace.s5),
      child: Card(
        key: const Key('pnlEmpty'),
        margin: EdgeInsets.zero,
        child: Padding(
          padding: const EdgeInsets.all(AppSpace.s5),
          child: Column(
            children: [
              Icon(AppIcons.closed, size: 40, color: muted),
              const SizedBox(height: AppSpace.s3),
              Text(s.emptyTitle, style: text.titleMedium, textAlign: TextAlign.center),
              const SizedBox(height: AppSpace.s1),
              Text(
                s.emptyBody,
                style: text.bodySmall!.copyWith(color: muted),
                textAlign: TextAlign.center,
              ),
              const SizedBox(height: AppSpace.s2),
              TextButton(onPressed: () => context.go('/positions'), child: Text(s.emptyAction)),
            ],
          ),
        ),
      ),
    );
  }
}
