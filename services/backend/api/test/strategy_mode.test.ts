// 0026: POST /v1/workspaces/:ws/strategies/:id/mode - per-strategy Paper/Real switch (additive to 1.1.6).
// Paper-only phase: practice -> real is always 403 MODE_NOT_ALLOWED (real_locked, needs owner approval);
// real -> practice is kept for the phase-7 contract (exercised here on a phase-7 fixture), same mode is a
// no-write 200, stale rev is 409 with `current`, archived is 403, another workspace is 404.
import { after, before, describe, test } from "node:test";
import assert from "node:assert/strict";
import { OTHER_WS, OWNER, VIEWER, WS, call, startHarness, token, type Harness } from "./helpers.ts";

let h: Harness;
before(async () => {
  h = await startHarness();
});
after(async () => {
  await h?.stop();
});

const S1 = "20000000-0000-0000-0000-0000000000a1";
const base = (ws = WS) => `/v1/workspaces/${ws}/strategies`;
const modePath = (id: string, ws = WS) => `${base(ws)}/${id}/mode`;
const owner = () => token(OWNER, { client: "web" });
const viewer = () => token(VIEWER, { client: "web" });
let n = 0;
const key = () => `mode-key-${Date.now()}-${++n}`;
const isIso = (s: unknown) => typeof s === "string" && /^\d{4}-\d\d-\d\dT\d\d:\d\d:\d\d\.\d{3}Z$/.test(s);

function err(r: { status: number; body: any }, status: number, code: string) {
  assert.equal(r.status, status, JSON.stringify(r.body));
  assert.equal(r.body.error.code, code, JSON.stringify(r.body));
}

async function getStrategy(id = S1) {
  const r = await call(h.base, "GET", `${base()}/${id}`, { token: owner() });
  assert.equal(r.status, 200, JSON.stringify(r.body));
  return r.body.data as any;
}

async function modeEvents(id: string): Promise<number> {
  const q = await h.db.query("select count(*)::int as n from public.events where type = 'strategy.mode_changed' and strategy_id = $1", [id]);
  return q.rows[0].n as number;
}

async function auditMode(id: string): Promise<number> {
  const q = await h.db.query("select count(*)::int as n from public.audit_log where action = 'strategy.mode_changed' and target = $1", [id]);
  return q.rows[0].n as number;
}

const modeCall = (id: string, mode: unknown, o: { rev?: number; key?: string; tok?: string; ws?: string; body?: object } = {}) =>
  call(h.base, "POST", modePath(id, o.ws), {
    token: o.tok ?? owner(),
    headers: {
      "idempotency-key": o.key ?? key(),
      ...(o.rev === undefined ? {} : { "if-match": `"${o.rev}"` }),
    },
    body: { mode, ...(o.body ?? {}) },
  });

describe("strategy mode switch", () => {
  test("rev required (428), mode validated, trade scope and write role required", async () => {
    err(await modeCall(S1, "practice"), 428, "PRECONDITION_REQUIRED");
    const rev = (await getStrategy()).rev;
    err(await modeCall(S1, "live", { rev }), 422, "VALIDATION_FAILED");
    err(await modeCall(S1, "practice", { rev, tok: token(OWNER, { scopes: ["read"] }) }), 403, "FORBIDDEN_SCOPE");
    err(await modeCall(S1, "practice", { rev, tok: viewer() }), 403, "FORBIDDEN_ROLE");
  });

  test("stale rev -> 409 with the current strategy, no write", async () => {
    const before = await getStrategy();
    const r = await modeCall(S1, "practice", { rev: before.rev - 1 });
    assert.equal(r.status, 409, JSON.stringify(r.body));
    assert.equal(r.body.error.code, "STRATEGY_REV_CONFLICT");
    assert.equal(r.body.error.current_rev, before.rev);
    assert.equal(r.body.error.base_rev, before.rev - 1);
    assert.equal(r.body.error.current.id, S1);
    assert.equal(r.body.error.current.rev, before.rev);
    assert.equal((await getStrategy()).rev, before.rev, "nothing applied");
  });

  test("practice -> real is always 403 MODE_NOT_ALLOWED (real_locked), no rev bump, no event", async () => {
    const before = await getStrategy();
    const ev = await modeEvents(S1);
    const au = await auditMode(S1);
    const r = await modeCall(S1, "real", { rev: before.rev });
    err(r, 403, "MODE_NOT_ALLOWED");
    assert.equal(r.body.error.reason, "real_locked");
    assert.equal(r.body.error.real_locked_reason, "needs_owner_approval");
    assert.match(String(r.body.error.hint), /owner approval/i);
    const after = await getStrategy();
    assert.equal(after.mode, "practice");
    assert.equal(after.rev, before.rev);
    assert.equal(await modeEvents(S1), ev, "no mode event");
    assert.equal(await auditMode(S1), au, "no audit row");
    assert.equal((await h.db.query("select count(*)::int n from public.strategies where id = $1 and mode = 'real'", [S1])).rows[0].n, 0);
  });

  test("same mode -> 200, no rev bump, no event; retried key replays", async () => {
    const before = await getStrategy();
    const ev = await modeEvents(S1);
    const k = key();
    const r = await modeCall(S1, "practice", { rev: before.rev, key: k });
    assert.equal(r.status, 200, JSON.stringify(r.body));
    assert.equal(r.body.replayed, false);
    assert.equal(r.body.data.id, S1);
    assert.equal(r.body.data.mode, "practice");
    assert.equal(r.body.data.rev, before.rev);
    assert.equal(r.headers.get("etag"), `"${before.rev}"`);
    assert.equal(r.body.data.real_locked, true);
    assert.equal(r.body.data.real_locked_reason, "needs_owner_approval");
    assert.ok(isIso(r.body.server_now));
    assert.equal(await modeEvents(S1), ev, "same mode emits nothing");
    assert.equal((await getStrategy()).rev, before.rev);

    const again = await modeCall(S1, "practice", { rev: before.rev, key: k });
    assert.equal(again.status, 200);
    assert.equal(again.body.replayed, true);
    assert.equal(again.headers.get("idempotent-replayed"), "true");
    err(await modeCall(S1, "practice", { rev: before.rev, key: k, body: { mode: "real" } as any }), 422, "IDEMPOTENCY_KEY_REUSED");
  });

  test("strategy of another workspace -> 404", async () => {
    const rev = (await getStrategy()).rev;
    const r = await modeCall(S1, "practice", { rev, ws: OTHER_WS });
    err(r, 404, "NOT_FOUND");
  });

  test("archived strategy -> 403 MODE_NOT_ALLOWED", async () => {
    const created = await call(h.base, "POST", base(), {
      token: owner(), headers: { "idempotency-key": key() }, body: { name: "Mode archived" },
    });
    assert.equal(created.status, 201, JSON.stringify(created.body));
    const id = created.body.data.id as string;
    const archived = await call(h.base, "POST", `${base()}/${id}/archive`, {
      token: owner(), headers: { "idempotency-key": key(), "if-match": `"${created.body.data.rev}"` }, body: {},
    });
    assert.equal(archived.status, 200, JSON.stringify(archived.body));
    const r = await modeCall(id, "practice", { rev: archived.body.data.rev });
    err(r, 403, "MODE_NOT_ALLOWED");
    assert.equal(r.body.error.reason, "archived");
  });

  // Phase-7 fixture: the strategies table currently has the paper-only CHECK, so real rows cannot exist in
  // production. Drop it only inside the throwaway test database, seed one Real row, then put the CHECK back
  // NOT VALID (still enforced for every new row/update) so the switch down to practice can be exercised.
  test("real -> practice flips mode, bumps rev, audits and emits strategy.mode_changed", async () => {
    const created = await call(h.base, "POST", base(), {
      token: owner(), headers: { "idempotency-key": key() }, body: { name: "Mode phase7" },
    });
    assert.equal(created.status, 201, JSON.stringify(created.body));
    const id = created.body.data.id as string;

    await h.db.query("alter table public.strategies drop constraint strategies_practice_only");
    try {
      await h.db.query("update public.strategies set mode = 'real' where id = $1", [id]);
      await h.db.query("alter table public.strategies add constraint strategies_practice_only check (mode = 'practice') not valid");
    } catch (e) {
      await h.db.query("alter table public.strategies add constraint strategies_practice_only check (mode = 'practice') not valid").catch(() => undefined);
      throw e;
    }
    const seeded = await h.db.query("select rev, mode, updated_at from public.strategies where id = $1", [id]);
    assert.equal(seeded.rows[0].mode, "real");
    const baseRev = seeded.rows[0].rev as number;

    // A real row is only visible to a token carrying trade:real (RLS mode_visible); that scope is never issued
    // before phase 7, so this token exists only in the fixture.
    const phase7 = () => token(OWNER, { client: "web", scopes: ["read", "trade", "trade:real"] });
    const r = await call(h.base, "POST", modePath(id), {
      token: phase7(),
      headers: { "idempotency-key": key(), "if-match": `"${baseRev}"` },
      body: { mode: "practice" },
    });
    assert.equal(r.status, 200, JSON.stringify(r.body));
    assert.equal(r.body.data.mode, "practice");
    assert.equal(r.body.data.rev, baseRev + 1, "mode change bumps rev");
    assert.equal(r.headers.get("etag"), `"${baseRev + 1}"`);
    assert.equal(r.body.data.real_locked, true);
    assert.ok(isIso(r.body.server_now));

    const row = (await h.db.query("select rev, mode from public.strategies where id = $1", [id])).rows[0];
    assert.equal(row.mode, "practice");
    assert.equal(row.rev, baseRev + 1);

    const ev = (await h.db.query("select payload from public.events where strategy_id = $1 and type = 'strategy.mode_changed' order by seq desc limit 1", [id])).rows[0];
    assert.ok(ev, "mode event emitted");
    assert.deepEqual(ev.payload, { rev: baseRev + 1, base_rev: baseRev, from_mode: "real", to_mode: "practice" });

    const au = (await h.db.query("select action, before, after, actor_via from public.audit_log where target = $1 and action = 'strategy.mode_changed' order by id desc limit 1", [id])).rows[0];
    assert.ok(au, "audit row written");
    assert.deepEqual(au.before, { mode: "real", rev: baseRev });
    assert.deepEqual(au.after, { mode: "practice", rev: baseRev + 1 });
    assert.equal(au.actor_via, "web");

    // Mode is first-class in the revision history and in a stale-writer conflict.
    const revBase = await call(h.base, "GET", `${base()}/${id}/revisions/${baseRev}`, { token: phase7() });
    assert.equal(revBase.status, 200, JSON.stringify(revBase.body));
    assert.equal(revBase.body.data.mode, "real");
    const revList = await call(h.base, "GET", `${base()}/${id}/revisions`, { token: phase7() });
    assert.equal(revList.status, 200, JSON.stringify(revList.body));
    assert.equal(revList.body.items[0].rev, baseRev + 1);
    assert.equal(revList.body.items[0].mode, "practice");
    const stale = await call(h.base, "PATCH", `${base()}/${id}`, {
      token: phase7(), headers: { "idempotency-key": key(), "if-match": `"${baseRev}"` }, body: {},
    });
    assert.equal(stale.status, 409, JSON.stringify(stale.body));
    assert.equal(stale.body.error.code, "STRATEGY_REV_CONFLICT");
    assert.ok(stale.body.error.changed_fields.includes("mode"), JSON.stringify(stale.body.error.changed_fields));

    // Already practice: another switch is the no-write 200 and does not append a second event.
    const same = await modeCall(id, "practice", { rev: baseRev + 1 });
    assert.equal(same.status, 200, JSON.stringify(same.body));
    assert.equal(same.body.data.rev, baseRev + 1);
    assert.equal((await h.db.query("select count(*)::int n from public.events where strategy_id = $1 and type = 'strategy.mode_changed'", [id])).rows[0].n, 1);
  });
});
