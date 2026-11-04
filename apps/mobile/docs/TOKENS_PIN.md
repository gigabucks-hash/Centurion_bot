# Vendored pins: contracts, i18n, design-tokens, fonts (3 Nov 2026)

| What | Pin | Where it is enforced |
|---|---|---|
| @centurion/contracts 1.1.6 (errors.json v7, 67 codes) | `4e0d7f3` | `lib/data/api/contracts_pin.dart`; `tool/ci_check_errors.sh` generates from `git show <pin>:packages/contracts/errors.json` |
| @centurion/i18n 0.4.11 (786 keys) | `714beb2` | ARB sha256 in `tool/ci_check_vendored.sh`; `tool/gen_error_l10n.py` + tests read `errors.map.json` at the pin |
| @centurion/design-tokens 0.3.4 | `5234c44` | sha256 in `tool/ci_check_vendored.sh` (G1-blue; adoption pending Boss sign-off) |
| Inter Bold (rsms/inter v4.1, OFL) | `5594cee` | sha256 `2883160…947f` in `tool/ci_check_vendored.sh`; `assets/fonts/` + pubspec family `InterIdenticon` (weight 700) |

None of the gates read the monorepo working tree, so other agents' uncommitted work cannot break mobile CI. CI needs
git history for the contracts pin (`fetch-depth: 0`); without it the errors gate falls back to the working-tree file
only if its `version` matches `contractsErrorsJsonVersion`. Bump a pin = copy at the new commit, update the hash/constant,
run gen-l10n / the generators, read the CHANGELOG.

## design-tokens: 0.3.4 (G1-blue)
`lib/core/theme/app_tokens.dart` is a **verbatim copy** of **@centurion/design-tokens 0.3.4** (commit `5234c44`).
The 0.3.x generator header already reads "Centurion Trade (@centurion/design-tokens)", so no rename edit is needed.

`tool/ci_check_vendored.sh` pins the sha256 of that copy (`5043960aa540…`) instead of reading the package working
tree, so other agents' uncommitted token work cannot break mobile CI and shallow clones work. To restore:

```
git show 5234c44:packages/design-tokens/tokens/app_tokens.dart > lib/core/theme/app_tokens.dart
```

Palette vs 0.2.5: accent violet → G1-blue (`brandPrimary` #4F8CFF dark / #2456D6 light), guard violet → amber,
plus the 0.3.0 surface/border/text steps. Three test expectations follow the new values
(`i18n_reference_test.dart` bgSunken + skeletonBase, `theme_tokens_test.dart` outline). Coin identicons are unchanged
(`test/goldens/coin_identicons.png` still valid); any screenshot goldens must be re-recorded.

`coin.logo.ring` and the identicon palette now come from tokens, so `lib/core/widgets/coin_avatar.dart` no longer
hard-codes `Color(0x1FFFFFFF)` / `Color(0x1A0F1420)`.

Adoption patch prepared by UX as a review diff; **not applied** to the app until Boss signs off on the G1-blue look.
0.3.4 tokens mobile does not use yet: `bgChrome`, `scrimSheet`, `shadowCard`, `shadowDialog`, `semanticOnWarning`
(wiring them restyles the tab bar / sheets and is a separate change).

## i18n history
0.4.11 (714beb2) removed `kill_switch.action.open` and `kill_switch.dialog.effect.buys` (no Dart usage); 0.4.10 added
97 keys incl. the 9 errors-v7 `error.code.*` messages (app-local fallbacks gone) and Paper copy.

### 0.4.9 sync notes
- Removed (only existed in the app copy; no call sites): `kill_switch.option.exits_freeze`,
  `kill_switch.option.revoke`, `kill_switch.reenable.action`, `kill_switch.reenable.resume_note`,
  `kill_switch.revoke_pending`, `wallet.owner.add_backup`, `wallet.owner.backup`.
- Signature changes after `flutter gen-l10n` (args are alphabetical; check call sites when syncing):
  - `notifRealSellAllCompletedBody(failed_count, requested_count, sold_count)` (new middle arg);
  - `notifRealSellAllRequestedBody(requested_count)`;
  - `notifRealSellAllCompletedTotal(amount_out_lamports)`;
  - `notifRealDepositDetectedBody` lost `cap_lamports`;
  - `notifRealKillSwitchClearedBody(signer_state)` is now a method;
  - `killSwitchStatusExits` is now a getter;
  - `queueTabWithCount(int count, ...)`.
  Only tests called them (Phase 7 reserved copy).
- The 12 G1-blue copy keys are in the ARB but unused: no G1-blue UI is built.

## errors.json vs errors.map.json
Since i18n 0.4.10 errors.map.json covers all 67 codes. `tool/gen_error_l10n.py` still emits the errors.json-message
fallback automatically if contracts ever run ahead of i18n again.
