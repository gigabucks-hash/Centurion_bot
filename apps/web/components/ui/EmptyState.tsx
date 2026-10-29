import type { ReactNode } from "react";
import { Inbox } from "lucide-react";

export function EmptyState({ title, detail, icon, action }: { title: string; detail?: ReactNode; icon?: ReactNode; action?: ReactNode }) {
  return (
    <div className="flex flex-col items-center justify-center gap-2 rounded-lg border border-dashed border-border-default px-6 py-10 text-center">
      <div className="text-text-tertiary">{icon ?? <Inbox size={28} />}</div>
      <p className="text-titleSm text-text-primary">{title}</p>
      {detail && <p className="max-w-sm text-caption text-text-secondary">{detail}</p>}
      {action}
    </div>
  );
}
