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

type Wib24 = { ms: number; day: string; year: number; date: string; dateYear: string; clock: string };

/** WIB calendar pieces, 24-hour clock (the receipt format; the ledger keeps the compact 12/24 h one). */
function wib24(iso: string | null | undefined, locale: string): Wib24 | null {
  const t = ms(iso);
  if (t == null) return null;
  const d = new Date(t + WIB_OFFSET_MS);
  const year = d.getUTCFullYear();
  return {
    ms: t,
    year,
    day: `${year}-${d.getUTCMonth() + 1}-${d.getUTCDate()}`,
    date: wibFormat(locale, { day: "2-digit", month: "short" }).format(t),
    dateYear: wibFormat(locale, { day: "2-digit", month: "short", year: "numeric" }).format(t),
    clock: wibFormat(locale, { hour: "2-digit", minute: "2-digit", hourCycle: "h23" }).format(t),
  };
}

const wibYear = (nowMs: number) => new Date(nowMs + WIB_OFFSET_MS).getUTCFullYear();

/** `06 Nov · 14:32 WIB`; the year is added only when it is not the current WIB year. */
export function wibDateTimeText(
  iso: string | null | undefined,
  locale: string,
  nowMs: number = Date.now(),
): string {
  const p = wib24(iso, locale);
  if (!p) return "—";
  const date = p.year === wibYear(nowMs) ? p.date : p.dateYear;
  return `${date} · ${p.clock} WIB`;
}

/**
 * Receipt entry → exit time. Same WIB day: `14:02 → 15:37 WIB`; across midnight both sides carry a
 * date (`28 Oct · 23:52 → 29 Oct · 00:12 WIB`), because the receipt has room for it. Missing sides
 * print an em dash and never hide the known one.
 */
export function entryExitTimeText(
  entry: string | null | undefined,
  exit: string | null | undefined,
  locale: string,
  nowMs: number = Date.now(),
): string {
  const a = wib24(entry, locale);
  const b = wib24(exit, locale);
  if (!a && !b) return "—";
  const crossDay = a != null && b != null && a.day !== b.day;
  const thisYear = wibYear(nowMs);
  const side = (p: Wib24 | null) => {
    if (!p) return "—";
    if (!crossDay) return p.clock;
    const date = p.year === thisYear ? p.date : p.dateYear;
    return `${date} · ${p.clock}`;
  };
  return `${side(a)} → ${side(b)} WIB`;
}

/**
 * Receipt SOL amount, numeric only (the unit lives on the unit line). Lamports are converted with
 * string math, never a float; at least three decimals so 0 is `0.000` and 0.2 is `0.200`.
 */
export function receiptSol(raw: string | null | undefined, locale: string): string {
  if (raw == null || raw === "") return "—";
  const neg = raw.trim().startsWith("-");
  const digits = raw.replace(/\D/g, "");
  if (!digits) return "—";
  const padded = digits.padStart(10, "0");
  const whole = padded.slice(0, -9).replace(/^0+(?=\d)/, "");
  const frac = padded.slice(-9).replace(/0+$/, "").padEnd(3, "0");
  const sep = locale.toLowerCase().startsWith("id") ? "," : ".";
  return `${neg ? "−" : ""}${whole}${sep}${frac}`;
}

/** Entry/exit price in SOL (numeric only): up to 9 significant digits, no exponent, zeros trimmed. */
export function priceText(raw: string | null | undefined, locale: string): string {
  if (raw == null || raw === "") return "—";
  const n = Number(raw);
  if (!Number.isFinite(n)) return "—";
  if (n === 0) return "0";
  return new Intl.NumberFormat(locale, { maximumSignificantDigits: 9, useGrouping: false }).format(n);
}

/**
 * Receipt PnL %: one decimal, sign always (`+31.0%`, `−12.5%`), exact zero `0.0%`, null `—`.
 * The sign comes from the value; colour is never the only signal.
 */
export function receiptPct(raw: number | null | undefined, locale: string): string {
  if (raw == null || !Number.isFinite(raw)) return "—";
  if (raw === 0) return new Intl.NumberFormat(locale, { style: "percent", minimumFractionDigits: 1, maximumFractionDigits: 1 }).format(0);
  const n = new Intl.NumberFormat(locale, {
    style: "percent",
    minimumFractionDigits: 1,
    maximumFractionDigits: 1,
    signDisplay: "exceptZero",
  }).format(raw / 100);
  return n.replace("-", "−");
}

/**
 * Receipt entry → exit price (A2 #12): per-side `—`, otherwise `0.000000255 → 0.000000412 SOL`.
 * A single trailing unit; the values are server-reported, never re-derived from lamports.
 */
export function receiptPrice(
  entryRaw: string | null | undefined,
  exitRaw: string | null | undefined,
  locale: string,
): string {
  const entry = priceText(entryRaw, locale);
  const exit = priceText(exitRaw, locale);
  if (entry === "—" && exit === "—") return "—";
  return `${entry} → ${exit === "—" ? "—" : `${exit} SOL`}`;
}

/**
 * F4: a page after the first reuses the absolute range the server froze for the first page. When
 * `from`/`to` are known the relative `window` is dropped, so a page fetched ten minutes later cannot
 * lose rows at the boundary.
 */
export function pnlPageArgs(
  summary: Pick<PnlSummaryView, "window" | "from" | "to">,
  cursor: string,
): { window: PnlWindow | null; from: string | null; to: string | null; cursor: string } {
  const ranged = summary.from != null || summary.to != null;
  return { window: ranged ? null : summary.window, from: summary.from, to: summary.to, cursor };
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