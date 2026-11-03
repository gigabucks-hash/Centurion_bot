import 'dart:io';

import 'package:centurion_mobile/data/api/contracts_pin.dart';

/// errors.json at [contractsPin]; `$ERRORS_JSON` overrides. Falls back to the working-tree file only when git
/// history is unavailable (shallow clone), mirroring tool/ci_check_errors.sh.
String pinnedErrorsJson() {
  final override = Platform.environment['ERRORS_JSON'];
  if (override != null) return File(override).readAsStringSync();
  final r = Process.runSync('git', ['show', '$contractsPin:packages/contracts/errors.json']);
  if (r.exitCode == 0) return r.stdout as String;
  return File('../../packages/contracts/errors.json').readAsStringSync();
}

/// `packages/i18n/<path>` at [i18nPin] (working tree only without git history).
String pinnedI18n(String path) {
  final r = Process.runSync('git', ['show', '$i18nPin:packages/i18n/$path']);
  if (r.exitCode == 0) return r.stdout as String;
  return File('../../packages/i18n/$path').readAsStringSync();
}
