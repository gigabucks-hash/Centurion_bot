import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';

import '../../../core/widgets/coin_avatar.dart';
import '../../../core/feature_flags.dart';
import '../../../core/format.dart';
import '../../../core/theme/centurion_theme.dart';
import '../../../core/widgets/common.dart';
import '../../../data/api/api_exception.dart';
import '../../../data/models/models.dart';
import '../../../data/repositories/repositories.dart' show ClosePositionRequest;
import '../../../data/providers.dart';
import '../../../l10n/gen/app_localizations.dart';

/// Opens the manual sell sheet (SPEC §6, flows/positions-sell.mmd).
/// Only reachable from the Positions list/detail: never from a notification.
Future<void> showSellSheet(BuildContext context, Position p) {
  return showModalBottomSheet<void>(
    context: context,
    isScrollControlled: true,
    showDragHandle: true,
    useSafeArea: true,
    builder: (_) => SellSheet(position: p),
  );
}

class SellSheet extends ConsumerStatefulWidget {
  const SellSheet({super.key, required this.position});
  final Position position;

  @override
  ConsumerState<SellSheet> createState() => _SellSheetState();
}

class _SellSheetState extends ConsumerState<SellSheet> {
  int _pct = 50;
  bool _busy = false;

  String _unit(AppLocalizations l) => widget.position.mode == TradeMode.real ? l.commonUnitSol : l.commonUnitPaperSol;

  Future<void> _sell({bool needsBiometric = false}) async {
    final l = AppLocalizations.of(context);
    final p = ref.read(positionByIdProvider(widget.position.id)).valueOrNull ?? widget.position;
    if (needsBiometric) {
      final ok = await ref
          .read(approvalGuardProvider)
          .confirm(context, action: l.positionsSellConfirmAction('$_pct', '\$${p.symbol}'));
      if (!ok || !mounted) return;
    }
    setState(() => _busy = true);
    final messenger = ScaffoldMessenger.of(context);
    final nav = Navigator.of(context);
    try {
      // close_position (1.1.2): fraction of the CURRENT remainder, If-Match on the
      // position rev. The key is deterministic per (position, rev, fraction): a
      // double tap / retry replays; a successful sell bumps rev → new key.
      final bps = _pct * 100;
      final res = await ref
          .read(portfolioRepositoryProvider)
          .closePosition(
            ClosePositionRequest(
              positionId: p.id,
              expectedRev: p.rev,
              idempotencyKey: 'close:${p.id}:r${p.rev}:$bps',
              fractionBps: bps,
            ),
          );
      nav.pop();
      final got = res.proceeds;
      messenger.showSnackBar(
        SnackBar(
          content: Text(
            got == null
                ? l.positionsSellOrderSent('$_pct', '\$${p.symbol}')
                : l.positionsSellFilled('$_pct', '\$${p.symbol}', fmtSol(got), _unit(l)),
          ),
        ),
      );
    } on ApiException catch (e) {
      nav.pop();
      messenger.showSnackBar(SnackBar(content: Text(e.localizedMessage('id'))));
    }
  }

  @override
  Widget build(BuildContext context) {
    // Live: estimate follows the mark while the sheet is open.
    final p = ref.watch(positionByIdProvider(widget.position.id)).valueOrNull ?? widget.position;
    final real = p.mode == TradeMode.real;
    final l = AppLocalizations.of(context);
    final tt = Theme.of(context).textTheme;
    final cs = Theme.of(context).colorScheme;
    final est = p.estimateSell(_pct);
    final realBlocked = real && !ref.watch(featureFlagsProvider).realSolEnabled;
    final full = _pct >= 100;
    return Padding(
      padding: const EdgeInsets.fromLTRB(AppSpace.s4, 0, AppSpace.s4, AppSpace.s4),
      child: Column(
        mainAxisSize: MainAxisSize.min,
        crossAxisAlignment: CrossAxisAlignment.stretch,
        children: [
          Row(
            children: [
              CoinAvatar(mint: p.mint, symbol: p.symbol, logoHash: p.logoHash, logoUrl: p.logoUrl),
              const SizedBox(width: AppSpace.s2),
              Flexible(
                child: Text(
                  l.positionsSellTitle('\$${p.symbol}'),
                  style: tt.titleLarge,
                  overflow: TextOverflow.ellipsis,
                ),
              ),
              const SizedBox(width: AppSpace.s2),
              ModeChip(p.mode),
            ],
          ),
          const SizedBox(height: AppSpace.s3),
          SegmentedButton<int>(
            key: const Key('sellShare'),
            showSelectedIcon: false,
            segments: const [
              ButtonSegment(value: 25, label: Text('25%')),
              ButtonSegment(value: 50, label: Text('50%')),
              ButtonSegment(value: 100, label: Text('100%')),
            ],
            selected: {_pct},
            onSelectionChanged: _busy ? null : (s) => setState(() => _pct = s.first),
          ),
          const SizedBox(height: AppSpace.s3),
          Row(
            children: [
              Expanded(child: Text(l.positionsSellEstimate, style: tt.bodyMedium)),
              Text(
                l.positionsSellEstimateValue(fmtSol(est), _unit(l)),
                key: const Key('sellEstimate'),
                style: AppText.num(14, weight: FontWeight.w600),
              ),
            ],
          ),
          const SizedBox(height: AppSpace.s1),
          Text(
            real
                ? l.positionsSellFeesReal('${p.feeBps / 100}')
                : l.positionsSellFeesPractice((p.feeBps / 100).toString().replaceAll('.', ',')),
            style: tt.bodySmall!.copyWith(color: cs.onSurfaceVariant),
          ),
          const SizedBox(height: AppSpace.sHalf),
          Text(
            full ? l.positionsSellPlanCancelled : l.positionsSellRemainingPlan,
            key: const Key('sellPlanEffect'),
            style: tt.bodySmall!.copyWith(color: full ? context.tradeColors.warning : cs.onSurfaceVariant),
          ),
          const SizedBox(height: AppSpace.s4),
          // Team lead rule: sell is always hold-to-confirm. Practice 1,2 s,
          // Real SOL 2,5 s + biometric (SPEC §6 only asks a plain confirm for Practice).
          HoldToConfirmButton(
            key: const Key('sellHold'),
            label: realBlocked
                ? realSolDisabledText
                : real
                ? l.positionsSellHoldReal('$_pct%')
                : l.positionsSellHoldPractice('$_pct%'),
            hold: real ? AppMotion.holdRealBase : AppMotion.holdPracticeBase,
            color: real ? context.tradeColors.real : Theme.of(context).colorScheme.primary,
            enabled: !_busy && !realBlocked,
            onConfirmed: () => _sell(needsBiometric: real),
          ),
          const SizedBox(height: AppSpace.s2),
          OutlinedButton(
            style: AppButtons.secondary(context),
            onPressed: _busy ? null : () => Navigator.pop(context),
            child: Text(l.commonActionCancel),
          ),
        ],
      ),
    );
  }
}
