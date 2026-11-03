/// The @centurion/contracts commit this app is built against (CI gate: tool/ci_check_errors.sh; tests:
/// test/support/contracts_source.dart). Generated Dart tables (api_errors.g.dart) come from
/// `git show <contractsPin>:packages/contracts/errors.json`, not from whatever the working tree has.
/// Bump all three together after reviewing the contracts CHANGELOG.
const contractsPin = '4e0d7f3';
const contractsVersion = '1.1.6';
const contractsErrorsJsonVersion = 7;

/// @centurion/i18n commit the ARB copies and error_l10n.g.dart come from (tool/ci_check_vendored.sh pins the ARB
/// bytes by sha256; tool/gen_error_l10n.py and tests read errors.map.json at this commit).
const i18nPin = '714beb2';
const i18nVersion = '0.4.11';
