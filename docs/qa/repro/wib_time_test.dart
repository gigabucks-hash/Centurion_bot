// Repro for BUG_HUNT_v1 F2: mobile prints a WIB label without converting the instant.
//
// Run from C:\cw\app\apps\mobile (real app code, real formatter):
//   flutter test ..\..\docs\qa\repro\wib_time_test.dart
//
// Every assertion is a fact about the shipped code in apps/mobile/lib at HEAD 77a10e3
// (format.dart:8,58 / l10n_format.dart:93 and the call sites that append " WIB").
import 'package:centurion_mobile/core/format.dart';
import 'package:centurion_mobile/core/l10n_format.dart' as l10n;
import 'package:flutter_test/flutter_test.dart';

void main() {
  test('fmtTime formats the DateTime own zone, so a wire UTC instant prints as UTC', () {
    // What GET /positions returns (position_wire() -> to_char(at time zone UTC, ...Z))
    // and what centurion_rpc.dart:374 stores: a UTC DateTime.
    final wire = DateTime.parse('2026-11-06T03:00:00.000Z');
    expect(wire.isUtc, isTrue);

    // UI text is '${fmtTime(closedAt)} WIB' (closed_trade_row.dart:37, positions_screen.dart:339).
    // 03:00Z is 10:00 WIB.
    expect(fmtTime(wire), '03:00');
    expect(fmtTime(wire), isNot('10:00'));
  });

  test('formatTime never applies a zone either; it prints t.hour and appends the label', () {
    final wire = DateTime.parse('2026-11-06T03:00:00.000Z');
    expect(l10n.formatTime(wire, 'id'), '03.00 WIB');
    expect(l10n.formatTime(wire, 'en'), '3:00\u00a0AM WIB');
  });

  test('a device outside WIB gets its own clock labelled WIB (mock path)', () {
    // MockCenturionBackend defaults _clock to DateTime.now (mock_backend.dart:37), i.e. device local.
    final deviceLocal = DateTime(2026, 11, 6, 3, 0);
    // On a UTC+8 device this 03:00 local instant is 02:00 WIB, but the label still says WIB.
    expect(fmtTime(deviceLocal), '03:00');
  });
}