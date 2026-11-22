import { accessSession } from "@/lib/mock/session-memory";

/**
 * Whether an access cookie may pass the gate.
 * The hosted paper API (`DATA_SOURCE=http`) checks the JWT itself, so any present cookie is forwarded.
 * The mock book accepts only a token this process issued.
 */
export function mockCookieGrantsAccess(token: string | undefined, dataSource: string | undefined): boolean {
  if (!token) return false;
  if (dataSource === "http") return true;
  return accessSession(token) != null;
}
