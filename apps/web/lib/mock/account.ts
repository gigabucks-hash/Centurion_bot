/**
 * Mock account resources (contracts v1.1 §4.10/§4.11): `/me/deletion` and `/devices/{device_id}`.
 * In-memory only; no identity provider, push service or e-mail is contacted. Push tokens are opaque
 * placeholders generated in the browser, never a real Web Push subscription.
 */
import { WireError } from "./store";

const DAY = 86_400_000;
export const DELETION_GRACE_DAYS = 7; // server-side setting (ACCOUNT_DELETION_GRACE_DAYS)

type Deletion = { state: "active" | "pending_deletion" | "deleted"; scheduled_for: string | null; rev: number };
type Device = { id: string; device_id: string; platform: "ios" | "android" | "web" | "desktop"; provider: "fcm" | "apns" | "webpush"; app_version: string; locale: string; rev: number; last_seen_at: string; token: string };

const g = globalThis as unknown as { __sentraAccount?: { deletion: Deletion; devices: Map<string, Device>; seq: number } };
const acct = () => (g.__sentraAccount ??= { deletion: { state: "active", scheduled_for: null, rev: 1 }, devices: new Map(), seq: 0 });

export const getDeletion = (): Deletion => ({ ...acct().deletion });

/** Mock preconditions: re-auth is assumed fresh; the mock has no Real trading wallet, so nothing blocks. */
export function requestDeletion(now = Date.now()) {
  const a = acct();
  if (a.deletion.state === "pending_deletion") throw new WireError("ACCOUNT_DELETION_PENDING");
  a.deletion = { state: "pending_deletion", scheduled_for: new Date(now + DELETION_GRACE_DAYS * DAY).toISOString(), rev: a.deletion.rev + 1 };
  return { ...a.deletion, grace_days: DELETION_GRACE_DAYS };
}

export function cancelDeletion() {
  const a = acct();
  if (a.deletion.state !== "pending_deletion") throw new WireError("NOT_FOUND");
  a.deletion = { state: "active", scheduled_for: null, rev: a.deletion.rev + 1 };
  return { ...a.deletion };
}

const DEVICE_ID = /^[A-Za-z0-9_-]{8,128}$/;
const SEMVER = /^\d+\.\d+\.\d+([-+].*)?$/;

export function registerDevice(deviceId: string, body: Record<string, unknown>, now = Date.now()) {
  const { platform, provider, token, app_version, locale } = body as Record<string, string | undefined>;
  if (!DEVICE_ID.test(deviceId)) throw new WireError("VALIDATION_FAILED", { field: "device_id" });
  if (!["ios", "android", "web", "desktop"].includes(platform ?? "") || !["fcm", "apns", "webpush"].includes(provider ?? "")) throw new WireError("VALIDATION_FAILED", { field: "platform/provider" });
  if (!token || token.length < 16 || !SEMVER.test(app_version ?? "")) throw new WireError("DEVICE_TOKEN_INVALID");
  const a = acct();
  const prev = a.devices.get(deviceId);
  const d: Device = {
    id: prev?.id ?? `dev_${++a.seq}`, device_id: deviceId, platform: platform as Device["platform"], provider: provider as Device["provider"],
    app_version: app_version!, locale: locale ?? "en", rev: (prev?.rev ?? 0) + 1, last_seen_at: new Date(now).toISOString(), token,
  };
  a.devices.set(deviceId, d);
  return publicDevice(d);
}

function publicDevice(d: Device) {
  // The token is never returned (column-level revoke).
  return { id: d.id, device_id: d.device_id, platform: d.platform, provider: d.provider, app_version: d.app_version, locale: d.locale, rev: d.rev, last_seen_at: d.last_seen_at };
}

export const listDevices = () => [...acct().devices.values()].map(publicDevice);

export function revokeDevice(deviceId: string) {
  if (!acct().devices.delete(deviceId)) throw new WireError("NOT_FOUND");
  return { device_id: deviceId, revoked: true };
}
