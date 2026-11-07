import type { T } from "./i18n/core";

/**
 * D8: the sell hold's "Released early" note is only meaningful after the user has interacted with the control.
 * While idle the hint is `undefined`, so nothing claims a release before the first pointer-down / key press.
 */
export function sellHoldHint(t: T, released: boolean): string | undefined {
  return released ? t.ux("positions.sell.hold.released") : undefined;
}
