"use client";
import { useEffect, useState } from "react";
import { Bot } from "lucide-react";
import { Button } from "@/components/ui";
import { useT } from "@/lib/i18n/client";

interface AuditRow { at: string; tool: string; ok: boolean; code: string }

export function McpPanel() {
  const t = useT();
  const [enabled, setEnabled] = useState(true);
  const [audit, setAudit] = useState<AuditRow[]>([]);

  async function load() {
    const res = await fetch("/api/local/mcp");
    if (!res.ok) return;
    const json = await res.json() as { data?: { mcp_enabled?: boolean; audit?: AuditRow[] } };
    setEnabled(json.data?.mcp_enabled !== false);
    setAudit(json.data?.audit ?? []);
  }

  useEffect(() => {
    const timer = setTimeout(() => { void load(); }, 0);
    return () => clearTimeout(timer);
  }, []);

  async function toggle() {
    await fetch("/api/local/mcp", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ action: "set_enabled", enabled: !enabled }),
    });
    await load();
  }

  return (
    <section data-testid="mcp-panel" className="rounded-lg border border-border-default bg-bg-surface p-4 lg:col-span-2">
      <h2 className="flex items-center gap-2 text-titleSm"><Bot size={16} aria-hidden /> {t("mcp.title")}</h2>
      <p className="mt-2 text-body text-text-secondary">{t("mcp.body")}</p>
      <p className="mt-2 text-caption text-text-tertiary">{t("mcp.tokenHint")}</p>
      <div className="mt-3 flex items-center gap-3">
        <span className="text-label" role="status">{enabled ? t("mcp.on") : t("mcp.off")}</span>
        <Button type="button" variant={enabled ? "danger" : "primary"} onClick={toggle}>{enabled ? t("mcp.off") : t("mcp.on")}</Button>
      </div>
      <h3 className="mt-4 text-label">{t("mcp.audit")}</h3>
      {audit.length === 0 ? <p className="mt-1 text-caption text-text-tertiary">{t("mcp.empty")}</p> : (
        <ul className="mt-2 max-h-48 overflow-auto text-caption">
          {audit.map((row) => (
            <li key={`${row.at}-${row.tool}`} className="flex justify-between gap-3 border-t border-border-subtle py-1">
              <span className="num">{row.tool}</span>
              <span className={row.ok ? "text-semantic-profit" : "text-semantic-loss"}>{row.code}</span>
              <span className="num text-text-tertiary">{row.at.slice(11, 19)}</span>
            </li>
          ))}
        </ul>
      )}
    </section>
  );
}
