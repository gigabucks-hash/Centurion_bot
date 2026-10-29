import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:go_router/go_router.dart';

import '../../core/widgets/api_feedback.dart';
import '../../data/api/api_exception.dart';
import '../../data/models/models.dart';
import '../../data/providers.dart';
import '../../data/repositories/repositories.dart';

/// Submit a strategy settings edit (REST PATCH, contracts 1.1.4) and report the
/// outcome honestly: applied → "saved"; loosening a guard → 202 proposal, shown
/// as PENDING approval (info tone, CTA to the queue), never as success.
/// A `409 GUARD_WEAKEN_REQUIRES_APPROVAL` (RPC path) renders with the pending tone too.
Future<StrategyPatchOutcome?> submitStrategyPatch(
  BuildContext context,
  WidgetRef ref,
  Strategy s,
  Map<String, Object?> settingsPatch,
) async {
  try {
    final out = await ref
        .read(strategyRepositoryProvider)
        .patchSettings(s.id, expectedRev: s.rev, settingsPatch: settingsPatch);
    if (!context.mounted) return out;
    switch (out) {
      case StrategyPatchApplied(:final strategy):
        ScaffoldMessenger.maybeOf(context)?.showSnackBar(
          SnackBar(key: const Key('strategyPatchApplied'), content: Text('${strategy.name}: rev ${strategy.rev}')),
        );
      case StrategyPatchPendingApproval():
        showGuardWeakenPending(context, out, onOpen: () => context.go('/approvals'));
    }
    return out;
  } on ApiException catch (e) {
    if (context.mounted) {
      showApiError(
        context,
        e,
        onCta: e.code == ApiErrorCode.guardWeakenRequiresApproval ? () => context.go('/approvals') : null,
      );
    }
    return null;
  }
}
