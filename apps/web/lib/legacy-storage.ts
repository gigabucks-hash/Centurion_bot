/**
 * Pre-rename storage keys (the app was renamed to Centurion on 3 Nov 2026). Read-only, one-time fallback so a
 * saved UI preference or local draft survives the rename: the old value is copied to the new key and removed.
 * Auth cookies are deliberately NOT migrated (a re-login is expected). Delete this file after one release.
 */
export const LEGACY_PREFIX = "sentra";
export const LEGACY_LOCALE_COOKIE = "sentra_locale";

/** `centurion_draft_x` -> `sentra_draft_x`; `centurion.device_id` -> `sentra.device_id`. */
export function legacyKey(key: string): string {
  return key.replace(/^centurion/, LEGACY_PREFIX);
}

/** localStorage read with the one-time legacy fallback (moves the old value to `key`). */
export function readMigrated(store: Storage, key: string): string | null {
  const v = store.getItem(key);
  if (v !== null) return v;
  const old = legacyKey(key);
  if (old === key) return null;
  const legacy = store.getItem(old);
  if (legacy === null) return null;
  try {
    store.setItem(key, legacy);
    store.removeItem(old);
  } catch {
    /* storage full / disabled: still return the legacy value */
  }
  return legacy;
}
