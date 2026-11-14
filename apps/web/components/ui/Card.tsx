import type { ReactNode } from "react";
import { cn } from "./cn";

export function Card({ title, subtitle, action, children, className, bodyClassName, as: As = "section" }: {
  title?: ReactNode;
  subtitle?: ReactNode;
  action?: ReactNode;
  children: ReactNode;
  className?: string;
  bodyClassName?: string;
  as?: "section" | "div" | "article";
}) {
  return (
    <As className={cn("min-w-0 rounded-md border border-border-subtle bg-bg-surface", className)}>
      {(title || action) && (
        <header className="flex items-center justify-between gap-3 border-b border-border-subtle px-4 py-3">
          <div className="min-w-0">
            <h2 className="truncate text-[15px] font-medium text-text-primary">{title}</h2>
            {subtitle && <div className="mt-0.5 text-caption text-text-tertiary">{subtitle}</div>}
          </div>
          {action}
        </header>
      )}
      <div className={cn("px-4 pb-4", !(title || action) && "pt-4", bodyClassName)}>{children}</div>
    </As>
  );
}
