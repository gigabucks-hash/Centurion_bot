# Design-tokens pin and i18n sync (3 Nov 2026)

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

## i18n: ARB = @centurion/i18n 0.4.9 verbatim
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

## errors.json ahead of errors.map.json
`packages/contracts/errors.json` (Backend working tree, still `version: 6`) has 67 codes, but
`@centurion/i18n` 0.4.9 `errors.map.json` covers the 58 at contracts HEAD. `tool/gen_error_l10n.py` adds an
app-local fallback for the other codes: the errors.json catalog message (en/id), which is the same text the
server sends. These codes need copy from UX: AGENT_BUDGET_EXCEEDED, AGENT_REQUEST_EXPIRED,
AGENT_TRADE_DISABLED, BUYS_PAUSED, LOGO_NOT_FOUND, LOGO_REJECTED, LOOSEN_REQUIRES_APP, RESUME_REQUIRES_APP,
SIWS_SESSION_REQUIRED.
