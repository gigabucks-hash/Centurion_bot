import 'dart:async';

import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';

import '../../core/format.dart';
import '../../core/l10n_format.dart';
import '../../core/perf/latest_throttle.dart';
import '../../core/theme/centurion_theme.dart';
import '../../core/widgets/coin_avatar.dart';
import '../../core/widgets/common.dart';
import '../../data/api/server_clock.dart';
import '../../data/models/models.dart';
import '../../data/providers.dart';
import '../../l10n/gen/app_localizations.dart';
import 'approvals_screen.dart' show approveItem;

/// Server sends at most one `proposal.updated` per 3 s; render no faster.
const quoteRenderInterval = Duration(seconds: 3);

/// How long the inline "Quote updated" label stays (i18n: ~2 s, no toast).
const quoteUpdatedLabelFor = Duration(seconds: 2);

/// Real approve hold (UX: 2.5 s).
const realReviewHold = Duration(milliseconds: 2500);

Future<void> showProposalReview(BuildContext context, Approval a) => showModalBottomSheet<void>(
  context: context,
  isScrollControlled: true,
  showDragHandle: true,
  builder: (_) => ProposalReviewSheet(initial: a),
);

/// WF-22 review sheet (contracts 1.1.4 quote fields, i18n 0.4.6 `review.quote.*`).
///
/// `proposal.updated` is SILENT: no push, no toast. While this sheet is open the
/// new quote is merged and the new `rev` kept (it becomes `expected_rev`),
/// rendering is throttled to [quoteRenderInterval], the inline label
/// `review.quote.updated_inline` shows briefly, and a Real hold in progress is
/// cancelled and reset (`review.quote.changed_during_hold`).
class ProposalReviewSheet extends ConsumerStatefulWidget {
  const ProposalReviewSheet({super.key, required this.initial});
  final Approval initial;
  @override
  ConsumerState<ProposalReviewSheet> createState() => _ProposalReviewSheetState();
}

class _ProposalReviewSheetState extends ConsumerState<ProposalReviewSheet> {
  late Approval _shown = widget.initial;
  late final LatestThrottle<Approval> _throttle = LatestThrottle(quoteRenderInterval, _merge);
  bool _holding = false;
  bool _changedDuringHold = false;
  bool _justUpdated = false;
  bool _refreshing = false;
  Timer? _labelTimer;
  Timer? _ticker;

  @override
  void initState() {
    super.initState();
    // Age / expiry countdown.
    _ticker = Timer.periodic(const Duration(seconds: 1), (_) {
      if (mounted) setState(() {});
    });
  }

  @override
  void dispose() {
    _throttle.dispose();
    _labelTimer?.cancel();
    _ticker?.cancel();
    super.dispose();
  }

  void _merge(Approval next) {
    if (!mounted || next.rev <= _shown.rev) return;
    setState(() {
      _shown = next;
      _justUpdated = true;
      if (_holding) {
        _holding = false;
        _changedDuringHold = true; // the HoldToConfirmButton is re-keyed by rev → reset
      }
    });
    _labelTimer?.cancel();
    _labelTimer = Timer(quoteUpdatedLabelFor, () {
      if (mounted) setState(() => _justUpdated = false);
    });
  }

  Future<void> _refresh() async {
    setState(() => _refreshing = true);
    try {
      final a = await ref.read(approvalRepositoryProvider).refreshApproval(_shown.id);
      _merge(a);
    } finally {
      if (mounted) setState(() => _refreshing = false);
    }
  }

  Future<void> _approve() async {
    final st = await approveItem(context, ref, _shown);
    if (st != null && mounted) Navigator.of(context).maybePop();
  }

  @override
  Widget build(BuildContext context) {
    ref.listen(allApprovalsProvider, (_, next) {
      final a = next.valueOrNull?.where((x) => x.id == _shown.id).firstOrNull;
      if (a != null && a.rev > _shown.rev) _throttle.add(a);
    });
    final l = AppLocalizations.of(context);
    final text = Theme.of(context).textTheme;
    final cs = Theme.of(context).colorScheme;
    final t = context.tradeColors;
    final a = _shown;
    final q = a.quote;
    final now = ref.read(serverClockProvider.notifier).now();
    final state = q?.stateAt(now) ?? QuoteState.missing;
    final real = a.mode == TradeMode.real;
    final blocked = quoteBlocksApprove(a, now);
    final symbol = a.symbol ?? a.title.split(' ').last;

    Widget row(String k, String v, {Key? key}) => Padding(
      key: key,
      padding: const EdgeInsets.symmetric(vertical: AppSpace.s1),
      child: Row(
        children: [
          Expanded(
            child: Text(k, style: text.bodyMedium!.copyWith(color: cs.onSurfaceVariant)),
          ),
          Text(v, style: AppText.num(14)),
        ],
      ),
    );
    String lam(Lamports? v) => v == null ? '—' : fmtSol(v, unit: true);
    final loc = Localizations.localeOf(context).languageCode;
    String bps(int? v) => formatBps(v, loc);

    return Padding(
      padding: const EdgeInsets.fromLTRB(AppSpace.s4, 0, AppSpace.s4, AppSpace.s6),
      child: Column(
        mainAxisSize: MainAxisSize.min,
        crossAxisAlignment: CrossAxisAlignment.stretch,
        children: [
          Row(
            children: [
              if (a.mint != null) ...[
                CoinAvatar(mint: a.mint, symbol: symbol, logoHash: a.logoHash, logoUrl: a.logoUrl),
                const SizedBox(width: AppSpace.s2),
              ],
              Expanded(
                child: Column(
                  crossAxisAlignment: CrossAxisAlignment.start,
                  children: [
                    Text('\$$symbol', style: text.titleLarge),
                    Text(l.reviewTitle('buy'), style: text.bodySmall!.copyWith(color: cs.onSurfaceVariant)),
                  ],
                ),
              ),
              if (_justUpdated)
                Semantics(
                  liveRegion: true,
                  child: Text(
                    l.reviewQuoteUpdatedInline,
                    key: const Key('quoteUpdatedInline'),
                    style: text.labelSmall!.copyWith(color: t.info),
                  ),
                ),
            ],
          ),
          const SizedBox(height: AppSpace.s3),
          row(l.reviewYouPay, lam(a.amountLamports)),
          row(l.reviewNetworkFee, lam(q?.estNetworkFee), key: const Key('quoteNetworkFee')),
          row(l.reviewPriorityFee, lam(q?.priorityFee)),
          row(l.reviewSwapFee, bps(q?.swapFeeBps)),
          row(l.reviewSlippage, bps(q?.maxSlippageBps)),
          // Token decimals are not on the proposal (contract gap): raw stays "—" until they are.
          row(l.reviewMinReceived, q?.minOutRaw == null ? '—' : l.reviewMinReceivedValue('—', symbol)),
          row(l.reviewTotalMax, lam(q?.totalMax), key: const Key('quoteTotalMax')),
          const SizedBox(height: AppSpace.s2),
          Text(
            switch (state) {
              QuoteState.missing => l.reviewQuoteMissing,
              QuoteState.stale => real ? l.reviewQuoteStale : l.reviewQuotePracticeStale,
              QuoteState.fresh =>
                '${l.reviewQuoteUpdatedAgo(now.difference(q!.quoteTs ?? now).inSeconds.clamp(0, 86400))} · '
                    '${l.reviewQuoteExpiresIn(q.quoteExpiresAt!.difference(now).inSeconds.clamp(0, 86400))}',
            },
            key: Key('quoteState_${state.name}'),
            style: text.bodySmall!.copyWith(color: state == QuoteState.fresh ? cs.onSurfaceVariant : t.warning),
          ),
          if (_changedDuringHold)
            Padding(
              padding: const EdgeInsets.only(top: AppSpace.s2),
              child: Text(
                l.reviewQuoteChangedDuringHold,
                key: const Key('quoteChangedDuringHold'),
                style: text.bodySmall!.copyWith(color: t.warning),
              ),
            ),
          if (state != QuoteState.fresh)
            Align(
              alignment: Alignment.centerLeft,
              child: TextButton(
                key: const Key('quoteRefresh'),
                onPressed: _refreshing ? null : _refresh,
                child: Text(_refreshing ? l.reviewQuoteRefreshing : l.reviewQuoteRefresh),
              ),
            ),
          const SizedBox(height: AppSpace.s2),
          Text(real ? l.reviewRealNote : l.reviewPracticeNote, style: text.bodySmall),
          const SizedBox(height: AppSpace.s4),
          if (real)
            HoldToConfirmButton(
              key: ValueKey('reviewHold_r${a.rev}'),
              label: 'Approve',
              hold: realReviewHold,
              color: t.real,
              enabled: !blocked && a.isPending,
              onHoldingChanged: (h) {
                // Release/cancel also fires while a re-keyed button is disposed: no rebuild then.
                if (!h) {
                  _holding = false;
                  return;
                }
                setState(() {
                  _holding = true;
                  _changedDuringHold = false;
                });
              },
              onConfirmed: _approve,
            )
          else
            FilledButton(
              key: const Key('reviewApprove'),
              style: AppButtons.success(context),
              onPressed: a.isPending && a.approvable ? _approve : null,
              child: const Text('Approve'),
            ),
        ],
      ),
    );
  }
}
