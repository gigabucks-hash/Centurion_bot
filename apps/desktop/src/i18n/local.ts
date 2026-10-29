/**
 * App-local copy. Since @sentra/i18n 0.4.4 every former `desktop.*` string is a package key
 * (see packages/i18n/key-migrations.json); the only thing left here is the "(mock)" dev suffix,
 * which UX keeps app-local on purpose (it describes this prototype build, not the product).
 */
export const MOCK_SUFFIX = "(mock)";

/**
 * Templates for activity rows whose keys @sentra/i18n 0.4.5 does not ship yet (UX gap, requested as
 * `feed.event.fill` / `feed.event.exit_triggered`). Used only when the package has no such key, so a
 * later package version replaces them without a code change. All numbers inside are formatted by
 * format.mjs in the UI locale (D10).
 */
export const LOCAL_TEMPLATES: Record<"en" | "id", Record<string, string>> = {
  en: {
    "feed.event.fill": "Paper {side} {amount_lamports} @ {price} SOL · fee {fee} · slippage {slip}",
    "feed.event.exit_triggered": "{rule} · sell {portion} @ {price} SOL",
  },
  id: {
    "feed.event.fill": "Paper {side} {amount_lamports} @ {price} SOL · biaya {fee} · slippage {slip}",
    "feed.event.exit_triggered": "{rule} · jual {portion} @ {price} SOL",
  },
};

