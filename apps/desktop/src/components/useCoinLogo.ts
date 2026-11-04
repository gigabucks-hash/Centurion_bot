import { useTerm } from "../state/store";

/**
 * `logo_hash` for a mint from whatever view carries it (pick / position / screener row), so surfaces that
 * only know the mint (chart header, activity feed) can still render the proxy logo. Environment-neutral:
 * when the mint is unknown or the server sent no hash, returns null and CoinAvatar falls back to the
 * deterministic identicon.
 */
export function useCoinLogo(mint: string | null | undefined): string | null {
  return useTerm((s) => {
    if (!mint) return null;
    const fromSignal = s.signals.find((x) => x.mint === mint)?.logo_hash;
    if (fromSignal) return fromSignal;
    const fromPosition = s.positions.find((x) => x.mint === mint)?.logo_hash;
    if (fromPosition) return fromPosition;
    return s.screened.find((x) => x.mint === mint)?.logo_hash ?? null;
  });
}
