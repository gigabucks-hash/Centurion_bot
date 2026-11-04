"use client";
import { createContext, useCallback, useContext, useState, type ReactNode } from "react";
import { CheckCircle2, Info, TriangleAlert, XCircle } from "lucide-react";
import { cn } from "./cn";

type Kind = "info" | "success" | "warning" | "error";
interface ToastItem { id: number; kind: Kind; text: string; action?: { label: string; run: () => void }; ttl: number }
const Ctx = createContext<(t: Omit<ToastItem, "id" | "ttl"> & { ttl?: number }) => void>(() => {});

/** Toasts (info/success/warning/error) with optional Undo. Never used to confirm Real SOL actions. */
export function ToastProvider({ children }: { children: ReactNode }) {
  const [items, setItems] = useState<ToastItem[]>([]);
  const push = useCallback((t: Omit<ToastItem, "id" | "ttl"> & { ttl?: number }) => {
    const id = Date.now() + Math.random();
    const ttl = t.ttl ?? 5000;
    setItems((p) => [...p, { ...t, id, ttl }]);
    setTimeout(() => setItems((p) => p.filter((x) => x.id !== id)), ttl);
  }, []);
  const icon = { info: Info, success: CheckCircle2, warning: TriangleAlert, error: XCircle };
  const color = { info: "text-semantic-info", success: "text-semantic-profit", warning: "text-semantic-warning", error: "text-semantic-loss" };
  return (
    <Ctx.Provider value={push}>
      {children}
      <div className="pointer-events-none fixed inset-x-0 bottom-4 z-[60] flex flex-col items-center gap-2 px-4" aria-live="polite">
        {items.map((t) => {
          const I = icon[t.kind];
          return (
            <div key={t.id} role="status" className="pointer-events-auto flex w-full max-w-md items-center gap-3 rounded-md border border-border-default bg-bg-overlay px-4 py-3 shadow-dialog">
              <I size={16} className={cn("shrink-0", color[t.kind])} aria-hidden />
              <span className="flex-1 text-body text-text-primary">{t.text}</span>
              {t.action && (
                <button
                  className="text-label font-semibold text-brand-primary hover:underline"
                  onClick={() => {
                    t.action!.run();
                    setItems((p) => p.filter((x) => x.id !== t.id));
                  }}
                >
                  {t.action.label}
                </button>
              )}
            </div>
          );
        })}
      </div>
    </Ctx.Provider>
  );
}

export const useToast = () => useContext(Ctx);
