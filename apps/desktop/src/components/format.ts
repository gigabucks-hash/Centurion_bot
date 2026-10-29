/** WebKitGTK may report navigator.language = "C" (POSIX locale) which Intl rejects. */
export const safeLocale = (() => {
  try {
    return Intl.getCanonicalLocales(navigator.language)[0] ?? "id-ID";
  } catch {
    return "id-ID";
  }
})();

export const fmtUsd = (n: number) =>
  n >= 1e6 ? `$${(n / 1e6).toFixed(2)}M` : n >= 1e3 ? `$${(n / 1e3).toFixed(1)}K` : `$${n.toFixed(0)}`;
export const fmtPrice = (n: number) => (n < 0.01 ? n.toExponential(3) : n.toFixed(4));
/** UX: PnL never color-only → arrow + sign + number; zero = "±0". */
export const fmtPnlPct = (n: number) => {
  if (Math.abs(n) < 0.05) return "±0,0%";
  return `${n > 0 ? "▲ +" : "▼ −"}${Math.abs(n).toFixed(1).replace(".", ",")}%`;
};
export const fmtTime = (ms: number) =>
  new Date(ms).toLocaleTimeString(safeLocale, { hour: "2-digit", minute: "2-digit", second: "2-digit", hour12: false });
export const fmtMmSs = (ms: number) => {
  const s = Math.max(0, Math.ceil(ms / 1000));
  return `${String(Math.floor(s / 60)).padStart(2, "0")}:${String(s % 60).padStart(2, "0")}`;
};
export const shortMint = (m: string) => `${m.slice(0, 4)}…${m.slice(-4)}`;
