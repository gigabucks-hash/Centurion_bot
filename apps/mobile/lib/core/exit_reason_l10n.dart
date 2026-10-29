import '../data/api/settings_keys.dart';
import '../l10n/gen/app_localizations.dart';

/// Wire `exit_reason` (contracts 1.1.4 EXIT_REASONS, 14 values) → i18n `exit_reason.*`.
/// v1.0 aliases are normalized first; 1.1.4 `stall` (stall_exit) is NOT the v1.0
/// `stall` (= no_new_high): the current name wins in [ExitReasons.normalize].
String exitReasonLabel(AppLocalizations l, String wire) {
  final labels = <String, String Function()>{
    ExitReasons.sellFloor.current: () => l.exitReasonSellFloor,
    ExitReasons.profitTarget.current: () => l.exitReasonProfitTarget,
    ExitReasons.lossGuard.current: () => l.exitReasonLossGuard,
    ExitReasons.peakTrail.current: () => l.exitReasonPeakTrail,
    ExitReasons.maxHold.current: () => l.exitReasonMaxHold,
    ExitReasons.idle.current: () => l.exitReasonIdle,
    ExitReasons.sellPressure.current: () => l.exitReasonSellPressure,
    ExitReasons.noNewHigh.current: () => l.exitReasonNoNewHigh,
    ExitReasons.rugDetected.current: () => l.exitReasonRugDetected,
    ExitReasons.drawdownHalt.current: () => l.exitReasonDrawdownHalt,
    ExitReasons.manual.current: () => l.exitReasonManual,
    ExitReasons.strategyRetired.current: () => l.exitReasonStrategyRetired,
    ExitReasons.practiceReset.current: () => l.exitReasonPracticeReset,
    ExitReasons.stall.current: () => l.exitReasonStall,
  };
  final key = ExitReasons.normalize(wire);
  return labels[key]?.call() ?? key;
}
