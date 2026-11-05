import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:go_router/go_router.dart';

import '../../core/format.dart';
import '../../core/theme/centurion_theme.dart';
import '../../core/widgets/app_icons.dart';
import '../../core/widgets/coin_avatar.dart';
import '../../core/widgets/common.dart';
import '../../core/widgets/sparkline.dart';
import '../../data/models/models.dart';
import '../../data/providers.dart';
import '../positions/widgets/pnl_report_card.dart';
import '../positions/widgets/equity_card.dart' show equityHistoryProvider;

/// G1-blue Portfolio home: equity hero, range chart, one partitioned KPI strip, guard banner
/// and the active-bot list. The "Example data" marker stays visible in every state.
final homeEquityRangeProvider = StateProvider<EquityRange>((_) => EquityRange.d7);

const _rangeLabels = {EquityRange.d1: '1D', EquityRange.d7: '1W', EquityRange.d30: '1M', EquityRange.all: 'All'};

class DashboardScreen extends ConsumerWidget {
  const DashboardScreen({super.key});

  @override
  Widget build(BuildContext context, WidgetRef ref) {
    final summary = ref.watch(summaryProvider);
    final pending = ref.watch(pendingApprovalsProvider).valueOrNull ?? const <Approval>[];
    final strategies = ref.watch(strategiesProvider).valueOrNull ?? const <Strategy>[];
    return Scaffold(
      appBar: AppBar(
        toolbarHeight: 64,
        titleSpacing: AppSpace.s4,
        title: const _PortfolioTitle(),
        actions: [
          Center(child: ModeChip(ref.watch(workspaceModeProvider))),
          _ApprovalsBell(count: pending.length),
          const SizedBox(width: AppSpace.s2),
        ],
      ),
      body: AsyncBody(
        value: summary,
        data: (s) => _Portfolio(summary: s, pending: pending, strategies: strategies),
      ),
    );
  }
}

class _PortfolioTitle extends StatelessWidget {
  const _PortfolioTitle();

  @override
  Widget build(BuildContext context) {
    final text = Theme.of(context).textTheme;
    return Column(
      crossAxisAlignment: CrossAxisAlignment.start,
      mainAxisAlignment: MainAxisAlignment.center,
      children: [
        Text('Portfolio', style: text.headlineSmall),
        Text(
          'Equity, guard, dan bot kamu',
          style: text.labelSmall!.copyWith(color: Theme.of(context).colorScheme.onSurfaceVariant),
        ),
      ],
    );
  }
}

class _ApprovalsBell extends StatelessWidget {
  const _ApprovalsBell({required this.count});
  final int count;

  @override
  Widget build(BuildContext context) {
    return IconButton(
      key: const Key('approvalsBell'),
      tooltip: 'Approvals',
      onPressed: () => context.go('/approvals'),
      icon: Badge(
        isLabelVisible: count > 0,
        label: Text('$count', key: const Key('pendingKpi')),
        child: const Icon(AppIcons.approvals),
      ),
    );
  }
}

class _Portfolio extends ConsumerWidget {
  const _Portfolio({required this.summary, required this.pending, required this.strategies});
  final PortfolioSummary summary;
  final List<Approval> pending;
  final List<Strategy> strategies;

  @override
  Widget build(BuildContext context, WidgetRef ref) {
    final text = Theme.of(context).textTheme;
    final running = strategies.where((s) => s.isRunning).toList();
    final maxOpen = strategies.fold<int>(0, (a, b) => a + (b.isRunning ? b.maxOpen : 0));
    final winRate = _weightedWinRate(strategies);
    final maxDd = strategies.fold<double>(0, (a, b) => b.maxDrawdownPct > a ? b.maxDrawdownPct : a);
    final guardChanges = pending.where((a) => a.kind == ApprovalKind.guardChange).toList();
    final range = ref.watch(homeEquityRangeProvider);
    final hist = ref.watch(equityHistoryProvider(range));
    return ListView(
      padding: const EdgeInsets.fromLTRB(AppSpace.s4, AppSpace.s4, AppSpace.s4, AppSpace.s10),
      children: [
        Row(
          crossAxisAlignment: CrossAxisAlignment.end,
          children: [
            Expanded(
              child: Text(
                summary.mode == TradeMode.real ? 'EQUITY · USDT' : 'EQUITY · SOL',
                style: AppText.eyebrow(Theme.of(context).colorScheme.onSurfaceVariant),
              ),
            ),
            const _ExampleDataChip(),
          ],
        ),
        const SizedBox(height: AppSpace.sHalf),
        FittedBox(
          fit: BoxFit.scaleDown,
          alignment: Alignment.centerLeft,
          child: Text(
            fmtSol(summary.equityLamports),
            key: const Key('equityHero'),
            style: AppText.num(46, weight: FontWeight.w600),
          ),
        ),
        const SizedBox(height: AppSpace.s1),
        Row(
          children: [
            PnlText(summary.totalPnlLamports, key: const Key('totalPnl'), size: 15),
            const SizedBox(width: AppSpace.s2),
            Text('total PnL', style: text.bodySmall!.copyWith(color: Theme.of(context).colorScheme.onSurfaceVariant)),
          ],
        ),
        const SizedBox(height: AppSpace.s3),
        _RangeChart(range: range, hist: hist),
        const SizedBox(height: AppSpace.s2),
        _SegmentedRange(range: range),
        const SizedBox(height: AppSpace.s4),
        _KpiStrip(winRate: winRate, maxDrawdown: maxDd, open: summary.openPositions, maxOpen: maxOpen),
        const SizedBox(height: AppSpace.s4),
        PnlReportCard(summary: summary),
        const SizedBox(height: AppSpace.s4),
        _GuardBanner(pendingGuardChanges: guardChanges, running: running.length),
        const SizedBox(height: AppSpace.s5),
        Row(
          children: [
            Expanded(child: Text('Bot aktif ${running.length}', style: text.titleMedium)),
            if (strategies.isNotEmpty)
              TextButton(onPressed: () => context.go('/strategies'), child: const Text('Lihat semua')),
          ],
        ),
        const SizedBox(height: AppSpace.s1),
        if (running.isEmpty)
          _EmptyBots(paused: strategies.length)
        else
          Card(
            margin: EdgeInsets.zero,
            clipBehavior: Clip.antiAlias,
            child: Column(
              children: [
                for (var i = 0; i < running.length; i++) ...[
                  if (i > 0) Divider(height: 1, thickness: 1, color: Theme.of(context).colorScheme.outlineVariant),
                  _BotRow(running[i]),
                ],
              ],
            ),
          ),
        const SizedBox(height: AppSpace.s4),
        if (summary.mode == TradeMode.practice) const _RealSolCta(),
      ],
    );
  }

  static double _weightedWinRate(List<Strategy> strategies) {
    if (strategies.isEmpty) return 0;
    final sum = strategies.fold<double>(0, (a, b) => a + b.winRatePct);
    return sum / strategies.length;
  }
}

class _ExampleDataChip extends StatelessWidget {
  const _ExampleDataChip();

  @override
  Widget build(BuildContext context) {
    return Container(
      key: const Key('exampleData'),
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

class _RangeChart extends StatelessWidget {
  const _RangeChart({required this.range, required this.hist});
  final EquityRange range;
  final AsyncValue<List<PnlPoint>> hist;

  @override
  Widget build(BuildContext context) {
    final cs = Theme.of(context).colorScheme;
    final points = hist.valueOrNull;
    final values = points?.map((p) => p.equityLamports.plotValue).toList() ?? const <double>[];
    if (points == null || values.length < 2) {
      return SizedBox(
        height: 132,
        child: Center(
          child: hist.isLoading
              ? const CircularProgressIndicator(strokeWidth: 2)
              : Text('Belum ada data', style: Theme.of(context).textTheme.bodySmall),
        ),
      );
    }
    final delta = points.last.equityLamports - points.first.equityLamports;
    final line = delta.isNegative ? context.tradeColors.loss : cs.primary;
    return Semantics(
      label: 'Kurva equity ${_rangeLabels[range]}',
      child: Sparkline(values: values, color: line, height: 132),
    );
  }
}

class _SegmentedRange extends ConsumerWidget {
  const _SegmentedRange({required this.range});
  final EquityRange range;

  @override
  Widget build(BuildContext context, WidgetRef ref) {
    final cs = Theme.of(context).colorScheme;
    return SizedBox(
      height: 40,
      child: Container(
        padding: const EdgeInsets.all(AppSpace.sHalf),
        decoration: BoxDecoration(color: cs.surfaceContainerLowest, borderRadius: BorderRadius.circular(AppRadius.sm)),
        child: Row(
          children: [
            for (final r in EquityRange.values)
              Expanded(
                child: GestureDetector(
                  key: Key('homeRange_${r.name}'),
                  behavior: HitTestBehavior.opaque,
                  onTap: () => ref.read(homeEquityRangeProvider.notifier).state = r,
                  child: Container(
                    alignment: Alignment.center,
                    decoration: r == range
                        ? BoxDecoration(
                            color: cs.surfaceContainer,
                            borderRadius: BorderRadius.circular(AppRadius.xs),
                            border: Border.all(color: cs.outlineVariant),
                          )
                        : null,
                    child: Text(
                      _rangeLabels[r]!,
                      style: Theme.of(context).textTheme.labelMedium!.copyWith(
                        color: r == range ? cs.onSurface : cs.onSurfaceVariant,
                        fontWeight: r == range ? FontWeight.w600 : FontWeight.w500,
                      ),
                    ),
                  ),
                ),
              ),
          ],
        ),
      ),
    );
  }
}

class _KpiStrip extends StatelessWidget {
  const _KpiStrip({required this.winRate, required this.maxDrawdown, required this.open, required this.maxOpen});
  final double winRate;
  final double maxDrawdown;
  final int open;
  final int maxOpen;

  @override
  Widget build(BuildContext context) {
    final cs = Theme.of(context).colorScheme;
    String pct(double v) => '${v.toStringAsFixed(1).replaceAll('.', ',')}%';
    return Container(
      key: const Key('kpiStrip'),
      decoration: BoxDecoration(
        color: cs.surfaceContainer,
        borderRadius: BorderRadius.circular(AppRadius.md),
        border: Border.all(color: cs.outlineVariant),
      ),
      child: IntrinsicHeight(
        child: Row(
          children: [
            Expanded(
              child: _Kpi(label: 'WIN RATE', value: pct(winRate)),
            ),
            VerticalDivider(width: 1, thickness: 1, color: cs.outlineVariant),
            Expanded(
              child: _Kpi(
                label: 'MAX DD',
                value: maxDrawdown == 0 ? '—' : '−${pct(maxDrawdown)}',
                color: maxDrawdown == 0 ? null : context.tradeColors.loss,
              ),
            ),
            VerticalDivider(width: 1, thickness: 1, color: cs.outlineVariant),
            Expanded(
              child: _Kpi(label: 'EXPOSURE', value: '$open / $maxOpen'),
            ),
          ],
        ),
      ),
    );
  }
}

class _Kpi extends StatelessWidget {
  const _Kpi({required this.label, required this.value, this.color});
  final String label;
  final String value;
  final Color? color;

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
            child: Text(
              value,
              style: AppText.num(22, weight: FontWeight.w600, color: color),
            ),
          ),
        ],
      ),
    );
  }
}

class _GuardBanner extends StatelessWidget {
  const _GuardBanner({required this.pendingGuardChanges, required this.running});
  final List<Approval> pendingGuardChanges;
  final int running;

  @override
  Widget build(BuildContext context) {
    final t = context.tradeColors;
    final text = Theme.of(context).textTheme;
    final pending = pendingGuardChanges.isNotEmpty;
    final title = pending ? 'Guard change menunggu' : 'Guarded';
    final body = pending
        ? '${pendingGuardChanges.length} perubahan aturan belum berlaku sampai kamu setujui.'
        : 'Entry dicek dulu: likuiditas, holder, dan spread. $running bot berjalan.';
    return Container(
      key: const Key('guardBanner'),
      padding: const EdgeInsets.all(AppSpace.s3),
      decoration: BoxDecoration(
        color: t.guardContainer,
        borderRadius: BorderRadius.circular(AppRadius.md),
        border: Border.all(color: t.guard.withValues(alpha: 0.45)),
      ),
      child: Row(
        crossAxisAlignment: CrossAxisAlignment.start,
        children: [
          Icon(AppIcons.guard, size: 18, color: t.guard),
          const SizedBox(width: AppSpace.s2),
          Expanded(
            child: Column(
              crossAxisAlignment: CrossAxisAlignment.start,
              children: [
                Text(title, style: text.titleSmall!.copyWith(color: t.guard)),
                const SizedBox(height: AppSpace.sHalf),
                Text(body, style: text.bodySmall!.copyWith(color: Theme.of(context).colorScheme.onSurfaceVariant)),
              ],
            ),
          ),
          if (pending) TextButton(onPressed: () => context.go('/approvals'), child: const Text('Tinjau')),
        ],
      ),
    );
  }
}

class _BotRow extends StatelessWidget {
  const _BotRow(this.s);
  final Strategy s;

  @override
  Widget build(BuildContext context) {
    final t = context.tradeColors;
    final text = Theme.of(context).textTheme;
    final pnlColor = context.lamportsColor(s.realizedPnlLamports);
    final statusColor = s.isRunning ? t.profit : t.warning;
    final muted = Theme.of(context).colorScheme.onSurfaceVariant;
    return InkWell(
      key: Key('bot_${s.id}'),
      onTap: () => context.go('/strategies/${s.id}'),
      child: Padding(
        padding: const EdgeInsets.symmetric(horizontal: AppSpace.s3, vertical: AppSpace.s3),
        child: Row(
          children: [
            CoinIdenticon(mint: s.id, symbol: _initial(s.name), size: 40),
            const SizedBox(width: AppSpace.s3),
            Expanded(
              child: Column(
                crossAxisAlignment: CrossAxisAlignment.start,
                children: [
                  Text(s.name, style: text.titleSmall, overflow: TextOverflow.ellipsis),
                  const SizedBox(height: AppSpace.sHalf),
                  Row(
                    children: [
                      Container(
                        width: 6,
                        height: 6,
                        decoration: BoxDecoration(color: statusColor, shape: BoxShape.circle),
                      ),
                      const SizedBox(width: 4),
                      Flexible(
                        child: Text(
                          '${s.isRunning ? 'Running' : 'Paused'}'
                          ' · ${s.mode == TradeMode.real ? 'Real' : 'Practice'}',
                          style: text.labelSmall!.copyWith(color: muted),
                          overflow: TextOverflow.ellipsis,
                        ),
                      ),
                    ],
                  ),
                ],
              ),
            ),
            const SizedBox(width: AppSpace.s2),
            SizedBox(
              width: 72,
              height: 28,
              child: Sparkline(values: _sparkFor(s), color: pnlColor, height: 28),
            ),
            const SizedBox(width: AppSpace.s3),
            Column(
              crossAxisAlignment: CrossAxisAlignment.end,
              children: [
                PnlText(s.realizedPnlLamports, size: 15),
                const SizedBox(height: AppSpace.sHalf),
                Text('WR ${s.winRatePct.round()}%', style: text.labelSmall!.copyWith(color: muted)),
              ],
            ),
          ],
        ),
      ),
    );
  }

  static String _initial(String name) => name.isEmpty ? '?' : name.substring(0, 1).toUpperCase();

  /// Prototype-only list sparkline: the API has no per-bot equity series yet, so it is derived
  /// deterministically from the bot id + realized PnL direction. Example data, marked as such on screen.
  static List<double> _sparkFor(Strategy s) {
    var h = 7;
    for (final c in s.id.codeUnits) {
      h = (h * 31 + c) & 0x7fffffff;
    }
    final dir = s.realizedPnlLamports.sign.toDouble();
    final out = <double>[];
    var v = 0.0;
    for (var i = 0; i < 24; i++) {
      h = (h * 1103515245 + 12345) & 0x7fffffff;
      v += (h % 1000) / 1000 - 0.5 + dir * 0.08;
      out.add(v);
    }
    return out;
  }
}

class _EmptyBots extends StatelessWidget {
  const _EmptyBots({required this.paused});
  final int paused;

  @override
  Widget build(BuildContext context) {
    return Card(
      margin: EdgeInsets.zero,
      child: Padding(
        padding: const EdgeInsets.all(AppSpace.s4),
        child: Row(
          children: [
            Icon(AppIcons.paused, color: Theme.of(context).colorScheme.onSurfaceVariant),
            const SizedBox(width: AppSpace.s2),
            Expanded(
              child: Text(
                paused == 0 ? 'Belum ada bot. Buat di tab Bots.' : 'Semua bot dijeda. Buka tab Bots untuk lanjut.',
                style: Theme.of(context).textTheme.bodySmall,
              ),
            ),
          ],
        ),
      ),
    );
  }
}

/// SPEC: switching to Real SOL is an explicit action (dialog + hold), never a swipe/toggle.
class _RealSolCta extends StatelessWidget {
  const _RealSolCta();
  @override
  Widget build(BuildContext context) {
    final t = context.tradeColors;
    return Card(
      color: t.realContainer.withValues(alpha: 0.35),
      shape: RoundedRectangleBorder(
        borderRadius: BorderRadius.circular(AppRadius.md),
        side: BorderSide(color: t.real.withValues(alpha: 0.6)),
      ),
      child: ListTile(
        contentPadding: const EdgeInsets.symmetric(horizontal: AppSpace.s4, vertical: AppSpace.s2),
        title: Text(
          'Ganti ke Real SOL',
          style: TextStyle(color: t.real, fontWeight: FontWeight.w600),
        ),
        subtitle: const Text('Butuh wallet terhubung, 2FA, konfirmasi hold 2,5 dtk. Tidak pernah via swipe.'),
        trailing: Icon(AppIcons.chevronRight, color: t.real),
        onTap: () => ScaffoldMessenger.of(
          context,
        ).showSnackBar(const SnackBar(content: Text('Setup wizard Real SOL belum ada di prototype (Fase 7)'))),
      ),
    );
  }
}
