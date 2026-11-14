import type { ComponentProps } from "react";
import { Loader2 } from "lucide-react";
import { cn } from "./cn";

export type ButtonVariant = "primary" | "secondary" | "ghost" | "success" | "danger" | "real";
const variants: Record<ButtonVariant, string> = {
  primary: "bg-brand-primary text-text-onAccent hover:bg-brand-primaryHover active:bg-brand-primaryPressed",
  secondary: "border border-border-default bg-bg-surface text-text-primary hover:bg-bg-raised",
  ghost: "text-text-secondary hover:bg-bg-raised hover:text-text-primary",
  success: "bg-semantic-profit text-bg-canvas hover:brightness-110",
  danger: "border border-semantic-loss/50 bg-semantic-lossContainer text-semantic-loss hover:brightness-110",
  /** Only for actions that move REAL SOL. */
  real: "bg-mode-real text-mode-onReal hover:brightness-110",
};
// Touch targets: on coarse pointers every size is at least 44 px tall (WCAG 2.5.5 / PERF_SECURITY touch audit).
const sizes = { sm: "h-8 px-3 text-label pointer-coarse:h-11", md: "h-10 px-4 text-label pointer-coarse:h-11", lg: "h-12 px-5 text-titleSm" } as const;

export function Button({ variant = "secondary", size = "md", loading, className, children, disabled, ...props }: ComponentProps<"button"> & {
  variant?: ButtonVariant;
  size?: keyof typeof sizes;
  loading?: boolean;
}) {
  return (
    <button
      {...props}
      disabled={disabled || loading}
      aria-busy={loading || undefined}
      className={cn(
        "inline-flex select-none items-center justify-center gap-1.5 rounded-md font-medium transition duration-fast ease-standard hover:brightness-[1.03] disabled:cursor-not-allowed disabled:opacity-50",
        variants[variant],
        sizes[size],
        className,
      )}
    >
      {loading && <Loader2 size={14} className="animate-spin" aria-hidden />}
      {children}
    </button>
  );
}
