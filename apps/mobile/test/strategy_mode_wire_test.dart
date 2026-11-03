import 'package:flutter/material.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:centurion_mobile/data/api/wire.dart';
import 'package:centurion_mobile/data/models/models.dart';
import 'package:centurion_mobile/features/strategies/strategy_mode.dart';
import 'package:centurion_mobile/l10n/gen/app_localizations.dart';

void main() {
  final id = lookupAppLocalizations(const Locale('id'));
  final en = lookupAppLocalizations(const Locale('en'));

  test('1.1.6 real_locked_reason: known values, null/unknown while locked → other, unlocked → null', () {
    expect(Wire.realLockedReasonOf('needs_owner_approval', locked: true), RealLockedReason.needsOwnerApproval);
    expect(Wire.realLockedReasonOf('gate_not_met', locked: true), RealLockedReason.gateNotMet);
    expect(Wire.realLockedReasonOf('policy', locked: true), RealLockedReason.policy);
    expect(Wire.realLockedReasonOf(null, locked: true), RealLockedReason.other);
    expect(Wire.realLockedReasonOf('new_reason', locked: true), RealLockedReason.other);
    expect(Wire.realLockedReasonOf('policy', locked: false), isNull);
    expect(realLockedReasonText(id, null), 'Belum tersedia saat ini');
    expect(realLockedReasonText(en, RealLockedReason.policy), 'Blocked by wallet rules');
  });

  test('1.1.6 paper_progress: null required → counts + "rule not set"; set → ratio', () {
    final p = Wire.paperProgressOf({
      'days_done': 4,
      'days_required': null,
      'trades_done': 23,
      'trades_required': null,
    })!;
    expect(p.rulesSet, isFalse);
    expect(paperProgressLines(id, p), ['4 hari di Paper', '23 trade selesai', 'Aturan belum ditetapkan']);
    final q = Wire.paperProgressOf({'days_done': 4, 'days_required': 7, 'trades_done': '23', 'trades_required': 30})!;
    expect(paperProgressLines(id, q), ['4/7 hari', '23/30 trade']);
    final half = Wire.paperProgressOf({'days_done': 2, 'days_required': 7, 'trades_done': 1, 'trades_required': null})!;
    expect(paperProgressLines(en, half), ['2/7 days', '1 trade closed', 'Rule not set yet']);
    expect(Wire.paperProgressOf(null), isNull);
  });

  test('wire mode stays practice|real; UI copy says Paper', () {
    expect(Wire.mode(TradeMode.practice), 'practice');
    expect(Wire.modeOf('paper'), isNull);
    expect(en.modePracticeLabel, 'PAPER');
    expect(id.strategyModePaper, 'Paper');
  });
}
