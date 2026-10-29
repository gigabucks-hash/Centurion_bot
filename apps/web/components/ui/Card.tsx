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
    <As className={cn("rounded-lg border border-border-subtle bg-bg-surface shadow-e1", className)}>
      {(title || action) && (
        <header className="flex items-center justify-between gap-3 px-4 pt-4 pb-3">
          <div className="min-w-0">
            <h2 className="text-titleSm text-text-primary">{title}</h2>
            {subtitle && <p className="text-caption text-text-tertiary">{subtitle}</p>}
          </div>
          {action}
        </header>
      )}
      <div className={cn("px-4 pb-4", !(title || action) && "pt-4", bodyClassName)}>{children}</div>
    </As>
  );
}
