// Strategies (API_ENDPOINTS 4.3) and practice reset (4.2). All writes go through SQL functions that take the
// actor from auth.uid() and the channel from the JWT claim.
import { ApiError, fromReturnedError } from "./errors.ts";
import { asUser, requireMember, type Tx } from "./db.ts";
import { readJson, send, type Ctx, type Router } from "./http.ts";
import { idempotent } from "./idem.ts";
import {
  cursorParam, deviceLabel, expectedRev, idempotencyKey, limitParam, modeParam, requireRev, requireScope, uuidParam, withCurrent,
} from "./rules.ts";
import { authenticate, type Deps } from "./deps.ts";
import { cursorCols, iso, pageOf } from "./wire.ts";
import { withRealGate } from "./real_gate.ts";

// row type for keyset pages
type Page = Record<string, any> & { cur_ts: string; cur_id: string };

const etag = (rev: unknown) => ({ ETag: `"${String(rev)}"` });
const NAME_MAX = 80;

async function strategyIn(c: Tx, id: string, ws: string): Promise<Record<string, unknown>> {
  const r = await c.query("select public.strategy_wire(s) as w from public.strategies s where s.id = $1 and s.workspace_id = $2", [id, ws]);
  const w = r.rows[0]?.w as Record<string, unknown> | undefined;
  if (!w) throw new ApiError("NOT_FOUND");
  return w;
}

/** JSON merge patch (RFC 7396 at the top level, like update_strategy): null removes a key. */
export function mergePatch(base: Record<string, unknown>, patch: Record<string, unknown>): Record<string, unknown> {
  const out: Record<string, unknown> = { ...base };
  for (const [k, v] of Object.entries(patch)) {
    if (v === null) delete out[k];
    else out[k] = v;
  }
  return out;
}

/** Same SQL classifier update_strategy / propose_guard_change use (guard_weakened_fields). */
async function weakenedFields(c: Tx, cur: Record<string, unknown>, patch: object): Promise<string[]> {
  const before = (cur.settings ?? {}) as Record<string, unknown>;
  const after = mergePatch(before, patch as Record<string, unknown>);
  const q = await c.query<{ f: string[] }>("select public.guard_weakened_fields($1::jsonb, $2::jsonb) as f", [JSON.stringify(before), JSON.stringify(after)]);
  return q.rows[0]?.f ?? [];
}

function strategyBody(body: Record<string, unknown>) {
  const { name, settings, settings_patch, status } = body;
  if (name !== undefined && (typeof name !== "string" || name.length < 1 || name.length > NAME_MAX)) {
    throw new ApiError("VALIDATION_FAILED", { field: "name", range: `1-${NAME_MAX}` });
  }
  for (const [k, v] of [["settings", settings], ["settings_patch", settings_patch]] as const) {
    if (v !== undefined && (v === null || typeof v !== "object" || Array.isArray(v))) throw new ApiError("VALIDATION_FAILED", { field: k });
  }
  if (status !== undefined && typeof status !== "string") throw new ApiError("VALIDATION_FAILED", { field: "status" });
  return { name: name as string | undefined, settings: settings as object | undefined, patch: settings_patch as object | undefined, status: status as string | undefined };
}

/** Target mode for the Paper/Real switch: `real` is a valid REQUEST (answered 403 MODE_NOT_ALLOWED), not REAL_SOL_DISABLED. */
function modeBody(body: Record<string, unknown>): "practice" | "real" {
  const m = body.mode;
  if (m !== "practice" && m !== "real") throw new ApiError("VALIDATION_FAILED", { field: "mode", allowed: ["practice", "real"] });
  return m;
}

export function registerStrategies(r: Router, d: Deps): void {
  const base = "/v1/workspaces/:ws/strategies";

  r.add("GET", base, async (ctx) => {
    const p = authenticate(ctx, d.cfg);
    requireScope(p, "read");
    const ws = uuidParam(ctx, "ws");
    const mode = modeParam(ctx);
    const status = ctx.url.searchParams.get("status");
    if (status !== null && !["draft", "running", "paused", "archived"].includes(status)) throw new ApiError("VALIDATION_FAILED", { field: "status" });
    const limit = limitParam(ctx, 50, 100);
    const cur = cursorParam(ctx);
    const rows = await asUser(d.db, p.claims, async (c) => {
      await requireMember(c, ws);
      const q = await c.query(
        `select public.strategy_wire(s) as w, ${cursorCols("s.created_at", "s.id")} from public.strategies s
          where s.workspace_id = $1 and s.mode = $2::public.trade_mode and ($3::text is null or s.status::text = $3)
            and ($4::timestamptz is null or (s.created_at, s.id) < ($4::timestamptz, $5::uuid))
          order by s.created_at desc, s.id desc limit $6`,
        [ws, mode, status, cur?.ts ?? null, cur?.id ?? null, limit + 1],
      );
      const page = q.rows as Page[];
      const gated = await withRealGate(c, d.cfg, ws, page.map((x) => x.w as Record<string, unknown>));
      return page.map((x, i) => ({ ...x, w: gated[i] }));
    });
    send(ctx, 200, pageOf(rows, limit, (x) => x.w));
  });

  r.add("POST", base, async (ctx) => {
    const p = authenticate(ctx, d.cfg);
    requireScope(p, "trade");
    const ws = uuidParam(ctx, "ws");
    const body = await readJson(ctx);
    modeParam(ctx, body.mode);
    const b = strategyBody(body);
    if (b.name === undefined) throw new ApiError("VALIDATION_FAILED", { field: "name", range: `1-${NAME_MAX}` });
    const status = b.status ?? "draft";
    if (status !== "draft" && status !== "paused") throw new ApiError("VALIDATION_FAILED", { field: "status", allowed: ["draft", "paused"] });
    const device = deviceLabel(ctx, body);
    const key = idempotencyKey(ctx);
    await idempotent(ctx, d.db, p, key, body, async () => {
      const w = await asUser(d.db, p.claims, async (c) => {
        const q = await c.query("select public.create_strategy($1, $2, $3, $4::public.strategy_status, $5) as r", [ws, b.name, JSON.stringify(b.settings ?? {}), status, device]);
        return q.rows[0]?.r as Record<string, unknown>;
      });
      const { server_now, ...data } = w;
      return { status: 201, body: { data, server_now }, headers: { ...etag(data.rev), Location: `/v1/workspaces/${ws}/strategies/${String(data.id)}` } };
    });
  });

  r.add("GET", `${base}/:id`, async (ctx) => {
    const p = authenticate(ctx, d.cfg);
    requireScope(p, "read");
    const ws = uuidParam(ctx, "ws");
    const id = uuidParam(ctx, "id");
    const w = await asUser(d.db, p.claims, async (c) => (await withRealGate(c, d.cfg, ws, [await strategyIn(c, id, ws)]))[0]!);
    send(ctx, 200, { data: w }, etag(w.rev));
  });

  r.add("GET", `${base}/:id/revisions`, async (ctx) => {
    const p = authenticate(ctx, d.cfg);
    requireScope(p, "read");
    const ws = uuidParam(ctx, "ws");
    const id = uuidParam(ctx, "id");
    const limit = limitParam(ctx, 50, 100);
    const cur = cursorParam(ctx, "int");
    const rows = await asUser(d.db, p.claims, async (c) => {
      await strategyIn(c, id, ws);
      const q = await c.query(
        `select rev, name, status::text as status, changed_by, changed_via, device, created_at, ${cursorCols("created_at", "rev")}
           from public.strategy_revisions where strategy_id = $1 and ($2::int is null or rev < $2::int)
          order by rev desc limit $3`,
        [id, cur?.id ?? null, limit + 1],
      );
      return q.rows as Page[];
    });
    send(ctx, 200, pageOf(rows, limit, ({ cur_ts: _t, cur_id: _i, ...x }) => ({ ...x, created_at: iso(x.created_at) })));
  });

  /** Merge base for the 3-way conflict review. */
  r.add("GET", `${base}/:id/revisions/:rev`, async (ctx) => {
    const p = authenticate(ctx, d.cfg);
    requireScope(p, "read");
    const ws = uuidParam(ctx, "ws");
    const id = uuidParam(ctx, "id");
    const rev = Number(ctx.params.rev);
    if (!Number.isInteger(rev) || rev < 1) throw new ApiError("NOT_FOUND");
    const row = await asUser(d.db, p.claims, async (c) => {
      await strategyIn(c, id, ws);
      const q = await c.query(
        `select strategy_id as id, rev, name, status::text as status, settings, changed_by, changed_via, device, created_at
           from public.strategy_revisions where strategy_id = $1 and rev = $2`,
        [id, rev],
      );
      return q.rows[0] as Record<string, unknown> | undefined;
    });
    if (!row) throw new ApiError("NOT_FOUND");
    send(ctx, 200, { data: { ...row, created_at: iso(row.created_at) } });
  });

  const load = (p: ReturnType<typeof authenticate>, id: string, ws: string) => () => asUser(d.db, p.claims, (c) => strategyIn(c, id, ws));

  /** PATCH: `{settings_patch?, name?, status?}` + If-Match / expected_rev. JSON merge patch (null removes a key). */
  r.add("PATCH", `${base}/:id`, async (ctx) => {
    const p = authenticate(ctx, d.cfg);
    requireScope(p, "trade");
    const ws = uuidParam(ctx, "ws");
    const id = uuidParam(ctx, "id");
    const body = await readJson(ctx);
    const b = strategyBody(body);
    if (b.settings !== undefined) throw new ApiError("VALIDATION_FAILED", { field: "settings", hint: "PATCH takes settings_patch" });
    if (b.status !== undefined && !["draft", "running", "paused"].includes(b.status)) {
      throw new ApiError("VALIDATION_FAILED", { field: "status", allowed: ["draft", "running", "paused"], hint: "archive/delete have their own endpoints" });
    }
    const rev = requireRev(expectedRev(ctx, body));
    const device = deviceLabel(ctx, body);
    const key = idempotencyKey(ctx);
    await idempotent(ctx, d.db, p, key, { ...body, expected_rev: rev }, () =>
      withCurrent(async () => {
        const w = await asUser(d.db, p.claims, async (c) => {
          const cur = await strategyIn(c, id, ws);
          const weak = b.patch ? await weakenedFields(c, cur, b.patch) : [];
          if (weak.length > 0) {
            // weakening never applies directly: the whole patch becomes a guard_change proposal (24 h)
            if (b.name !== undefined || b.status !== undefined) {
              throw new ApiError("VALIDATION_FAILED", { field: "settings_patch", hint: "send name/status separately from a guard-weakening patch" });
            }
            const q = await c.query("select public.propose_guard_change($1, $2, $3, $4) as r", [id, rev, JSON.stringify(b.patch), device]);
            const out = q.rows[0]?.r as Record<string, unknown>;
            return { proposal: out };
          }
          const q = await c.query("select public.update_strategy($1, $2, $3, $4, $5::public.strategy_status, $6, null) as r", [
            id, rev, b.patch ? JSON.stringify(b.patch) : null, b.name ?? null, b.status ?? null, device,
          ]);
          const out = q.rows[0]?.r as Record<string, unknown>;
          const err = fromReturnedError(out);
          if (err) throw err;
          return strategyIn(c, id, ws);
        });
        if ("proposal" in w) {
          const { server_now, ...data } = w.proposal as Record<string, unknown>;
          const pid = (data.proposal as Record<string, unknown>).id;
          return { status: 202, body: { data, server_now }, headers: { Location: `/v1/workspaces/${ws}/approvals/${String(pid)}` } };
        }
        return { status: 200, body: { data: w }, headers: etag(w.rev) };
      }, load(p, id, ws)),
    );
  });

  const status = (to: "running" | "paused") => async (ctx: Ctx) => {
    const p = authenticate(ctx, d.cfg);
    requireScope(p, "trade");
    const ws = uuidParam(ctx, "ws");
    const id = uuidParam(ctx, "id");
    const body = await readJson(ctx);
    const rev = requireRev(expectedRev(ctx, body));
    const key = idempotencyKey(ctx);
    await idempotent(ctx, d.db, p, key, { ...body, expected_rev: rev }, () =>
      withCurrent(async () => {
        const w = await asUser(d.db, p.claims, async (c) => {
          await strategyIn(c, id, ws);
          const q = await c.query("select public.set_strategy_status($1, $2, $3) as r", [id, to, rev]);
          const err = fromReturnedError(q.rows[0]?.r as Record<string, unknown>);
          if (err) throw err;
          return strategyIn(c, id, ws);
        });
        return { status: 200, body: { data: w }, headers: etag(w.rev) };
      }, load(p, id, ws)),
    );
  };
  r.add("POST", `${base}/:id/pause`, status("paused"));
  r.add("POST", `${base}/:id/resume`, status("running"));

  // Per-strategy Paper/Real switch (Web StrategyModeCard, additive to 1.1.6).
  // Unlike modeParam, `real` is a valid request body here: the answer is 403 MODE_NOT_ALLOWED with
  // real_locked details, not REAL_SOL_DISABLED. Same mode -> 200 without a write; real -> practice is kept
  // for the phase-7 contract and only ever moves down to practice.
  r.add("POST", `${base}/:id/mode`, async (ctx) => {
    const p = authenticate(ctx, d.cfg);
    requireScope(p, "trade");
    const ws = uuidParam(ctx, "ws");
    const id = uuidParam(ctx, "id");
    const body = await readJson(ctx);
    const mode = modeBody(body);
    const rev = requireRev(expectedRev(ctx, body));
    const device = deviceLabel(ctx, body);
    const key = idempotencyKey(ctx);
    await idempotent(ctx, d.db, p, key, { ...body, expected_rev: rev }, () =>
      withCurrent(async () => {
        const out = await asUser(d.db, p.claims, async (c) => {
          await requireMember(c, ws);
          await strategyIn(c, id, ws); // cross-workspace -> 404 before any write
          const q = await c.query("select public.set_strategy_mode($1, $2::public.trade_mode, $3, $4) as r", [id, mode, rev, device]);
          const r = q.rows[0]?.r as Record<string, unknown> | undefined;
          if (!r) throw new ApiError("INTERNAL");
          const err = fromReturnedError(r);
          if (err) throw err;
          const { server_now, ...wire } = r;
          const [gated] = await withRealGate(c, d.cfg, ws, [wire]);
          return { data: gated!, server_now: iso(server_now) };
        });
        return { status: 200, body: { data: out.data, server_now: out.server_now }, headers: etag(out.data.rev) };
      }, load(p, id, ws)),
    );
  });

  const retire = (action: "archive" | "delete") => async (ctx: Ctx) => {
    const p = authenticate(ctx, d.cfg);
    requireScope(p, "trade");
    const ws = uuidParam(ctx, "ws");
    const id = uuidParam(ctx, "id");
    const body = await readJson(ctx);
    const rev = requireRev(expectedRev(ctx, body));
    const key = idempotencyKey(ctx);
    await idempotent(ctx, d.db, p, key, { ...body, expected_rev: rev, action }, () =>
      withCurrent(async () => {
        const out = await asUser(d.db, p.claims, async (c) => {
          await strategyIn(c, id, ws);
          const q = await c.query("select public.retire_strategy_by_user($1, $2, $3) as r", [id, rev, action]);
          return q.rows[0]?.r as Record<string, unknown>;
        });
        const { server_now, ...data } = out;
        return { status: 200, body: { data, server_now }, headers: action === "archive" ? etag(data.rev) : {} };
      }, load(p, id, ws)),
    );
  };
  r.add("POST", `${base}/:id/archive`, retire("archive"));
  r.add("DELETE", `${base}/:id`, retire("delete"));

  // ---- practice reset (a direct user action, not a proposal) ------------------------------------
  r.add("POST", "/v1/workspaces/:ws/practice/reset", async (ctx) => {
    const p = authenticate(ctx, d.cfg);
    requireScope(p, "trade");
    const ws = uuidParam(ctx, "ws");
    const body = await readJson(ctx);
    modeParam(ctx, body.mode);
    const key = idempotencyKey(ctx);
    await idempotent(ctx, d.db, p, key, body, async () => {
      const out = await asUser(d.db, p.claims, async (c) => {
        await requireMember(c, ws);
        const q = await c.query("select public.reset_practice($1) as r", [ws]);
        const r = q.rows[0]?.r as Record<string, unknown>;
        // SQL returns raw timestamptz in jsonb (session-zone offset, microseconds); the wire is IsoTs (UTC, ms, Z)
        return { ...r, next_allowed_at: iso(r.next_allowed_at), server_now: iso(r.server_now) };
      });
      return { status: 200, body: out };
    });
  });

  r.add("GET", "/v1/workspaces/:ws/practice/resets", async (ctx) => {
    const p = authenticate(ctx, d.cfg);
    requireScope(p, "read");
    const ws = uuidParam(ctx, "ws");
    const limit = limitParam(ctx, 20, 100);
    const cur = cursorParam(ctx, "int");
    const rows = await asUser(d.db, p.claims, async (c) => {
      await requireMember(c, ws);
      const q = await c.query(
        `select id::text as id, from_epoch, to_epoch, starting_lamports::text as starting_lamports, actor_user, archived, created_at,
                ${cursorCols("created_at", "id")}
           from public.practice_resets where workspace_id = $1
            and ($2::timestamptz is null or (created_at, id) < ($2::timestamptz, $3::bigint))
          order by created_at desc, id desc limit $4`,
        [ws, cur?.ts ?? null, cur?.id ?? null, limit + 1],
      );
      return q.rows as Page[];
    });
    send(ctx, 200, pageOf(rows, limit, ({ cur_ts: _t, cur_id: _i, ...x }) => ({ ...x, created_at: iso(x.created_at) })));
  });
}
