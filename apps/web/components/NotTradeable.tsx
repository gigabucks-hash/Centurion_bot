import { Ban, Info } from "lucide-react";
import { cn } from "@/components/ui";

/**
 * UNSUPPORTED_QUOTE_MINT (UX WF-20 / WF-21): a product limit, not a danger, so never red.
 * Dashed-outline chip, text.tertiary on the sunken surface, ⊘ icon. Labels are passed in (works in server + client trees).
 */
export function NotTradeableChip({ label, className }: { label: string; className?: string }) {
  return (
    <span data-not-tradeable className={cn("inline-flex items-center gap-1 whitespace-nowrap rounded-md border border-dashed border-border-default bg-bg-sunken px-1.5 py-px text-caption text-text-tertiary", className)}>
      <Ban size={12} aria-hidden /> {label}
    </span>
  );
}

/** Detail reason box: the reason first (ⓘ), shown before any metric. */
export function NotTradeableReason({ text, className }: { text: string; className?: string }) {
  return (
    <p role="status" data-not-tradeable className={cn("flex items-start gap-2 rounded-md border border-border-default bg-bg-sunken px-3 py-2.5 text-body text-text-secondary", className)}>
      <Info size={16} className="mt-0.5 shrink-0 text-text-tertiary" aria-hidden /> {text}
    </p>
  );
}

/** Disabled, labelled CTA (not hidden): "Approve — not available" plus a caption saying why. */
export function NotTradeableCta({ label, note }: { label: string; note: string }) {
  return (
    <div className="mt-4">
      <button type="button" disabled aria-disabled className="h-12 w-full cursor-not-allowed rounded-md border border-border-subtle bg-bg-sunken text-label text-text-disabled">
        {label}
      </button>
      <p className="mt-1.5 text-caption text-text-tertiary">{note}</p>
    </div>
  );
}
