import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';

import '../../core/theme/solbot_theme.dart';
import '../../core/widgets/common.dart';
import '../../data/models/models.dart';
import '../../data/providers.dart';

/// Wireframe 08 / flow guard-weakening.mmd. Practice: hold 1,2 s.
/// Real SOL: typed strategy name → hold 2,5 s → biometric → cooldown 10 min.
class GuardReviewScreen extends ConsumerStatefulWidget {
  const GuardReviewScreen({super.key, required this.approvalId});
  final String approvalId;
  @override
  ConsumerState<GuardReviewScreen> createState() => _GuardReviewScreenState();
}

class _GuardReviewScreenState extends ConsumerState<GuardReviewScreen> {
  final _typed = TextEditingController();
  bool _submitting = false;

  @override
  void initState() {
    super.initState();
    _typed.addListener(() => setState(() {}));
  }

  @override
  void dispose() {
    _typed.dispose();
    super.dispose();
  }

  Future<void> _decide(Approval a, {required bool approve}) async {
    if (approve && a.mode == TradeMode.real) {
      final ok = await ref.read(approvalGuardProvider).confirm(context, action: 'Melemahkan guard (Real SOL)');
      if (!ok) return;
    }
    if (!mounted) return;
    setState(() => _submitting = true);
    final messenger = ScaffoldMessenger.of(context);
    final nav = Navigator.of(context);
    try {
      final st = await ref.read(approvalRepositoryProvider).decide(a.id, approve: approve, token: a.token);
      messenger.showSnackBar(SnackBar(
          content: Text(approve && a.mode == TradeMode.real
              ? 'Disetujui · berlaku setelah cooldown 10 mnt (bisa dibatalkan)'
              : 'Guard change: ${st.name}')));
      nav.maybePop();
    } on ConflictException catch (e) {
      messenger.showSnackBar(SnackBar(content: Text(e.message)));
    } finally {
      if (mounted) setState(() => _submitting = false);
    }
  }

  @override
  Widget build(BuildContext context) {
    final all = ref.watch(allApprovalsProvider).valueOrNull ?? const <Approval>[];
    final strategies = ref.watch(strategiesProvider).valueOrNull ?? const <Strategy>[];
    Approval? a;
    for (final x in all) {
      if (x.id == widget.approvalId) a = x;
    }
    if (a == null) {
      return Scaffold(appBar: AppBar(), body: const EmptyState(icon: Icons.search_off, text: 'Item tidak ditemukan'));
    }
    final approval = a;
    Strategy? st;
    for (final s in strategies) {
      if (s.id == approval.strategyId) st = s;
    }
    final name = st?.name ?? '';
    final real = approval.mode == TradeMode.real;
    final t = context.tradeColors;
    final cs = Theme.of(context).colorScheme;
    final text = Theme.of(context).textTheme;
    final typedOk = !real || _typed.text.trim() == name;
    final canAct = approval.isPending && !_submitting;

    return Scaffold(
      appBar: AppBar(
        leading: IconButton(icon: const Icon(Icons.close), onPressed: () => Navigator.of(context).maybePop()),
        title: const Text('Konfirmasi perubahan guard'),
      ),
      body: Column(children: [
        ModeBanner(approval.mode),
        Expanded(
          child: ListView(padding: const EdgeInsets.all(AppSpace.s4), children: [
            Container(
              padding: const EdgeInsets.all(AppSpace.s4),
              decoration: BoxDecoration(
                color: t.warningContainer,
                borderRadius: BorderRadius.circular(AppRadius.md),
                border: Border.all(color: t.warning),
              ),
              child: Column(crossAxisAlignment: CrossAxisAlignment.start, children: [
                Text('⚠ Melemahkan guard · ${real ? 'Real SOL' : 'Practice'}',
                    style: text.titleMedium!.copyWith(color: t.warning)),
                Text('$name · rev ${approval.baseRev} → ${(approval.baseRev ?? 0) + 1}', style: text.bodyMedium),
              ]),
            ),
            const SectionHeader('Perubahan'),
            for (final e in approval.diff.entries)
              Card(
                margin: const EdgeInsets.only(bottom: AppSpace.s2),
                child: ListTile(
                  title: Text(e.key),
                  subtitle: Text('${e.value.first}  →  ${e.value.last}', style: AppText.num(14, color: t.loss)),
                  trailing: Text('▼ longgar', style: text.labelLarge!.copyWith(color: t.warning)),
                ),
              ),
            const SectionHeader('Dampak risiko (replay 7 hr)'),
            for (final r in approval.riskImpact.entries)
              Padding(
                padding: const EdgeInsets.symmetric(vertical: AppSpace.s2),
                child: Row(children: [
                  Text(r.key, style: text.bodyMedium!.copyWith(color: cs.onSurfaceVariant)),
                  const Spacer(),
                  Text(r.value, style: AppText.num(14, weight: FontWeight.w700, color: t.loss)),
                ]),
              ),
            if (approval.riskLevel != null) ...[
              const SizedBox(height: AppSpace.s2),
              Align(alignment: Alignment.centerLeft, child: RiskBadge(approval.riskLevel!)),
            ],
            if (real) ...[
              const SectionHeader('Ketik nama strategi'),
              TextField(
                key: const Key('typedConfirm'),
                controller: _typed,
                style: AppText.num(15),
                decoration: InputDecoration(hintText: name),
              ),
              const SizedBox(height: AppSpace.s1),
              if (_typed.text.isNotEmpty)
                Text(typedOk ? '✓ cocok' : '✕ belum cocok',
                    style: text.bodySmall!.copyWith(color: typedOk ? t.profit : t.loss)),
              const SizedBox(height: AppSpace.s2),
              Text('Cooldown 10 mnt · audit log · notifikasi semua device',
                  style: text.bodySmall!.copyWith(color: cs.onSurfaceVariant)),
            ],
            const SizedBox(height: AppSpace.s6),
            HoldToConfirmButton(
              key: const Key('holdConfirm'),
              label: real ? 'Tahan untuk melemahkan · biometrik' : 'Tahan untuk melemahkan',
              hold: real ? AppMotion.holdRealBase : AppMotion.holdPracticeBase,
              color: real ? t.real : t.warning,
              enabled: canAct && typedOk,
              onConfirmed: () => _decide(approval, approve: true),
            ),
            const SizedBox(height: AppSpace.s3),
            // SPEC: the safe action is the primary button.
            FilledButton(
              onPressed: () => Navigator.of(context).maybePop(),
              child: const Text('Batal'),
            ),
            TextButton(
              onPressed: canAct ? () => _decide(approval, approve: false) : null,
              child: const Text('Tolak perubahan'),
            ),
          ]),
        ),
      ]),
    );
  }
}
