import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:go_router/go_router.dart';

import '../../core/exit_reason_l10n.dart';
import '../../core/format.dart';
import '../../core/theme/centurion_theme.dart';
import '../../core/widgets/app_icons.dart';
import '../../core/l10n_format.dart' show dash, formatHold;
import '../../core/widgets/common.dart';
import '../../core/widgets/page_footer.dart';
import '../../data/api/cursor_page.dart';
import '../../data/api/centurion_rpc.dart';
import '../../data/models/models.dart';
import '../../data/providers.dart';
import '../../l10n/gen/app_localizations.dart';

import 'widgets/closed_trade_row.dart';

/// PnL report: the `GET /stats/pnl` strip (unrealized, realized for the range,
/// closed, win rate, avg hold), the per-exit-reason aggregates, and the closed
/// ledger for the same range.
///
/// Every number is server-computed. The report never adds up ledger rows to
/// build a total: `realized_pnl_window_lamports` and `closed_count` come from
/// `pnl_summary()`, and the ledger is `/positions?state=closed` with the same
/// `from`/`to` bounds.
class PnlReportScreen extends ConsumerStatefulWidget {
  const PnlReportScreen({super.key});

  @override
  ConsumerState<PnlReportScreen> createState() => _PnlReportScreenState();
}

class _PnlReportScreenState extends ConsumerState<PnlReportScreen> {
  PnlWindow _window = PnlWindow.d7;

  /// Range echoed by the last `/stats/pnl` response. The paged fetcher reads
  /// these at call time, so the ledger always matches the strip.
  DateTime? _from;
  DateTime? _to;
  bool _ledgerReady = false;
  bool _syncScheduled = false;
  bool _queryRead = false;

  /// `/pnl?window=1h|24h|7d|30d|all` (web parity; `range=` and `1d` accepted).
  /// Read once, before the first build, so the first request is already right.
  @override
  void didChangeDependencies() {
    super.didChangeDependencies();
    if (_queryRead) return;
    _queryRead = true;
    final q = GoRouterState.of(context).uri.queryParameters;
    _window = switch (q['window'] ?? q['range']) {
      '1h' => PnlWindow.h1,
      '24h' || '1d' => PnlWindow.d1,
      '7d' => PnlWindow.d7,
      '30d' => PnlWindow.d30,
      'all' => PnlWindow.all,
      _ => _window,
    };
  }

  late final PagedListController<Position> _closedPages = PagedListController(
    ({cursor, limit = defaultPageLimit}) => ref
        .read(portfolioRepositoryProvider)
        .fetchPositionsPage(state: PositionState.closed, cursor: cursor, limit: limit, from: _from, to: _to),
    idOf: (p) => p.id,
    onChanged: (_) {
      if (mounted) setState(() {});
    },
  );

  @override
  void dispose() {
    _closedPages.dispose();
    super.dispose();
  }

  void _syncRange(PnlSummary summary) {
    if (_ledgerReady && summary.from == _from && summary.to == _to) return;
    _from = summary.from;
    _to = summary.to;
    _ledgerReady = true;
    // New generation: a loadMore() still in flight for the previous range is
    // discarded instead of being appended to this range's ledger (N2).
    _closedPages.refresh();
  }

  /// First data load and every filter change: point the paged ledger at the
  /// server's range. The first frame is never a client-side date calculation.
  void _maybeSync(PnlSummary summary) {
    if (_ledgerReady && summary.from == _from && summary.to == _to) return;
    if (_syncScheduled) return;
    _syncScheduled = true;
    WidgetsBinding.instance.addPostFrameCallback((_) {
      _syncScheduled = false;
      if (mounted) _syncRange(summary);
    });
  }

  @override
  Widget build(BuildContext context) {
    final s = AppLocalizations.of(context);
    final report = ref.watch(pnlSummaryProvider(_window));

    final summary = report.valueOrNull;
    if (summary != null) _maybeSync(summary);

    return Scaffold(
      appBar: AppBar(
        // Explicit and localized: Material's implicit back button carries the
        // localized tooltip, so tests and screen readers get a stable label.
        // A direct `/pnl` deep link has nothing to pop, so fall back to the shell.
        leading: IconButton(
          key: const Key('pnlBack'),
          icon: const Icon(AppIcons.back),
          tooltip: s.commonActionBack,
          onPressed: () {
            final nav = Navigator.of(context);
            if (nav.canPop()) {
              nav.pop();
            } else {
              context.go('/');
            }
          },
        ),
        title: Text(s.pnlReportTitle),
      ),
      body: report.when(
        loading: () => const Center(child: CircularProgressIndicator()),
        error: (_, _) => _ReportError(strings: s, onRetry: () => ref.invalidate(pnlSummaryProvider(_window))),
        data: (pnl) => _body(s, pnl),
      ),
    );
  }

  Widget _body(AppLocalizations s, PnlSummary pnl) {
    final paged = _closedPages.state;
    final range = (from: pnl.from, to: pnl.to);
    final stats = ref.watch(exitStatsProvider(range));
    final closed = paged.items;
    final showEmpty = pnl.closedCount == 0 && (paged.done || paged.error != null);
    return CustomScrollView(
      slivers: [
        SliverPadding(
          padding: const EdgeInsets.fromLTRB(AppSpace.s4, AppSpace.s2, AppSpace.s4, AppSpace.s6),
          sliver: SliverMainAxisGroup(
            slivers: [
              SliverToBoxAdapter(
                child: _SummaryCard(
                  summary: pnl,
                  strings: s,
                  window: _window,
                  onWindow: (w) {
                    if (w != _window) setState(() => _window = w);
                  },
                ),
              ),
              SliverToBoxAdapter(
                child: _ExitStatsSection(stats: stats, strings: s),
              ),
              if (showEmpty)
                SliverToBoxAdapter(child: _EmptyClosed(strings: s))
              else ...[
                SliverToBoxAdapter(
                  child: SectionHeader('${s.pnlClosedTrades} · ${pnl.closedCount}${paged.done ? '' : '+'}'),
                ),
                SliverList.builder(
                  itemCount: closed.length + 1,
                  itemBuilder: (context, i) {
                    if (i >= closed.length - pagePrefetchDistance && !paged.done && !paged.loading) {
                      WidgetsBinding.instance.addPostFrameCallback((_) => _closedPages.loadMore());
                    }
                    if (i == closed.length) return PageFooter(state: paged, onRetry: _closedPages.loadMore);
                    return ClosedTradeRow(
                      position: closed[i],
                      showClosedAt: true,
                      onTap: () => context.go('/positions/${Uri.encodeComponent(closed[i].id)}'),
                    );
                  },
                ),
              ],
            ],
          ),
        ),
      ],
    );
  }
}

class _SummaryCard extends StatelessWidget {
  const _SummaryCard({required this.summary, required this.strings, required this.window, required this.onWindow});

  final PnlSummary summary;
  final AppLocalizations strings;
  final PnlWindow window;
  final ValueChanged<PnlWindow> onWindow;

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
                Expanded(child: Text(s.pnlReportEyebrow, style: AppText.eyebrow(cs.primary))),
                ModeChip(summary.mode),
              ],
            ),
            const SizedBox(height: AppSpace.s2),
            Wrap(
              spacing: AppSpace.s1,
              children: [
                for (final w in PnlWindow.values)
                  ChoiceChip(
                    key: Key('pnlWindow_${w.name}'),
                    label: Text(_windowLabel(s, w)),
                    selected: w == window,
                    visualDensity: VisualDensity.compact,
                    onSelected: (_) => onWindow(w),
                  ),
              ],
            ),
            Text(s.pnlUnrealized, style: label),
            const SizedBox(height: AppSpace.s1),
            FittedBox(
              fit: BoxFit.scaleDown,
              alignment: Alignment.centerLeft,
              child: summary.unrealizedPnl == null
                  ? Text(dash, key: const Key('pnlReportUnrealized'), style: muted)
                  : PnlText(summary.unrealizedPnl!, key: const Key('pnlReportUnrealized'), size: 40, unit: true),
            ),
            const SizedBox(height: AppSpace.s3),
            Divider(height: 1, thickness: 1, color: cs.outlineVariant),
            const SizedBox(height: AppSpace.s2),
            _PairRow(
              left: _MiniPnl(
                label: s.pnlRealizedFor(_windowLabel(s, window)),
                value: summary.realizedPnlWindow,
                valueKey: const Key('pnlReportRealized'),
              ),
              right: _MiniValue(
                label: s.pnlClosed,
                value: '${summary.closedCount}',
                valueKey: const Key('pnlReportClosed'),
              ),
            ),
            const SizedBox(height: AppSpace.s1),
            Text(s.pnlPartialNote, style: muted),
            const SizedBox(height: AppSpace.s2),
            Divider(height: 1, thickness: 1, color: cs.outlineVariant),
            const SizedBox(height: AppSpace.s2),
            _PairRow(
              left: _MiniValue(
                label: s.pnlWinRate,
                value: summary.winRatePct == null ? dash : fmtRatePct(summary.winRatePct!),
                valueKey: const Key('pnlReportWinRate'),
              ),
              right: _MiniValue(
                label: s.pnlAvgHold,
                value: summary.avgHoldS == null ? dash : formatHold(s, summary.avgHoldS!),
                valueKey: const Key('pnlReportAvgHold'),
              ),
            ),
            const SizedBox(height: AppSpace.s3),
            Divider(height: 1, thickness: 1, color: cs.outlineVariant),
            const SizedBox(height: AppSpace.s2),
            _TotalRow(label: s.pnlTotalAllTime, value: summary.totalPnl, valueKey: const Key('pnlReportTotal')),
            const SizedBox(height: AppSpace.s1),
            _TotalRow(
              label: s.pnlRealizedAllTime,
              value: summary.realizedPnl,
              valueKey: const Key('pnlReportRealizedAllTime'),
            ),
          ],
        ),
      ),
    );
  }
}

class _PairRow extends StatelessWidget {
  const _PairRow({required this.left, required this.right});
  final Widget left, right;

  @override
  Widget build(BuildContext context) => IntrinsicHeight(
    child: Row(
      crossAxisAlignment: CrossAxisAlignment.stretch,
      children: [
        Expanded(child: left),
        VerticalDivider(width: 1, thickness: 1, color: Theme.of(context).colorScheme.outlineVariant),
        Expanded(child: right),
      ],
    ),
  );
}

class _MiniPnl extends StatelessWidget {
  const _MiniPnl({required this.label, required this.value, required this.valueKey});
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
                ? Text(dash, key: valueKey, style: AppText.num(17))
                : PnlText(value!, key: valueKey, size: 17, unit: true),
          ),
        ],
      ),
    );
  }
}

class _MiniValue extends StatelessWidget {
  const _MiniValue({required this.label, required this.value, required this.valueKey});
  final String label;
  final String value;
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
            child: Text(value, key: valueKey, style: AppText.num(17)),
          ),
        ],
      ),
    );
  }
}

class _TotalRow extends StatelessWidget {
  const _TotalRow({required this.label, required this.value, required this.valueKey});
  final String label;
  final Lamports? value;
  final Key valueKey;

  @override
  Widget build(BuildContext context) {
    final cs = Theme.of(context).colorScheme;
    return Row(
      children: [
        Expanded(
          child: Text(
            label,
            style: Theme.of(context).textTheme.bodySmall!.copyWith(color: cs.onSurfaceVariant),
            maxLines: 1,
            overflow: TextOverflow.ellipsis,
          ),
        ),
        const SizedBox(width: AppSpace.s2),
        value == null
            ? Text(dash, key: valueKey, style: AppText.num(15))
            : PnlText(value!, key: valueKey, size: 15, unit: true),
      ],
    );
  }
}

class _ExitStatsSection extends StatelessWidget {
  const _ExitStatsSection({required this.stats, required this.strings});

  final AsyncValue<List<ExitStat>> stats;
  final AppLocalizations strings;

  @override
  Widget build(BuildContext context) {
    final s = strings;
    final rows = stats.valueOrNull;
    if (rows != null && rows.isEmpty) return const SizedBox.shrink();
    return Column(
      crossAxisAlignment: CrossAxisAlignment.start,
      children: [
        SectionHeader(s.pnlByExitReason),
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
                s.pnlStatsUnavailable,
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
  final AppLocalizations strings;

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
                Text('${s.pnlTrades(stat.count)} · ${s.pnlWinRate} ${fmtRatePct(stat.winRatePct)}', style: muted),
              ],
            ),
          ),
          const SizedBox(width: AppSpace.s2),
          Column(
            crossAxisAlignment: CrossAxisAlignment.end,
            children: [
              PnlText(stat.pnl, size: 14, unit: true),
              const SizedBox(height: AppSpace.sHalf),
              Text('${s.pnlAvgHold} ${formatHold(s, stat.avgHoldS)}', style: muted),
            ],
          ),
        ],
      ),
    );
  }
}

class _EmptyClosed extends StatelessWidget {
  const _EmptyClosed({required this.strings});

  final AppLocalizations strings;

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
              Text(s.pnlEmptyTitle, style: text.titleMedium, textAlign: TextAlign.center),
              const SizedBox(height: AppSpace.s1),
              Text(
                s.pnlEmptyBody,
                style: text.bodySmall!.copyWith(color: muted),
                textAlign: TextAlign.center,
              ),
              const SizedBox(height: AppSpace.s2),
              TextButton(onPressed: () => context.go('/positions'), child: Text(s.pnlEmptyAction)),
            ],
          ),
        ),
      ),
    );
  }
}

class _ReportError extends StatelessWidget {
  const _ReportError({required this.strings, required this.onRetry});
  final AppLocalizations strings;
  final VoidCallback onRetry;

  @override
  Widget build(BuildContext context) {
    return ListView(
      padding: const EdgeInsets.all(AppSpace.s6),
      children: [
        Text(strings.pnlReportUnavailable, textAlign: TextAlign.center, style: Theme.of(context).textTheme.bodyMedium),
        const SizedBox(height: AppSpace.s2),
        Center(
          child: TextButton(onPressed: onRetry, child: Text(strings.commonActionRetry)),
        ),
      ],
    );
  }
}

/// 1D/7D/30D stay numeric; only All is localized (common.range.all).
String _windowLabel(AppLocalizations s, PnlWindow w) => switch (w) {
  PnlWindow.h1 => '1h',
  PnlWindow.d1 => '1D',
  PnlWindow.d7 => '7D',
  PnlWindow.d30 => '30D',
  PnlWindow.all => s.commonRangeAll,
};
