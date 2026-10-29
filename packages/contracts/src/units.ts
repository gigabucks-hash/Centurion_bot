/** Integer base units as a decimal string, e.g. lamports "250000000" = 0.25 SOL. Never a float. */
export type Lamports = string & { readonly __brand?: "Lamports" };
/** Raw SPL token units (respecting mint decimals) as an integer string. */
export type RawQty = string & { readonly __brand?: "RawQty" };
/** Decimal string price, no exponent, e.g. "0.000012345678". */
export type DecimalString = string & { readonly __brand?: "Decimal" };
/** Percent as decimal string, e.g. "-35" or "12.5". */
export type PctString = string & { readonly __brand?: "Pct" };
/** RFC 3339 UTC timestamp with ms, e.g. "2026-10-29T08:42:00.123Z". */
export type IsoTs = string;
export type Uuid = string;
export type Base58 = string;

export const LAMPORTS_PER_SOL = 1_000_000_000n;

/** Format lamports as a SOL decimal string without floating point. */
export function lamportsToSol(l: Lamports, maxDecimals = 9): string {
  const v = BigInt(l);
  const neg = v < 0n;
  const a = neg ? -v : v;
  const whole = a / LAMPORTS_PER_SOL;
  let frac = (a % LAMPORTS_PER_SOL).toString().padStart(9, "0").slice(0, maxDecimals).replace(/0+$/, "");
  return `${neg ? "-" : ""}${whole}${frac ? "." + frac : ""}`;
}
