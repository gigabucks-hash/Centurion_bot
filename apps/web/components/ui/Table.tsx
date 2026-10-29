import type { ReactNode } from "react";
import { cn } from "./cn";

export interface Column<T> {
  key: string;
  header: ReactNode;
  cell: (row: T) => ReactNode;
  align?: "left" | "right" | "center";
  /** Numeric columns render mono + right aligned. */
  numeric?: boolean;
  className?: string;
}

export function Table<T>({ columns, rows, rowKey, empty, minWidth = 560 }: {
  columns: Column<T>[];
  rows: T[];
  rowKey: (row: T) => string;
  empty?: ReactNode;
  minWidth?: number;
}) {
  if (rows.length === 0 && empty) return <>{empty}</>;
  const align = (c: Column<T>) => (c.numeric || c.align === "right" ? "text-right" : c.align === "center" ? "text-center" : "text-left");
  return (
    <div className="-mx-4 overflow-x-auto">
      <table className="w-full text-body" style={{ minWidth }}>
        <thead className="sticky top-0 bg-bg-surface">
          <tr className="border-b border-border-subtle text-label text-text-tertiary">
            {columns.map((c) => (
              <th key={c.key} scope="col" className={cn("px-4 py-2 font-medium", align(c), c.className)}>
                {c.header}
              </th>
            ))}
          </tr>
        </thead>
        <tbody>
          {rows.map((r) => (
            <tr key={rowKey(r)} className="border-b border-border-subtle last:border-0 hover:bg-bg-raised">
              {columns.map((c) => (
                <td key={c.key} className={cn("px-4 py-3", align(c), c.numeric && "num text-numSm", c.className)}>
                  {c.cell(r)}
                </td>
              ))}
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}
