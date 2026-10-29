import { ModeChrome } from "../components/ModeChrome";
import { PriceChart } from "../components/PriceChart";
import { pnlPercent, pnlText, TONE_CLASS, useLang } from "../i18n";
import { useTerm } from "../state/store";

export function ChartView({ mint }: { mint: string }) {
  const sym = useTerm((s) => s.signals.find((x) => x.mint === mint)?.symbol ?? s.positions.find((p) => p.mint === mint)?.symbol ?? "");
  const pos = useTerm((s) => s.positions.find((p) => p.mint === mint));
  const lang = useLang();
  return (
    <div className="window">
      <ModeChrome title={`Chart · ${sym}`}>
        <span className="mono dim">{mint}</span>
        {pos && <span className={`num ${TONE_CLASS[pnlPercent(pos.pnl_pct, lang)!.tone]}`} style={{ marginLeft: "auto" }}>{pnlText(pnlPercent(pos.pnl_pct, lang))}</span>}
      </ModeChrome>
      <div style={{ display: "flex", minHeight: 0 }}><PriceChart mint={mint} /></div>
      <div />
    </div>
  );
}
