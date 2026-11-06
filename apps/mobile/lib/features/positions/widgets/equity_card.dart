import 'dart:math';

import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';

import '../../../core/format.dart';
import '../../../core/l10n_format.dart' show toWib;
import '../../../core/theme/centurion_theme.dart';
import '../../../core/widgets/common.dart';
import '../../../data/models/models.dart';
import '../../../data/providers.dart';

final equityRangeProvider = StateProvider<EquityRange>((_) => EquityRange.d7);

final equityHistoryProvider = FutureProvider.family<List<PnlPoint>, EquityRange>(
  (ref, range) => ref.watch(portfolioRepositoryProvider).equityHistory(range),
);

const _monthsId = ['Jan', 'Feb', 'Mar', 'Apr', 'Mei', 'Jun', 'Jul', 'Agu', 'Sep', 'Okt', 'Nov', 'Des'];

String _axisLabel(DateTime t, EquityRange r) {
  String two(int v) => v.toString().padLeft(2, '0');
  // Chart labels are WIB too: a UTC instant must not show its UTC hour/day.
  final w = toWib(t);
  return r == EquityRange.d1 ? '${two(w.hour)}:${two(w.minute)}' : '${w.day} ${_monthsId[w.month - 1]}';
}

/// SPEC §6: equity curve (1D/7D/30D/All, high-water mark) above the list.
class EquityCard extends ConsumerWidget {
  const EquityCard({super.key});

  static const _labels = {
    EquityRange.d1: ('1D', '1 hari'),
    EquityRange.d7: ('7D', '7 hari'),
    EquityRange.d30: ('30D', '30 hari'),
    EquityRange.all: ('All', 'semua'),
  };

  @override
  Widget build(BuildContext context, WidgetRef ref) {
    final range = ref.watch(equityRangeProvider);
    final hist = ref.watch(equityHistoryProvider(range));
    final cs = Theme.of(context).colorScheme;
    final tt = Theme.of(context).textTheme;
    return Card(
      key: const Key('equityCard'),
      margin: EdgeInsets.zero,
      child: Padding(
        padding: const EdgeInsets.fromLTRB(AppSpace.s3, AppSpace.s3, AppSpace.s3, AppSpace.s2),
        child: Column(
          crossAxisAlignment: CrossAxisAlignment.start,
          children: [
            Row(
              children: [
                Expanded(child: Text('Equity · ${_labels[range]!.$2}', style: tt.titleSmall)),
                if (hist.valueOrNull case final pts? when pts.length > 1)
                  PnlText(pts.last.equityLamports - pts.first.equityLamports, size: 15),
              ],
            ),
            const SizedBox(height: AppSpace.s2),
            SizedBox(
              height: 96,
              child: hist.when(
                loading: () => const Center(child: CircularProgressIndicator(strokeWidth: 2)),
                error: (e, _) => Center(child: Text('$e')),
                data: (pts) => Semantics(
                  label: 'Kurva equity ${_labels[range]!.$2}',
                  child: CustomPaint(
                    size: Size.infinite,
                    painter: _EquityPainter(
                      pts.map((p) => p.equityLamports.plotValue).toList(),
                      line: cs.primary,
                      hwm: cs.outline,
                    ),
                  ),
                ),
              ),
            ),
            if (hist.valueOrNull case final pts? when pts.isNotEmpty)
              Padding(
                padding: const EdgeInsets.only(top: AppSpace.sHalf),
                child: Row(
                  children: [
                    Text(_axisLabel(pts.first.at, range), style: tt.labelSmall!.copyWith(color: cs.onSurfaceVariant)),
                    Expanded(
                      child: Text(
                        '- - high-water ${fmtSol(pts.map((p) => p.equityLamports).reduce((a, b) => a > b ? a : b))}',
                        textAlign: TextAlign.center,
                        overflow: TextOverflow.ellipsis,
                        style: tt.labelSmall!.copyWith(color: cs.onSurfaceVariant),
                      ),
                    ),
                    Text(_axisLabel(pts.last.at, range), style: tt.labelSmall!.copyWith(color: cs.onSurfaceVariant)),
                  ],
                ),
              ),
            const SizedBox(height: AppSpace.s1),
            Wrap(
              spacing: AppSpace.s1,
              children: [
                for (final r in EquityRange.values)
                  ChoiceChip(
                    key: Key('range_${r.name}'),
                    label: Text(_labels[r]!.$1),
                    selected: r == range,
                    visualDensity: VisualDensity.compact,
                    onSelected: (_) => ref.read(equityRangeProvider.notifier).state = r,
                  ),
              ],
            ),
          ],
        ),
      ),
    );
  }
}

class _EquityPainter extends CustomPainter {
  _EquityPainter(this.values, {required this.line, required this.hwm});
  final List<double> values;
  final Color line, hwm;

  @override
  void paint(Canvas canvas, Size size) {
    if (values.length < 2) return;
    final lo = values.reduce(min), hi = values.reduce(max);
    final span = (hi - lo).abs() < 1e-9 ? 1.0 : hi - lo;
    double y(double v) => size.height - 4 - (v - lo) / span * (size.height - 8);
    // High-water mark (dashed).
    final hy = y(hi);
    final dash = Paint()
      ..color = hwm
      ..strokeWidth = 1;
    for (double x = 0; x < size.width; x += 8) {
      canvas.drawLine(Offset(x, hy), Offset(min(x + 4, size.width), hy), dash);
    }
    final path = Path();
    for (var i = 0; i < values.length; i++) {
      final x = size.width * i / (values.length - 1);
      i == 0 ? path.moveTo(x, y(values[i])) : path.lineTo(x, y(values[i]));
    }
    canvas.drawPath(
      path,
      Paint()
        ..color = line
        ..style = PaintingStyle.stroke
        ..strokeWidth = 2
        ..strokeJoin = StrokeJoin.round,
    );
  }

  @override
  bool shouldRepaint(_EquityPainter old) => old.values != values || old.line != line;
}
