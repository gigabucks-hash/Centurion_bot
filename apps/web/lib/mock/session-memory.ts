/**
 * In-memory mock sessions. Kept separate from the paper book so the request proxy can
 * check an access cookie without loading the trading store.
 * Nothing here is a credential: tokens are random strings for this process only.
 */

export interface Family {
  address: string;
  userId: string;
  revoked: boolean;
  current: string;
  refreshExp: number;
}

interface AccessRow { sid: string; exp: number }

interface SessionTables {
  families: Map<string, Family>;
  refresh: Map<string, string>;
  access: Map<string, AccessRow>;
}

const g = globalThis as unknown as { __centurionSessions?: SessionTables };

export const sessions: SessionTables = (g.__centurionSessions ??= {
  families: new Map(),
  refresh: new Map(),
  access: new Map(),
});

/** Valid, unexpired access token whose family has not been revoked. */
export function accessSession(accessToken: string | undefined, now = Date.now()) {
  const a = accessToken ? sessions.access.get(accessToken) : undefined;
  const f = a ? sessions.families.get(a.sid) : undefined;
  if (!a || !f || f.revoked || now > a.exp) return null;
  return { session_id: a.sid, address: f.address, expires_at: new Date(a.exp).toISOString() };
}
