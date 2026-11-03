// Pure (unit-tested under node).
/**
 * Wire `IsoTs` (e.g. `next_allowed_at`): RFC 3339 in UTC with milliseconds and `Z`, exactly
 * `YYYY-MM-DDTHH:MM:SS.mmmZ` (e.g. `2026-11-04T08:06:04.312Z`, Backend 404efd6). Anything else → null
 * (never a guessed local parse). Returns epoch ms; the UI shows it in the user's local time zone.
 */
export function parseIsoTs(v: unknown): number | null {
  if (typeof v !== "string" || !/^\d{4}-(0[1-9]|1[0-2])-(0[1-9]|[12]\d|3[01])T([01]\d|2[0-3]):[0-5]\d:[0-5]\d\.\d{3}Z$/.test(v)) return null;
  const ms = Date.parse(v);
  // reject impossible dates that Date.parse would roll over (e.g. 2026-02-30)
  return Number.isFinite(ms) && new Date(ms).toISOString() === v ? ms : null;
}
