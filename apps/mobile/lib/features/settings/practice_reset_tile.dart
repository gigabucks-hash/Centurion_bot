import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';

import '../../core/format.dart';
import '../../data/api/api_exception.dart';
import '../../data/api/server_clock.dart';
import '../../data/providers.dart';

/// Lainnya → "Reset Practice" (contract v1.1 `POST /workspaces/{ws}/practice/reset`):
/// back to 30 paper SOL, at most once per 24 h (RESET_COOLDOWN).
class PracticeResetTile extends ConsumerStatefulWidget {
  const PracticeResetTile({super.key});
  @override
  ConsumerState<PracticeResetTile> createState() => _PracticeResetTileState();
}

class _PracticeResetTileState extends ConsumerState<PracticeResetTile> {
  bool _busy = false;

  Future<void> _reset() async {
    final ok = await showDialog<bool>(
      context: context,
      builder: (ctx) => AlertDialog(
        title: const Text('Reset Practice?'),
        content: const Text('Posisi Practice diarsipkan, pick yang menunggu kedaluwarsa, saldo kembali ke '
            '30 paper SOL. Hanya 1× per 24 jam.'),
        actions: [
          FilledButton(onPressed: () => Navigator.pop(ctx, false), child: const Text('Batal')),
          TextButton(key: const Key('confirmReset'), onPressed: () => Navigator.pop(ctx, true), child: const Text('Reset')),
        ],
      ),
    );
    if (ok != true || !mounted) return;
    setState(() => _busy = true);
    final messenger = ScaffoldMessenger.of(context);
    try {
      final r = await ref
          .read(practiceResetRepositoryProvider)
          .resetPractice(idempotencyKey: 'reset:${DateTime.now().millisecondsSinceEpoch}');
      ref.read(serverClockProvider.notifier).observe(r.serverNow);
      messenger.showSnackBar(SnackBar(
          content: Text('Practice di-reset ke ${fmtSol(r.startingBalance)} paper SOL · epoch ${r.epoch}')));
    } on ApiException catch (e) {
      final next = DateTime.tryParse('${e.details['next_allowed_at']}');
      messenger.showSnackBar(SnackBar(
          content: Text(e.isCode('RESET_COOLDOWN') && next != null
              ? 'Reset berikutnya bisa pukul ${fmtTime(next.toLocal())}'
              : e.message)));
    } finally {
      if (mounted) setState(() => _busy = false);
    }
  }

  @override
  Widget build(BuildContext context) => ListTile(
        key: const Key('practiceReset'),
        leading: const Icon(Icons.restart_alt),
        title: const Text('Reset Practice'),
        subtitle: const Text('Kembali ke 30 paper SOL · maks 1× / 24 jam'),
        enabled: !_busy,
        onTap: _reset,
      );
}

/// Shows that Real SOL is behind [FeatureFlags.realSolEnabled].
String realModeStatus(bool enabled) => enabled ? 'Real SOL aktif' : 'Real SOL nonaktif sampai Fase 7';

