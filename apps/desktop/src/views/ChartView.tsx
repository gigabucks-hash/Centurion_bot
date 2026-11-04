import { CoinAvatar } from "../components/CoinAvatar";
import { ModeChrome } from "../components/ModeChrome";
import { PriceChart } from "../components/PriceChart";
import { useCoinLogo } from "../components/useCoinLogo";
import { pnlPercent, pnlText, TONE_CLASS, useLang } from "../i18n";
import { useTerm } from "../state/store";

export function ChartView({ mint }: { mint: string }) {
  const sym = useTerm((s) => s.signals.find((x) => x.mint === mint)?.symbol ?? s.positions.find((p) => p.mint === mint)?.symbol ?? "");
  const pos = useTerm((s) => s.positions.find((p) => p.mint === mint));
  const notTradeable = useTerm((s) => {
    const t = s.signals.find((x) => x.mint === mint) ?? s.positions.find((p) => p.mint === mint) ?? s.screened.find((c) => c.mint === mint);
    return t?.tradeable === false;
  });
  const logoHash = useCoinLogo(mint);
  const lang = useLang();
  return (
    <div className="window">
      <ModeChrome title={`Chart — ${sym}`}>
        <span className="coin-sym" data-testid="chart-coin">
          <CoinAvatar mint={mint} symbol={sym || "•"} logoHash={logoHash} size={20} notTradeable={notTradeable} />
          <b>{sym ? `$${sym}` : "—"}</b>
        </span>
        <span className="mono dim">{mint}</span>
        {pos && <span className={`num ${TONE_CLASS[pnlPercent(pos.pnl_pct, lang)!.tone]}`} style={{ marginLeft: "auto" }}>{pnlText(pnlPercent(pos.pnl_pct, lang))}</span>}
      </ModeChrome>
      <div style={{ display: "flex", minHeight: 0 }}><PriceChart mint={mint} /></div>
      <div />
    </div>
  );
}
