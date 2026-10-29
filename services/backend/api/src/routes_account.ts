// Account-level endpoints: /v1/me, push devices (4.9) and account deletion (4.10).
import { ApiError } from "./errors.ts";
import { asService, asUser } from "./db.ts";
import { readJson, send, type Router } from "./http.ts";
import { idempotencyKey, requireApp } from "./rules.ts";
import { idempotent } from "./idem.ts";
import { authenticate, type Deps } from "./deps.ts";
import { iso } from "./wire.ts";

const DEVICE_ID = /^[A-Za-z0-9._:-]{8,128}$/;
const PLATFORMS = ["ios", "android", "macos", "windows", "linux", "web"];
const PROVIDERS = ["fcm", "apns", "webpush"];

function deletionWire(u: Record<string, unknown>) {
  return {
    state: u.deletion_state,
    requested_at: iso(u.deletion_requested_at),
    scheduled_for: iso(u.deletion_scheduled_for),
    cancelled_at: iso(u.deletion_cancelled_at),
    rev: u.rev,
  };
}

export function registerAccount(r: Router, d: Deps): void {
  r.add("GET", "/v1/me", async (ctx) => {
    const p = authenticate(ctx, d.cfg);
    const u = await asUser(d.db, p.claims, async (c) =>
      (await c.query("select id, display_name, created_at, rev, deletion_state from public.users where id = auth.uid()")).rows[0],
    );
    if (!u) throw new ApiError("NOT_FOUND");
    send(ctx, 200, { data: { ...u, created_at: iso(u.created_at), scopes: [...p.scopes], client: p.via } });
  });

  // ---- devices ----------------------------------------------------------------------------------
  r.add("GET", "/v1/devices", async (ctx) => {
    const p = authenticate(ctx, d.cfg);
    requireApp(p);
    const items = await asUser(d.db, p.claims, async (c) => {
      const q = await c.query(
        `select id, device_id, platform, provider, app_version, locale, rev, last_seen_at, created_at
           from public.device_tokens where revoked_at is null order by last_seen_at desc nulls last limit 50`,
      );
      return q.rows.map((x) => ({ ...x, last_seen_at: iso(x.last_seen_at), created_at: iso(x.created_at) }));
    });
    send(ctx, 200, { items, next_cursor: null });
  });

  // RLS limits device_tokens to the caller; user_id and token are not even selectable.
  /** Upsert: the push token itself is write-only and never returned. */
  r.add("PUT", "/v1/devices/:device_id", async (ctx) => {
    const p = authenticate(ctx, d.cfg);
    requireApp(p);
    const id = ctx.params.device_id ?? "";
    if (!DEVICE_ID.test(id)) throw new ApiError("VALIDATION_FAILED", { field: "device_id" });
    const b = await readJson(ctx);
    if (typeof b.platform !== "string" || !PLATFORMS.includes(b.platform)) throw new ApiError("VALIDATION_FAILED", { field: "platform", allowed: PLATFORMS });
    if (typeof b.provider !== "string" || !PROVIDERS.includes(b.provider)) throw new ApiError("VALIDATION_FAILED", { field: "provider", allowed: PROVIDERS });
    if (typeof b.token !== "string" || b.token.length < 16 || b.token.length > 4096) throw new ApiError("DEVICE_TOKEN_INVALID");
    const appVersion = typeof b.app_version === "string" ? b.app_version.slice(0, 32) : null;
    const locale = typeof b.locale === "string" && /^[a-z]{2}(-[A-Z]{2})?$/.test(b.locale) ? b.locale : "id-ID";
    const out = await asUser(d.db, p.claims, async (c) =>
      (await c.query("select public.register_device($1, $2, $3, $4, $5, $6) as r", [id, b.platform, b.provider, b.token, appVersion, locale])).rows[0]?.r,
    );
    send(ctx, 200, { data: out });
  });

  r.add("DELETE", "/v1/devices/:device_id", async (ctx) => {
    const p = authenticate(ctx, d.cfg);
    requireApp(p);
    const id = ctx.params.device_id ?? "";
    if (!DEVICE_ID.test(id)) throw new ApiError("NOT_FOUND");
    const ok = await asUser(d.db, p.claims, async (c) => (await c.query<{ r: boolean }>("select public.revoke_device($1) as r", [id])).rows[0]?.r);
    if (!ok) throw new ApiError("NOT_FOUND");
    send(ctx, 200, { data: { device_id: id, revoked: true } });
  });

  // ---- account deletion -------------------------------------------------------------------------
  r.add("GET", "/v1/me/deletion", async (ctx) => {
    const p = authenticate(ctx, d.cfg);
    requireApp(p);
    const u = await asUser(d.db, p.claims, async (c) =>
      (await c.query("select deletion_state, deletion_requested_at, deletion_scheduled_for, deletion_cancelled_at, rev from public.users where id = auth.uid()")).rows[0],
    );
    if (!u) throw new ApiError("NOT_FOUND");
    send(ctx, 200, { data: { ...deletionWire(u), grace_days: d.cfg.accountDeletionGraceDays } });
  });

  /**
   * Request deletion. Needs a fresh re-auth (`reauth_at` claim within 5 minutes) and an Idempotency-Key.
   * The grace period is the server's ACCOUNT_DELETION_GRACE_DAYS (7-30); clients cannot choose it.
   */
  r.add("POST", "/v1/me/deletion", async (ctx) => {
    const p = authenticate(ctx, d.cfg);
    requireApp(p);
    const body = await readJson(ctx);
    if (body.grace_days !== undefined) throw new ApiError("VALIDATION_FAILED", { field: "grace_days", hint: "server-side setting" });
    const key = idempotencyKey(ctx);
    const ra = p.claims.reauth_at;
    const reauth = typeof ra === "number" ? new Date(ra * 1000).toISOString() : typeof ra === "string" && !Number.isNaN(Date.parse(ra)) ? ra : null;
    await idempotent(ctx, d.db, p, key, body, async () => {
      const out = await asService(d.db, async (c) =>
        (await c.query("select public.request_account_deletion($1, $2, $3, $4) as r", [p.userId, reauth, d.cfg.accountDeletionGraceDays, p.via])).rows[0]?.r as Record<string, unknown>,
      );
      const { server_now, ...data } = out;
      return { status: 202, body: { data: { ...data, scheduled_for: iso(data.scheduled_for), grace_days: d.cfg.accountDeletionGraceDays }, server_now } };
    });
  });

  r.add("DELETE", "/v1/me/deletion", async (ctx) => {
    const p = authenticate(ctx, d.cfg);
    requireApp(p);
    const out = await asService(d.db, async (c) =>
      (await c.query("select public.cancel_account_deletion($1, $2) as r", [p.userId, p.via])).rows[0]?.r as Record<string, unknown>,
    );
    const { server_now, ...data } = out ?? {};
    send(ctx, 200, { data, server_now });
  });
}
