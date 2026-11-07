import type { ReactNode } from "react";
import { ChevronDown } from "lucide-react";
import { cn } from "./cn";

export interface Column<T> {
  key: string;
  header: ReactNode;
  cell: (row: T) => ReactNode;
  align?: "left" | "right" | "center";
  /** Numeric columns render mono, right aligned, tabular and never wrap (QA-10). */
  numeric?: boolean;
  /** Never wrap (chips, durations). Numeric columns are always nowrap. */
  nowrap?: boolean;
  /** Let this column's header wrap onto two lines (keeps a long label without widening a dense table). */
  headerWrap?: boolean;
  /** Mobile card list (MOBILE_TABLES.md): "primary" = right of row 1, "status" = row 2, default = inside expand. */
  mobile?: "primary" | "status";
  className?: string;
}

/**
 * Table with the mobile patterns of MOBILE_TABLES.md / WF-19 (< 640 px):
 * - mobile="cards" (A + C): card per row, identity + key number on row 1, status chips row 2,
 *   secondary columns in a tap-to-expand accordion (<details name> = one open at a time, 48 px targets).
 * - mobile="sticky" (B): first column sticky with a shadow, horizontal scroll + one-line hint (compare rows).
 */
export function Table<T>({ columns, rows, rowKey, empty, minWidth = 560, mobile = "sticky", labels, dense = false }: {
  columns: Column<T>[];
  rows: T[];
  rowKey: (row: T) => string;
  empty?: ReactNode;
  minWidth?: number;
  mobile?: "cards" | "sticky";
  /** Localized "Show details" / "Scroll for more columns" (table.mobile.*). */
  labels?: { expand: string; scrollHint: string };
  /** Tighter horizontal padding for wide ledgers that must fit a desktop viewport. */
  dense?: boolean;
}) {
  if (rows.length === 0 && empty) return <>{empty}</>;
  const align = (c: Column<T>) => (c.numeric || c.align === "right" ? "text-right" : c.align === "center" ? "text-center" : "text-left");
  const group = `t-${columns.map((c) => c.key).join("-")}`;
  const [id, ...rest] = columns;
  const primary = rest.filter((c) => c.mobile === "primary");
  const status = rest.filter((c) => c.mobile === "status");
  const secondary = rest.filter((c) => !c.mobile);
  return (
    <>
      {mobile === "cards" && (
        <ul className="-mx-1 flex flex-col gap-2 sm:hidden">
          {rows.map((r) => (
            <li key={rowKey(r)} className="rounded-md border border-border-subtle bg-bg-surface">
              <div className="flex min-h-12 items-center gap-3 px-3 pt-2">
                <div className="min-w-0 flex-1 truncate">{id.cell(r)}</div>
                {primary.map((c) => <div key={c.key} className="num whitespace-nowrap text-right text-numSm">{c.cell(r)}</div>)}
              </div>
              {status.length > 0 && <div className="flex flex-wrap items-center gap-1.5 px-3 pt-1">{status.map((c) => <span key={c.key} className="whitespace-nowrap">{c.cell(r)}</span>)}</div>}
              {secondary.length > 0 ? (
                <details name={group} className="group px-3 pb-1">
                  <summary className="flex min-h-12 cursor-pointer list-none items-center justify-between text-label text-text-secondary">
                    {labels?.expand ?? "Show details"} <ChevronDown size={16} aria-hidden className="transition group-open:rotate-180" />
                  </summary>
                  <dl className="grid grid-cols-[auto_1fr] gap-x-4 gap-y-2 pb-2 text-caption">
                    {secondary.map((c) => (
                      <div key={c.key} className="contents">
                        <dt className="text-text-tertiary">{c.header}</dt>
                        <dd className={cn("text-right text-text-primary", (c.numeric || c.nowrap) && "num whitespace-nowrap")}>{c.cell(r)}</dd>
                      </div>
                    ))}
                  </dl>
                </details>
              ) : (
                <div className="pb-2" />
              )}
            </li>
          ))}
        </ul>
      )}
      <div className={cn(mobile === "cards" && "hidden sm:block")}>
        {labels && <p className="mb-1 text-caption text-text-tertiary sm:hidden">{labels.scrollHint} →</p>}
        <div className="relative -mx-4 overflow-x-auto [mask-image:linear-gradient(to_right,black_92%,transparent)] sm:[mask-image:none]">
          <table className="w-full text-body" style={{ minWidth }}>
            <thead className="sticky top-0 bg-bg-surface">
              <tr className="border-b border-border-subtle text-label text-text-tertiary">
                {columns.map((c, i) => (
                  <th key={c.key} scope="col" className={cn(dense ? "px-1.5" : "px-4", "py-2 font-medium", align(c), c.headerWrap ? "whitespace-normal" : (c.numeric || c.nowrap) && "whitespace-nowrap", i === 0 && "sticky left-0 z-10 bg-bg-surface shadow-[10px_0_10px_-10px_rgba(0,0,0,0.5)] sm:static sm:shadow-none", c.className)}>
                    {c.header}
                  </th>
                ))}
              </tr>
            </thead>
            <tbody>
              {rows.map((r) => (
                <tr key={rowKey(r)} className="h-[52px] border-b border-border-subtle last:border-0 hover:bg-bg-raised">
                  {columns.map((c, i) => (
                    <td
                      key={c.key}
                      className={cn(
                        dense ? "px-1.5" : "px-4",
                        "py-3",
                        align(c),
                        c.numeric && "num text-numSm tabular-nums",
                        (c.numeric || c.nowrap) && "whitespace-nowrap",
                        i === 0 && "sticky left-0 z-10 bg-bg-surface shadow-[10px_0_10px_-10px_rgba(0,0,0,0.5)] sm:static sm:shadow-none",
                        c.className,
                      )}
                    >
                      {c.cell(r)}
                    </td>
                  ))}
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>
    </>
  );
}
