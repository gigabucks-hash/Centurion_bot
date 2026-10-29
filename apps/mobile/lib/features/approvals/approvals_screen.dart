import 'dart:async';

import 'package:flutter/material.dart';
import 'package:flutter/services.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:go_router/go_router.dart';

import '../../core/feature_flags.dart';
import '../../core/format.dart';
import '../../core/theme/solbot_theme.dart';
import '../../core/widgets/common.dart';
import '../../data/api/api_exception.dart';
import '../../data/api/server_clock.dart';
import '../../data/api/decide_approval.dart';
import '../../data/api/wire.dart';
import '../../data/models/models.dart';
import '../../data/providers.dart';
import '../../l10n/gen/app_localizations.dart';

/// Ids with a decision in flight or in the 5 s undo window (hidden from list).
class _BusyApprovals extends Notifier<Set<String>> {
  @override
  Set<String> build() => const {};
  void set(String id, bool busy) => state = busy ? {...state, id} : ({...state}..remove(id));
}

final busyApprovalsProvider = NotifierProvider<_BusyApprovals, Set<String>>(_BusyApprovals.new);

/// Items inside the skip undo window: hidden from the inbox.
final skippingApprovalsProvider = NotifierProvider<_BusyApprovals, Set<String>>(_BusyApprovals.new);

const undoWindow = Duration(seconds: 5);
const skipReasons = ['Likuiditas tipis', 'Sudah pump', 'Dev aneh', 'Lainnya'];

/// `decide_approval` request for [a]. The idempotency key is deterministic per
/// (approval, rev, decision), so a double tap or retry replays instead of
/// double-deciding. 1.1.2: `p_expected_rev` = the approval `rev` (never null);
/// no `p_client` (the server takes it from the JWT).
DecideApprovalRequest decideRequest(Approval a, {required bool approve, String? reason}) => DecideApprovalRequest(
  approvalId: a.id,
  token: a.token,
  approve: approve,
  expectedRev: a.rev,
  idempotencyKey: '${a.id}:r${a.rev}:${Wire.decision(approve: approve)}',
  reason: approve ? null : reason,
);

/// Approve path. Real SOL always passes the biometric gate first (SPEC §3),
/// and is disabled entirely while [FeatureFlags.realSolEnabled] is false.
Future<ApprovalStatus?> approveItem(BuildContext context, WidgetRef ref, Approval a) async {
  if (!a.approvable) return null; // not tradeable: Approve is off (server: UNSUPPORTED_QUOTE_MINT)
  if (a.mode == TradeMode.real && !ref.read(featureFlagsProvider).realSolEnabled) {
    ScaffoldMessenger.maybeOf(context)?.showSnackBar(const SnackBar(content: Text(realSolDisabledText)));
    return null;
  }
  if (a.mode == TradeMode.real) {
    final ok = await ref.read(approvalGuardProvider).confirm(context, action: 'Approve "${a.title}" (Real SOL)');
    if (!ok) return null;
  }
  if (!context.mounted) return null;
  final busy = ref.read(busyApprovalsProvider.notifier)..set(a.id, true);
  final messenger = ScaffoldMessenger.maybeOf(context);
  try {
    final res = await ref.read(approvalRepositoryProvider).decide(decideRequest(a, approve: true));
    ref.read(serverClockProvider.notifier).observe(res.serverNow);
    messenger?.showSnackBar(SnackBar(content: Text('${a.title}: ${res.status.name}')));
    return res.status;
  } on ApiException catch (e) {
    messenger?.showSnackBar(SnackBar(content: Text(e.message)));
    return null;
  } finally {
    busy.set(a.id, false);
  }
}

/// Skip path: optimistic hide + Undo 5 s; the decision is only sent after
/// the undo window closes (so "undo" needs no backend support). A not-tradeable
/// pick CAN be skipped (i18n 0.4.4); its wire reason `not_tradeable` is preselected.
void skipItem(BuildContext context, WidgetRef ref, Approval a, {String? reason}) {
  final wireReason = a.defaultSkipReason;
  reason ??= wireReason == null ? null : AppLocalizations.of(context).queueSkipReasonNotTradeable;
  final busy = ref.read(skippingApprovalsProvider.notifier)..set(a.id, true);
  final repo = ref.read(approvalRepositoryProvider);
  var undone = false;
  final messenger = ScaffoldMessenger.of(context);
  messenger.hideCurrentSnackBar();
  messenger.showSnackBar(
    SnackBar(
      duration: undoWindow,
      content: Text('Skipped ${a.title.replaceFirst('Buy ', '')}${reason == null ? '' : ' · $reason'}'),
      action: SnackBarAction(label: 'Undo', onPressed: () => undone = true),
    ),
  );
  Timer(undoWindow, () async {
    if (!undone) {
      try {
        await repo.decide(decideRequest(a, approve: false, reason: wireReason));
      } catch (_) {
        /* surfaced via feed in prod */
      }
    }
    busy.set(a.id, false);
  });
}

Future<String?> _askSkipReason(BuildContext context, Approval a) => showModalBottomSheet<String>(
  context: context,
  showDragHandle: true,
  builder: (ctx) => Padding(
    padding: const EdgeInsets.fromLTRB(AppSpace.s4, 0, AppSpace.s4, AppSpace.s6),
    child: Column(
      mainAxisSize: MainAxisSize.min,
      crossAxisAlignment: CrossAxisAlignment.start,
      children: [
        Text('Alasan skip (opsional)', style: Theme.of(ctx).textTheme.titleMedium),
        const SizedBox(height: AppSpace.s3),
        if (a.notTradeable) ...[
          // i18n 0.4.4: reason `not_tradeable` preselected; one tap confirms it.
          ChoiceChip(
            key: const Key('skipReason_not_tradeable'),
            selected: true,
            label: Text(AppLocalizations.of(ctx).queueSkipReasonNotTradeable),
            onSelected: (_) => Navigator.pop(ctx, AppLocalizations.of(ctx).queueSkipReasonNotTradeable),
          ),
          const SizedBox(height: AppSpace.s3),
          SizedBox(
            width: double.infinity,
            child: FilledButton(
              key: const Key('skipConfirm'),
              onPressed: () => Navigator.pop(ctx, AppLocalizations.of(ctx).queueSkipReasonNotTradeable),
              child: Text('Skip · ${AppLocalizations.of(ctx).queueSkipReasonNotTradeable}'),
            ),
          ),
        ] else ...[
          Wrap(
            spacing: AppSpace.s2,
            runSpacing: AppSpace.s2,
            children: [for (final r in skipReasons) ActionChip(label: Text(r), onPressed: () => Navigator.pop(ctx, r))],
          ),
          const SizedBox(height: AppSpace.s3),
          SizedBox(
            width: double.infinity,
            child: OutlinedButton(onPressed: () => Navigator.pop(ctx, ''), child: const Text('Skip tanpa alasan')),
          ),
        ],
      ],
    ),
  ),
);

enum InboxFilter { pending, approved, skipped, expired }

final inboxFilterProvider = StateProvider<InboxFilter>((_) => InboxFilter.pending);

class ApprovalsScreen extends ConsumerWidget {
  const ApprovalsScreen({super.key, this.highlightId});

  /// Set when opened from a push notification deep link.
  final String? highlightId;

  @override
  Widget build(BuildContext context, WidgetRef ref) {
    final all = ref.watch(allApprovalsProvider);
    final pending = ref.watch(pendingApprovalsProvider).valueOrNull ?? const <Approval>[];
    final filter = ref.watch(inboxFilterProvider);
    final skipping = ref.watch(skippingApprovalsProvider);
    return Scaffold(
      appBar: AppBar(title: const Text('Approvals')),
      body: Column(
        children: [
          SizedBox(
            height: 48,
            child: ListView(
              scrollDirection: Axis.horizontal,
              padding: const EdgeInsets.symmetric(horizontal: AppSpace.s4),
              children: [
                for (final f in InboxFilter.values)
                  Padding(
                    padding: const EdgeInsets.only(right: AppSpace.s2),
                    child: ChoiceChip(
                      label: Text(f == InboxFilter.pending ? 'Pending ${pending.length}' : _cap(f.name)),
                      selected: filter == f,
                      onSelected: (_) => ref.read(inboxFilterProvider.notifier).state = f,
                    ),
                  ),
              ],
            ),
          ),
          Expanded(
            child: AsyncBody(
              value: all,
              data: (_) {
                final List<Approval> list = switch (filter) {
                  InboxFilter.pending => [
                    ...pending.where((a) => !skipping.contains(a.id)),
                    // Expired items stay visible (greyed) under Pending for context.
                    ...(all.valueOrNull ?? const <Approval>[])
                        .where((a) => a.status == ApprovalStatus.expired && a.expireReason != ExpireReason.timedOut)
                        .take(2),
                  ],
                  InboxFilter.approved => _byStatus(all.valueOrNull, ApprovalStatus.approved),
                  InboxFilter.skipped => _byStatus(all.valueOrNull, ApprovalStatus.skipped),
                  InboxFilter.expired => _byStatus(all.valueOrNull, ApprovalStatus.expired),
                };
                if (list.isEmpty) return const EmptyState(icon: Icons.inbox_outlined, text: 'Tidak ada item');
                return ListView.separated(
                  padding: const EdgeInsets.fromLTRB(AppSpace.s4, AppSpace.s2, AppSpace.s4, AppSpace.s8),
                  itemCount: list.length,
                  separatorBuilder: (_, _) => const SizedBox(height: AppSpace.s3),
                  itemBuilder: (_, i) => ApprovalCard(list[i], highlighted: list[i].id == highlightId),
                );
              },
            ),
          ),
        ],
      ),
    );
  }

  static List<Approval> _byStatus(List<Approval>? all, ApprovalStatus s) =>
      (all ?? const <Approval>[]).where((a) => a.status == s).toList();
  static String _cap(String s) => s[0].toUpperCase() + s.substring(1);
}

String expireReasonLabel(ExpireReason r) => switch (r) {
  ExpireReason.timedOut => 'Waktu habis',
  ExpireReason.strategyDeleted => 'Strategi dihapus',
  ExpireReason.strategyArchived => 'Strategi diarsip',
  ExpireReason.guardFailedWhileWaiting => 'Guard gagal saat menunggu',
  ExpireReason.priceRanPastLimit => 'Harga lari melewati batas',
  ExpireReason.practiceReset => 'Practice di-reset',
  ExpireReason.accountDeleted => 'Akun dihapus',
};

class ApprovalCard extends ConsumerWidget {
  const ApprovalCard(this.a, {super.key, this.highlighted = false});
  final Approval a;
  final bool highlighted;

  @override
  Widget build(BuildContext context, WidgetRef ref) {
    final t = context.tradeColors;
    final cs = Theme.of(context).colorScheme;
    final text = Theme.of(context).textTheme;
    final busy = ref.watch(busyApprovalsProvider).contains(a.id);
    final realBlocked = a.mode == TradeMode.real && !ref.watch(featureFlagsProvider).realSolEnabled;
    final isGuard = a.kind == ApprovalKind.guardChange;
    final expired = a.status == ApprovalStatus.expired;
    final l10n = AppLocalizations.of(context);

    if (isGuard && a.isPending) return _GuardChangeCard(a, highlighted: highlighted);

    final typeChip = switch (a.pickType) {
      PickType.firstBuy => TagChip('FIRST BUY', color: cs.primary, container: cs.primaryContainer),
      PickType.rebuy => TagChip('Rebuy', color: t.info),
      _ => TagChip('Buy', color: cs.onSurfaceVariant),
    };

    final card = Card(
      margin: EdgeInsets.zero,
      color: expired ? cs.surfaceContainerLow : null,
      shape: RoundedRectangleBorder(
        borderRadius: BorderRadius.circular(AppRadius.md),
        side: BorderSide(color: highlighted ? t.warning : cs.outlineVariant, width: highlighted ? 2 : 1),
      ),
      child: Opacity(
        opacity: expired ? 0.6 : 1,
        child: Padding(
          padding: const EdgeInsets.all(AppSpace.s4),
          child: Column(
            crossAxisAlignment: CrossAxisAlignment.start,
            children: [
              Row(
                crossAxisAlignment: CrossAxisAlignment.start,
                children: [
                  Flexible(child: Text(a.title.replaceFirst('Buy ', '\$'), style: text.titleLarge)),
                  const SizedBox(width: AppSpace.s2),
                  if (expired) TagChip('EXPIRED', color: cs.onSurfaceVariant) else typeChip,
                  const SizedBox(width: AppSpace.s2),
                  if (a.mode == TradeMode.real) const ModeChip(TradeMode.real),
                  const Spacer(),
                  if (a.isPending) ExpiryCountdown(createdAt: a.createdAt, expiresAt: a.expiresAt),
                ],
              ),
              const SizedBox(height: AppSpace.s1),
              Text(a.detail, style: text.bodyMedium!.copyWith(color: cs.onSurfaceVariant)),
              if (a.amountLamports != null)
                Text(
                  'Size ${fmtSol(a.amountLamports!, unit: true)}',
                  style: AppText.num(13, color: cs.onSurfaceVariant),
                ),
              if (expired) ...[
                const SizedBox(height: AppSpace.s2),
                Text(
                  '${expireReasonLabel(a.expireReason ?? ExpireReason.timedOut)} · Tidak bisa di-approve',
                  style: text.bodySmall,
                ),
              ] else if (a.isPending && a.notTradeable) ...[
                // Own row: the ID badge is ~1.8× EN (i18n REPORT) and overflows the header.
                const SizedBox(height: AppSpace.s3),
                TagChip(
                  l10n.screenerNotTradeableBadge,
                  key: Key('notTradeable_${a.id}'),
                  color: t.neutral,
                  icon: Icons.block,
                ),
                const SizedBox(height: AppSpace.s1),
                Text(l10n.screenerNotTradeableDetail, style: text.bodySmall!.copyWith(color: t.neutral)),
                Text(l10n.screenerDetailSkipHint, style: text.bodySmall!.copyWith(color: t.neutral)),
                const SizedBox(height: AppSpace.s3),
                // i18n 0.4.4 / Apex: Skip allowed (reason preselected), Approve disabled.
                Row(
                  children: [
                    Expanded(
                      child: OutlinedButton(
                        key: Key('skip_${a.id}'),
                        onPressed: busy
                            ? null
                            : () async {
                                final r = await _askSkipReason(context, a);
                                if (r != null && context.mounted) skipItem(context, ref, a, reason: r);
                              },
                        child: const Text('Skip'),
                      ),
                    ),
                    const SizedBox(width: AppSpace.s3),
                    Expanded(
                      child: FilledButton(
                        key: Key('approve_${a.id}'),
                        onPressed: null,
                        child: Text(l10n.screenerDetailApproveUnavailable, textAlign: TextAlign.center),
                      ),
                    ),
                  ],
                ),
                Padding(
                  padding: const EdgeInsets.only(top: AppSpace.s2),
                  child: Text('‹ geser untuk skip', style: text.labelSmall!.copyWith(color: cs.onSurfaceVariant)),
                ),
              ] else if (a.isPending) ...[
                const SizedBox(height: AppSpace.s3),
                Row(
                  children: [
                    Expanded(
                      child: OutlinedButton(
                        key: Key('skip_${a.id}'),
                        onPressed: busy
                            ? null
                            : () async {
                                final r = await _askSkipReason(context, a);
                                if (r != null && context.mounted) {
                                  skipItem(context, ref, a, reason: r.isEmpty ? null : r);
                                }
                              },
                        child: const Text('Skip'),
                      ),
                    ),
                    const SizedBox(width: AppSpace.s3),
                    Expanded(
                      child: FilledButton(
                        key: Key('approve_${a.id}'),
                        style: a.mode == TradeMode.real ? AppButtons.real(context) : AppButtons.success(context),
                        onPressed: busy || realBlocked ? null : () => approveItem(context, ref, a),
                        child: busy
                            ? const SizedBox(width: 18, height: 18, child: CircularProgressIndicator(strokeWidth: 2))
                            : Text(realBlocked ? 'Fase 7' : 'Approve'),
                      ),
                    ),
                  ],
                ),
                if (realBlocked)
                  Padding(
                    padding: const EdgeInsets.only(top: AppSpace.s2),
                    child: Text(realSolDisabledText, style: text.labelSmall!.copyWith(color: t.real)),
                  ),
                if (a.swipeable)
                  Padding(
                    padding: const EdgeInsets.only(top: AppSpace.s2),
                    child: Text(
                      'Geser › approve · ‹ skip',
                      style: text.labelSmall!.copyWith(color: cs.onSurfaceVariant),
                    ),
                  ),
              ],
            ],
          ),
        ),
      ),
    );

    if (!a.swipeable || !a.isPending || busy) return card;
    // SPEC §3: swipe right approve / left skip, 40% threshold + haptic. A
    // not-tradeable pick only swipes LEFT (skip, reason preselected); a right
    // swipe is a no-op (the direction is not even offered).
    return Dismissible(
      key: ValueKey('swipe_${a.id}'),
      direction: a.approvable ? DismissDirection.horizontal : DismissDirection.endToStart,
      dismissThresholds: const {DismissDirection.startToEnd: 0.4, DismissDirection.endToStart: 0.4},
      background: _SwipeBg(color: t.profit, container: t.profitContainer, label: '✓ OK', left: true),
      secondaryBackground: _SwipeBg(
        color: cs.onSurfaceVariant,
        container: cs.surfaceContainerHigh,
        label: 'Skip ✕',
        left: false,
      ),
      confirmDismiss: (dir) async {
        HapticFeedback.mediumImpact();
        if (dir == DismissDirection.startToEnd) {
          if (a.approvable) unawaited(approveItem(context, ref, a));
        } else {
          skipItem(context, ref, a);
        }
        return false; // list rebuilds from the stream; keeps undo simple
      },
      child: card,
    );
  }
}

class _SwipeBg extends StatelessWidget {
  const _SwipeBg({required this.color, required this.container, required this.label, required this.left});
  final Color color, container;
  final String label;
  final bool left;
  @override
  Widget build(BuildContext context) => Container(
    decoration: BoxDecoration(color: container, borderRadius: BorderRadius.circular(AppRadius.md)),
    alignment: left ? Alignment.centerLeft : Alignment.centerRight,
    padding: const EdgeInsets.symmetric(horizontal: AppSpace.s6),
    child: Text(
      label,
      style: TextStyle(color: color, fontWeight: FontWeight.w700),
    ),
  );
}

class _GuardChangeCard extends StatelessWidget {
  const _GuardChangeCard(this.a, {this.highlighted = false});
  final Approval a;
  final bool highlighted;
  @override
  Widget build(BuildContext context) {
    final t = context.tradeColors;
    final text = Theme.of(context).textTheme;
    return Card(
      margin: EdgeInsets.zero,
      color: t.warningContainer,
      clipBehavior: Clip.antiAlias,
      shape: RoundedRectangleBorder(
        borderRadius: BorderRadius.circular(AppRadius.md),
        side: BorderSide(color: t.warning, width: highlighted ? 2 : 1),
      ),
      child: InkWell(
        key: Key('review_${a.id}'),
        onTap: () => context.push('/approvals/${Uri.encodeComponent(a.id)}/review'),
        child: Padding(
          padding: const EdgeInsets.all(AppSpace.s4),
          child: Column(
            crossAxisAlignment: CrossAxisAlignment.start,
            children: [
              Row(
                children: [
                  Icon(Icons.warning_amber, color: t.warning, size: 20),
                  const SizedBox(width: AppSpace.s2),
                  Expanded(
                    child: Text('Guard dilemahkan', style: text.titleMedium!.copyWith(color: t.warning)),
                  ),
                  if (a.mode == TradeMode.real) const ModeChip(TradeMode.real),
                ],
              ),
              const SizedBox(height: AppSpace.s1),
              Text(a.title, style: text.bodyMedium),
              for (final e in a.diff.entries)
                Text('${e.key}  ${e.value.first} → ${e.value.last}', style: AppText.num(13)),
              const SizedBox(height: AppSpace.s2),
              Text(
                'Tidak bisa di-swipe · Review ›',
                style: text.labelLarge!.copyWith(color: t.warning, fontWeight: FontWeight.w700),
              ),
            ],
          ),
        ),
      ),
    );
  }
}
