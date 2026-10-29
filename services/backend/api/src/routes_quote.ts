// Contracts 1.1.5 quotes (paper only; estimates, nothing is signed or sent):
//   POST /v1/workspaces/{ws}/approvals/{id}/quote      refresh a pending proposal's quote (trade scope)
//   POST /v1/workspaces/{ws}/positions/{id}/close/preview  sell quote for a manual close (read scope)
// plus refreshQuote(), used by GET approval detail to auto-refresh a stale quote. No background timer.
import { ApiError } from "./errors.ts";
import { asService, asUser, requireMember } from "./db.ts";
import { Router, readJson, send } from "./http.ts";
import { authenticate, type Deps } from "./deps.ts";
import { requireScope, uuidParam } from "./rules.ts";
import { APPROVAL_COLUMNS, approvalWire } from "./wire.ts";
import { estimateBuy, estimateSell, type Pool } from "./quote.ts";

export const QUOTE_COALESCE_MS = 3_000;
export const DEFAULT_SLIPPAGE_BPS = 500;
/** Pool states older than this are not quoted (POOL_STALE). */
export const POOL_MAX_AGE_MS = 30_000;
const QUOTABLE = new Set(["buy_pick", "sell_position"]);

interface PoolRow extends Pool { observed_at: Date; decimals: number | null; token_program: string | null }

async function poolFor(d: Deps, mint: string): Promise<PoolRow> {
  const row = await asService(d.db, async (c) => (await c.query<PoolRow>(
    `select p.sol_reserve, p.token_reserve, p.quote_mint, p.observed_at, c.decimals, c.token_program
       from public.pool_states p join public.coins c on c.mint = p.mint where p.mint = $1`, [mint])).rows[0]);
  if (!row) throw new ApiError("POOL_STALE", { reason: "no_pool_state", mint });
  if (Date.now() - row.observed_at.getTime() > POOL_MAX_AGE_MS) {
    throw new ApiError("POOL_STALE", { reason: "too_old", mint, observed_at: row.observed_at.toISOString() });
  }
  if (row.decimals === null) throw new ApiError("POOL_STALE", { reason: "decimals_unknown", mint });
  return row;
}

const slippageOf = (v: unknown): number => {
  if (v === undefined || v === null) return DEFAULT_SLIPPAGE_BPS;
  if (typeof v !== "number" || !Number.isInteger(v) || v < 0 || v > 10_000) {
    throw new ApiError("VALIDATION_FAILED", { field: "max_slippage_bps", range: "0-10000" });
  }
  return v;
};
const fractionOf = (v: unknown): number => {
  if (v === undefined || v === null) return 10_000;
  if (typeof v !== "number" || !Number.isInteger(v) || v < 1 || v > 10_000) throw new ApiError("INVALID_FRACTION", { range: "1-10000" });
  return v;
};

/**
 * Refresh a pending approval's quote now from the papersim model and the latest pool state.
 * Coalesced: within 3 s of the previous refresh the current row is returned unchanged (SQL enforces it too).
 */
export async function refreshQuote(d: Deps, a: Record<string, unknown>): Promise<Record<string, unknown>> {
  if (a.status !== "pending") throw new ApiError("APPROVAL_ALREADY_DECIDED");
  if (!QUOTABLE.has(String(a.kind)) || typeof a.mint !== "string") {
    throw new ApiError("VALIDATION_FAILED", { field: "kind", hint: "only buy_pick and sell_position proposals carry a quote" });
  }
  const last = a.quote_refreshed_at instanceof Date ? a.quote_refreshed_at.getTime() : null;
  if (last !== null && Date.now() - last < QUOTE_COALESCE_MS) return a;
  const pool = await poolFor(d, a.mint);
  const payload = (a.payload ?? {}) as Record<string, unknown>;
  const slip = slippageOf(a.max_slippage_bps ?? payload.max_slippage_bps);
  let quote: Record<string, unknown>;
  if (a.kind === "buy_pick") {
    if (a.amount_lamports == null) throw new ApiError("VALIDATION_FAILED", { field: "amount_lamports" });
    const ata = await asService(d.db, async (c) => (await c.query<{ ok: boolean }>(
      `select exists (select 1 from public.positions where workspace_id = $1 and mode = $2::public.trade_mode
                        and mint = $3 and status = 'open' and qty_raw > 0) as ok`, [a.workspace_id, a.mode, a.mint])).rows[0]!.ok);
    quote = { ...estimateBuy(pool, BigInt(String(a.amount_lamports)), pool.decimals!, slip, ata) };
  } else {
    const pos = await asService(d.db, async (c) => (await c.query<{ qty_raw: string }>(
      "select qty_raw::text as qty_raw from public.positions where id = $1 and workspace_id = $2", [a.position_id, a.workspace_id])).rows[0]);
    if (!pos) throw new ApiError("NOT_FOUND", { field: "position_id" });
    const qty = (BigInt(pos.qty_raw) * BigInt(fractionOf(payload.fraction_bps))) / 10_000n;
    const s = estimateSell(pool, qty, pool.decimals!, slip);
    quote = { ...s, min_out_raw: null, est_ata_rent_lamports: "0" };
  }
  await asService(d.db, (c) => c.query("select public.set_approval_quote($1, $2::jsonb)", [a.id, JSON.stringify(quote)]));
  const fresh = await asService(d.db, async (c) =>
    (await c.query(`select ${APPROVAL_COLUMNS} from public.approvals where id = $1`, [a.id])).rows[0] as Record<string, unknown>);
  return fresh;
}

/** GET detail: refresh when the quote is missing or stale; never fails the read (pool may be unavailable). */
export async function autoRefresh(d: Deps, a: Record<string, unknown>): Promise<Record<string, unknown>> {
  if (a.status !== "pending" || !QUOTABLE.has(String(a.kind))) return a;
  const exp = a.quote_expires_at instanceof Date ? a.quote_expires_at.getTime() : null;
  if (exp !== null && exp > Date.now()) return a;
  try {
    return await refreshQuote(d, a);
  } catch (e) {
    if (e instanceof ApiError && ["POOL_STALE", "UNSUPPORTED_QUOTE_MINT", "APPROVAL_ALREADY_DECIDED", "VALIDATION_FAILED", "NOT_FOUND"].includes(e.code)) return a;
    throw e;
  }
}

export function registerQuotes(r: Router, d: Deps): void {
  r.add("POST", "/v1/workspaces/:ws/approvals/:id/quote", async (ctx) => {
    const p = authenticate(ctx, d.cfg);
    requireScope(p, "trade");
    const ws = uuidParam(ctx, "ws");
    const id = uuidParam(ctx, "id");
    const body = await readJson(ctx);
    const unknown = Object.keys(body).filter((k) => k !== "mode");
    if (unknown.length) throw new ApiError("VALIDATION_FAILED", { field: unknown[0]!, hint: "unknown field" });
    const row = await asUser(d.db, p.claims, async (c) => {
      await requireMember(c, ws);
      const res = await c.query(`select ${APPROVAL_COLUMNS} from public.approvals where id = $1 and workspace_id = $2`, [id, ws]);
      return res.rows[0] as Record<string, unknown> | undefined;
    });
    if (!row) throw new ApiError("NOT_FOUND");
    const fresh = await refreshQuote(d, row);
    send(ctx, 200, { data: approvalWire(fresh) });
  });

  r.add("POST", "/v1/workspaces/:ws/positions/:id/close/preview", async (ctx) => {
    const p = authenticate(ctx, d.cfg);
    requireScope(p, "read");
    const ws = uuidParam(ctx, "ws");
    const id = uuidParam(ctx, "id");
    const body = await readJson(ctx);
    const unknown = Object.keys(body).filter((k) => !["fraction_bps", "max_slippage_bps", "mode"].includes(k));
    if (unknown.length) throw new ApiError("VALIDATION_FAILED", { field: unknown[0]!, hint: "unknown field" });
    const fraction = fractionOf(body.fraction_bps);
    const slip = slippageOf(body.max_slippage_bps);
    const pos = await asUser(d.db, p.claims, async (c) => {
      await requireMember(c, ws);
      const res = await c.query<{ mint: string; qty_raw: string; status: string }>(
        "select mint, qty_raw::text as qty_raw, status::text as status from public.positions where id = $1 and workspace_id = $2", [id, ws]);
      return res.rows[0];
    });
    if (!pos) throw new ApiError("NOT_FOUND");
    if (pos.status !== "open" || BigInt(pos.qty_raw) === 0n) throw new ApiError("VALIDATION_FAILED", { field: "position", hint: "position is not open" });
    const pool = await poolFor(d, pos.mint);
    const qty = (BigInt(pos.qty_raw) * BigInt(fraction)) / 10_000n;
    if (qty === 0n) throw new ApiError("INVALID_FRACTION", { range: "1-10000", hint: "fraction rounds to zero tokens" });
    const q = estimateSell(pool, qty, pool.decimals!, slip);
    send(ctx, 200, {
      data: {
        position_id: id, mint: pos.mint, fraction_bps: fraction, qty_raw: qty.toString(),
        decimals: pool.decimals, token_program: pool.token_program, ...q,
      },
    });
  });
}
