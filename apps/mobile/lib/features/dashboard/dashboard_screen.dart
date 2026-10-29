import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:go_router/go_router.dart';

import '../../core/format.dart';
import '../../core/theme/solbot_theme.dart';
import '../../core/widgets/common.dart';
import '../../core/widgets/sparkline.dart';
import '../../data/models/models.dart';
import '../../data/providers.dart';
import '../../l10n/gen/app_localizations.dart';
import '../activity/activity_screen.dart';
import '../strategies/strategies_screen.dart';

/// Wireframe 02-dashboard-mobile: KPI 2×2 → Strategi → Activity → Real SOL CTA.
class DashboardScreen extends ConsumerWidget {
  const DashboardScreen({super.key});

  @override
  Widget build(BuildContext context, WidgetRef ref) {
    final summary = ref.watch(summaryProvider);
    final pending = ref.watch(pendingCountProvider);
    final strategies = ref.watch(strategiesProvider).valueOrNull ?? const <Strategy>[];
    final feed = ref.watch(activityFeedProvider(null)).valueOrNull ?? const <ActivityEvent>[];
    final t = context.tradeColors;
    final text = Theme.of(context).textTheme;
    return Scaffold(
      body: AsyncBody(
        value: summary,
        data: (s) {
          final maxOpen = strategies.fold<int>(0, (a, b) => a + (b.isRunning ? b.maxOpen : 0));
          return ListView(
            padding: const EdgeInsets.fromLTRB(AppSpace.s4, AppSpace.s4, AppSpace.s4, AppSpace.s8),
            children: [
              Text('Team overview', style: text.headlineSmall),
              Text(
                '${s.mode == TradeMode.real ? 'Real SOL' : 'Practice'} · update realtime',
                style: text.bodySmall!.copyWith(color: Theme.of(context).colorScheme.onSurfaceVariant),
              ),
              const SizedBox(height: AppSpace.s4),
              GridView.count(
                crossAxisCount: 2,
                shrinkWrap: true,
                physics: const NeverScrollableScrollPhysics(),
                mainAxisSpacing: AppSpace.s3,
                crossAxisSpacing: AppSpace.s3,
                childAspectRatio: 1.9,
                children: [
                  _Kpi(
                    label: 'Cash',
                    child: Text(fmtSol(s.cashLamports), style: AppText.num(22)),
                  ),
                  _Kpi(
                    label: 'Realized PnL',
                    child: PnlText(s.realizedPnlLamports, size: 22, key: const Key('realizedPnl')),
                  ),
                  _Kpi(
                    label: 'Open',
                    onTap: () => context.go('/positions'),
                    child: Text('${s.openPositions} / $maxOpen', style: AppText.num(22)),
                  ),
                  _Kpi(
                    label: 'Approvals',
                    onTap: () => context.go('/approvals'),
                    child: Text(
                      '$pending',
                      key: const Key('pendingKpi'),
                      style: AppText.num(22, color: pending > 0 ? t.warning : null),
                    ),
                  ),
                ],
              ),
              const SizedBox(height: AppSpace.s3),
              Card(
                child: Padding(
                  padding: const EdgeInsets.all(AppSpace.s4),
                  child: Column(
                    crossAxisAlignment: CrossAxisAlignment.start,
                    children: [
                      Row(
                        children: [
                          Text('Total PnL', style: text.labelLarge),
                          const Spacer(),
                          PnlText(s.totalPnlLamports, key: const Key('totalPnl'), unit: true),
                        ],
                      ),
                      const SizedBox(height: AppSpace.s3),
                      Sparkline(
                        height: 72,
                        values: s.history.map((p) => p.equityLamports.plotValue).toList(),
                        color: context.lamportsColor(s.totalPnlLamports),
                      ),
                    ],
                  ),
                ),
              ),
              SectionHeader(
                AppLocalizations.of(context).screenerTitle,
                action: 'Lihat',
                onAction: () => context.go('/coins'),
              ),
              SectionHeader('Strategi', action: 'Lihat semua', onAction: () => context.go('/strategies')),
              for (final st in strategies.take(2)) ...[
                StrategySummaryCard(st, onTap: () => context.go('/strategies')),
                const SizedBox(height: AppSpace.s2),
              ],
              SectionHeader('Activity', action: 'Semua', onAction: () => context.go('/activity')),
              Card(
                child: Column(
                  children: [for (final e in feed.take(4)) ActivityTile(e, now: DateTime.now(), dense: true)],
                ),
              ),
              const SizedBox(height: AppSpace.s4),
              if (s.mode == TradeMode.practice) const _RealSolCta(),
            ],
          );
        },
      ),
    );
  }
}

class _Kpi extends StatelessWidget {
  const _Kpi({required this.label, required this.child, this.onTap});
  final String label;
  final Widget child;
  final VoidCallback? onTap;

  @override
  Widget build(BuildContext context) {
    return Card(
      margin: EdgeInsets.zero,
      clipBehavior: Clip.antiAlias,
      child: InkWell(
        onTap: onTap,
        child: Padding(
          padding: const EdgeInsets.all(AppSpace.s3),
          child: Column(
            crossAxisAlignment: CrossAxisAlignment.start,
            mainAxisAlignment: MainAxisAlignment.spaceBetween,
            children: [
              Text(label, style: Theme.of(context).textTheme.labelMedium),
              FittedBox(fit: BoxFit.scaleDown, child: child),
            ],
          ),
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
        trailing: Icon(Icons.chevron_right, color: t.real),
        onTap: () => ScaffoldMessenger.of(
          context,
        ).showSnackBar(const SnackBar(content: Text('Setup wizard Real SOL belum ada di prototype (Fase 7)'))),
      ),
    );
  }
}
