
/** Number locale per UX SPEC (id-ID: comma decimal, dot thousands). */
export const LOCALE = "id-ID";
const TZ = "Asia/Jakarta";

export function fmtNum(n: number, digits = 2, minDigits = digits): string {
  return Math.abs(n).toLocaleString(LOCALE, { minimumFractionDigits: minDigits, maximumFractionDigits: digits });
}

export function fmtSol(n: number, opts: { sign?: boolean; digits?: number; unit?: boolean } = {}): string {
  const d = opts.digits ?? 3;
  const sign = n < 0 ? "−" : opts.sign && n > 0 ? "+" : "";
  return `${sign}${fmtNum(n, d)}${opts.unit === false ? "" : " SOL"}`;
}

export function fmtPct(n: number, digits = 1, sign = true): string {
  return `${n < 0 ? "−" : sign && n > 0 ? "+" : ""}${fmtNum(n, digits)}%`;
}

export function fmtInt(n: number): string {
  return n.toLocaleString(LOCALE);
}

export function fmtUsdPrice(n: number): string {
  return `$${n.toLocaleString(LOCALE, { maximumSignificantDigits: 4 })}`;
}

export function fmtTime(ts: number, withDate = false, seconds = true): string {
  return (
    new Intl.DateTimeFormat("en-GB", {
      timeZone: TZ,
      hour: "2-digit",
      minute: "2-digit",
      ...(seconds ? { second: "2-digit" } : {}),
      ...(withDate ? { day: "2-digit", month: "short" } : {}),
      hour12: false,
    }).format(ts) + " WIB"
  );
}

export function fmtClock(ts: number): string {
  return new Intl.DateTimeFormat("en-GB", { timeZone: TZ, hour: "2-digit", minute: "2-digit", hour12: false }).format(ts);
}

export function fmtDuration(seconds: number): string {
  if (seconds < 60) return `${seconds}s`;
  const m = Math.floor(seconds / 60);
  if (m < 60) return `${m}m ${String(seconds % 60).padStart(2, "0")}s`;
  return `${Math.floor(m / 60)}h ${m % 60}m`;
}

/** mm:ss (or h:mm:ss) countdown. */
export function fmtCountdown(ms: number): string {
  const s = Math.max(0, Math.ceil(ms / 1000));
  const h = Math.floor(s / 3600);
  const m = Math.floor((s % 3600) / 60);
  const ss = String(s % 60).padStart(2, "0");
  return h ? `${h}:${String(m).padStart(2, "0")}:${ss}` : `${String(m).padStart(2, "0")}:${ss}`;
}

export function shortMint(mint: string): string {
  return `${mint.slice(0, 4)}…${mint.slice(-4)}`;
}
