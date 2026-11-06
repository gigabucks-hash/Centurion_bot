// BUG_HUNT_v2 — retest F2 at main 97faf0a.
// F2: every "WIB" label must convert the instant to Asia/Jakarta (UTC+7) first.
//
// Run from C:\cw\app\apps\mobile (real app code, real formatters):
//   flutter test ..\..\docs\qa\repro\v2\f2_wib_retest.dart
import 'package:centurion_mobile/core/format.dart';
import 'package:centurion_mobile/core/l10n_format.dart' as l10n;
import 'package:flutter_test/flutter_test.dart';

void main() {
  // What GET /positions returns (position_wire() -> ...Z) and what centurion_rpc.dart stores.
  final wire = DateTime.parse('2026-11-06T03:00:00.000Z');

  test('fmtTime converts a wire UTC instant to WIB (03:00Z -> 10:00)', () {
    expect(wire.isUtc, isTrue);
    expect(fmtTime(wire), '10:00');
    expect(fmtTime(wire), isNot('03:00'));
  });

  test('formatTime converts too, for both locales', () {
    expect(l10n.formatTime(wire, 'id'), '10.00 WIB');
    expect(l10n.formatTime(wire, 'en'), '10:00\u00a0AM WIB');
  });

  test('toWib is a pure UTC+7 shift, independent of the device zone', () {
    final w = l10n.toWib(wire);
    expect(w.hour, 10);
    expect(w.minute, 0);
    expect(w.day, 6);
    // Crossing midnight: 2026-11-05T20:30Z is 2026-11-06 03:30 WIB.
    final late = l10n.toWib(DateTime.parse('2026-11-05T20:30:00.000Z'));
    expect([late.month, late.day, late.hour, late.minute], [11, 6, 3, 30]);
  });
}