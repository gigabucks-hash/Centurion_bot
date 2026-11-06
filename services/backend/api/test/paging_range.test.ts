// F4 + F5: a ranged keyset walk freezes its `from`/`to` on page 1 and refuses a cursor from another
// range, so a relative `window` resolved twice cannot drop the oldest rows; a malformed uuid cursor is
// 400 CURSOR_INVALID, never a 500 from the uuid cast.
import { after, before, describe, test } from "node:test";
import assert from "node:assert/strict";
import { OWNER, WS, call, startHarness, token, type Harness } from "./helpers.ts";

let h: Harness;
const owner = () => token(OWNER, { client: "desktop" });

before(async () => {
  h = await startHarness();
  // 5 closed trades inside 7d (distinct close times, newest first) and 2 outside it.
  const rows: [string, string][] = [
    ["60000000-0000-0000-0000-0000000000c1", "1 hour"],
    ["60000000-0000-0000-0000-0000000000c2", "2 hours"],
    ["60000000-0000-0000-0000-0000000000c3", "3 hours"],
    ["60000000-0000-0000-0000-0000000000c4", "4 hours"],
    ["60000000-0000-0000-0000-0000000000c5", "5 hours"],
    ["60000000-0000-0000-0000-0000000000c6", "8 days"],
    ["60000000-0000-0000-0000-0000000000c7", "10 days"],
  ];
  for (const [i, [id, ago]] of rows.entries()) {
    await h.db.query(
      `insert into public.positions
         (id, position_key, strategy_id, workspace_id, mint, qty_raw, sol_in_lamports, cost_basis_lamports,
          entry_price_sol, status, exit_reason, opened_at, closed_at)
       values ($1, $2, '20000000-0000-0000-0000-0000000000a1', $3,
               'Co68LzYNQArj5fmRmh4o2TVeEVx6FfaLiyRgDAjtpump', 0, 100000000, 100000000,
               '0.00000025', 'closed', 'profit_target', now() - interval '30 days', now() - $4::interval)`,
      [id, `pagerange.${i + 1}`, WS, ago],
    );
  }
  // Two coins with picks so /coins has a second page to walk.
  const mints = ["Pg2a", "Pg2b"].map((p) => p + "Co68LzYNQArj5fmRmh4o2TVeEVx6FfaLiyRgDAjtpump".slice(4));
  for (let i = 0; i < mints.length; i++) {
    await h.db.query(
      `insert into public.coins (mint, venue, decimals, token_program) values ($1, 'curve', 6, 'TokenzQdBNbLqP5VEhdkAS6EPFLC1PHnBqCXEpPxuEb')`,
      [mints[i]],
    );
    await h.db.query(
      `insert into public.picks (ck, workspace_id, strategy_id, mint, stage, created_at)
       values ($1, $2, '20000000-0000-0000-0000-0000000000a1', $3, 'passed', now() - $4::interval)`,
      [`pagerangecoin${i}`, WS, mints[i], `${i} minutes`],
    );
  }
});
after(async () => {
  await h?.stop();
});

const ledger = (qs: string) => `/v1/workspaces/${WS}/positions?state=closed${qs}`;

describe("F4: frozen range + cursor binding", () => {
  test("page 1 echoes the resolved range and page 2 reuses it exactly after time passes", async () => {
    const p1 = await call(h.base, "GET", ledger("&window=7d&limit=2"), { token: owner() });
    assert.equal(p1.status, 200);
    assert.equal(p1.body.items.length, 2);
    assert.equal(typeof p1.body.range_from, "string");
    assert.equal(p1.body.range_to, null);
    assert.ok(p1.body.next_cursor);
    const frozen = p1.body.range_from;
    assert.ok(Date.parse(frozen) > Date.parse(new Date(Date.now() - 7 * 86400_000 - 60_000).toISOString()), "sanity: ~7d ago");

    // A later request would resolve a newer `from`; the cursor must keep the first one.
    await new Promise((r) => setTimeout(r, 60));
    const p2 = await call(h.base, "GET", ledger(`&window=7d&limit=2&cursor=${p1.body.next_cursor}`), { token: owner() });
    assert.equal(p2.status, 200);
    assert.equal(p2.body.range_from, frozen, "page 2 keeps page 1's from");
    assert.equal(p2.body.range_to, null);

    // Same walk, no window repeated: the cursor alone still pins the range.
    const p2b = await call(h.base, "GET", ledger(`&limit=2&cursor=${p1.body.next_cursor}`), { token: owner() });
    assert.equal(p2b.status, 200);
    assert.equal(p2b.body.range_from, frozen);
  });

  test("a walk over 7d returns every in-range row exactly once, oldest included", async () => {
    const seen: string[] = [];
    let cursor: string | null = null;
    let frozen: string | null = null;
    for (let i = 0; i < 20; i++) {
      await new Promise((r) => setTimeout(r, 25));
      const r = await call(h.base, "GET", ledger(`&window=7d&limit=2${cursor ? `&cursor=${cursor}` : ""}`), { token: owner() });
      assert.equal(r.status, 200, JSON.stringify(r.body));
      if (frozen === null) frozen = r.body.range_from;
      assert.equal(r.body.range_from, frozen, "range never moves between pages");
      seen.push(...r.body.items.map((x: any) => x.id));
      cursor = r.body.next_cursor;
      if (!cursor) break;
    }
    assert.equal(new Set(seen).size, seen.length, "no duplicates");
    for (const c of ["c1", "c2", "c3", "c4", "c5"]) {
      assert.ok(seen.includes(`60000000-0000-0000-0000-0000000000${c}`), `row ${c} is on the walk`);
    }
    for (const c of ["c6", "c7"]) {
      assert.ok(!seen.includes(`60000000-0000-0000-0000-0000000000${c}`), `row ${c} is outside 7d`);
    }
    assert.equal(seen.length, 6, "the seed close plus the five in-range trades, once each");
  });

  test("a cursor from another window is 400 CURSOR_INVALID", async () => {
    const p1 = await call(h.base, "GET", ledger("&window=7d&limit=2"), { token: owner() });
    const c = p1.body.next_cursor;
    for (const w of ["30d", "1h", "all"]) {
      const r = await call(h.base, "GET", ledger(`&window=${w}&limit=2&cursor=${c}`), { token: owner() });
      assert.equal(r.status, 400, w);
      assert.equal(r.body.error.code, "CURSOR_INVALID");
      assert.equal(r.body.error.reason, "cursor belongs to another range");
    }
  });

  test("explicit from/to equal to the frozen range is accepted; a different range is rejected", async () => {
    const p1 = await call(h.base, "GET", ledger("&window=7d&limit=2"), { token: owner() });
    const c = p1.body.next_cursor;
    const from = encodeURIComponent(p1.body.range_from);
    const same = await call(h.base, "GET", ledger(`&from=${from}&limit=2&cursor=${c}`), { token: owner() });
    assert.equal(same.status, 200, JSON.stringify(same.body));

    const other = await call(h.base, "GET", ledger(`&from=${encodeURIComponent(new Date(Date.now() - 3600_000).toISOString())}&limit=2&cursor=${c}`), { token: owner() });
    assert.equal(other.status, 400);
    assert.equal(other.body.error.code, "CURSOR_INVALID");

    const toOnly = await call(h.base, "GET", ledger(`&to=${encodeURIComponent(new Date().toISOString())}&limit=2&cursor=${c}`), { token: owner() });
    assert.equal(toOnly.status, 400, "adding to= narrows the range, so the cursor no longer applies");
  });

  test("legacy 2-part cursors still page (unbound range, recomputed once per request)", async () => {
    const p1 = await call(h.base, "GET", ledger("&window=all&limit=2"), { token: owner() });
    const legacy = Buffer.from(`${p1.body.items[1].closed_at}|${p1.body.items[1].id}`).toString("base64url");
    const p2 = await call(h.base, "GET", ledger(`&window=all&limit=2&cursor=${legacy}`), { token: owner() });
    assert.equal(p2.status, 200);
    assert.ok(p2.body.items.length > 0);
    assert.ok(p2.body.next_cursor, "the next cursor is upgraded to the bound form");
  });

  test("coins list echoes its range and binds the cursor to it", async () => {
    const p1 = await call(h.base, "GET", `/v1/workspaces/${WS}/coins?window=7d&limit=1`, { token: owner() });
    assert.equal(p1.status, 200);
    assert.equal(typeof p1.body.range_from, "string", JSON.stringify({ ...p1.body, items: p1.body.items?.length }));
    const p2 = await call(h.base, "GET", `/v1/workspaces/${WS}/coins?window=24h&limit=1&cursor=${p1.body.next_cursor}`, { token: owner() });
    assert.equal(p2.status, 400);
    assert.equal(p2.body.error.code, "CURSOR_INVALID");
  });
});

describe("F5: malformed uuid cursor", () => {
  const forge = (id: string) => Buffer.from(`2026-10-01T00:00:00Z|${id}`).toString("base64url");

  test("36 hyphens is 400 CURSOR_INVALID on every uuid-keyed list, never 500", async () => {
    const bad = forge("-".repeat(36));
    for (const path of [
      `/v1/workspaces/${WS}/positions?state=closed&cursor=${bad}`,
      `/v1/workspaces/${WS}/picks?cursor=${bad}`,
      `/v1/workspaces/${WS}/fills?window=all&cursor=${bad}`,
      `/v1/workspaces/${WS}/guard-changes?cursor=${bad}`,
    ]) {
      const r = await call(h.base, "GET", path, { token: owner() });
      assert.equal(r.status, 400, path);
      assert.equal(r.body.error.code, "CURSOR_INVALID", path);
    }
  });

  test("near-miss uuids are rejected: wrong grouping, non-hex, wrong length", async () => {
    for (const id of [
      "00000000000000000000000000000000----",
      "60000000-0000-0000-0000-0000000000zz",
      "60000000-0000-0000-0000-0000000000a1f",
      "6000000-0000-0000-0000-0000000000a1",
      "６0000000-0000-0000-0000-0000000000a1",
    ]) {
      const r = await call(h.base, "GET", ledger(`&cursor=${forge(id)}`), { token: owner() });
      assert.equal(r.status, 400, id);
      assert.equal(r.body.error.code, "CURSOR_INVALID", id);
    }
  });

  test("well-formed uuid cursor is still accepted", async () => {
    const r = await call(h.base, "GET", ledger(`&cursor=${forge("60000000-0000-0000-0000-0000000000c5")}`), { token: owner() });
    assert.equal(r.status, 200, JSON.stringify(r.body));
    assert.deepEqual(r.body.items.map((x: any) => x.id), [], "everything is newer than the cursor");
  });

  test("a bound cursor with an unknown window key is rejected at decode", async () => {
    const forged = Buffer.from(`2026-10-01T00:00:00Z|60000000-0000-0000-0000-0000000000c5|||3m`).toString("base64url");
    const r = await call(h.base, "GET", ledger(`&cursor=${forged}`), { token: owner() });
    assert.equal(r.status, 400);
    assert.equal(r.body.error.code, "CURSOR_INVALID");
  });
});