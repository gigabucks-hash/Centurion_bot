import 'package:flutter/material.dart';

/// Gate in front of every approve action. Prod: `local_auth` biometric /
/// device PIN (required for Real SOL). Prototype: a confirmation dialog.
abstract interface class ApprovalGuard {
  Future<bool> confirm(BuildContext context, {required String action});
}

class DialogApprovalGuard implements ApprovalGuard {
  const DialogApprovalGuard();

  @override
  Future<bool> confirm(BuildContext context, {required String action}) async {
    final ok = await showDialog<bool>(
      context: context,
      builder: (ctx) => AlertDialog(
        icon: const Icon(Icons.fingerprint, size: 40),
        title: const Text('Confirm'),
        content: Text('$action\n\n(Biometric prompt in production build)'),
        actions: [
          TextButton(onPressed: () => Navigator.pop(ctx, false), child: const Text('Cancel')),
          FilledButton(onPressed: () => Navigator.pop(ctx, true), child: const Text('Confirm')),
        ],
      ),
    );
    return ok ?? false;
  }
}

/// Used by tests and by the "skip" path, which never needs auth.
class AlwaysAllowGuard implements ApprovalGuard {
  const AlwaysAllowGuard();
  @override
  Future<bool> confirm(BuildContext context, {required String action}) async => true;
}
