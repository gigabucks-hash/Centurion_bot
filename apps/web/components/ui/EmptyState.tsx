import type { ReactNode } from "react";
import { Inbox } from "lucide-react";

export function EmptyState({ title, detail, icon, action }: { title: string; detail?: ReactNode; icon?: ReactNode; action?: ReactNode }) {
  return (
    <div className="flex flex-col items-center justify-center gap-2 rounded-md border border-border-subtle bg-bg-surface px-6 py-10 text-center">
      <div className="text-text-tertiary">{icon ?? <Inbox size={20} strokeWidth={1.75} />}</div>
      <p className="text-[15px] font-medium text-text-primary">{title}</p>
      {detail && <p className="max-w-sm text-caption text-text-secondary">{detail}</p>}
      {action}
    </div>
  );
}
