import 'dart:math';

import 'package:flutter/material.dart';

import '../../../core/theme/solbot_theme.dart';
import '../../../data/models/models.dart';

/// SPEC §6 exit progress: SL marker │ fill to current price │ TP rung dots.
/// Scale is linear in % vs entry, from SL (left) to the last TP (right).
class ExitProgressBar extends StatelessWidget {
  const ExitProgressBar({super.key, required this.position, this.height = 18});
  final Position position;
  final double height;

  @override
  Widget build(BuildContext context) {
    final plan = position.exitPlan;
    if (plan == null) return const SizedBox.shrink();
    final t = context.tradeColors;
    final cs = Theme.of(context).colorScheme;
    final next = plan.nextRung;
    final semantic =
        'Exit plan: stop loss ${plan.stopLossPct.round()}%, '
        'sekarang ${position.changePct.round()}%, '
        '${plan.filledCount} dari ${plan.rungs.length} take profit terisi'
        '${next == null ? '' : ', berikutnya +${next.gainPct.round()}%'}';
    return Semantics(
      label: semantic,
      child: SizedBox(
        height: height,
        width: double.infinity,
        child: CustomPaint(
          painter: _ExitBarPainter(
            plan: plan,
            changePct: position.changePct,
            track: cs.surfaceContainerHighest,
            outline: cs.outline,
            fill: position.changePct >= 0 ? t.profit : t.loss,
            sl: t.loss,
            rungFilled: t.profit,
            rungNext: cs.onSurface,
            surface: cs.surfaceContainer,
          ),
        ),
      ),
    );
  }
}

class _ExitBarPainter extends CustomPainter {
  _ExitBarPainter({
    required this.plan,
    required this.changePct,
    required this.track,
    required this.outline,
    required this.fill,
    required this.sl,
    required this.rungFilled,
    required this.rungNext,
    required this.surface,
  });
  final ExitPlanState plan;
  final double changePct;
  final Color track, outline, fill, sl, rungFilled, rungNext, surface;

  @override
  void paint(Canvas canvas, Size size) {
    const pad = 6.0;
    final w = size.width - pad * 2;
    final cy = size.height / 2;
    final lo = plan.stopLossPct;
    final hi = plan.maxGainPct;
    double x(double pct) => pad + w * ((pct - lo) / (hi - lo)).clamp(0.0, 1.0);

    final barH = max(4.0, size.height * 0.28);
    final r = Radius.circular(barH / 2);
    canvas.drawRRect(RRect.fromLTRBR(pad, cy - barH / 2, pad + w, cy + barH / 2, r), Paint()..color = track);
    final now = x(changePct);
    canvas.drawRRect(RRect.fromLTRBR(pad, cy - barH / 2, now, cy + barH / 2, r), Paint()..color = fill);
    // SL marker.
    canvas.drawRect(Rect.fromLTWH(pad - 1.5, 0, 3, size.height), Paint()..color = sl);
    // Current price marker.
    canvas.drawCircle(Offset(now, cy), barH * 0.9, Paint()..color = fill);
    // TP rungs.
    final next = plan.nextRung;
    for (final rung in plan.rungs) {
      final c = Offset(x(rung.gainPct), cy);
      final rad = barH * 0.95;
      canvas.drawCircle(c, rad, Paint()..color = rung.filled ? rungFilled : surface);
      canvas.drawCircle(
        c,
        rad,
        Paint()
          ..style = PaintingStyle.stroke
          ..strokeWidth = identical(rung, next) ? 2 : 1.2
          ..color = rung.filled ? rungFilled : (identical(rung, next) ? rungNext : outline),
      );
    }
  }

  @override
  bool shouldRepaint(_ExitBarPainter old) => old.changePct != changePct || old.plan != plan || old.fill != fill;
}

/// Short caption under the bar: "TP1 ✓ · next TP2 +100%" / "SL −35% · trail armed".
String exitCaption(Position p) {
  final plan = p.exitPlan;
  if (plan == null) return '';
  final parts = <String>[];
  for (var i = 0; i < plan.rungs.length; i++) {
    if (plan.rungs[i].filled) parts.add('TP${i + 1} ✓');
  }
  final nextIdx = plan.rungs.indexWhere((r) => !r.filled);
  if (p.changePct < 0) {
    parts.add('SL −${plan.stopLossPct.abs().round()}%');
    parts.add(plan.trailArmed ? 'trail armed' : 'trail off');
  } else if (nextIdx >= 0) {
    parts.add('next TP${nextIdx + 1} +${plan.rungs[nextIdx].gainPct.round()}%');
    if (plan.trailArmed && parts.length == 1) parts.add('trail armed');
  } else {
    parts.add('trail −${plan.trailPct.round()}% armed');
  }
  return parts.join(' · ');
}
