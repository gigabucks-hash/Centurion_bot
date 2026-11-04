/// Per-strategy Paper / Real (contracts 1.1.6), read-only. 1.1.6 has no mode-switch endpoint: mode is chosen on
/// create and `PATCH /strategies/{id}` takes `settings_patch` only. Real also stays behind the
/// [FeatureFlags.realSolEnabled] flag (off). Nothing here reaches the Real confirmation
/// (hold / TOTP / passkey / typed name).
library;

import 'package:flutter/material.dart';

import '../../core/theme/centurion_theme.dart';
import '../../core/widgets/app_icons.dart';
import '../../core/widgets/common.dart';
import '../../data/models/models.dart';
import '../../l10n/gen/app_localizations.dart';

/// `strategy.real_locked_reason.*`; null while locked → other (HANDOFF v2.6).
String realLockedReasonText(AppLocalizations l, RealLockedReason? r) => switch (r ?? RealLockedReason.other) {
  RealLockedReason.needsOwnerApproval => l.strategyRealLockedReasonNeedsOwnerApproval,
  RealLockedReason.gateNotMet => l.strategyRealLockedReasonGateNotMet,
  RealLockedReason.policy => l.strategyRealLockedReasonPolicy,
  RealLockedReason.other => l.strategyRealLockedReasonOther,
};

/// `strategy.real_gate.*` lines. A null `*_required` shows the count only plus "rule not set" (never a ratio, never
/// an assumed number).
List<String> paperProgressLines(AppLocalizations l, PaperProgress p) => [
  p.daysRequired == null
      ? l.strategyRealGateDaysDone(p.daysDone)
      : l.strategyRealGateProgressDays('${p.daysDone}', '${p.daysRequired}'),
  p.tradesRequired == null
      ? l.strategyRealGateTradesDone(p.tradesDone)
      : l.strategyRealGateProgressTrades('${p.tradesDone}', '${p.tradesRequired}'),
  if (p.daysRequired == null || p.tradesRequired == null) l.strategyRealGateNotSet,
];

/// "Real locked" chip with the reason as its accessible label.
class RealLockedChip extends StatelessWidget {
  const RealLockedChip(this.reason, {super.key});
  final RealLockedReason? reason;
  @override
  Widget build(BuildContext context) {
    final l = AppLocalizations.of(context);
    final muted = Theme.of(context).colorScheme.onSurfaceVariant;
    return Semantics(
      container: true,
      label: l.strategyRealLockedA11y(realLockedReasonText(l, reason)),
      excludeSemantics: true,
      child: TagChip(l.strategyRealLockedChip, color: muted, icon: AppIcons.locked),
    );
  }
}

/// Mode block for a strategy: banner for its own mode, a read-only Paper/Real selector (Real disabled while locked,
/// and always disabled here because the contract has no switch), the lock reason and Paper progress.
class StrategyModeSection extends StatelessWidget {
  const StrategyModeSection(this.s, {super.key});
  final Strategy s;

  @override
  Widget build(BuildContext context) {
    final l = AppLocalizations.of(context);
    final text = Theme.of(context).textTheme;
    final muted = Theme.of(context).colorScheme.onSurfaceVariant;
    final progress = s.paperProgress;
    return Column(
      crossAxisAlignment: CrossAxisAlignment.start,
      children: [
        Text(l.strategyModeLabel, style: text.titleSmall),
        const SizedBox(height: AppSpace.s2),
        SegmentedButton<TradeMode>(
          key: const Key('strategy_mode_selector'),
          segments: [
            ButtonSegment(value: TradeMode.practice, label: Text(l.strategyModePaper)),
            ButtonSegment(
              value: TradeMode.real,
              enabled: false,
              icon: s.realLocked ? const Icon(AppIcons.locked, size: 16) : null,
              label: Semantics(
                label: s.realLocked ? l.strategyRealLockedA11y(realLockedReasonText(l, s.realLockedReason)) : null,
                child: Text(l.strategyModeReal),
              ),
            ),
          ],
          selected: {s.mode},
          onSelectionChanged: null, // read-only: no mode-switch contract in 1.1.6
        ),
        const SizedBox(height: AppSpace.s2),
        Text(
          s.mode == TradeMode.practice ? l.strategyModePaperDesc : l.modeRealBannerShort,
          style: text.bodySmall!.copyWith(color: muted),
        ),
        if (s.realLocked && s.mode == TradeMode.practice) ...[
          const SizedBox(height: AppSpace.s3),
          Row(
            children: [
              RealLockedChip(s.realLockedReason),
              const SizedBox(width: AppSpace.s2),
              Expanded(child: Text(realLockedReasonText(l, s.realLockedReason), style: text.bodySmall)),
            ],
          ),
          const SizedBox(height: AppSpace.s1),
          Text(l.strategyRealLockedExplain, style: text.bodySmall!.copyWith(color: muted)),
        ],
        if (progress != null) ...[
          const SizedBox(height: AppSpace.s3),
          for (final line in paperProgressLines(l, progress))
            Text(
              line,
              style: line == l.strategyRealGateNotSet ? text.bodySmall!.copyWith(color: muted) : text.bodyMedium,
            ),
        ],
        const SizedBox(height: AppSpace.s3),
        Text(l.strategyModeScopeNote, style: text.bodySmall!.copyWith(color: muted)),
      ],
    );
  }
}
