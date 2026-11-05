import { ChartNoAxesColumn } from "lucide-react";
import { useTerm } from "../state/store";
import { pnlLamports, pnlText, TONE_CLASS, useLang, useT } from "../i18n";
import { Icon } from "./Icon";

/**
 * PnL card (G1-blue): one flat strip above the positions table — total / unrealized / realized.
 *
 * The numbers come from the server portfolio snapshot (`portfolio.snapshot` -> account), never from
 * the open rows: realized already includes take-profits and closed trades that are no longer in the
 * table, so summing rows would silently drop it. Total is the exact BigInt sum of the two legs.
 * "View report" opens the range report with the closed-trade ledger (realized locked at close).
 */
export function PnlReport({ onOpen }: { onOpen?: () => void }) {
  const t = useT();
  const lang = useLang();
  const account = useTerm((s) => s.account);
  const paper = useTerm((s) => s.mode) === "practice";
  const totalRaw =
    account.realized_pnl_lamports != null && account.unrealized_pnl_lamports != null
      ? (BigInt(account.realized_pnl_lamports) + BigInt(account.unrealized_pnl_lamports)).toString()
      : null;
  const cells = [
    { key: "unrealized", label: t("positions.pnl.unrealized"), raw: account.unrealized_pnl_lamports },
    { key: "realized", label: t("dashboard.kpi.realized_pnl"), raw: account.realized_pnl_lamports },
    { key: "total", label: t("pnl.report.total"), raw: totalRaw },
  ];
  return (
    <div className="pnl-report" data-testid="pnl-report" role="group" aria-label={t("pnl.report.title")}>
      {cells.map((c) => {
        const p = pnlLamports(c.raw, lang, paper);
        return (
          <div key={c.key} className="pnl-cell" data-pnl={c.key}>
            <span className="pnl-k">{c.label}</span>
            <span className={`num pnl-v ${p ? TONE_CLASS[p.tone] : "muted"}`}>{p ? pnlText(p) : "—"}</span>
          </div>
        );
      })}
      {onOpen && (
        <button className="ghost pnl-open" onClick={onOpen} data-action="open-pnl-report" title={t("pnl.report.open_hint")} aria-keyshortcuts="r">
          <Icon glyph={ChartNoAxesColumn} size={16} /> {t("pnl.report.open")}
        </button>
      )}
    </div>
  );
}
