import 'package:flutter/material.dart';

import '../../../core/exit_reason_l10n.dart';
import '../../../core/format.dart';
import '../../../core/theme/centurion_theme.dart';
import '../../../core/widgets/coin_avatar.dart';
import '../../../core/widgets/common.dart';
import '../../../data/models/models.dart';
import '../../../l10n/gen/app_localizations.dart';
import '../pnl_strings.dart';

/// One closed trade with its locked-in (realized) PnL.
///
/// Shared by the Positions history and the PnL report so a closed row looks and
/// reads the same in both places: the number is labelled `realized`, never a
/// bare "PnL" that could be mistaken for a live position.
class ClosedTradeRow extends StatelessWidget {
  const ClosedTradeRow({super.key, required this.position, this.onTap, this.showClosedAt = false});

  final Position position;
  final VoidCallback? onTap;

  /// Adds the close time to the subtitle (PnL report). Off in the Positions list,
  /// where the section is already sorted by close time.
  final bool showClosedAt;

  @override
  Widget build(BuildContext context) {
    final p = position;
    final l = AppLocalizations.of(context);
    final s = PnlStrings.of(Localizations.localeOf(context).languageCode);
    final muted = Theme.of(
      context,
    ).textTheme.labelSmall!.copyWith(color: Theme.of(context).colorScheme.onSurfaceVariant);
    final reason = p.exitReason == null ? l.coinTrailStepClosed : exitReasonLabel(l, p.exitReason!);
    final subtitle = showClosedAt && p.closedAt != null
        ? '$reason · ${s.closedAt} ${fmtTime(p.closedAt!)} WIB'
        : reason;
    return ListTile(
      key: Key('closed_${p.id}'),
      contentPadding: EdgeInsets.zero,
      leading: CoinAvatar(mint: p.mint, symbol: p.symbol, logoHash: p.logoHash, logoUrl: p.logoUrl),
      title: Text('\$${p.symbol}', overflow: TextOverflow.ellipsis),
      subtitle: Text(subtitle, maxLines: 1, overflow: TextOverflow.ellipsis),
      trailing: SizedBox(
        width: 118,
        child: Column(
          mainAxisSize: MainAxisSize.min,
          crossAxisAlignment: CrossAxisAlignment.end,
          children: [
            PnlText(p.pnlLamports),
            const SizedBox(height: AppSpace.sHalf),
            FittedBox(
              fit: BoxFit.scaleDown,
              alignment: Alignment.centerRight,
              child: Text('${fmtPct(p.pnlPct, arrow: false)} · ${s.realizedShort}', style: muted),
            ),
          ],
        ),
      ),
      onTap: onTap,
    );
  }
}
