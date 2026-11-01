/**
 * Keyset cursor paging (API_ENDPOINTS 1.1.4 §Lists): `?cursor=&limit<=100` (default 50), newest first by
 * (created_at, id); `next_cursor` opaque (base64url), null on the last page; malformed or foreign cursor →
 * 400 CURSOR_INVALID. The mock encodes `{l: list, t: ms, id}`; clients must treat it as opaque.
 */
export const DEFAULT_LIMIT = 50;
export const MAX_LIMIT = 100;

export class CursorInvalid extends Error {
  constructor() {
    super("CURSOR_INVALID");
  }
}

const b64 = (s: string) => btoa(unescape(encodeURIComponent(s))).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "");
const unb64 = (s: string) => decodeURIComponent(escape(atob(s.replace(/-/g, "+").replace(/_/g, "/"))));

export function encodeCursor(list: string, t: number, id: string): string {
  return b64(JSON.stringify({ l: list, t, id }));
}

export function decodeCursor(list: string, cursor: string): { t: number; id: string } {
  try {
    if (!/^[A-Za-z0-9_-]{1,512}$/.test(cursor)) throw new CursorInvalid();
    const c = JSON.parse(unb64(cursor)) as { l?: unknown; t?: unknown; id?: unknown };
    if (c.l !== list || typeof c.t !== "number" || !Number.isFinite(c.t) || typeof c.id !== "string") throw new CursorInvalid();
    return { t: c.t, id: c.id };
  } catch {
    throw new CursorInvalid();
  }
}

export function parseLimit(raw: string | null): number {
  const n = raw == null ? DEFAULT_LIMIT : Number(raw);
  return Number.isInteger(n) && n >= 1 ? Math.min(n, MAX_LIMIT) : DEFAULT_LIMIT;
}

/** Newest first by (t desc, id desc); returns one page and the cursor of its last row (null on the last page). */
export function paginate<T>(rows: T[], list: string, key: (r: T) => { t: number; id: string }, o: { cursor: string | null; limit: number }): { items: T[]; next_cursor: string | null } {
  const sorted = [...rows].sort((a, b) => {
    const ka = key(a), kb = key(b);
    return kb.t - ka.t || (kb.id < ka.id ? -1 : kb.id > ka.id ? 1 : 0);
  });
  let start = 0;
  if (o.cursor) {
    const c = decodeCursor(list, o.cursor);
    start = sorted.findIndex((r) => {
      const k = key(r);
      return k.t < c.t || (k.t === c.t && k.id < c.id);
    });
    if (start < 0) start = sorted.length;
  }
  const items = sorted.slice(start, start + o.limit);
  const last = items[items.length - 1];
  const more = start + o.limit < sorted.length;
  return { items, next_cursor: more && last ? encodeCursor(list, key(last).t, key(last).id) : null };
}
