import { ModeChrome } from "../components/ModeChrome";
import { PriceChart } from "../components/PriceChart";
import { fmtPnlPct } from "../components/format";
import { useTerm } from "../state/store";

export function ChartView({ mint }: { mint: string }) {
  const sym = useTerm((s) => s.signals.find((x) => x.mint === mint)?.symbol ?? s.positions.find((p) => p.mint === mint)?.symbol ?? "");
  const pos = useTerm((s) => s.positions.find((p) => p.mint === mint));
  return (
    <div className="window">
      <ModeChrome title={`Chart · ${sym}`}>
        <span className="mono dim">{mint}</span>
        {pos && <span className={`num ${pos.pnl_pct >= 0 ? "pos" : "neg"}`} style={{ marginLeft: "auto" }}>{fmtPnlPct(pos.pnl_pct)}</span>}
      </ModeChrome>
      <div style={{ display: "flex", minHeight: 0 }}><PriceChart mint={mint} /></div>
      <div />
    </div>
  );
}
