# Vendored pins: contracts, i18n, design-tokens, fonts (3 Nov 2026)

| What | Pin | Where it is enforced |
|---|---|---|
| @centurion/contracts 1.1.6 (errors.json v7, 67 codes) | `4e0d7f3` | `lib/data/api/contracts_pin.dart`; `tool/ci_check_errors.sh` generates from `git show <pin>:packages/contracts/errors.json` |
| @centurion/i18n 0.4.11 (786 keys) | `714beb2` | ARB sha256 in `tool/ci_check_vendored.sh`; `tool/gen_error_l10n.py` + tests read `errors.map.json` at the pin |
| @centurion/design-tokens 0.2.5 | `bd58541` | sha256 in `tool/ci_check_vendored.sh` (G1-blue 0.3.x on hold) |
| Inter Bold (rsms/inter v4.1, OFL) | `5594cee` | sha256 `2883160…947f` in `tool/ci_check_vendored.sh`; `assets/fonts/` + pubspec family `InterIdenticon` (weight 700) |

None of the gates read the monorepo working tree, so other agents' uncommitted work cannot break mobile CI. CI needs
git history for the contracts pin (`fetch-depth: 0`); without it the errors gate falls back to the working-tree file
only if its `version` matches `contractsErrorsJsonVersion`. Bump a pin = copy at the new commit, update the hash/constant,
run gen-l10n / the generators, read the CHANGELOG.

## design-tokens: pinned to 0.2.5
`lib/core/theme/app_tokens.dart` stays on **@centurion/design-tokens 0.2.5** (commit `bd58541`), with only the
rename-only Sentra → Centurion edit applied. The 0.3.x releases (0.3.0 G1-blue palette, 0.3.1 amber guard,
0.3.2+ docs) change colour values and wait for Boss's visual approval of G1-blue, so the app does not adopt them yet.

`tool/ci_check_vendored.sh` checks the copy against a sha256 of that pinned file instead of the package's
working copy. It works on shallow CI clones. To restore the file:

```
git show bd58541:packages/design-tokens/tokens/app_tokens.dart \
  | sed -e 's/Sentra (working name)/Centurion (working name)/' -e 's#@sentra/#@centurion/#g'
```

After G1-blue is approved: copy `packages/design-tokens/tokens/app_tokens.dart`, put the plain `check` line back
in the script, and regenerate goldens.

The coin identicon palette (`coin.identicon.palette.0..11`, `coin.identicon.fg`) and `coin.logo.ring` first
appear in 0.3.0. They are not G1-blue colours: they are the COIN_LOGO spec. `lib/core/widgets/coin_avatar.dart`
carries them as constants until the pin is lifted. The skeleton colour uses the pinned token
(`skeletonBase` #262F43 dark), not 0.3.x #272D3C.

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
