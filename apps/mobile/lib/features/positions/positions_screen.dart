import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:go_router/go_router.dart';

import '../../core/exit_reason_l10n.dart';
import '../../core/format.dart';
import '../../core/l10n_format.dart' show dash, formatHold;
import '../../core/theme/centurion_theme.dart';
import '../../core/widgets/app_icons.dart';
import '../../core/widgets/coin_avatar.dart';
import '../../core/widgets/common.dart';
import '../../core/widgets/page_footer.dart';
import '../../data/models/models.dart';
import '../../data/repositories/repositories.dart';
import '../../data/providers.dart';
import '../../l10n/gen/app_localizations.dart';
import 'widgets/closed_trade_row.dart';
import 'widgets/equity_card.dart';
import 'widgets/exit_progress_bar.dart';
import 'widgets/pnl_report_card.dart';
import 'widgets/sell_sheet.dart';

final _strategyNamesProvider = Provider<Map<String, String>>(
  (ref) => {for (final s in ref.watch(strategiesProvider).valueOrNull ?? const <Strategy>[]) s.id: s.name},
);

/// SPEC §6 + wireframe 12-positions-mobile (lives under the Lainnya tab).
class PositionsScreen extends ConsumerStatefulWidget {
  const PositionsScreen({super.key});
  @override
  ConsumerState<PositionsScreen> createState() => _PositionsScreenState();
}

/// Open positions are live (stream). Closed history: live head + older pages via
/// 1.1.4 keyset paging (`fetchPositionsPage(state: closed)`).
class _PositionsScreenState extends ConsumerState<PositionsScreen> {
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
    final positions = ref.watch(positionsProvider);
    final paged = _closedPages.state;
    final open = positions.valueOrNull?.where((p) => p.isOpen).length ?? 0;
    return Scaffold(
      appBar: AppBar(
        title: Text(AppLocalizations.of(context).navPositions),
        actions: [
          Padding(
            padding: const EdgeInsets.only(right: AppSpace.s4),
            child: Text(
              AppLocalizations.of(context).positionsOpenCount(open),
              key: const Key('openCount'),
              style: Theme.of(context).textTheme.labelLarge,
            ),
          ),
        ],
      ),
      body: AsyncBody(
        value: positions,
        data: (list) {
          final openList = list.where((p) => p.isOpen).toList();
          final closed = mergeHeadAndPages(
            list.where((p) => !p.isOpen).toList(),
            // Practice-reset / mode gate: paged rows pass the same filter as the stream.
            ref.read(practiceEpochGateProvider).filter(paged.items).where((p) => !p.isOpen).toList(),
            (p) => p.id,
            (a, b) => (b.closedAt ?? b.openedAt).compareTo(a.closedAt ?? a.openedAt),
          );
          // Slivers + builders: closed history grows without bound; only visible rows build.
          return CustomScrollView(
            slivers: [
              SliverPadding(
                padding: const EdgeInsets.fromLTRB(AppSpace.s4, AppSpace.s2, AppSpace.s4, AppSpace.s6),
                sliver: SliverMainAxisGroup(
                  slivers: [
                    const SliverToBoxAdapter(child: EquityCard()),
                    const SliverToBoxAdapter(child: SizedBox(height: AppSpace.s3)),
                    SliverToBoxAdapter(
                      child: switch (ref.watch(summaryProvider).valueOrNull) {
                        final s? => PnlReportCard(summary: s, onTap: () => context.push('/pnl')),
                        // Summary is loading or failed: the equity card above already owns that state.
                        _ => const SizedBox.shrink(),
                      },
                    ),
                    const SliverToBoxAdapter(child: SizedBox(height: AppSpace.s3)),
                    if (openList.isEmpty)
                      const SliverToBoxAdapter(
                        child: EmptyState(icon: AppIcons.empty, text: 'Belum ada posisi terbuka'),
                      )
                    else
                      SliverList.builder(
                        itemCount: openList.length,
                        itemBuilder: (context, i) => Padding(
                          key: ValueKey('posRow_${openList[i].id}'),
                          padding: const EdgeInsets.only(bottom: AppSpace.s2),
                          // Live price row (marks): repaints stay inside the card.
                          child: RepaintBoundary(child: PositionCard(position: openList[i])),
                        ),
                      ),
                    if (closed.isNotEmpty) ...[
                      SliverToBoxAdapter(
                        child: SectionHeader(
                          AppLocalizations.of(context).coinTrailStepClosed,
                          action: AppLocalizations.of(context).pnlViewReport,
                          onAction: () => context.push('/pnl'),
                        ),
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
        },
      ),
    );
  }
}

class PositionCard extends ConsumerWidget {
  const PositionCard({super.key, required this.position});
  final Position position;

  @override
  Widget build(BuildContext context, WidgetRef ref) {
    final p = position;
    final names = ref.watch(_strategyNamesProvider);
    final l = AppLocalizations.of(context);
    final tt = Theme.of(context).textTheme;
    final cs = Theme.of(context).colorScheme;
    return Card(
      key: Key('pos_${p.id}'),
      margin: EdgeInsets.zero,
      clipBehavior: Clip.antiAlias,
      child: InkWell(
        onTap: () => context.go('/positions/${Uri.encodeComponent(p.id)}'),
        child: Padding(
          padding: const EdgeInsets.all(AppSpace.s3),
          child: Column(
            crossAxisAlignment: CrossAxisAlignment.start,
            children: [
              Row(
                crossAxisAlignment: CrossAxisAlignment.start,
                children: [
                  CoinAvatar(mint: p.mint, symbol: p.symbol, logoHash: p.logoHash, logoUrl: p.logoUrl),
                  const SizedBox(width: AppSpace.s3),
                  Expanded(
                    child: Column(
                      crossAxisAlignment: CrossAxisAlignment.start,
                      children: [
                        Text('\$${p.symbol}', style: tt.titleMedium, overflow: TextOverflow.ellipsis),
                        Text(
                          '${names[p.strategyId] ?? p.strategyId} · ${fmtSol(p.sizeLamports)} SOL',
                          style: tt.bodySmall!.copyWith(color: cs.onSurfaceVariant),
                          overflow: TextOverflow.ellipsis,
                        ),
                      ],
                    ),
                  ),
                  Column(
                    crossAxisAlignment: CrossAxisAlignment.end,
                    children: [
                      PnlText(p.pnlLamports, size: 14),
                      Text(
                        '(${fmtPct(p.pnlPct, arrow: false)})',
                        style: AppText.num(12, color: context.pnlColor(p.pnlPct)),
                      ),
                    ],
                  ),
                ],
              ),
              const SizedBox(height: AppSpace.s2),
              ExitProgressBar(position: p),
              const SizedBox(height: AppSpace.s1),
              Row(
                children: [
                  Expanded(
                    child: Column(
                      crossAxisAlignment: CrossAxisAlignment.start,
                      children: [
                        Text(exitCaption(p), style: tt.bodySmall),
                        Text(
                          '${fmtUsd(p.entryPriceUsd)} → ${fmtUsd(p.markPriceUsd)} · '
                          '${formatHold(l, p.holdAt(DateTime.now()).inSeconds)}',
                          style: AppText.num(11, color: cs.onSurfaceVariant),
                        ),
                      ],
                    ),
                  ),
                  OutlinedButton(
                    key: Key('sell_${p.id}'),
                    style: AppButtons.secondary(context),
                    onPressed: () => showSellSheet(context, p),
                    child: Text(l.pnlSell),
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

/// Detail: vertical ladder (TP filled/next/pending, now, trail, entry, SL),
/// next action + time stop (SPEC §6).
class PositionDetailScreen extends ConsumerWidget {
  const PositionDetailScreen({super.key, required this.positionId});
  final String positionId;

  @override
  Widget build(BuildContext context, WidgetRef ref) {
    final value = ref.watch(positionByIdProvider(positionId));
    final names = ref.watch(_strategyNamesProvider);
    final l = AppLocalizations.of(context);
    return Scaffold(
      appBar: AppBar(title: Text(value.valueOrNull == null ? l.pnlPositionsTitle : '\$${value.valueOrNull!.symbol}')),
      body: AsyncBody(
        value: value,
        data: (p) {
          if (p == null) return EmptyState(icon: AppIcons.searchOff, text: l.pnlPositionNotFound);
          final tt = Theme.of(context).textTheme;
          final cs = Theme.of(context).colorScheme;
          final now = DateTime.now();
          return ListView(
            padding: const EdgeInsets.all(AppSpace.s4),
            children: [
              if (p.isOpen) ...[
                Row(
                  children: [
                    ModeChip(p.mode),
                    const SizedBox(width: AppSpace.s2),
                    Expanded(
                      child: Text(
                        names[p.strategyId] ?? p.strategyId,
                        style: tt.bodyMedium,
                        overflow: TextOverflow.ellipsis,
                      ),
                    ),
                    PnlText(p.pnlLamports, size: 18, unit: true),
                  ],
                ),
                const SizedBox(height: AppSpace.s2),
                Wrap(
                  spacing: AppSpace.s4,
                  runSpacing: AppSpace.s1,
                  children: [
                    _Kv(l.pnlReceiptSize, fmtSol(p.sizeLamports, unit: true)),
                    _Kv(l.pnlReceiptEntryNow, '${fmtUsd(p.entryPriceUsd)} → ${fmtUsd(p.markPriceUsd)}'),
                    _Kv(l.pnlReceiptHold, formatHold(l, p.holdAt(now).inSeconds)),
                    _Kv(l.pnlReceiptSold, '${p.soldPct.round()}%'),
                    // 1.1.2: raw qty scaled by the mint's `decimals` (never assumed).
                    if (p.qtyRaw != null)
                      _Kv(l.pnlReceiptToken, fmtTokenQty(p.qtyRaw!, p.decimals), key: Key('qty_${p.id}')),
                    _Kv(l.pnlReceiptMint, shortMint(p.mint)),
                  ],
                ),
                const SizedBox(height: AppSpace.s4),
                if (p.exitPlan != null) ...[
                  Text('Exit plan · ${p.exitPlan!.name}', style: tt.titleSmall),
                  const SizedBox(height: AppSpace.s2),
                  ExitLadder(position: p),
                  const SizedBox(height: AppSpace.s3),
                  _NextAction(position: p, now: now),
                ],
                const SizedBox(height: AppSpace.s4),
                FilledButton.tonal(
                  key: const Key('detailSell'),
                  onPressed: () => showSellSheet(context, p),
                  child: Text(l.pnlSell),
                ),
                const SizedBox(height: AppSpace.s2),
                Text(
                  l.pnlNoSellNote,
                  style: tt.bodySmall!.copyWith(color: cs.onSurfaceVariant),
                  textAlign: TextAlign.center,
                ),
              ] else
                _ClosedReceipt(position: p, bot: names[p.strategyId] ?? p.strategyId, now: now),
            ],
          );
        },
      ),
    );
  }
}

/// Receipt for a closed position: realized result first, then the trade facts
/// the server reports. `fees` is context only (already netted in SOL in/out);
/// a missing value is an em dash, never zero.
class _ClosedReceipt extends StatelessWidget {
  const _ClosedReceipt({required this.position, required this.bot, required this.now});
  final Position position;
  final String bot;
  final DateTime now;

  @override
  Widget build(BuildContext context) {
    final p = position;
    final l = AppLocalizations.of(context);
    final tt = Theme.of(context).textTheme;
    final cs = Theme.of(context).colorScheme;
    final muted = tt.labelSmall!.copyWith(color: cs.onSurfaceVariant);
    final exitReason = p.exitReason == null ? l.coinTrailStepClosed : exitReasonLabel(l, p.exitReason!);
    return Card(
      key: const Key('realizedPnl'),
      margin: EdgeInsets.zero,
      child: Padding(
        padding: const EdgeInsets.all(AppSpace.s3),
        child: Column(
          crossAxisAlignment: CrossAxisAlignment.start,
          children: [
            Row(
              crossAxisAlignment: CrossAxisAlignment.start,
              children: [
                CoinAvatar(mint: p.mint, symbol: p.symbol, logoHash: p.logoHash, logoUrl: p.logoUrl),
                const SizedBox(width: AppSpace.s3),
                Expanded(
                  child: Column(
                    crossAxisAlignment: CrossAxisAlignment.start,
                    children: [
                      Row(
                        children: [
                          Flexible(
                            child: Text('\$${p.symbol}', style: tt.titleMedium, overflow: TextOverflow.ellipsis),
                          ),
                          const SizedBox(width: AppSpace.s2),
                          ModeChip(p.mode),
                        ],
                      ),
                      const SizedBox(height: AppSpace.sHalf),
                      Text(
                        bot,
                        style: tt.bodySmall!.copyWith(color: cs.onSurfaceVariant),
                        overflow: TextOverflow.ellipsis,
                      ),
                    ],
                  ),
                ),
              ],
            ),
            const SizedBox(height: AppSpace.s3),
            Row(
              crossAxisAlignment: CrossAxisAlignment.start,
              children: [
                Expanded(
                  child: Column(
                    crossAxisAlignment: CrossAxisAlignment.start,
                    children: [
                      Text(l.pnlRealized, style: tt.titleSmall),
                      const SizedBox(height: AppSpace.sHalf),
                      Text(l.pnlRealizedHeroHint, style: muted),
                    ],
                  ),
                ),
                Column(
                  crossAxisAlignment: CrossAxisAlignment.end,
                  children: [
                    PnlText(p.pnlLamports, size: 20, unit: true),
                    const SizedBox(height: AppSpace.sHalf),
                    Text(fmtPct(p.pnlPct, arrow: false), style: AppText.num(12, color: context.pnlColor(p.pnlPct))),
                  ],
                ),
              ],
            ),
            const SizedBox(height: AppSpace.s3),
            Divider(height: 1, color: cs.outlineVariant),
            const SizedBox(height: AppSpace.s3),
            Wrap(
              spacing: AppSpace.s4,
              runSpacing: AppSpace.s2,
              children: [
                _Kv(l.pnlReceiptSolIn, fmtSol(p.costLamports, unit: true)),
                _Kv(l.pnlReceiptSolOut, fmtSol(p.proceedsLamports, unit: true)),
                _Kv(l.pnlReceiptFees, p.feesLamports == null ? dash : fmtSol(p.feesLamports!, unit: true)),
                _Kv(l.pnlReceiptHold, formatHold(l, p.holdAt(now).inSeconds)),
                _Kv(
                  l.pnlReceiptEntryExit,
                  '${fmtUsd(p.entryPriceUsd)} → ${p.exitPriceUsd == null ? dash : fmtUsd(p.exitPriceUsd!)}',
                ),
                _Kv(l.pnlReceiptExitReason, exitReason),
                _Kv(l.pnlReceiptBot, bot),
                _Kv(l.pnlClosed, p.closedAt == null ? dash : '${fmtTime(p.closedAt!)} WIB'),
              ],
            ),
          ],
        ),
      ),
    );
  }
}

class _Kv extends StatelessWidget {
  const _Kv(this.k, this.v, {super.key});
  final String k, v;
  @override
  Widget build(BuildContext context) {
    final cs = Theme.of(context).colorScheme;
    return Column(
      crossAxisAlignment: CrossAxisAlignment.start,
      mainAxisSize: MainAxisSize.min,
      children: [
        Text(k, style: Theme.of(context).textTheme.labelSmall!.copyWith(color: cs.onSurfaceVariant)),
        Text(v, style: AppText.num(13)),
      ],
    );
  }
}

enum _RowKind { tpFilled, tpNext, tpPending, now, trail, entry, sl }

/// Vertical ladder, sorted by level (% vs entry), highest first.
class ExitLadder extends StatelessWidget {
  const ExitLadder({super.key, required this.position});
  final Position position;

  @override
  Widget build(BuildContext context) {
    final p = position;
    final plan = p.exitPlan!;
    final t = context.tradeColors;
    final cs = Theme.of(context).colorScheme;
    final next = plan.nextRung;
    final peakPct = pctChange(p.entryPriceUsd, p.peakPriceUsd);
    final trailLevel = (peakPct + 100) * (1 - plan.trailPct / 100) - 100;
    final rows = <(double, _RowKind, String, String)>[
      for (var i = 0; i < plan.rungs.length; i++)
        (
          plan.rungs[i].gainPct,
          plan.rungs[i].filled
              ? _RowKind.tpFilled
              : identical(plan.rungs[i], next)
              ? _RowKind.tpNext
              : _RowKind.tpPending,
          'TP${i + 1} · jual ${plan.rungs[i].sellPct.round()}%',
          plan.rungs[i].filled
              ? 'terisi ${fmtTime(plan.rungs[i].filledAt!)}'
              : identical(plan.rungs[i], next)
              ? 'berikutnya'
              : 'menunggu',
        ),
      (p.changePct, _RowKind.now, 'Sekarang', fmtUsd(p.markPriceUsd)),
      (
        trailLevel,
        _RowKind.trail,
        'Trailing −${plan.trailPct.round()}% dari high',
        plan.trailArmed ? 'armed' : 'aktif setelah TP1',
      ),
      (0.0, _RowKind.entry, 'Entry', fmtUsd(p.entryPriceUsd)),
      (plan.stopLossPct, _RowKind.sl, 'Stop loss', 'armed'),
    ]..sort((a, b) => b.$1.compareTo(a.$1));
    return Column(
      key: const Key('exitLadder'),
      children: [
        for (var i = 0; i < rows.length; i++)
          _LadderRow(
            pct: rows[i].$1,
            kind: rows[i].$2,
            label: rows[i].$3,
            status: rows[i].$4,
            first: i == 0,
            last: i == rows.length - 1,
            color: switch (rows[i].$2) {
              _RowKind.tpFilled => t.profit,
              _RowKind.tpNext => cs.onSurface,
              _RowKind.tpPending => cs.outline,
              _RowKind.now => p.changePct >= 0 ? t.profit : t.loss,
              _RowKind.trail => plan.trailArmed ? t.warning : cs.outline,
              _RowKind.entry => cs.onSurfaceVariant,
              _RowKind.sl => t.loss,
            },
            line: cs.outlineVariant,
          ),
      ],
    );
  }
}

class _LadderRow extends StatelessWidget {
  const _LadderRow({
    required this.pct,
    required this.kind,
    required this.label,
    required this.status,
    required this.first,
    required this.last,
    required this.color,
    required this.line,
  });
  final double pct;
  final _RowKind kind;
  final String label, status;
  final bool first, last;
  final Color color, line;

  @override
  Widget build(BuildContext context) {
    final tt = Theme.of(context).textTheme;
    final isNow = kind == _RowKind.now;
    final filledDot = kind == _RowKind.tpFilled || isNow || kind == _RowKind.sl;
    return SizedBox(
      height: 44,
      child: Row(
        children: [
          SizedBox(
            width: 24,
            child: Stack(
              alignment: Alignment.center,
              children: [
                Column(
                  children: [
                    Expanded(child: Container(width: 2, color: first ? Colors.transparent : line)),
                    Expanded(child: Container(width: 2, color: last ? Colors.transparent : line)),
                  ],
                ),
                Container(
                  width: isNow ? 14 : 10,
                  height: isNow ? 14 : 10,
                  decoration: BoxDecoration(
                    shape: kind == _RowKind.sl || kind == _RowKind.trail ? BoxShape.rectangle : BoxShape.circle,
                    color: filledDot ? color : Theme.of(context).colorScheme.surface,
                    border: Border.all(color: color, width: kind == _RowKind.tpNext ? 2.5 : 1.5),
                  ),
                ),
              ],
            ),
          ),
          const SizedBox(width: AppSpace.s2),
          Expanded(
            child: Text(
              label,
              style: (isNow ? tt.titleSmall : tt.bodyMedium)!.copyWith(color: isNow ? color : null),
              overflow: TextOverflow.ellipsis,
            ),
          ),
          Text(status, style: tt.bodySmall!.copyWith(color: color)),
          const SizedBox(width: AppSpace.s3),
          SizedBox(
            width: 64,
            child: Text(
              fmtPct(pct, arrow: false),
              textAlign: TextAlign.right,
              style: AppText.num(13, weight: FontWeight.w600, color: color),
            ),
          ),
        ],
      ),
    );
  }
}

class _NextAction extends StatelessWidget {
  const _NextAction({required this.position, required this.now});
  final Position position;
  final DateTime now;
  @override
  Widget build(BuildContext context) {
    final plan = position.exitPlan!;
    final next = plan.nextRung;
    final idx = next == null ? -1 : plan.rungs.indexOf(next);
    final ts = plan.timeStopAt;
    final left = ts?.difference(now);
    return Card(
      key: const Key('nextAction'),
      margin: EdgeInsets.zero,
      child: ListTile(
        leading: const Icon(AppIcons.clock),
        title: Text(
          next == null
              ? 'Berikutnya: trailing −${plan.trailPct.round()}% dari high'
              : 'Berikutnya: TP${idx + 1} di +${next.gainPct.round()}% (jual ${next.sellPct.round()}%)',
        ),
        subtitle: ts == null
            ? null
            : Text(
                left!.isNegative
                    ? 'Time stop lewat · keluar di tick berikutnya'
                    : 'Time stop ${fmtTime(ts)} WIB (${fmtCountdown(left)} lagi)',
              ),
      ),
    );
  }
}
