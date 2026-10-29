// Phase 2 second milestone: strategies, reads, devices, account deletion, audit, shared SSE feed, practice reset.
import { after, before, describe, test } from "node:test";
import assert from "node:assert/strict";
import { OTHER_WS, OUTSIDER, OWNER, POS, VIEWER, WS, call, readSse, startHarness, token, type Harness } from "./helpers.ts";

let h: Harness;
before(async () => {
  h = await startHarness();
});
after(async () => {
  await h?.stop();
});

const MINT = "Co68LzYNQArj5fmRmh4o2TVeEVx6FfaLiyRgDAjtpump";
const S1 = "20000000-0000-0000-0000-0000000000a1";
const owner = () => token(OWNER, { client: "desktop" });
const viewer = () => token(VIEWER, { client: "mobile" });
const isIso = (s: unknown) => typeof s === "string" && /^\d{4}-\d\d-\d\dT\d\d:\d\d:\d\d\.\d{3}Z$/.test(s);
let n = 0;
const key = () => `test-key-${Date.now()}-${++n}`;

function err(r: { status: number; body: any }, status: number, code: string) {
  assert.equal(r.status, status, JSON.stringify(r.body));
  assert.equal(r.body.error.code, code, JSON.stringify(r.body));
}

describe("strategies CRUD with rev", () => {
  let id = "";
  let rev = 0;
  const path = (s = "") => `/v1/workspaces/${WS}/strategies${s}`;

  test("create: 201 + ETag + Location; validation, role and scope", async () => {
    err(await call(h.base, "POST", path(), { token: owner(), body: { name: "x" } }), 428, "PRECONDITION_REQUIRED");
    err(await call(h.base, "POST", path(), { token: owner(), headers: { "idempotency-key": key() }, body: { name: "" } }), 422, "VALIDATION_FAILED");
    err(await call(h.base, "POST", path(), { token: owner(), headers: { "idempotency-key": key() }, body: { name: "x", status: "running" } }), 422, "VALIDATION_FAILED");
    err(await call(h.base, "POST", path(), { token: viewer(), headers: { "idempotency-key": key() }, body: { name: "x" } }), 403, "FORBIDDEN_ROLE");
    err(await call(h.base, "POST", path(), { token: token(OWNER, { scopes: ["read"] }), headers: { "idempotency-key": key() }, body: { name: "x" } }), 403, "FORBIDDEN_SCOPE");
    err(await call(h.base, "POST", path(), { token: owner(), headers: { "idempotency-key": key() }, body: { name: "x", mode: "real" } }), 403, "REAL_SOL_DISABLED");
    const k = key();
    const r = await call(h.base, "POST", path(), { token: owner(), headers: { "idempotency-key": k }, body: { name: "Momentum", settings: { score_threshold: 70 } } });
    assert.equal(r.status, 201, JSON.stringify(r.body));
    assert.equal(r.body.replayed, false);
    id = r.body.data.id;
    rev = r.body.data.rev;
    assert.equal(r.body.data.status, "draft");
    assert.equal(r.body.data.mode, "practice");
    assert.equal(r.headers.get("etag"), `"${rev}"`);
    assert.equal(r.headers.get("location"), path(`/${id}`));
    assert.ok(isIso(r.body.server_now));
    const again = await call(h.base, "POST", path(), { token: owner(), headers: { "idempotency-key": k }, body: { name: "Momentum", settings: { score_threshold: 70 } } });
    assert.equal(again.status, 201);
    assert.equal(again.body.replayed, true);
    assert.equal(again.headers.get("idempotent-replayed"), "true");
    assert.equal(again.body.data.id, id, "replay returns the same strategy");
    err(await call(h.base, "POST", path(), { token: owner(), headers: { "idempotency-key": k }, body: { name: "Other" } }), 422, "IDEMPOTENCY_KEY_REUSED");
  });

  test("list and get (ETag), outsider 404/403", async () => {
    const l = await call(h.base, "GET", path("?mode=practice"), { token: viewer() });
    assert.equal(l.status, 200);
    assert.ok(l.body.items.some((s: any) => s.id === id) && l.body.items.some((s: any) => s.id === S1));
    const f = await call(h.base, "GET", path("?status=running"), { token: viewer() });
    assert.deepEqual(f.body.items.map((s: any) => s.id), [S1]);
    const g = await call(h.base, "GET", path(`/${id}`), { token: viewer() });
    assert.equal(g.status, 200);
    assert.equal(g.headers.get("etag"), `"${rev}"`);
    assert.deepEqual(g.body.data.settings, { score_threshold: 70 });
    assert.equal((await call(h.base, "GET", path(`/${id}`), { token: token(OUTSIDER) })).status, 404);
    assert.equal((await call(h.base, "GET", `/v1/workspaces/${OTHER_WS}/strategies/${id}`, { token: token(OUTSIDER) })).status, 404);
  });

  test("PATCH: If-Match required, merge patch applied, stale rev -> 409 with current", async () => {
    err(await call(h.base, "PATCH", path(`/${id}`), { token: owner(), headers: { "idempotency-key": key() }, body: { name: "M2" } }), 428, "PRECONDITION_REQUIRED");
    err(await call(h.base, "PATCH", path(`/${id}`), { token: owner(), headers: { "idempotency-key": key(), "if-match": `"${rev}"` }, body: { settings: {} } }), 422, "VALIDATION_FAILED");
    const r = await call(h.base, "PATCH", path(`/${id}`), {
      token: owner(), headers: { "idempotency-key": key(), "if-match": `"${rev}"` }, body: { name: "M2", settings_patch: { idle_exit_seconds: 600 } },
    });
    assert.equal(r.status, 200, JSON.stringify(r.body));
    assert.equal(r.body.data.name, "M2");
    assert.deepEqual(r.body.data.settings, { score_threshold: 70, idle_exit_seconds: 600 });
    assert.equal(r.body.data.rev, rev + 1);
    assert.equal(r.headers.get("etag"), `"${rev + 1}"`);
    const stale = await call(h.base, "PATCH", path(`/${id}`), { token: owner(), headers: { "idempotency-key": key(), "if-match": `"${rev}"` }, body: { name: "M3" } });
    assert.equal(stale.status, 409, JSON.stringify(stale.body));
    assert.match(stale.body.error.code, /^(STRATEGY_REV_CONFLICT|VERSION_CONFLICT)$/);
    assert.equal(stale.body.error.current_rev, rev + 1);
    assert.equal(stale.body.error.base_rev, rev);
    assert.equal(stale.body.error.current.id, id, "current is always present on 409");
    assert.equal(stale.body.error.current.rev, rev + 1);
    rev += 1;
    err(await call(h.base, "PATCH", path(`/${id}`), { token: viewer(), headers: { "idempotency-key": key(), "if-match": `"${rev}"` }, body: { name: "v" } }), 403, "FORBIDDEN_ROLE");
  });

  test("guard weakening -> 202 proposal (nothing applied); strengthening applies; mixed -> proposal; hold-confirmed approval applies", async () => {
    const patch = (body: object, tok = owner()) =>
      call(h.base, "PATCH", path(`/${id}`), { token: tok, headers: { "idempotency-key": key(), "if-match": `"${rev}"` }, body });
    const strong = await patch({ settings_patch: { guard_checks: { creator_share_pct_fail: 10 }, top_holders_share_pct_max: 30 } });
    assert.equal(strong.status, 200, JSON.stringify(strong.body));
    rev = strong.body.data.rev;

    // merge patch is top-level: guard_checks is replaced whole, so send the full object
    const weak = await patch({ settings_patch: { guard_checks: { creator_share_pct_fail: 10, allow_mint_authority: true } } });
    assert.equal(weak.status, 202, JSON.stringify(weak.body));
    assert.equal(weak.body.data.proposal.kind, "guard_change");
    assert.equal(weak.body.data.proposal.risk, "critical");
    assert.equal(weak.body.data.proposal.base_rev, rev);
    assert.deepEqual(weak.body.data.guard_change.weakened_fields, ["allow_mint_authority"]);
    assert.equal(weak.headers.get("location"), `/v1/workspaces/${WS}/approvals/${weak.body.data.proposal.id}`);
    const hours = (Date.parse(weak.body.data.proposal.expires_at) - Date.parse(weak.body.data.proposal.created_at)) / 3_600_000;
    assert.equal(hours, 24);
    err(await patch({ settings_patch: { guard_checks: { allow_mint_authority: true } }, name: "x" }), 422, "VALIDATION_FAILED");

    const mixed = await patch({ settings_patch: { guard_checks: { creator_share_pct_fail: 5 }, top_holders_share_pct_max: null } });
    assert.equal(mixed.status, 202, JSON.stringify(mixed.body));
    assert.deepEqual(mixed.body.data.guard_change.weakened_fields, ["top_holders_share_pct_max"]);
    const mcp = await patch({ settings_patch: { top_holders_share_pct_max: 45 } }, token(OWNER, { client: "mcp" }));
    assert.equal(mcp.status, 202, "MCP may propose");
    let now = await call(h.base, "GET", path(`/${id}`), { token: owner() });
    assert.equal(now.body.data.rev, rev, "nothing applied");
    assert.equal(now.body.data.settings.top_holders_share_pct_max, 30);

    // the SQL write path refuses weakening on its own (Flutter RPC must use propose_guard_change)
    const direct = await h.db.query("select public.update_strategy($1, $2, $3) as r", [id, rev, JSON.stringify({ guard_checks: { require_sell_sim: false } })]).catch((e) => e);
    assert.equal(direct.message, "GUARD_WEAKEN_REQUIRES_APPROVAL");

    // decide: MCP cannot; approve needs the 1,200 ms hold
    const ap = `/v1/workspaces/${WS}/approvals/${mixed.body.data.proposal.id}`;
    const mcpDetail = await call(h.base, "GET", ap, { token: token(OWNER, { client: "mcp" }) });
    err(await call(h.base, "POST", `${ap}/decision`, { token: token(OWNER, { client: "mcp" }), headers: { "idempotency-key": key(), "if-match": '"1"' },
      body: { decision: "approve", token: mcpDetail.body.data.decision_token, confirmation: { hold_duration_ms: 1500 } } }), 403, "APPROVAL_REQUIRES_APP");
    const detail = await call(h.base, "GET", ap, { token: owner() });
    const tok = detail.body.data.decision_token;
    const decide = (body: object) => call(h.base, "POST", `${ap}/decision`, { token: owner(), headers: { "idempotency-key": key(), "if-match": '"1"' }, body: { decision: "approve", token: tok, ...body } });
    err(await decide({}), 428, "CONFIRMATION_REQUIRED");
    err(await decide({ confirmation: { hold_duration_ms: 900 } }), 422, "HOLD_TOO_SHORT");
    err(await decide({ confirmation: { hold_duration_ms: "long" } }), 422, "VALIDATION_FAILED");
    await new Promise((r) => setTimeout(r, 1250));
    const ok = await decide({ confirmation: { hold_duration_ms: 1300 } });
    assert.equal(ok.status, 200, JSON.stringify(ok.body));
    assert.equal(ok.body.data.status, "approved");
    now = await call(h.base, "GET", path(`/${id}`), { token: owner() });
    assert.equal(now.body.data.rev, rev + 1, "applied on approval");
    assert.equal(now.body.data.settings.top_holders_share_pct_max, undefined);
    assert.equal(now.body.data.settings.guard_checks.creator_share_pct_fail, 5);
    rev = now.body.data.rev;
    const gc = await call(h.base, "GET", `/v1/workspaces/${WS}/guard-changes?strategy_id=${id}`, { token: owner() });
    assert.deepEqual(gc.body.items.map((g: any) => g.status).sort(), ["applied", "requested", "requested"]);
    // the other pending proposals are now stale
    const other = `/v1/workspaces/${WS}/approvals/${weak.body.data.proposal.id}`;
    const od = await call(h.base, "GET", other, { token: owner() });
    await new Promise((r) => setTimeout(r, 1250));
    const stale = await call(h.base, "POST", `${other}/decision`, { token: owner(), headers: { "idempotency-key": key(), "if-match": '"1"' },
      body: { decision: "approve", token: od.body.data.decision_token, confirmation: { hold_duration_ms: 1300 } } });
    err(stale, 409, "STRATEGY_REV_CONFLICT");
    assert.equal(stale.body.error.current.id, id);
  });

  test("pause / resume with rev; revisions list and merge base", async () => {
    const res = await call(h.base, "POST", path(`/${id}/resume`), { token: owner(), headers: { "idempotency-key": key() }, body: { expected_rev: rev } });
    assert.equal(res.status, 200, JSON.stringify(res.body));
    assert.equal(res.body.data.status, "running");
    rev = res.body.data.rev;
    const stale = await call(h.base, "POST", path(`/${id}/pause`), { token: owner(), headers: { "idempotency-key": key() }, body: { expected_rev: rev - 1 } });
    assert.equal(stale.status, 409);
    assert.equal(stale.body.error.current.status, "running");
    const p = await call(h.base, "POST", path(`/${id}/pause`), { token: owner(), headers: { "idempotency-key": key(), "if-match": `W/"${rev}"` } });
    assert.equal(p.status, 200, JSON.stringify(p.body));
    assert.equal(p.body.data.status, "paused");
    rev = p.body.data.rev;
    const revs = await call(h.base, "GET", path(`/${id}/revisions`), { token: viewer() });
    assert.equal(revs.status, 200);
    assert.equal(revs.body.items[0].rev, rev);
    assert.ok(revs.body.items.length >= 3);
    assert.equal(revs.body.items[0].settings, undefined, "list is light; settings via /revisions/{rev}");
    const base = await call(h.base, "GET", path(`/${id}/revisions/1`), { token: viewer() });
    assert.equal(base.status, 200);
    assert.deepEqual(base.body.data.settings, { score_threshold: 70 });
    assert.equal((await call(h.base, "GET", path(`/${id}/revisions/999`), { token: viewer() })).status, 404);
  });

  test("archive then delete; retired strategies refuse writes", async () => {
    err(await call(h.base, "POST", path(`/${id}/archive`), { token: owner(), headers: { "idempotency-key": key() } }), 428, "PRECONDITION_REQUIRED");
    const stale = await call(h.base, "POST", path(`/${id}/archive`), { token: owner(), headers: { "idempotency-key": key(), "if-match": `"${rev - 1}"` } });
    assert.equal(stale.status, 409);
    assert.equal(stale.body.error.current.id, id);
    const a = await call(h.base, "POST", path(`/${id}/archive`), { token: owner(), headers: { "idempotency-key": key(), "if-match": `"${rev}"` } });
    assert.equal(a.status, 200, JSON.stringify(a.body));
    assert.equal(a.body.data.status, "archived");
    rev = a.body.data.rev;
    err(await call(h.base, "PATCH", path(`/${id}`), { token: owner(), headers: { "idempotency-key": key(), "if-match": `"${rev}"` }, body: { name: "z" } }), 409, "STRATEGY_RETIRED");
    const d = await call(h.base, "DELETE", path(`/${id}`), { token: owner(), headers: { "idempotency-key": key(), "if-match": `"${rev}"` } });
    assert.equal(d.status, 200, JSON.stringify(d.body));
    assert.equal(d.body.data.status, "deleted");
  });
});

describe("reads: coins, picks, fills, orders, jobs, guard changes, audit", () => {
  const PICK = "70000000-0000-0000-0000-0000000000b1";
  const ORDER = "90000000-0000-0000-0000-0000000000b1";
  let job = "";
  before(async () => {
    await h.db.query(
      `insert into public.picks (id, ck, workspace_id, strategy_id, mint, stage, score, score_threshold, checks)
       values ($1, 'ckb1', $2, $3, $4, 'passed', 81.5, 70, '[{"code":"LIQ_OK","ok":true}]')`,
      [PICK, WS, S1, MINT],
    );
    await h.db.query(
      `insert into public.fills (position_id, workspace_id, side, sol_lamports, token_amount_raw, exec_price_sol)
       values ($1, $2, 'buy', 250000000, 1000000000, 0.00000025)`,
      [POS, WS],
    );
    const j = await h.db.query(`insert into public.jobs (kind, workspace_id, payload) values ('paper.sell', $1, '{}') returning id::text as id`, [WS]);
    job = j.rows[0].id;
    await h.db.query(
      `insert into public.orders (id, workspace_id, position_id, mint, side, fraction_bps, idempotency_key, request_hash, job_id)
       values ($1, $2, $3, $4, 'sell', 10000, 'k-order-b1', 'h', $5)`,
      [ORDER, WS, POS, MINT, job],
    );
    await h.db.query(
      `insert into public.guard_changes (workspace_id, strategy_id, from_rev, diff, weakened_fields)
       values ($1, $2, 1, '{"min_score":{"from":70,"to":50}}', '{min_score}')`,
      [WS, S1],
    );
    await h.db.query(
      `insert into public.audit_log (workspace_id, actor_user, actor_kind, actor_via, action, target_type, target, ip, user_agent)
       values ($1, $2, 'user', 'desktop', 'test.action', 'strategy', $3, '10.1.2.3', 'ua-secret')`,
      [WS, OWNER, S1],
    );
    await h.db.query(
      `insert into public.events (id, workspace_id, strategy_id, mint, ts, type, actor, payload)
       values ('tl1:1761700000001:pick.found', $1, $2, $3, now(), 'pick.found', 'screener', '{}')`,
      [WS, S1, MINT],
    );
  });

  test("coins list/detail/timeline", async () => {
    const l = await call(h.base, "GET", `/v1/workspaces/${WS}/coins?mode=practice`, { token: viewer() });
    assert.equal(l.status, 200, JSON.stringify(l.body));
    assert.equal(l.body.items[0].mint, MINT);
    assert.equal(l.body.items[0].decimals, 6);
    assert.equal(l.body.items[0].token_program, "TokenzQdBNbLqP5VEhdkAS6EPFLC1PHnBqCXEpPxuEb");
    assert.equal(typeof l.body.items[0].untrusted, "object");
    const g = await call(h.base, "GET", `/v1/workspaces/${WS}/coins/${MINT}`, { token: viewer() });
    assert.equal(g.status, 200);
    assert.equal((await call(h.base, "GET", `/v1/workspaces/${WS}/coins/not-a-mint`, { token: viewer() })).status, 404);
    const t = await call(h.base, "GET", `/v1/workspaces/${WS}/coins/${MINT}/timeline?mode=practice`, { token: viewer() });
    assert.equal(t.status, 200);
    assert.deepEqual(t.body.items.map((e: any) => e.type), ["pick.found"]);
    assert.match(t.body.next_after_seq, /^\d+$/);
    assert.equal((await call(h.base, "GET", `/v1/workspaces/${WS}/coins?mode=practice`, { token: token(OUTSIDER) })).status, 404);
  });

  test("picks list/detail with numeric scores", async () => {
    const l = await call(h.base, "GET", `/v1/workspaces/${WS}/picks?stage=passed`, { token: viewer() });
    assert.equal(l.status, 200);
    assert.equal(l.body.items.length, 1);
    assert.equal(l.body.items[0].score, 81.5);
    const g = await call(h.base, "GET", `/v1/workspaces/${WS}/picks/${PICK}`, { token: viewer() });
    assert.equal(g.status, 200);
    assert.deepEqual(g.body.data.checks, [{ code: "LIQ_OK", ok: true }]);
    assert.equal((await call(h.base, "GET", `/v1/workspaces/${OTHER_WS}/picks/${PICK}`, { token: token(OUTSIDER) })).status, 404);
  });

  test("fills by position; lamports are strings", async () => {
    const r = await call(h.base, "GET", `/v1/workspaces/${WS}/fills?position_id=${POS}`, { token: viewer() });
    assert.equal(r.status, 200, JSON.stringify(r.body));
    assert.equal(r.body.items.length, 1);
    assert.equal(r.body.items[0].position_id, POS);
    assert.equal(r.body.items[0].side, "buy");
    err(await call(h.base, "GET", `/v1/workspaces/${WS}/fills?position_id=nope`, { token: viewer() }), 422, "VALIDATION_FAILED");
  });

  test("order and job polling; other workspace is 404", async () => {
    const o = await call(h.base, "GET", `/v1/workspaces/${WS}/orders/${ORDER}`, { token: viewer() });
    assert.equal(o.status, 200, JSON.stringify(o.body));
    assert.equal(o.body.data.id ?? o.body.data.order_id, ORDER);
    assert.equal((await call(h.base, "GET", `/v1/workspaces/${OTHER_WS}/orders/${ORDER}`, { token: token(OUTSIDER) })).status, 404);
    const j = await call(h.base, "GET", `/v1/workspaces/${WS}/jobs/${job}`, { token: viewer() });
    assert.equal(j.status, 200);
    assert.equal(j.body.data.id, job);
    assert.equal(j.body.data.status, "queued");
    assert.equal(j.body.data.payload, undefined, "job payload is internal");
    assert.equal((await call(h.base, "GET", `/v1/workspaces/${WS}/jobs/abc`, { token: viewer() })).status, 400);
  });

  test("guard changes for members; audit log owner/admin only, without ip or user agent", async () => {
    const g = await call(h.base, "GET", `/v1/workspaces/${WS}/guard-changes`, { token: viewer() });
    assert.equal(g.status, 200);
    assert.deepEqual(g.body.items[0].weakened_fields, ["min_score"]);
    assert.ok(isIso(g.body.items[0].created_at));
    err(await call(h.base, "GET", `/v1/workspaces/${WS}/audit-log`, { token: viewer() }), 403, "FORBIDDEN_ROLE");
    const a = await call(h.base, "GET", `/v1/workspaces/${WS}/audit-log?action=test.action`, { token: owner() });
    assert.equal(a.status, 200, JSON.stringify(a.body));
    assert.equal(a.body.items.length, 1);
    const s = JSON.stringify(a.body);
    assert.doesNotMatch(s, /10\.1\.2\.3|ua-secret|proof_hash/);
    assert.match(a.body.items[0].id, /^\d+$/);
  });
});

describe("devices", () => {
  const DEV = "device-test-0001";
  test("register (token write-only), list, revoke; MCP agents are refused", async () => {
    const tok = token(VIEWER, { client: "mobile" });
    err(await call(h.base, "PUT", `/v1/devices/${DEV}`, { token: tok, body: { platform: "ios", provider: "apns", token: "short" } }), 422, "DEVICE_TOKEN_INVALID");
    err(await call(h.base, "PUT", `/v1/devices/${DEV}`, { token: tok, body: { platform: "symbian", provider: "apns", token: "x".repeat(64) } }), 422, "VALIDATION_FAILED");
    err(await call(h.base, "PUT", `/v1/devices/${DEV}`, { token: token(VIEWER, { client: "mcp" }), body: {} }), 403, "FORBIDDEN_SCOPE");
    err(await call(h.base, "PUT", `/v1/devices/${DEV}`, { token: tok, body: { platform: "ios", provider: "apns", token: "x".repeat(64) } }), 422, "VALIDATION_FAILED");
    const r = await call(h.base, "PUT", `/v1/devices/${DEV}`, { token: tok, body: { platform: "ios", provider: "apns", token: "apns-token-" + "a".repeat(40), app_version: "1.0.0" } });
    assert.equal(r.status, 200, JSON.stringify(r.body));
    assert.equal(r.body.data.device_id, DEV);
    const l = await call(h.base, "GET", "/v1/devices", { token: tok });
    assert.equal(l.status, 200);
    assert.equal(l.body.items.length, 1);
    assert.doesNotMatch(JSON.stringify(l.body), /apns-token-/, "push token never returned");
    assert.equal((await call(h.base, "GET", "/v1/devices", { token: token(OWNER) })).body.items.length, 0, "per user");
    assert.equal((await call(h.base, "DELETE", `/v1/devices/${DEV}`, { token: tok })).status, 200);
    assert.equal((await call(h.base, "DELETE", `/v1/devices/${DEV}`, { token: tok })).status, 404);
  });
});

describe("account deletion (7-30 day grace, server-side)", () => {
  const now = () => Math.floor(Date.now() / 1000);
  test("request needs re-auth + Idempotency-Key, schedules +7d, cancel restores", async () => {
    const plain = token(OUTSIDER, { client: "web" });
    const fresh = token(OUTSIDER, { client: "web", extra: { reauth_at: now() } });
    const s = await call(h.base, "GET", "/v1/me/deletion", { token: plain });
    assert.equal(s.status, 200);
    assert.equal(s.body.data.state, "active");
    assert.equal(s.body.data.grace_days, 7);
    err(await call(h.base, "POST", "/v1/me/deletion", { token: fresh }), 428, "PRECONDITION_REQUIRED");
    err(await call(h.base, "POST", "/v1/me/deletion", { token: plain, headers: { "idempotency-key": key() } }), 401, "REAUTH_REQUIRED");
    err(await call(h.base, "POST", "/v1/me/deletion", { token: token(OUTSIDER, { extra: { reauth_at: now() - 3600 } }), headers: { "idempotency-key": key() } }), 401, "REAUTH_REQUIRED");
    err(await call(h.base, "POST", "/v1/me/deletion", { token: fresh, headers: { "idempotency-key": key() }, body: { grace_days: 1 } }), 422, "VALIDATION_FAILED");
    err(await call(h.base, "POST", "/v1/me/deletion", { token: token(OUTSIDER, { client: "mcp", extra: { reauth_at: now() } }), headers: { "idempotency-key": key() } }), 403, "FORBIDDEN_SCOPE");
    const k = key();
    const r = await call(h.base, "POST", "/v1/me/deletion", { token: fresh, headers: { "idempotency-key": k } });
    assert.equal(r.status, 202, JSON.stringify(r.body));
    assert.equal(r.body.data.state, "pending_deletion");
    const days = (Date.parse(r.body.data.scheduled_for) - Date.now()) / 86_400_000;
    assert.ok(days > 6.99 && days <= 7.001, `scheduled ${days}d out`);
    const replay = await call(h.base, "POST", "/v1/me/deletion", { token: fresh, headers: { "idempotency-key": k } });
    assert.equal(replay.status, 202);
    assert.equal(replay.body.replayed, true);
    err(await call(h.base, "POST", "/v1/me/deletion", { token: fresh, headers: { "idempotency-key": key() } }), 409, "ACCOUNT_DELETION_PENDING");
    assert.equal((await call(h.base, "GET", "/v1/me/deletion", { token: plain })).body.data.state, "pending_deletion");
    const c = await call(h.base, "DELETE", "/v1/me/deletion", { token: plain });
    assert.equal(c.status, 200, JSON.stringify(c.body));
    assert.equal((await call(h.base, "GET", "/v1/me/deletion", { token: plain })).body.data.state, "active");
    err(await call(h.base, "DELETE", "/v1/me/deletion", { token: plain }), 422, "VALIDATION_FAILED");
  });

  test("grace days config is validated 7-30", async () => {
    const { loadConfig } = await import("../src/config.ts");
    const base = { TRADING_MODE: "paper", DATABASE_URL: "postgres://x", SUPABASE_JWT_SECRET: "s".repeat(40) };
    assert.equal(loadConfig(base).accountDeletionGraceDays, 7);
    assert.equal(loadConfig({ ...base, ACCOUNT_DELETION_GRACE_DAYS: "30" }).accountDeletionGraceDays, 30);
    assert.throws(() => loadConfig({ ...base, ACCOUNT_DELETION_GRACE_DAYS: "6" }));
    assert.throws(() => loadConfig({ ...base, ACCOUNT_DELETION_GRACE_DAYS: "31" }));
  });

  test("/v1/me", async () => {
    const r = await call(h.base, "GET", "/v1/me", { token: token(OWNER, { client: "desktop", scopes: ["read"] }) });
    assert.equal(r.status, 200);
    assert.equal(r.body.data.id, OWNER);
    assert.deepEqual(r.body.data.scopes, ["read"]);
    assert.equal(r.body.data.client, "desktop");
  });
});

describe("shared per-workspace SSE feed", () => {
  const stream = `/v1/workspaces/${WS}/events/stream?mode=practice`;
  const insert = (tag: string) =>
    h.db.query(
      `insert into public.events (id, workspace_id, ts, type, actor, payload) values ($1, $2, now(), 'system.notice', 'system', '{}')`,
      [`${tag}:1761700000002:system.notice`, WS],
    );

  test("two streams share one poller and both receive new events in order", async () => {
    const pollsBefore = h.feeds.polls;
    let opened = 0;
    const got = (f: any[]) => f.filter((x) => x.event === "system.notice").length >= 2;
    const onOpen = async () => {
      if (++opened === 2) {
        await new Promise((r) => setTimeout(r, 100));
        assert.equal(h.feeds.activeFeeds(), 1, "one poller for the workspace");
        await insert("shared1");
        await insert("shared2");
      }
    };
    const [a, b] = await Promise.all([
      readSse(h.base, stream, owner(), got, { onOpen }),
      readSse(h.base, stream, viewer(), got, { onOpen }),
    ]);
    for (const s of [a, b]) {
      const ids = s.frames.filter((f) => f.event === "system.notice").map((f) => BigInt(f.id!));
      assert.equal(ids.length, 2);
      assert.ok(ids[0]! < ids[1]!);
    }
    assert.deepEqual(a.frames.map((f) => f.id), b.frames.map((f) => f.id));
    assert.ok(h.feeds.polls > pollsBefore);
    await new Promise((r) => setTimeout(r, 100));
    assert.equal(h.feeds.activeFeeds(), 0, "poller stops when the last stream closes");
  });

  test("resume with Last-Event-ID catches up as the user, then continues live without gaps or duplicates", async () => {
    const seed = await call(h.base, "GET", `/v1/workspaces/${WS}/events?mode=practice&limit=1`, { token: owner() });
    const first = seed.body.items[0].seq;
    const r = await readSse(h.base, stream, owner(), (f) => f.some((x) => x.id && x.data?.id?.startsWith("live3")), {
      headers: { "last-event-id": first },
      onOpen: async () => {
        await new Promise((res) => setTimeout(res, 80));
        await insert("live3");
      },
    });
    const ids = r.frames.filter((f) => f.id).map((f) => f.id!);
    assert.equal(new Set(ids).size, ids.length, "no duplicates");
    assert.ok(ids.length >= 4, "seed backlog + live");
    for (let i = 1; i < ids.length; i++) assert.ok(BigInt(ids[i]!) > BigInt(ids[i - 1]!));
    assert.ok(BigInt(ids[0]!) > BigInt(first));
  });

  test("a revoked member's stream is closed on the next membership check", async () => {
    const start = Date.now();
    const r = await readSse(h.base, stream, viewer(), () => false, {
      timeoutMs: 3000,
      onOpen: async () => {
        await h.db.query("delete from public.workspace_members where workspace_id = $1 and user_id = $2", [WS, VIEWER]);
      },
    });
    assert.equal(r.status, 200);
    assert.ok(Date.now() - start < 2500, "closed by the server, not the client timeout");
    await h.db.query("insert into public.workspace_members (workspace_id, user_id, role) values ($1, $2, 'viewer')", [WS, VIEWER]);
  });
});

describe("practice reset", () => {
  test("Idempotency-Key, role, replay, then 429 RESET_COOLDOWN with Retry-After", async () => {
    const path = `/v1/workspaces/${WS}/practice/reset`;
    err(await call(h.base, "POST", path, { token: owner() }), 428, "PRECONDITION_REQUIRED");
    err(await call(h.base, "POST", path, { token: viewer(), headers: { "idempotency-key": key() } }), 403, "FORBIDDEN_ROLE");
    err(await call(h.base, "POST", path, { token: owner(), headers: { "idempotency-key": key() }, body: { mode: "real" } }), 403, "REAL_SOL_DISABLED");
    const k = key();
    const r = await call(h.base, "POST", path, { token: owner(), headers: { "idempotency-key": k } });
    assert.equal(r.status, 200, JSON.stringify(r.body));
    assert.equal(r.body.replayed, false);
    const replay = await call(h.base, "POST", path, { token: owner(), headers: { "idempotency-key": k } });
    assert.equal(replay.status, 200);
    assert.equal(replay.body.replayed, true);
    const again = await call(h.base, "POST", path, { token: owner(), headers: { "idempotency-key": key() } });
    err(again, 429, "RESET_COOLDOWN");
    assert.ok(isIso(again.body.error.next_allowed_at));
    const ra = Number(again.headers.get("retry-after"));
    assert.ok(ra > 86_000 && ra <= 86_400, `Retry-After ${ra}`);
    const list = await call(h.base, "GET", `/v1/workspaces/${WS}/practice/resets`, { token: viewer() });
    assert.equal(list.status, 200);
    assert.equal(list.body.items.length, 1);
    assert.match(list.body.items[0].starting_lamports, /^\d+$/);
  });
});
