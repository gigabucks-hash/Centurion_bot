import 'dart:math';
import 'dart:async';

import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';

import '../../data/api/server_clock.dart';
import '../../data/models/models.dart';
import '../format.dart';
import '../theme/solbot_theme.dart';

/// PnL: arrow + sign + color + mono tabular number (SPEC §1).
class PnlText extends StatelessWidget {
  /// SOL PnL (exact lamports). T-15: exact 0 → `0,000` neutral, no arrow/sign;
  /// any non-zero (even 1 lamport) → ▲/▼ + sign + profit/loss color.
  const PnlText(Lamports this.value, {super.key, this.size = 14, this.unit = false}) : pctValue = null;

  /// Percent PnL (display number).
  const PnlText.pct(double this.pctValue, {super.key, this.size = 14}) : value = null, unit = false;
  final Lamports? value;
  final double? pctValue;
  final double size;
  final bool unit;

  @override
  Widget build(BuildContext context) {
    final v = value;
    final text = v == null ? fmtPct(pctValue!) : fmtPnl(v, unit: unit);
    final color = v == null ? context.pnlColor(pctValue!) : context.lamportsColor(v);
    return Text(
      text,
      style: AppText.num(size, weight: FontWeight.w600, color: color),
    );
  }
}

extension LamportsColor on BuildContext {
  /// PnL color for an exact amount: neutral only when exactly 0 lamports (T-15).
  Color lamportsColor(Lamports v) => pnlColor(v.sign);
}

/// Non-dismissable mode banner on every screen (SPEC §1 "Mode banner").
class ModeBanner extends StatelessWidget {
  const ModeBanner(this.mode, {super.key});
  final TradeMode mode;

  @override
  Widget build(BuildContext context) {
    final t = context.tradeColors;
    final real = mode == TradeMode.real;
    final fg = real ? t.onReal : t.practice;
    return Semantics(
      label: real ? 'Mode Real SOL' : 'Mode Practice',
      container: true,
      child: CustomPaint(
        painter: real ? null : _StripePainter(t.practice.withValues(alpha: 0.10)),
        child: Container(
          width: double.infinity,
          padding: const EdgeInsets.symmetric(horizontal: AppSpace.s4, vertical: AppSpace.s2),
          decoration: BoxDecoration(
            color: real ? t.real : t.practiceContainer.withValues(alpha: 0.85),
            border: real ? null : Border(bottom: BorderSide(color: t.practice.withValues(alpha: 0.5))),
          ),
          child: Text(
            real ? '● REAL SOL · memakai SOL nyata' : '◇ PRACTICE · paper SOL, bukan uang nyata',
            style: Theme.of(context).textTheme.labelLarge!.copyWith(color: fg, fontWeight: FontWeight.w700),
          ),
        ),
      ),
    );
  }
}

class _StripePainter extends CustomPainter {
  _StripePainter(this.color);
  final Color color;
  @override
  void paint(Canvas canvas, Size size) {
    final p = Paint()
      ..color = color
      ..strokeWidth = 6;
    for (double x = -size.height; x < size.width; x += 16) {
      canvas.drawLine(Offset(x, size.height), Offset(x + size.height, 0), p);
    }
  }

  @override
  bool shouldRepaint(_StripePainter old) => old.color != color;
}

/// Pill chip for states/labels. `filled` = container color + accent text.
class TagChip extends StatelessWidget {
  const TagChip(this.label, {super.key, required this.color, this.container, this.icon});
  final String label;
  final Color color;
  final Color? container;
  final IconData? icon;

  @override
  Widget build(BuildContext context) {
    return Container(
      padding: const EdgeInsets.symmetric(horizontal: AppSpace.s2, vertical: AppSpace.sHalf),
      decoration: BoxDecoration(
        color: container ?? color.withValues(alpha: 0.12),
        borderRadius: BorderRadius.circular(AppRadius.full),
        border: Border.all(color: color.withValues(alpha: 0.7)),
      ),
      child: Row(
        mainAxisSize: MainAxisSize.min,
        children: [
          if (icon != null) ...[Icon(icon, size: 12, color: color), const SizedBox(width: 4)],
          Text(label, style: Theme.of(context).textTheme.labelSmall!.copyWith(color: color, letterSpacing: 0.4)),
        ],
      ),
    );
  }
}

class ModeChip extends StatelessWidget {
  const ModeChip(this.mode, {super.key});
  final TradeMode mode;
  @override
  Widget build(BuildContext context) {
    final t = context.tradeColors;
    return mode == TradeMode.real
        ? TagChip('● REAL', color: t.real, container: t.realContainer)
        : TagChip('◇ PRACTICE', color: t.practice, container: t.practiceContainer);
  }
}

/// Text + icon + color (SPEC: Risk badge Rendah/Sedang/Tinggi/Kritis).
class RiskBadge extends StatelessWidget {
  const RiskBadge(this.level, {super.key});
  final RiskLevel level;
  @override
  Widget build(BuildContext context) {
    final t = context.tradeColors;
    final (label, color, bg, icon) = switch (level) {
      RiskLevel.low => ('RENDAH', t.profit, t.profitContainer, Icons.shield_outlined),
      RiskLevel.medium => ('SEDANG', t.warning, t.warningContainer, Icons.info_outline),
      RiskLevel.high => ('TINGGI', t.loss, t.lossContainer, Icons.warning_amber),
      RiskLevel.critical => ('KRITIS', t.loss, t.lossContainer, Icons.dangerous_outlined),
    };
    return TagChip('Risk level: $label', color: color, container: bg, icon: icon);
  }
}

/// mm:ss countdown + progress bar; < 2 min turns red with an icon (SPEC §1).
/// Uses the server clock: `expires_at − (device now + skew)`.
class ExpiryCountdown extends ConsumerStatefulWidget {
  const ExpiryCountdown({super.key, required this.createdAt, required this.expiresAt, this.showBar = true});
  final DateTime createdAt;
  final DateTime expiresAt;
  final bool showBar;
  @override
  ConsumerState<ExpiryCountdown> createState() => _ExpiryCountdownState();
}

class _ExpiryCountdownState extends ConsumerState<ExpiryCountdown> {
  Timer? _t;
  @override
  void initState() {
    super.initState();
    _t = Timer.periodic(const Duration(seconds: 1), (_) => setState(() {}));
  }

  @override
  void dispose() {
    _t?.cancel();
    super.dispose();
  }

  @override
  Widget build(BuildContext context) {
    final now = DateTime.now().add(ref.watch(serverClockProvider));
    final left = widget.expiresAt.difference(now);
    final total = max(1, widget.expiresAt.difference(widget.createdAt).inMilliseconds);
    final urgent = left.inSeconds < 120;
    final c = urgent ? context.tradeColors.loss : Theme.of(context).colorScheme.onSurfaceVariant;
    return Column(
      crossAxisAlignment: CrossAxisAlignment.end,
      mainAxisSize: MainAxisSize.min,
      children: [
        Row(
          mainAxisSize: MainAxisSize.min,
          children: [
            Icon(urgent ? Icons.timer_outlined : Icons.schedule, size: 14, color: c),
            const SizedBox(width: 4),
            Text(fmtCountdown(left), style: AppText.num(13, color: c)),
          ],
        ),
        if (widget.showBar) ...[
          const SizedBox(height: 4),
          SizedBox(
            width: 72,
            child: LinearProgressIndicator(
              value: (left.inMilliseconds / total).clamp(0.0, 1.0),
              color: c,
              minHeight: 3,
              borderRadius: BorderRadius.circular(AppRadius.full),
            ),
          ),
        ],
      ],
    );
  }
}

/// Hold-to-confirm (Practice 1,2 s / Real 2,5 s). Release early = cancel.
class HoldToConfirmButton extends StatefulWidget {
  const HoldToConfirmButton({
    super.key,
    required this.label,
    required this.hold,
    required this.onConfirmed,
    required this.color,
    this.enabled = true,
  });
  final String label;
  final Duration hold;
  final VoidCallback onConfirmed;
  final Color color;
  final bool enabled;
  @override
  State<HoldToConfirmButton> createState() => _HoldToConfirmButtonState();
}

class _HoldToConfirmButtonState extends State<HoldToConfirmButton> with SingleTickerProviderStateMixin {
  late final AnimationController _c = AnimationController(vsync: this, duration: widget.hold)
    ..addStatusListener((s) {
      if (s == AnimationStatus.completed) {
        widget.onConfirmed();
        _c.reset();
      }
    });

  @override
  void dispose() {
    _c.dispose();
    super.dispose();
  }

  @override
  Widget build(BuildContext context) {
    final cs = Theme.of(context).colorScheme;
    return Semantics(
      button: true,
      enabled: widget.enabled,
      label: '${widget.label}, tahan ${widget.hold.inMilliseconds / 1000} detik',
      child: GestureDetector(
        onTapDown: widget.enabled ? (_) => _c.forward() : null,
        onTapUp: (_) => _c.isCompleted ? null : _c.reverse(),
        onTapCancel: () => _c.reverse(),
        child: AnimatedBuilder(
          animation: _c,
          builder: (_, _) => Container(
            height: AppDensity.comfortable.controlLg,
            decoration: BoxDecoration(
              borderRadius: BorderRadius.circular(AppRadius.sm),
              border: Border.all(color: widget.enabled ? widget.color : cs.outlineVariant),
              gradient: LinearGradient(
                colors: [widget.color.withValues(alpha: 0.45), cs.surfaceContainerHigh],
                stops: [_c.value, _c.value],
              ),
            ),
            alignment: Alignment.center,
            child: Text(
              widget.label,
              style: Theme.of(context).textTheme.titleSmall!.copyWith(
                color: widget.enabled ? cs.onSurface : cs.onSurface.withValues(alpha: 0.4),
              ),
            ),
          ),
        ),
      ),
    );
  }
}

class SectionHeader extends StatelessWidget {
  const SectionHeader(this.title, {super.key, this.action, this.onAction});
  final String title;
  final String? action;
  final VoidCallback? onAction;
  @override
  Widget build(BuildContext context) => Padding(
    padding: const EdgeInsets.only(top: AppSpace.s5, bottom: AppSpace.s2),
    child: Row(
      children: [
        Expanded(child: Text(title, style: Theme.of(context).textTheme.titleMedium)),
        if (action != null) TextButton(onPressed: onAction, child: Text('$action ›')),
      ],
    ),
  );
}

/// Renders loading / error / data for an [AsyncValue] consistently.
class AsyncBody<T> extends StatelessWidget {
  const AsyncBody({super.key, required this.value, required this.data});
  final AsyncValue<T> value;
  final Widget Function(T data) data;

  @override
  Widget build(BuildContext context) {
    return value.when(
      data: data,
      loading: () => const Center(child: CircularProgressIndicator()),
      error: (e, _) => Center(
        child: Padding(padding: const EdgeInsets.all(AppSpace.s6), child: Text('Terjadi kesalahan\n$e')),
      ),
    );
  }
}

class EmptyState extends StatelessWidget {
  const EmptyState({super.key, required this.icon, required this.text});
  final IconData icon;
  final String text;

  @override
  Widget build(BuildContext context) {
    final c = Theme.of(context).colorScheme.onSurfaceVariant;
    return Center(
      child: Column(
        mainAxisSize: MainAxisSize.min,
        children: [
          Icon(icon, size: 48, color: c),
          const SizedBox(height: AppSpace.s2),
          Text(text, style: TextStyle(color: c)),
        ],
      ),
    );
  }
}
