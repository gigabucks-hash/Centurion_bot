import type { ClosedTradeView, PnlSummaryView, PnlWindow } from "../api/contract";

/** Report ranges, in the order the segment shows them (the API also accepts `1h`). */
export const PNL_RANGES: readonly PnlWindow[] = ["24h", "7d", "30d", "all"];

export type PnlSortKey = "closed" | "pnl" | "pct" | "hold";
export type SortDir = "asc" | "desc";

type Summary = Pick<
  PnlSummaryView,
  "total_pnl_lamports" | "realized_pnl_lamports" | "unrealized_pnl_lamports"
>;

/**
 * All-time total, exact. The server sends it pre-added; only fall back to a BigInt sum when it is
 * missing (never `Number(lamports)`). Null when either leg is unknown.
 */
export function pnlTotal(sum: Summary): string | null {
  if (sum.total_pnl_lamports != null) return sum.total_pnl_lamports;
  if (sum.realized_pnl_lamports == null || sum.unrealized_pnl_lamports == null) return null;
  return (BigInt(sum.realized_pnl_lamports) + BigInt(sum.unrealized_pnl_lamports)).toString();
}

/** true/false when checkable; null when a leg is unknown (never guess). */
export function pnlReconciles(sum: Summary): boolean | null {
  const total = pnlTotal(sum);
  if (total == null || sum.realized_pnl_lamports == null || sum.unrealized_pnl_lamports == null) return null;
  return BigInt(total) === BigInt(sum.realized_pnl_lamports) + BigInt(sum.unrealized_pnl_lamports);
}

const ms = (iso: string | null | undefined) => {
  if (!iso) return null;
  const t = Date.parse(iso);
  return Number.isFinite(t) ? t : null;
};

/** WIB = UTC+7 all year (no DST), so a fixed offset is exact and device-independent. */
const WIB_TZ = "Asia/Jakarta";
const WIB_OFFSET_MS = 7 * 3_600_000;

const wibFormats = new Map<string, Intl.DateTimeFormat>();
function wibFormat(locale: string, opts: Intl.DateTimeFormatOptions): Intl.DateTimeFormat {
  const key = `${locale}|${JSON.stringify(opts)}`;
  let f = wibFormats.get(key);
  if (!f) {
    f = new Intl.DateTimeFormat(locale, { timeZone: WIB_TZ, ...opts });
    wibFormats.set(key, f);
  }
  return f;
}

type WibStamp = { ms: number; day: string; clock: string };

function wibStamp(iso: string | null | undefined, locale: string): WibStamp | null {
  const t = ms(iso);
  if (t == null) return null;
  const d = new Date(t + WIB_OFFSET_MS);
  return {
    ms: t,
    // UTC getters on the shifted instant give the WIB calendar day, whatever the device zone is.
    day: `${d.getUTCFullYear()}-${d.getUTCMonth() + 1}-${d.getUTCDate()}`,
    clock: wibFormat(locale, { hour: "numeric", minute: "2-digit" }).format(t),
  };
}

/**
 * Compact entry → exit for the closed ledger, both times in WIB (GMT+7). The exit date is shown
 * only when the exit falls on a different WIB day (the UX rule); a missing side prints an em dash.
 */
export function entryExitText(
  entry: string | null | undefined,
  exit: string | null | undefined,
  locale: string,
): string {
  const a = wibStamp(entry, locale);
  const b = wibStamp(exit, locale);
  if (!a || !b) return "—";
  if (a.day === b.day) return `${a.clock} → ${b.clock}`;
  const crossYear = a.day.slice(0, 4) !== b.day.slice(0, 4);
  const date = wibFormat(locale, { month: "short", day: "numeric", ...(crossYear ? { year: "numeric" } : {}) });
  // A middle dot keeps the date and clock apart in both locales (en-US drops the comma without a year).
  return `${a.clock} → ${date.format(b.ms)} · ${b.clock}`;
}

/** Newest close first (server order) unless a column is chosen; null values always sort last. */
export function sortClosed(rows: readonly ClosedTradeView[], key: PnlSortKey, dir: SortDir): ClosedTradeView[] {
  const sign = dir === "asc" ? 1 : -1;
  const value = (r: ClosedTradeView): bigint | number | null => {
    if (key === "closed") return ms(r.closed_at);
    if (key === "pnl") return r.pnl_lamports == null ? null : BigInt(r.pnl_lamports);
    if (key === "pct") return r.pnl_pct;
    return r.hold_seconds;
  };
  const cmp = (a: bigint | number, b: bigint | number) =>
    typeof a === "bigint" || typeof b === "bigint" ? (BigInt(a) < BigInt(b) ? -1 : BigInt(a) > BigInt(b) ? 1 : 0) : a < b ? -1 : a > b ? 1 : 0;
  return rows
    .map((row, i) => ({ row, i }))
    .sort(({ row: a, i: ai }, { row: b, i: bi }) => {
      const av = value(a);
      const bv = value(b);
      if (av == null || bv == null) {
        if (av == null && bv == null) return ai - bi;
        return av == null ? 1 : -1; // nulls last, independent of direction
      }
      const c = cmp(av, bv) * sign;
      return c !== 0 ? c : ai - bi; // stable for equal values
    })
    .map((x) => x.row);
}