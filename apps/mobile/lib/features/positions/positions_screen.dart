import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:go_router/go_router.dart';

import '../../core/format.dart';
import '../../core/theme/solbot_theme.dart';
import '../../core/widgets/common.dart';
import '../../data/models/models.dart';
import '../../data/providers.dart';
import 'widgets/equity_card.dart';
import 'widgets/exit_progress_bar.dart';
import 'widgets/sell_sheet.dart';

/// "26 mnt" / "1 j 5 mnt".
String fmtHold(Duration d) {
  if (d.inMinutes < 1) return '${d.inSeconds} dtk';
  if (d.inHours < 1) return '${d.inMinutes} mnt';
  return '${d.inHours} j ${d.inMinutes % 60} mnt';
}

String fmtUsd(double v) => '\$${v.toStringAsPrecision(3).replaceAll('.', ',')}';

final _strategyNamesProvider = Provider<Map<String, String>>((ref) => {
      for (final s in ref.watch(strategiesProvider).valueOrNull ?? const <Strategy>[]) s.id: s.name,
    });

/// SPEC §6 + wireframe 12-positions-mobile (lives under the Lainnya tab).
class PositionsScreen extends ConsumerWidget {
  const PositionsScreen({super.key});

  @override
  Widget build(BuildContext context, WidgetRef ref) {
    final positions = ref.watch(positionsProvider);
    final open = positions.valueOrNull?.where((p) => p.isOpen).length ?? 0;
    return Scaffold(
      appBar: AppBar(
        title: const Text('Positions'),
        actions: [
          Padding(
            padding: const EdgeInsets.only(right: AppSpace.s4),
            child: Text('$open open', key: const Key('openCount'), style: Theme.of(context).textTheme.labelLarge),
          ),
        ],
      ),
      body: AsyncBody(
        value: positions,
        data: (list) {
          final openList = list.where((p) => p.isOpen).toList();
          final closed = list.where((p) => !p.isOpen).toList()
            ..sort((a, b) => (b.closedAt ?? b.openedAt).compareTo(a.closedAt ?? a.openedAt));
          return ListView(
            padding: const EdgeInsets.fromLTRB(AppSpace.s4, AppSpace.s2, AppSpace.s4, AppSpace.s6),
            children: [
              const EquityCard(),
              const SizedBox(height: AppSpace.s3),
              if (openList.isEmpty)
                const EmptyState(icon: Icons.inbox_outlined, text: 'Belum ada posisi terbuka')
              else
                for (final p in openList) ...[
                  PositionCard(position: p),
                  const SizedBox(height: AppSpace.s2),
                ],
              if (closed.isNotEmpty) ...[
                const SectionHeader('Closed'),
                for (final p in closed) _ClosedRow(position: p),
              ],
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
          child: Column(crossAxisAlignment: CrossAxisAlignment.start, children: [
            Row(crossAxisAlignment: CrossAxisAlignment.start, children: [
              Expanded(
                child: Column(crossAxisAlignment: CrossAxisAlignment.start, children: [
                  Text('\$${p.symbol}', style: tt.titleMedium, overflow: TextOverflow.ellipsis),
                  Text('${names[p.strategyId] ?? p.strategyId} · ${fmtSol(p.sizeSol)} SOL',
                      style: tt.bodySmall!.copyWith(color: cs.onSurfaceVariant), overflow: TextOverflow.ellipsis),
                ]),
              ),
              Column(crossAxisAlignment: CrossAxisAlignment.end, children: [
                PnlText(p.pnlSol, size: 14),
                Text('(${fmtPct(p.pnlPct, arrow: false)})',
                    style: AppText.num(12, color: context.pnlColor(p.pnlPct, epsilon: 0.05))),
              ]),
            ]),
            const SizedBox(height: AppSpace.s2),
            ExitProgressBar(position: p),
            const SizedBox(height: AppSpace.s1),
            Row(children: [
              Expanded(
                child: Column(crossAxisAlignment: CrossAxisAlignment.start, children: [
                  Text(exitCaption(p), style: tt.bodySmall),
                  Text('${fmtUsd(p.entryPriceUsd)} → ${fmtUsd(p.markPriceUsd)} · ${fmtHold(p.holdAt(DateTime.now()))}',
                      style: AppText.num(11, color: cs.onSurfaceVariant)),
                ]),
              ),
              OutlinedButton(
                key: Key('sell_${p.id}'),
                style: AppButtons.secondary(context),
                onPressed: () => showSellSheet(context, p),
                child: const Text('Sell'),
              ),
            ]),
          ]),
        ),
      ),
    );
  }
}

class _ClosedRow extends StatelessWidget {
  const _ClosedRow({required this.position});
  final Position position;
  @override
  Widget build(BuildContext context) {
    final p = position;
    return ListTile(
      contentPadding: EdgeInsets.zero,
      title: Text('\$${p.symbol}'),
      subtitle: Text(p.exitReason ?? 'Closed', overflow: TextOverflow.ellipsis),
      trailing: PnlText(p.pnlSol),
      onTap: () => context.go('/positions/${Uri.encodeComponent(p.id)}'),
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
    return Scaffold(
      appBar: AppBar(title: Text(value.valueOrNull == null ? 'Posisi' : '\$${value.valueOrNull!.symbol}')),
      body: AsyncBody(
        value: value,
        data: (p) {
          if (p == null) return const EmptyState(icon: Icons.search_off, text: 'Posisi tidak ditemukan');
          final tt = Theme.of(context).textTheme;
          final cs = Theme.of(context).colorScheme;
          final now = DateTime.now();
          return ListView(padding: const EdgeInsets.all(AppSpace.s4), children: [
            Row(children: [
              ModeChip(p.mode),
              const SizedBox(width: AppSpace.s2),
              Expanded(
                  child: Text(names[p.strategyId] ?? p.strategyId,
                      style: tt.bodyMedium, overflow: TextOverflow.ellipsis)),
              PnlText(p.pnlSol, size: 18, unit: true),
            ]),
            const SizedBox(height: AppSpace.s2),
            Wrap(spacing: AppSpace.s4, runSpacing: AppSpace.s1, children: [
              _Kv('Size', '${fmtSol(p.sizeSol)} SOL'),
              _Kv('Entry → now', '${fmtUsd(p.entryPriceUsd)} → ${fmtUsd(p.markPriceUsd)}'),
              _Kv('Hold', fmtHold(p.holdAt(now))),
              _Kv('Terjual', '${p.soldPct.round()}%'),
              _Kv('Mint', shortMint(p.mint)),
            ]),
            const SizedBox(height: AppSpace.s4),
            if (p.exitPlan != null) ...[
              Text('Exit plan · ${p.exitPlan!.name}', style: tt.titleSmall),
              const SizedBox(height: AppSpace.s2),
              ExitLadder(position: p),
              const SizedBox(height: AppSpace.s3),
              if (p.isOpen) _NextAction(position: p, now: now),
            ],
            if (!p.isOpen)
              ListTile(
                contentPadding: EdgeInsets.zero,
                leading: const Icon(Icons.flag_outlined),
                title: Text(p.exitReason ?? 'Closed'),
                subtitle: p.closedAt == null ? null : Text('Ditutup ${fmtTime(p.closedAt!)} WIB'),
              ),
            const SizedBox(height: AppSpace.s4),
            if (p.isOpen)
              FilledButton.tonal(
                key: const Key('detailSell'),
                onPressed: () => showSellSheet(context, p),
                child: const Text('Sell'),
              ),
            const SizedBox(height: AppSpace.s2),
            Text('Sell tidak pernah tersedia dari notifikasi.',
                style: tt.bodySmall!.copyWith(color: cs.onSurfaceVariant), textAlign: TextAlign.center),
          ]);
        },
      ),
    );
  }
}

class _Kv extends StatelessWidget {
  const _Kv(this.k, this.v);
  final String k, v;
  @override
  Widget build(BuildContext context) {
    final cs = Theme.of(context).colorScheme;
    return Column(crossAxisAlignment: CrossAxisAlignment.start, mainAxisSize: MainAxisSize.min, children: [
      Text(k, style: Theme.of(context).textTheme.labelSmall!.copyWith(color: cs.onSurfaceVariant)),
      Text(v, style: AppText.num(13)),
    ]);
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
    final peakPct = (p.peakPriceUsd / p.entryPriceUsd - 1) * 100;
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
      (0, _RowKind.entry, 'Entry', fmtUsd(p.entryPriceUsd)),
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
      child: Row(children: [
        SizedBox(
          width: 24,
          child: Stack(alignment: Alignment.center, children: [
            Column(children: [
              Expanded(child: Container(width: 2, color: first ? Colors.transparent : line)),
              Expanded(child: Container(width: 2, color: last ? Colors.transparent : line)),
            ]),
            Container(
              width: isNow ? 14 : 10,
              height: isNow ? 14 : 10,
              decoration: BoxDecoration(
                shape: kind == _RowKind.sl || kind == _RowKind.trail ? BoxShape.rectangle : BoxShape.circle,
                color: filledDot ? color : Theme.of(context).colorScheme.surface,
                border: Border.all(color: color, width: kind == _RowKind.tpNext ? 2.5 : 1.5),
              ),
            ),
          ]),
        ),
        const SizedBox(width: AppSpace.s2),
        Expanded(
          child: Text(label,
              style: (isNow ? tt.titleSmall : tt.bodyMedium)!.copyWith(color: isNow ? color : null),
              overflow: TextOverflow.ellipsis),
        ),
        Text(status, style: tt.bodySmall!.copyWith(color: color)),
        const SizedBox(width: AppSpace.s3),
        SizedBox(
          width: 64,
          child: Text(fmtPct(pct, arrow: false),
              textAlign: TextAlign.right, style: AppText.num(13, weight: FontWeight.w600, color: color)),
        ),
      ]),
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
        leading: const Icon(Icons.schedule),
        title: Text(next == null
            ? 'Berikutnya: trailing −${plan.trailPct.round()}% dari high'
            : 'Berikutnya: TP${idx + 1} di +${next.gainPct.round()}% (jual ${next.sellPct.round()}%)'),
        subtitle: ts == null
            ? null
            : Text(left!.isNegative
                ? 'Time stop lewat · keluar di tick berikutnya'
                : 'Time stop ${fmtTime(ts)} WIB (${fmtCountdown(left)} lagi)'),
      ),
    );
  }
}
