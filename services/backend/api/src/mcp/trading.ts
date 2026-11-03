// Workspace-level Stop (pause new buys; REAL_MONEY_OPTIONS rev4 section 5) and paper sell-all.
// Plain REST endpoints for the apps; agents reach them only through the MCP dispatcher (same handlers).
//   GET  /v1/workspaces/:ws/trading                 read
//   POST /v1/workspaces/:ws/trading/pause-buys      trade (practice mutation), If-Match/expected_rev, Idempotency-Key
//   POST /v1/workspaces/:ws/trading/resume-buys     same; an agent cannot resume a pause set from the app (RESUME_REQUIRES_APP)
//   POST /v1/workspaces/:ws/trading/sell-all        trade, Idempotency-Key (= sell_all_id), 1 per 60 s per workspace
import { ApiError } from "../errors.ts";
import { asService, asUser } from "../db.ts";
import { readJson, send, type Router } from "../http.ts";
import { idempotent } from "../idem.ts";
import { authenticate } from "../deps.ts";
import { expectedRev, idempotencyKey, modeParam, requireRev, requireScope, uuidParam } from "../rules.ts";
import type { Principal } from "../jwt.ts";
import type { AgentDeps } from "./common.ts";
import { agentSettings } from "./consent.ts";

function agentOf(p: Principal): Record<string, unknown> | null {
  const a = p.claims.agent as Record<string, unknown> | undefined;
  return p.via === "mcp" && a ? { source: "agent", via: "mcp", grant_id: a.grant_id, client_id: a.client_id } : null;
}

async function requireTrader(d: AgentDeps, p: Principal, ws: string): Promise<void> {
  const ok = await asUser(d.db, p.claims, async (c) =>
    (await c.query<{ ok: boolean }>("select public.has_workspace_role($1::uuid, array['owner','admin','trader']::public.workspace_role[]) as ok", [ws])).rows[0]?.ok);
  if (!ok) throw new ApiError("FORBIDDEN_ROLE");
}

async function emit(d: AgentDeps, ws: string, p: Principal, type: string, payload: Record<string, unknown>): Promise<void> {
  const a = agentOf(p);
  const name = (p.claims.agent as Record<string, unknown> | undefined)?.client_name;
  await asService(d.db, (c) => c.query(
    `insert into public.events (id, workspace_id, ts, type, actor, payload, untrusted)
     values ($1 || ':' || (extract(epoch from clock_timestamp()) * 1000)::bigint || ':' || $2, $1::uuid, clock_timestamp(), $2, 'user', $3, $4)`,
    [ws, type, JSON.stringify({ ...payload, via: p.via, ...(a ? { agent: a, notify: "instant" } : {}) }),
      JSON.stringify(a && typeof name === "string" ? { agent_client_name: name.slice(0, 100) } : {})]));
}

const wire = (s: Record<string, unknown>) => ({
  buys_paused: s.buys_paused, buys_paused_via: s.buys_paused_via, buys_paused_at: s.buys_paused_at,
  agent_trade_enabled: s.trade_enabled, rev: s.rev,
});

export function registerTrading(r: Router, d: AgentDeps): void {
  const base = "/v1/workspaces/:ws/trading";

  r.add("GET", base, async (ctx) => {
    const p = authenticate(ctx, d.cfg);
    requireScope(p, "read");
    const ws = uuidParam(ctx, "ws");
    modeParam(ctx);
    await asUser(d.db, p.claims, async (c) => {
      const ok = (await c.query<{ ok: boolean }>("select public.is_workspace_member($1::uuid) as ok", [ws])).rows[0]?.ok;
      if (!ok) throw new ApiError("NOT_FOUND");
    });
    const s = await agentSettings(d, ws);
    send(ctx, 200, { data: wire(s) }, { ETag: `"${s.rev}"` });
  });

  const setPaused = (paused: boolean) => async (ctx: Parameters<Parameters<Router["add"]>[2]>[0]) => {
    const p = authenticate(ctx, d.cfg);
    requireScope(p, "trade");
    const ws = uuidParam(ctx, "ws");
    const body = await readJson(ctx);
    modeParam(ctx, body.mode);
    if (body.reason !== undefined && (typeof body.reason !== "string" || body.reason.length > 200)) throw new ApiError("VALIDATION_FAILED", { field: "reason", max: 200 });
    const rev = requireRev(expectedRev(ctx, body));
    const key = idempotencyKey(ctx);
    await requireTrader(d, p, ws);
    await agentSettings(d, ws);
    await idempotent(ctx, d.db, p, key, body, async () => {
      const row = await asService(d.db, async (c) => {
        const cur = (await c.query("select * from public.agent_settings where workspace_id = $1 for update", [ws])).rows[0]!;
        if (cur.rev !== rev) throw new ApiError("VERSION_CONFLICT", { current_rev: cur.rev, base_rev: rev, current: wire(cur) });
        if (!paused && p.via === "mcp" && cur.buys_paused && cur.buys_paused_via !== "mcp") {
          throw new ApiError("RESUME_REQUIRES_APP", { paused_via: cur.buys_paused_via });
        }
        const u = await c.query(
          `update public.agent_settings set buys_paused = $2, buys_paused_via = case when $2 then $3 else null end,
                  buys_paused_by = case when $2 then $4::uuid else null end, buys_paused_at = case when $2 then now() else null end,
                  rev = rev + 1, updated_at = now() where workspace_id = $1 returning *`, [ws, paused, p.via, p.userId]);
        return u.rows[0]!;
      });
      const a = agentOf(p);
      await asService(d.db, (c) => c.query(
        `insert into public.audit_log (workspace_id, actor_user, actor_kind, actor_via, action, target_type, target, after, risk, request_id, proof_kind)
         values ($1::uuid, $2, 'user', $3, $4, 'workspace', $1::text, $5, $6, $7, 'none')`,
        [ws, p.userId, p.via, paused ? "buys.pause" : "buys.resume", JSON.stringify({ reason: body.reason ?? null }),
          a ? JSON.stringify({ agent: { ...a, client_name: (p.claims.agent as Record<string, unknown>).client_name } }) : null, ctx.requestId]));
      await emit(d, ws, p, paused ? "buys.paused" : "buys.resumed", { rev: row.rev });
      return { status: 200, body: { data: wire(row) }, headers: { ETag: `"${row.rev}"` } };
    });
  };
  r.add("POST", `${base}/pause-buys`, setPaused(true));
  r.add("POST", `${base}/resume-buys`, setPaused(false));

  /** Paper sell-all: every open practice position through close_position() (all its guards), per-item results. */
  r.add("POST", `${base}/sell-all`, async (ctx) => {
    const p = authenticate(ctx, d.cfg);
    requireScope(p, "trade");
    const ws = uuidParam(ctx, "ws");
    const body = await readJson(ctx);
    modeParam(ctx, body.mode);
    const key = idempotencyKey(ctx);
    await requireTrader(d, p, ws);
    if (p.via === "mcp" && !(await agentSettings(d, ws)).trade_enabled) throw new ApiError("AGENT_TRADE_DISABLED");
    await idempotent(ctx, d.db, p, key, body, async () => {
      await d.limiter!.hit(`sell_all:${ws}`, 1, 60);
      const open = await asUser(d.db, p.claims, async (c) => (await c.query<{ id: string; rev: number }>(
        `select id, rev from public.positions where workspace_id = $1 and mode = 'practice' and status = 'open'
            and practice_epoch = (select practice_epoch from public.workspaces where id = $1) order by opened_at`, [ws])).rows);
      await emit(d, ws, p, "sell_all.requested", { sell_all_id: key, positions: open.length });
      const results: Record<string, unknown>[] = [];
      for (const [i, pos] of open.entries()) {
        try {
          const r = await asUser(d.db, p.claims, async (c) =>
            (await c.query("select public.close_position($1, $2, $3, 10000) as r", [pos.id, pos.rev, `${key.slice(0, 100)}:sa${i}`])).rows[0]?.r as Record<string, unknown>);
          results.push({ position_id: pos.id, status: r?.status ?? "queued", order_id: r?.order_id ?? null });
        } catch (e) {
          results.push({ position_id: pos.id, status: "failed", error: e instanceof ApiError ? e.code : "INTERNAL" });
        }
      }
      await emit(d, ws, p, "sell_all.completed", { sell_all_id: key, results: results.map((x) => ({ position_id: x.position_id, status: x.status })) });
      return { status: 200, body: { data: { sell_all_id: key, positions: results } } };
    });
  });
}
