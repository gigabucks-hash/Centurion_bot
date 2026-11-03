// MCP tools (MCP_DESIGN section 4). Each tool maps to existing REST handlers through dispatch(); the tool layer
// only shapes input/output. Forbidden capabilities have no tool here (L1) and are refused again at the route
// guard (L2), requireApp (L3), SQL triggers/RPCs (L4).
import { ApiError } from "../errors.ts";
import { asService } from "../db.ts";
import type { AgentDeps, Scope } from "./common.ts";
import { dispatch, type Caller, type Reply } from "./dispatch.ts";
import { UNTRUSTED_NOTE } from "./envelope.ts";

export type Kind = "read" | "write" | "approval" | "sell";

export interface ToolCtx {
  d: AgentDeps;
  who: Caller;
  args: Record<string, unknown>;
}

export interface Tool {
  name: string;
  title: string;
  scope: Scope;
  kind: Kind;
  /** Instant notification (pause/resume, sells); every other write goes to the digest (lead answer Q6). */
  instant?: boolean;
  description: string;
  inputSchema: Record<string, unknown>;
  /** (method, route pattern) pairs this tool may reach (L2 allowlist). */
  routes: string[];
  run(t: ToolCtx): Promise<Record<string, unknown>>;
}

const W = "/v1/workspaces/:ws";
const UUID_S = { type: "string", format: "uuid" };
const MODE_S = { type: "string", enum: ["practice", "real"], default: "practice", description: "practice (paper) only; real -> MODE_NOT_ALLOWED" };
const REV_S = { type: "integer", minimum: 1, description: "rev of the resource you read (sent as If-Match)" };
const KEY_S = { type: "string", minLength: 8, maxLength: 128, description: "unique per intended action (Idempotency-Key)" };
const obj = (properties: Record<string, unknown>, required: string[] = []) => ({ type: "object", properties: { mode: MODE_S, ...properties }, required, additionalProperties: false });

/** Third-party data rule, appended to every description. */
const desc = (s: string) => `${s} ${UNTRUSTED_NOTE}`;

function mode(args: Record<string, unknown>): void {
  const m = args.mode ?? "practice";
  if (m === "real") throw new ApiError("MODE_NOT_ALLOWED", { allowed: ["practice"], hint: "Real trading is app-only" });
  if (m !== "practice") throw new ApiError("VALIDATION_FAILED", { field: "mode", allowed: ["practice"] });
}

function str(args: Record<string, unknown>, k: string, re: RegExp, required = true): string | undefined {
  const v = args[k];
  if (v === undefined || v === null) {
    if (required) throw new ApiError("VALIDATION_FAILED", { field: k, reason: "required" });
    return undefined;
  }
  if (typeof v !== "string" || !re.test(v)) throw new ApiError("VALIDATION_FAILED", { field: k });
  return v;
}
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const KEY = /^[\x21-\x7e]{8,128}$/;
function int(args: Record<string, unknown>, k: string, min: number, max: number, required: boolean): number | undefined {
  const v = args[k];
  if (v === undefined || v === null) {
    if (required) throw new ApiError("VALIDATION_FAILED", { field: k, reason: "required" });
    return undefined;
  }
  if (typeof v !== "number" || !Number.isInteger(v) || v < min || v > max) throw new ApiError("VALIDATION_FAILED", { field: k, range: `${min}-${max}` });
  return v;
}

/** REST error envelope -> ApiError (same code and details the app would see). */
function ok(r: Reply): any {
  if (r.status >= 200 && r.status < 300) return r.body;
  const e = (r.body?.error ?? {}) as Record<string, unknown>;
  const { code, message: _m, request_id: _r, server_now: _s, ...rest } = e;
  throw new ApiError(typeof code === "string" ? code : "INTERNAL", rest);
}

function qs(o: Record<string, unknown>): string {
  const u = new URLSearchParams();
  for (const [k, v] of Object.entries(o)) if (v !== undefined && v !== null) u.set(k, String(v));
  const s = u.toString();
  return s ? `?${s}` : "";
}

const go = (t: ToolCtx, tool: Tool, method: string, path: string, o: { body?: unknown; headers?: Record<string, string> } = {}) =>
  dispatch(t.d, t.who, tool.routes, method, path.replace(":ws", t.who.ws), o);

function writeHeaders(args: Record<string, unknown>, rev: boolean): Record<string, string> {
  const key = str(args, "idempotency_key", KEY)!;
  const h: Record<string, string> = { "idempotency-key": key };
  if (rev) h["if-match"] = `"${int(args, "expected_rev", 1, 999_999_999, true)}"`;
  return h;
}

export const TOOLS: Tool[] = [
  {
    name: "get_status", title: "Status", scope: "read", kind: "read",
    description: desc("Centurion Trade practice status: buys paused?, strategies with rev, open positions, pending cards."),
    inputSchema: obj({}),
    routes: [`GET ${W}`, `GET ${W}/strategies`, `GET ${W}/trading`, `GET ${W}/positions`, `GET ${W}/approvals`],
    async run(t) {
      mode(t.args);
      const [ws, st, tr, pos, cards] = await Promise.all([
        go(t, this, "GET", W), go(t, this, "GET", `${W}/strategies`), go(t, this, "GET", `${W}/trading`),
        go(t, this, "GET", `${W}/positions?state=open&limit=100`), go(t, this, "GET", `${W}/approvals?status=pending&limit=100`),
      ]);
      const strategies = (ok(st).items ?? []) as Record<string, unknown>[];
      return {
        workspace: ok(ws).data, trading: ok(tr).data,
        strategies: strategies.map((s) => ({ id: s.id, name: s.name, status: s.status, rev: s.rev })),
        open_positions: (ok(pos).items ?? []).length, pending_cards: (ok(cards).items ?? []).length,
      };
    },
  },
  {
    name: "list_positions", title: "Positions", scope: "read", kind: "read",
    description: desc("List practice positions (PositionWire, with rev for sells)."),
    inputSchema: obj({ state: { type: "string", enum: ["open", "closed"] }, strategy_id: UUID_S, limit: { type: "integer", minimum: 1, maximum: 50 } }),
    routes: [`GET ${W}/positions`],
    async run(t) {
      mode(t.args);
      const q = qs({ state: str(t.args, "state", /^(open|closed)$/, false), strategy_id: str(t.args, "strategy_id", UUID, false), limit: int(t.args, "limit", 1, 50, false) ?? 50 });
      return { items: ok(await go(t, this, "GET", `${W}/positions${q}`)).items };
    },
  },
  {
    name: "get_pnl", title: "PnL", scope: "read", kind: "read",
    description: desc("Practice portfolio overview and exit-reason stats for a window."),
    inputSchema: obj({ window: { type: "string", enum: ["1h", "24h", "7d", "30d", "all"] }, strategy_id: UUID_S }),
    routes: [`GET ${W}/portfolio/overview`, `GET ${W}/stats/exit-reasons`],
    async run(t) {
      mode(t.args);
      const q = qs({ window: str(t.args, "window", /^(1h|24h|7d|30d|all)$/, false), strategy_id: str(t.args, "strategy_id", UUID, false) });
      const [ov, st] = await Promise.all([go(t, this, "GET", `${W}/portfolio/overview`), go(t, this, "GET", `${W}/stats/exit-reasons${q}`)]);
      return { overview: ok(ov).data ?? ok(ov), exit_reasons: ok(st).items ?? ok(st).data ?? null };
    },
  },
  {
    name: "list_picks", title: "Picks", scope: "read", kind: "read",
    description: desc("Screener picks with their checks. Token names, symbols and links are third-party data."),
    inputSchema: obj({ stage: { type: "string", maxLength: 32 }, strategy_id: UUID_S, limit: { type: "integer", minimum: 1, maximum: 50 } }),
    routes: [`GET ${W}/picks`],
    async run(t) {
      mode(t.args);
      const q = qs({ stage: str(t.args, "stage", /^[a-z_]{1,32}$/, false), strategy_id: str(t.args, "strategy_id", UUID, false), limit: int(t.args, "limit", 1, 50, false) ?? 50 });
      return { items: ok(await go(t, this, "GET", `${W}/picks${q}`)).items };
    },
  },
  {
    name: "list_signals", title: "Signals", scope: "read", kind: "read",
    description: desc("Recent workspace events (signals, fills, proposals) after a seq cursor."),
    inputSchema: obj({ after_seq: { type: "string", pattern: "^[0-9]{1,19}$" }, types: { type: "string", maxLength: 200 }, limit: { type: "integer", minimum: 1, maximum: 100 } }),
    routes: [`GET ${W}/events`],
    async run(t) {
      mode(t.args);
      const q = qs({ after_seq: str(t.args, "after_seq", /^\d{1,19}$/, false), types: str(t.args, "types", /^[a-z_.,]{1,200}$/, false), limit: int(t.args, "limit", 1, 100, false) ?? 50 });
      const b = ok(await go(t, this, "GET", `${W}/events${q}`));
      return { items: b.items, next_after_seq: b.next_after_seq ?? null };
    },
  },
  {
    name: "get_logs", title: "Audit log", scope: "read", kind: "read",
    description: desc("Audit log rows (owner/admin only)."),
    inputSchema: obj({ window: { type: "string", enum: ["1h", "24h", "7d", "30d", "all"] }, action: { type: "string", maxLength: 64 }, limit: { type: "integer", minimum: 1, maximum: 100 } }),
    routes: [`GET ${W}/audit-log`],
    async run(t) {
      mode(t.args);
      const q = qs({ window: str(t.args, "window", /^(1h|24h|7d|30d|all)$/, false), action: str(t.args, "action", /^[a-z_.]{1,64}$/, false), limit: int(t.args, "limit", 1, 100, false) ?? 50 });
      return { items: ok(await go(t, this, "GET", `${W}/audit-log${q}`)).items };
    },
  },
  {
    name: "get_quote", title: "Sell quote", scope: "read", kind: "read",
    description: desc("Indicative practice sell quote for an open position (no state change)."),
    inputSchema: obj({ position_id: UUID_S, fraction_bps: { type: "integer", minimum: 1, maximum: 10000 } }, ["position_id"]),
    routes: [`POST ${W}/positions/:id/close/preview`],
    async run(t) {
      mode(t.args);
      const id = str(t.args, "position_id", UUID)!;
      const f = int(t.args, "fraction_bps", 1, 10000, false) ?? 10000;
      return { quote: ok(await go(t, this, "POST", `${W}/positions/${id}/close/preview`, { body: { fraction_bps: f } })).data };
    },
  },
  {
    name: "list_cards", title: "Cards", scope: "read", kind: "read",
    description: desc("Approval cards (pending first). Only practice buy_pick cards can be decided by an agent."),
    inputSchema: obj({ status: { type: "string", enum: ["pending", "approved", "rejected", "expired"] }, kind: { type: "string", enum: ["buy_pick", "guard_change", "team_action"] } }),
    routes: [`GET ${W}/approvals`],
    async run(t) {
      mode(t.args);
      const q = qs({ status: str(t.args, "status", /^(pending|approved|rejected|expired)$/, false), kind: str(t.args, "kind", /^(buy_pick|guard_change|team_action)$/, false) });
      return { items: ok(await go(t, this, "GET", `${W}/approvals${q}`)).items };
    },
  },
  // ---- control ---------------------------------------------------------------------------------
  ...(["pause_buys", "resume_buys"] as const).map((name): Tool => ({
    name, title: name === "pause_buys" ? "Pause buys" : "Resume buys", scope: "control", kind: "write", instant: true,
    description: desc(name === "pause_buys"
      ? "Stop: pause new buys in this workspace (exits keep running). Needs expected_rev from get_status.trading.rev."
      : "Resume buys. Refused (RESUME_REQUIRES_APP) when the pause was set from the Centurion Trade app."),
    inputSchema: obj({ expected_rev: REV_S, idempotency_key: KEY_S, reason: { type: "string", maxLength: 200 } }, ["expected_rev", "idempotency_key"]),
    routes: [`POST ${W}/trading/${name === "pause_buys" ? "pause-buys" : "resume-buys"}`],
    async run(t) {
      mode(t.args);
      const h = writeHeaders(t.args, true);
      const reason = str(t.args, "reason", /^[^\u0000-\u001f]{1,200}$/, false);
      return ok(await go(t, this, "POST", `${W}/trading/${name === "pause_buys" ? "pause-buys" : "resume-buys"}`, { body: reason ? { reason } : {}, headers: h })).data;
    },
  })),
  ...(["start_strategy", "stop_strategy"] as const).map((name): Tool => ({
    name, title: name === "start_strategy" ? "Start strategy" : "Stop strategy", scope: "control", kind: "write",
    description: desc(`${name === "start_strategy" ? "Resume" : "Pause"} one practice strategy. Needs its rev.`),
    inputSchema: obj({ strategy_id: UUID_S, expected_rev: REV_S, idempotency_key: KEY_S }, ["strategy_id", "expected_rev", "idempotency_key"]),
    routes: [`POST ${W}/strategies/:id/${name === "start_strategy" ? "resume" : "pause"}`],
    async run(t) {
      mode(t.args);
      const id = str(t.args, "strategy_id", UUID)!;
      const h = writeHeaders(t.args, true);
      const b = ok(await go(t, this, "POST", `${W}/strategies/${id}/${name === "start_strategy" ? "resume" : "pause"}`, { body: {}, headers: h }));
      return b.data ?? b;
    },
  })),
  {
    name: "tighten_limits", title: "Tighten limits", scope: "control", kind: "write",
    description: desc("Make a strategy's guards/limits STRICTER (JSON merge patch on settings). Any loosening is refused with LOOSEN_REQUIRES_APP and nothing is created; loosening is app-only."),
    inputSchema: obj({ strategy_id: UUID_S, expected_rev: REV_S, idempotency_key: KEY_S, settings_patch: { type: "object" } }, ["strategy_id", "expected_rev", "idempotency_key", "settings_patch"]),
    routes: [`GET ${W}/strategies/:id`, `PATCH ${W}/strategies/:id`],
    async run(t) {
      mode(t.args);
      const id = str(t.args, "strategy_id", UUID)!;
      const patch = t.args.settings_patch;
      if (!patch || typeof patch !== "object" || Array.isArray(patch) || Object.keys(patch).length === 0) throw new ApiError("VALIDATION_FAILED", { field: "settings_patch" });
      const h = writeHeaders(t.args, true);
      // L1 pre-check with the same SQL classifier the PATCH uses (L4 trigger refuses it again)
      const cur = ok(await go(t, this, "GET", `${W}/strategies/${id}`)).data as { settings: Record<string, unknown> };
      const merged: Record<string, unknown> = { ...cur.settings };
      for (const [k, v] of Object.entries(patch)) if (v === null) delete merged[k]; else merged[k] = v;
      const weak = await asService(t.d.db, async (c) => (await c.query<{ f: string[] }>(
        "select public.guard_weakened_fields($1::jsonb, $2::jsonb) as f", [JSON.stringify(cur.settings), JSON.stringify(merged)])).rows[0]?.f ?? []);
      if (weak.length) throw new ApiError("LOOSEN_REQUIRES_APP", { weakened_fields: weak, hint: "loosening is app-only" });
      const r = await go(t, this, "PATCH", `${W}/strategies/${id}`, { body: { settings_patch: patch }, headers: h });
      if (r.status === 202) throw new ApiError("LOOSEN_REQUIRES_APP", {});
      const b = ok(r);
      return b.data ?? b;
    },
  },
  {
    name: "decide_card", title: "Approve or skip a card", scope: "control", kind: "approval",
    description: desc("Approve or skip one PRACTICE buy_pick card. Other kinds are app-only (APPROVAL_REQUIRES_APP). Needs the card's rev."),
    inputSchema: obj({ approval_id: UUID_S, expected_rev: REV_S, idempotency_key: KEY_S, decision: { type: "string", enum: ["approve", "skip"] } }, ["approval_id", "expected_rev", "idempotency_key", "decision"]),
    routes: [`GET ${W}/approvals/:id`, `POST ${W}/approvals/:id/decision`],
    async run(t) {
      mode(t.args);
      const id = str(t.args, "approval_id", UUID)!;
      const decision = str(t.args, "decision", /^(approve|skip)$/)!;
      const h = writeHeaders(t.args, true);
      const card = ok(await go(t, this, "GET", `${W}/approvals/${id}`)).data as Record<string, unknown>;
      if (card.kind !== "buy_pick" || (card.mode ?? "practice") !== "practice") throw new ApiError("APPROVAL_REQUIRES_APP", { kind: card.kind });
      if (typeof card.decision_token !== "string") throw new ApiError(card.status === "pending" ? "APPROVAL_EXPIRED" : "APPROVAL_ALREADY_DECIDED", {});
      const body = decision === "approve"
        ? { decision: "approve", token: card.decision_token }
        : { decision: "reject", token: card.decision_token, reject_reason: "user_declined" };
      return ok(await go(t, this, "POST", `${W}/approvals/${id}/decision`, { body, headers: h })).data;
    },
  },
  // ---- trade (paper only; the in-app toggle must be on; Real is app-only: MODE_NOT_ALLOWED) -------
  {
    name: "approve_real_buy", title: "Approve a Real buy", scope: "trade", kind: "approval",
    description: desc("Reserved. Real buys are app-only: always MODE_NOT_ALLOWED."),
    inputSchema: obj({ approval_id: UUID_S }, ["approval_id"]),
    routes: [],
    async run() {
      throw new ApiError("MODE_NOT_ALLOWED", { allowed: ["practice"], hint: "Real buys are approved in the Centurion Trade app only" });
    },
  },
  {
    name: "sell_position", title: "Sell a paper position", scope: "trade", kind: "sell", instant: true,
    description: desc("Sell (close) one PRACTICE position, all or fraction_bps. Needs the position rev. Requires agent trading to be on in the app."),
    inputSchema: obj({ position_id: UUID_S, expected_rev: REV_S, idempotency_key: KEY_S, fraction_bps: { type: "integer", minimum: 1, maximum: 10000 } }, ["position_id", "expected_rev", "idempotency_key"]),
    routes: [`POST ${W}/positions/:id/close`],
    async run(t) {
      mode(t.args);
      const id = str(t.args, "position_id", UUID)!;
      const h = writeHeaders(t.args, true);
      const f = int(t.args, "fraction_bps", 1, 10000, false) ?? 10000;
      return ok(await go(t, this, "POST", `${W}/positions/${id}/close`, { body: { fraction_bps: f }, headers: h }));
    },
  },
  {
    name: "sell_all", title: "Sell all paper positions", scope: "trade", kind: "sell", instant: true,
    description: desc("Sell every open PRACTICE position (1 per 60 s per workspace). confirm must be \"SELL ALL\". Requires agent trading to be on in the app."),
    inputSchema: obj({ idempotency_key: KEY_S, confirm: { type: "string", const: "SELL ALL" } }, ["idempotency_key", "confirm"]),
    routes: [`POST ${W}/trading/sell-all`],
    async run(t) {
      mode(t.args);
      if (t.args.confirm !== "SELL ALL") throw new ApiError("CONFIRMATION_REQUIRED", { required: { confirm: "SELL ALL" } });
      const h = writeHeaders(t.args, false);
      return ok(await go(t, this, "POST", `${W}/trading/sell-all`, { body: {}, headers: h })).data;
    },
  },
];

/**
 * Capabilities that never exist for an agent (MCP_DESIGN section 3). Calling one of these names is a refused
 * attempt: FORBIDDEN_SCOPE {required: app}, an instant `agent.refused` event, and repeated attempts suspend
 * the grant. The list is for detection only; nothing here is implemented.
 */
export const NEVER_TOOLS = new Set([
  "withdraw", "withdraw_funds", "transfer", "change_owner_wallet", "set_owner_wallet", "change_wallet",
  "grant_signer", "revoke_signer", "regrant_signer", "export_key", "loosen_limits", "raise_limits", "set_limits",
  "weaken_guard", "propose_guard_change", "decide_guard_change", "update_strategy", "create_strategy",
  "archive_strategy", "delete_strategy", "clear_kill_switch", "enable_real_trading", "practice_reset",
  "reset_practice", "delete_account", "manage_agents", "set_agent_trade", "approve_guard_change",
]);

export const toolByName = new Map(TOOLS.map((t) => [t.name, t]));
