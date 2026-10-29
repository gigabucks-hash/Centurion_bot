// Integration tests against the local Postgres (all migrations + seed.sql).
import { after, before, describe, test } from "node:test";
import assert from "node:assert/strict";
import { errorDef } from "../src/errors.ts";
import {
  APPROVAL, APPROVAL2, OTHER_WS, OUTSIDER, OWNER, POS, VIEWER, WS, call, readSse, startHarness, token, type Harness,
} from "./helpers.ts";

let h: Harness;
before(async () => {
  h = await startHarness();
});
after(async () => {
  await h?.stop();
});

const isIso = (s: unknown) => typeof s === "string" && /^\d{4}-\d\d-\d\dT\d\d:\d\d:\d\d\.\d{3}Z$/.test(s);
const isInt64Str = (s: unknown) => typeof s === "string" && /^\d+$/.test(s);
const owner = () => token(OWNER, { client: "desktop" });

function assertError(r: { status: number; body: any; headers: Headers }, status: number, code: string) {
  assert.equal(r.status, status, JSON.stringify(r.body));
  assert.equal(typeof r.body.error, "object", "error is always an object");
  assert.equal(r.body.error.code, code);
  assert.equal(typeof r.body.error.message, "string");
  assert.ok(isIso(r.body.error.server_now) && isIso(r.body.server_now));
  assert.match(r.body.error.request_id, /^[A-Za-z0-9_-]{8,64}$/);
  assert.ok(isIso(r.headers.get("x-server-now")));
}

describe("health, clock, envelope", () => {
  test("healthz reports practice mode and real_enabled:false; no 'paper' on the wire", async () => {
    const r = await call(h.base, "GET", "/healthz");
    assert.equal(r.status, 200);
    assert.equal(r.body.mode, "practice");
    assert.equal(r.body.real_enabled, false);
    assert.deepEqual(r.body.modes_enabled, ["practice"]);
    assert.equal(r.body.contracts_version, "1.1.3");
    assert.ok(isIso(r.body.server_now) && isIso(r.headers.get("x-server-now")));
    assert.doesNotMatch(JSON.stringify(r.body), /paper/);
    assert.equal(r.body.trading_mode, undefined);
    const ready = await call(h.base, "GET", "/readyz");
    assert.equal(ready.status, 200);
    assert.equal(ready.body.db, "ok");
  });

  test("unknown route, auth failures and localized messages use the errors.json envelope", async () => {
    assertError(await call(h.base, "GET", "/v1/nope"), 404, "NOT_FOUND");
    assertError(await call(h.base, "GET", `/v1/workspaces/${WS}`), 401, "UNAUTHENTICATED");
    assertError(await call(h.base, "GET", `/v1/workspaces/${WS}`, { token: token(OWNER, { secret: "x".repeat(40) }) }), 401, "UNAUTHENTICATED");
    assertError(await call(h.base, "GET", `/v1/workspaces/${WS}`, { token: token(OWNER, { exp: 1 }) }), 401, "UNAUTHENTICATED");
    const id = await call(h.base, "GET", "/v1/nope", { headers: { "accept-language": "id-ID" } });
    assert.equal(id.body.error.message, errorDef("NOT_FOUND")?.messages.id);
    assert.notEqual(id.body.error.message, (await call(h.base, "GET", "/v1/nope")).body.error.message, "id differs from en");
    const rid = await call(h.base, "GET", "/v1/nope", { headers: { "x-request-id": "req_client_supplied_1" } });
    assert.equal(rid.body.error.request_id, "req_client_supplied_1");
  });

  test("mode=real is refused; the removed 1.1 SSE path is 404", async () => {
    assertError(await call(h.base, "GET", `/v1/workspaces/${WS}/positions?mode=real`, { token: owner() }), 403, "REAL_SOL_DISABLED");
    assertError(await call(h.base, "GET", `/v1/workspaces/${WS}/positions?mode=paper`, { token: owner() }), 422, "VALIDATION_FAILED");
    assertError(await call(h.base, "GET", "/v1/events/stream", { token: owner() }), 404, "NOT_FOUND");
  });
});

describe("reads", () => {
  test("workspace carries rev, practice_epoch, lamport strings; non-members get 404", async () => {
    const r = await call(h.base, "GET", `/v1/workspaces/${WS}`, { token: owner() });
    assert.equal(r.status, 200);
    assert.equal(r.body.data.practice_epoch, 0);
    assert.equal(r.body.data.practice_start_lamports, "30000000000");
    assert.equal(r.headers.get("etag"), `"${r.body.data.rev}"`);
    assertError(await call(h.base, "GET", `/v1/workspaces/${WS}`, { token: token(OUTSIDER) }), 404, "NOT_FOUND");
    assertError(await call(h.base, "GET", `/v1/workspaces/${OTHER_WS}/positions`, { token: owner() }), 404, "NOT_FOUND");
  });

  test("positions list/get return PositionWire with rev, decimals, token_program", async () => {
    const l = await call(h.base, "GET", `/v1/workspaces/${WS}/positions?state=open`, { token: owner() });
    assert.equal(l.status, 200);
    assert.equal(l.body.items.length, 1);
    const p = l.body.items[0];
    assert.equal(p.id, POS);
    assert.equal(p.decimals, 6);
    assert.equal(p.token_program, "TokenzQdBNbLqP5VEhdkAS6EPFLC1PHnBqCXEpPxuEb");
    assert.equal(p.qty_raw, "1000000000");
    assert.equal(p.practice_epoch, 0);
    const g = await call(h.base, "GET", `/v1/workspaces/${WS}/positions/${POS}`, { token: token(VIEWER, { scopes: ["read"] }) });
    assert.equal(g.status, 200);
    assert.equal(g.headers.get("etag"), `"${g.body.data.rev}"`);
    const all = await call(h.base, "GET", `/v1/workspaces/${WS}/positions?limit=1`, { token: owner() });
    assert.equal(all.body.items.length, 1);
    assert.ok(all.body.next_cursor);
    const page2 = await call(h.base, "GET", `/v1/workspaces/${WS}/positions?limit=1&cursor=${all.body.next_cursor}`, { token: owner() });
    assert.equal(page2.body.items.length, 1);
    assert.notEqual(page2.body.items[0].id, all.body.items[0].id);
    assert.equal(page2.body.next_cursor, null);
  });

  test("portfolio overview = portfolio_latest columns (lamport strings, practice_epoch, as_of_seq string)", async () => {
    const r = await call(h.base, "GET", `/v1/workspaces/${WS}/portfolio/overview`, { token: owner() });
    assert.equal(r.status, 200);
    const d = r.body.data;
    assert.equal(d.practice_epoch, 0);
    assert.equal(d.equity_lamports, "29950000000");
    assert.equal(d.unrealized_pnl_lamports, "-50000000");
    assert.equal(d.drawdown_bps, 16);
    assert.equal(d.open_positions, 1);
    assert.equal(d.as_of_seq, "1");
    assert.ok(isIso(d.ts));
  });

  test("exit-stats rows share the exit_stats() shape", async () => {
    const r = await call(h.base, "GET", `/v1/workspaces/${WS}/stats/exit-reasons?window=all`, { token: owner() });
    assert.equal(r.status, 200);
    assert.equal(r.body.items.length, 1);
    assert.deepEqual(Object.keys(r.body.items[0]).sort(), ["avg_hold_s", "avg_pnl_pct", "count", "exit_reason", "pnl_lamports", "win_rate_pct"]);
    const row = r.body.items[0];
    assert.equal(row.exit_reason, "profit_target");
    assert.equal(row.count, 1);
    assert.equal(row.pnl_lamports, "100000000");
    assert.equal(row.win_rate_pct, 100);
    assert.equal(row.avg_hold_s, 90);
    assert.equal(typeof row.avg_pnl_pct, "number");
    assertError(await call(h.base, "GET", `/v1/workspaces/${WS}/stats/exit-reasons?window=2y`, { token: owner() }), 422, "VALIDATION_FAILED");
  });
});

describe("POST positions/{id}/close", () => {
  const path = `/v1/workspaces/${WS}/positions/${POS}/close`;
  test("scope, role, preconditions, fraction", async () => {
    assertError(await call(h.base, "POST", path, { token: token(OWNER, { scopes: ["read"] }), body: {} }), 403, "FORBIDDEN_SCOPE");
    assertError(await call(h.base, "POST", path, { token: token(VIEWER), headers: { "if-match": '"1"', "idempotency-key": "viewer-key-1" }, body: {} }), 403, "FORBIDDEN_ROLE");
    const noRev = await call(h.base, "POST", path, { token: owner(), headers: { "idempotency-key": "close-key-norev" }, body: {} });
    assertError(noRev, 428, "PRECONDITION_REQUIRED");
    assertError(await call(h.base, "POST", path, { token: owner(), headers: { "if-match": '"1"' }, body: {} }), 428, "PRECONDITION_REQUIRED");
    assertError(await call(h.base, "POST", path, { token: owner(), headers: { "if-match": '"1"', "idempotency-key": "short" }, body: {} }), 422, "VALIDATION_FAILED");
    assertError(await call(h.base, "POST", path, { token: owner(), headers: { "if-match": '"1"', "idempotency-key": "close-key-frac0" }, body: { fraction_bps: 0 } }), 422, "INVALID_FRACTION");
    assertError(await call(h.base, "POST", path, { token: owner(), headers: { "if-match": '"1"', "idempotency-key": "close-key-frac1" }, body: { fraction_bps: 2.5 } }), 422, "INVALID_FRACTION");
    assertError(await call(h.base, "POST", path, { token: owner(), headers: { "if-match": '"1"', "idempotency-key": "close-key-sellp" }, body: { sell_pct: 50 } }), 422, "VALIDATION_FAILED");
    assertError(await call(h.base, "POST", path, { token: owner(), headers: { "if-match": '"1"', "idempotency-key": "close-key-diff1" }, body: { expected_rev: 2 } }), 422, "VALIDATION_FAILED");
    assertError(await call(h.base, "POST", `/v1/workspaces/${OTHER_WS}/positions/${POS}/close`, { token: owner(), headers: { "if-match": '"1"', "idempotency-key": "close-key-other" }, body: {} }), 404, "NOT_FOUND");
  });

  test("stale If-Match -> 409 VERSION_CONFLICT with current_rev/base_rev/current", async () => {
    const r = await call(h.base, "POST", path, { token: owner(), headers: { "if-match": '"7"', "idempotency-key": "close-key-stale" }, body: {} });
    assertError(r, 409, "VERSION_CONFLICT");
    assert.equal(r.body.error.current_rev, 1);
    assert.equal(r.body.error.base_rev, 7);
    assert.equal(r.body.error.current.id, POS);
  });

  test("close queues an order; same key + body replays; same key + other body -> 422", async () => {
    const hdr = { "if-match": '"1"', "idempotency-key": "close-key-half-0001" };
    const r = await call(h.base, "POST", path, { token: owner(), headers: hdr, body: { fraction_bps: 5000 } });
    assert.equal(r.status, 200, JSON.stringify(r.body));
    assert.equal(r.body.status, "queued");
    assert.equal(r.body.replayed, false);
    assert.equal(r.body.fill, null);
    assert.ok(isInt64Str(r.body.job_id), "job_id is an int64 string");
    assert.equal(r.body.order.fraction_bps, 5000);
    assert.equal(r.body.position.id, POS);
    assert.ok(isIso(r.body.server_now));
    assert.equal(r.headers.get("idempotent-replayed"), null);
    // retry (even with a now-stale If-Match it is the same request) -> stored response
    const again = await call(h.base, "POST", path, { token: owner(), headers: hdr, body: { fraction_bps: 5000 } });
    assert.equal(again.status, 200);
    assert.equal(again.body.replayed, true);
    assert.equal(again.body.order_id, r.body.order_id);
    assert.equal(again.headers.get("idempotent-replayed"), "true");
    assertError(await call(h.base, "POST", path, { token: owner(), headers: hdr, body: { fraction_bps: 2500 } }), 422, "IDEMPOTENCY_KEY_REUSED");
    // the order is attributed to the JWT subject + client claim
    const o = await h.db.query("select requested_by, requested_via from public.orders where id = $1", [r.body.order_id]);
    assert.equal(o.rows[0].requested_by, OWNER);
    assert.equal(o.rows[0].requested_via, "desktop");
  });
});

describe("approvals", () => {
  const base = `/v1/workspaces/${WS}/approvals/${APPROVAL}`;
  test("list and detail; trade scope gets a decision token, read-only does not", async () => {
    const l = await call(h.base, "GET", `/v1/workspaces/${WS}/approvals?status=pending`, { token: owner() });
    assert.equal(l.status, 200);
    assert.deepEqual(l.body.items.map((a: any) => a.id), [APPROVAL, APPROVAL2]);
    assert.equal(l.body.items[0].amount_lamports, "250000000");
    const ro = await call(h.base, "GET", base, { token: token(OWNER, { scopes: ["read"] }) });
    assert.equal(ro.body.data.decision_token, null);
    const viewer = await call(h.base, "GET", base, { token: token(VIEWER) });
    assert.equal(viewer.body.data.decision_token, null, "viewer role never gets a token");
    assertError(await call(h.base, "GET", `/v1/workspaces/${WS}/approvals/30000000-0000-0000-0000-0000000000a3`, { token: owner() }), 404, "NOT_FOUND");
  });

  test("decide: 428 without rev, 409 stale, JWT-derived actor/via, replay, 422 key reuse, 409 already decided", async () => {
    const d = await call(h.base, "GET", base, { token: owner() });
    const tok = d.body.data.decision_token as string;
    assert.match(tok, /^apt_/);
    assert.equal(d.body.data.rev, 1);
    const body = { decision: "approve", token: tok, via: "mcp", actor: OUTSIDER, client: "mcp" };
    assertError(await call(h.base, "POST", `${base}/decision`, { token: owner(), headers: { "idempotency-key": "decide-key-0001" }, body }), 428, "PRECONDITION_REQUIRED");
    const stale = await call(h.base, "POST", `${base}/decision`, { token: owner(), headers: { "if-match": '"5"', "idempotency-key": "decide-key-0001" }, body });
    assertError(stale, 409, "VERSION_CONFLICT");
    assert.equal(stale.body.error.current_rev, 1);
    assert.equal(stale.body.error.current.id, APPROVAL, "409 always carries current");
    assert.equal(stale.body.error.current.status, "pending");
    const ok = await call(h.base, "POST", `${base}/decision`, { token: owner(), headers: { "if-match": '"1"', "idempotency-key": "decide-key-0001" }, body });
    assert.equal(ok.status, 200, JSON.stringify(ok.body));
    assert.deepEqual({ ...ok.body.data }, { proposal_id: APPROVAL, status: "approved", rev: 2, reject_reason: null, replayed: false });
    assert.ok(isIso(ok.body.server_now));
    assert.equal(ok.headers.get("etag"), '"2"');
    const row = await h.db.query("select decided_by, decided_via::text as via from public.approvals where id = $1", [APPROVAL]);
    assert.equal(row.rows[0].decided_by, OWNER, "actor = JWT sub, not the body");
    assert.equal(row.rows[0].via, "desktop", "via = sentra_client claim, not the body");
    const replay = await call(h.base, "POST", `${base}/decision`, { token: owner(), headers: { "if-match": '"1"', "idempotency-key": "decide-key-0001" }, body });
    assert.equal(replay.status, 200);
    assert.equal(replay.body.data.replayed, true);
    assert.equal(replay.headers.get("idempotent-replayed"), "true");
    assertError(await call(h.base, "POST", `${base}/decision`, { token: owner(), headers: { "if-match": '"2"', "idempotency-key": "decide-key-0001" }, body: { ...body, decision: "reject" } }), 422, "IDEMPOTENCY_KEY_REUSED");
    assertError(await call(h.base, "POST", `${base}/decision`, { token: owner(), headers: { "if-match": '"2"', "idempotency-key": "decide-key-0002" }, body: { ...body, decision: "reject" } }), 409, "APPROVAL_ALREADY_DECIDED");
    assertError(await call(h.base, "POST", `${base}/decision`, { token: owner(), headers: { "if-match": '"2"', "idempotency-key": "decide-key-0003" }, body: { decision: "maybe", token: tok } }), 422, "VALIDATION_FAILED");
  });
});

describe("approvals: reject_reason (1.1.3)", () => {
  const base = `/v1/workspaces/${WS}/approvals/${APPROVAL2}`;
  test("422 on unknown value or with approve; stored + evented + audited on reject", async () => {
    const tok = (await call(h.base, "GET", base, { token: owner() })).body.data.decision_token as string;
    const hdr = (k: string) => ({ "if-match": '"1"', "idempotency-key": k });
    const bad = await call(h.base, "POST", `${base}/decision`, { token: owner(), headers: hdr("rr-api-key-01"), body: { decision: "reject", token: tok, reject_reason: "bored" } });
    assertError(bad, 422, "VALIDATION_FAILED");
    assert.equal(bad.body.error.field, "reject_reason");
    assert.deepEqual(bad.body.error.allowed, ["user_declined", "not_tradeable", "price_moved", "other"]);
    const withApprove = await call(h.base, "POST", `${base}/decision`, { token: owner(), headers: hdr("rr-api-key-02"), body: { decision: "approve", token: tok, reject_reason: "other" } });
    assertError(withApprove, 422, "VALIDATION_FAILED");
    assertError(await call(h.base, "POST", `${base}/decision`, { token: owner(), headers: hdr("rr-api-key-03"), body: { decision: "reject", token: tok, reject_reason: 7 } }), 422, "VALIDATION_FAILED");
    const ok = await call(h.base, "POST", `${base}/decision`, { token: owner(), headers: hdr("rr-api-key-04"), body: { decision: "reject", token: tok, reject_reason: "not_tradeable" } });
    assert.equal(ok.status, 200, JSON.stringify(ok.body));
    assert.equal(ok.body.data.status, "rejected");
    assert.equal(ok.body.data.reject_reason, "not_tradeable");
    const detail = await call(h.base, "GET", base, { token: owner() });
    assert.equal(detail.body.data.reject_reason, "not_tradeable");
    const ev = await h.db.query("select payload from public.events where type = 'proposal.rejected' and payload->>'proposal_id' = $1", [APPROVAL2]);
    assert.equal(ev.rows[0].payload.reject_reason, "not_tradeable");
    const au = await h.db.query("select after from public.audit_log where action = 'approval.reject' and target = $1", [APPROVAL2]);
    assert.equal(au.rows[0].after.reject_reason, "not_tradeable");
  });
});

describe("events: REST page and SSE", () => {
  const sse = `/v1/workspaces/${WS}/events/stream`;
  test("REST page: seq / next_after_seq / safe_seq are int64 strings", async () => {
    const r = await call(h.base, "GET", `/v1/workspaces/${WS}/events?after_seq=0&limit=2`, { token: owner() });
    assert.equal(r.status, 200);
    assert.equal(r.body.items.length, 2);
    for (const e of r.body.items) {
      assert.ok(isInt64Str(e.seq));
      assert.equal(e.mode, "practice");
      assert.ok(isIso(e.server_now));
    }
    assert.equal(r.body.next_after_seq, r.body.items[1].seq);
    assert.ok(isInt64Str(r.body.safe_seq));
    assertError(await call(h.base, "GET", `/v1/workspaces/${WS}/events?after_seq=-1`, { token: owner() }), 400, "CURSOR_INVALID");
  });

  test("SSE: ids are seq strings, ascending, match data.seq; clock frames carry safe_seq", async () => {
    const { status, frames, headers } = await readSse(h.base, `${sse}?mode=practice&after_seq=0&include=clock`, owner(), (f) =>
      f.filter((x) => x.id).length >= 4 && f.some((x) => x.event === "clock"));
    assert.equal(status, 200);
    assert.match(headers.get("content-type") ?? "", /text\/event-stream/);
    assert.ok(isIso(headers.get("x-server-now")));
    const evs = frames.filter((f) => f.id !== undefined);
    assert.ok(evs.length >= 4);
    for (const f of evs) {
      assert.ok(isInt64Str(f.id));
      assert.equal(f.data.seq, f.id);
      assert.equal(f.event, f.data.type);
    }
    const ids = evs.map((f) => BigInt(f.id as string));
    assert.deepEqual([...ids].sort((a, b) => (a < b ? -1 : 1)), ids, "strictly seq ordered");
    const clock = frames.find((f) => f.event === "clock");
    assert.ok(clock && clock.id === undefined && isInt64Str(clock.data.safe_seq) && isIso(clock.data.server_now));
  });

  test("SSE resumes after Last-Event-ID (wins over after_seq) and delivers new events live", async () => {
    const page = await call(h.base, "GET", `/v1/workspaces/${WS}/events?after_seq=0&limit=500`, { token: owner() });
    const seqs = page.body.items.map((e: any) => e.seq as string);
    const mid = seqs[1];
    const { frames } = await readSse(h.base, `${sse}?after_seq=0`, owner(), (f) => f.some((x) => x.data?.type === "system.notice" && x.data?.payload?.n === 99), {
      headers: { "last-event-id": mid },
      onOpen: async () => {
        await h.db.query(
          `insert into public.events (id, workspace_id, ts, type, actor, payload)
           values ('live99:1761700000001:system.notice', $1, now(), 'system.notice', 'system', '{"code":"SOURCE_DEGRADED","n":99}')`,
          [WS],
        );
      },
    });
    const ids = frames.filter((f) => f.id).map((f) => BigInt(f.id as string));
    assert.ok(ids.length >= 1);
    assert.ok(ids.every((i) => i > BigInt(mid)), "nothing at or before Last-Event-ID");
    assert.equal(ids[0], BigInt(seqs[2]), "resumes at the next seq");
    assert.ok(frames.some((f) => f.data?.payload?.n === 99), "live event arrives");
  });

  test("SSE include=marks forwards MarkMessage frames for this workspace only (no id)", async () => {
    const { frames } = await readSse(h.base, `${sse}?include=marks`, owner(), (f) => f.some((x) => x.event === "mark"), {
      onOpen: async () => {
        await new Promise((r) => setTimeout(r, 100));
        const mark = { mint: "Co68LzYNQArj5fmRmh4o2TVeEVx6FfaLiyRgDAjtpump", price_usd: "0.000041230000", price_sol: "0.000000213400", liquidity_usd: 42000, slot: 462847812, ts: new Date().toISOString(), position_ids: [POS], secret: "dropped" };
        await h.db.query("select pg_notify('sentra_marks', $1)", [JSON.stringify({ workspace_id: OTHER_WS, mode: "practice", mark: { ...mark, mint: "So11111111111111111111111111111111111111112" } })]);
        await h.db.query("select pg_notify('sentra_marks', $1)", [JSON.stringify({ workspace_id: WS, mode: "practice", mark })]);
      },
    });
    const marks = frames.filter((f) => f.event === "mark");
    assert.equal(marks.length, 1);
    const m = marks[0]!;
    assert.equal(m.id, undefined);
    assert.equal(m.data.mint, "Co68LzYNQArj5fmRmh4o2TVeEVx6FfaLiyRgDAjtpump");
    assert.equal(m.data.secret, undefined, "only MarkMessage fields");
    assert.ok(isIso(m.data.server_now));
  });

  test("SSE auth and validation", async () => {
    assert.equal((await readSse(h.base, sse, token(OUTSIDER), () => true)).status, 404);
    assert.equal((await readSse(h.base, `${sse}?include=prices`, owner(), () => true)).status, 422);
    assert.equal((await readSse(h.base, sse, owner(), () => true, { headers: { "last-event-id": "abc" } })).status, 400);
    assert.equal((await readSse(h.base, `${sse}?mode=real`, owner(), () => true)).status, 403);
  });
});
