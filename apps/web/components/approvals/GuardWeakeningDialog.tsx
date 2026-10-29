"use client";
import { useRef, useState } from "react";
import { Dot, Fingerprint, Lock, ShieldAlert } from "lucide-react";
import type { Approval, DiffDirection } from "@/lib/types";

import { Badge, Button, RiskBadge, cn } from "@/components/ui";
import { Dialog, HoldButton } from "@/components/ui/client";
import { ModeBadge } from "@/components/domain";
import { useT, useFmt } from "@/lib/i18n/client";
import { settingLabel } from "@/lib/strategy-schema";

const dirLabel = {
  weakens: { key: "guardDialog.looser", cls: "text-semantic-warning" },
  strengthens: { key: "guardDialog.stricter", cls: "text-semantic-profit" },
  new: { key: "guardDialog.newRow", cls: "text-semantic-info" },
  neutral: { key: "guardDialog.neutral", cls: "text-text-tertiary" },
} as const satisfies Record<DiffDirection, { key: string; cls: string }>;

/**
 * Hardened confirm for a guard-weakening change (SPEC §3, flows/guard-weakening.mmd).
 * Practice: hold 1.2 s. Real SOL: type strategy name + second factor (mock passkey) + hold 2.5 s,
 * then a 10-min cancellable cooldown. Safe action (Cancel) has default focus.
 */
export function GuardWeakeningDialog({ approval, open, onClose, onConfirm, busy }: {
  approval: Approval;
  open: boolean;
  onClose: () => void;
  onConfirm: (c: { typedName?: string; secondFactor?: "mock_passkey"; holdMs: number }) => void;
  busy?: boolean;
}) {
  const t = useT();
  const f = useFmt();
  const real = approval.mode === "real";
  const name = approval.strategyName ?? "";
  const [typed, setTyped] = useState("");
  const [verified, setVerified] = useState(false);
  const [verifying, setVerifying] = useState(false);
  const [onlyWeak, setOnlyWeak] = useState(false);
  const cancelRef = useRef<HTMLButtonElement>(null);
  const matchCount = [...typed].filter((ch, i) => ch === name[i]).length;
  const nameOk = typed === name;
  const ready = !real || (nameOk && verified);
  const rows = (approval.diff ?? []).filter((r) => !onlyWeak || r.direction === "weakens");
  const ri = approval.riskImpact;
  const passedPct = ri ? ((ri.coinsPassedPerDayAfter - ri.coinsPassedPerDayBefore) / ri.coinsPassedPerDayBefore) * 100 : 0;
  const rugX = ri && ri.rugsBefore ? ri.rugsAfter / ri.rugsBefore : 0;

  return (
    <Dialog open={open} onClose={onClose} accent={real ? "real" : "warning"} initialFocusRef={cancelRef} wide title={<TitleWithWeaken text={t(real ? "guardDialog.titleReal" : "guardDialog.title", { weaken: "\u0000" })} word={t("guardDialog.weaken")} />}>
      <div className="-mt-1 mb-4 flex flex-wrap items-center gap-2 text-caption text-text-secondary">
        <ModeBadge mode={approval.mode} />
        <span>{name} · {t("strategies.rev", { rev: `${approval.revFrom} → ${approval.revTo}` })}</span>
      </div>

      <div className="flex items-center justify-between">
        <h3 className="text-titleSm">{t("guardDialog.changes")}</h3>
        <label className="flex items-center gap-2 text-caption text-text-secondary">
          <input type="checkbox" checked={onlyWeak} onChange={(e) => setOnlyWeak(e.target.checked)} className="accent-[var(--color-brand-primary)]" /> {t("builder.onlyWeakening")}
        </label>
      </div>
      <div className="mt-2 overflow-x-auto">
        <table className="w-full min-w-[520px] text-body">
          <thead>
            <tr className="text-left text-label text-text-tertiary">
              <th className="py-1.5 pr-2 font-medium">{t("guardDialog.setting")}</th><th className="py-1.5 pr-2 font-medium">{t("guardDialog.before")}</th><th className="py-1.5 pr-2 font-medium">{t("guardDialog.after")}</th><th className="py-1.5 font-medium">{t("guardDialog.direction")}</th>
            </tr>
          </thead>
          <tbody>
            {rows.map((r) => (
              <tr key={r.key} className={cn("border-t border-border-subtle", r.direction === "weakens" && "bg-semantic-warningContainer")}>
                <td className="num py-2 pr-2 pl-2 text-numSm" title={r.key}>{settingLabel(t, r.key, r.label)}</td>
                <td className="num py-2 pr-2 text-numSm text-text-secondary">{f.value(r.before)}</td>
                <td className="num py-2 pr-2 text-numSm font-semibold">{f.value(r.after)}</td>
                <td className={cn("py-2 pr-2 text-label", dirLabel[r.direction].cls)}>{r.key.includes(".checks.") && r.direction === "weakens" ? t("guardDialog.turnedOff") : t(dirLabel[r.direction].key)}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      {ri && (
        <>
          <h3 className="mt-5 text-titleSm">{t("guardDialog.riskImpact")} <span className="text-caption font-normal text-text-tertiary">{t("guardDialog.riskNote")}</span></h3>
          <div className="mt-2 grid gap-3 sm:grid-cols-3">
            <Impact label={t("guardDialog.coinsPassing")} value={`+${f.num(passedPct, 0)}%`} detail={t("guardDialog.perDay", { a: ri.coinsPassedPerDayBefore, b: ri.coinsPassedPerDayAfter })} />
            <Impact label={t("guardDialog.rugged")} value={`+${f.num(rugX, 1)}×`} detail={`${ri.rugsBefore} → ${ri.rugsAfter}`} />
            <Impact label={t("guardDialog.maxDd")} value={`−${ri.maxDrawdownBeforePct}% → −${ri.maxDrawdownAfterPct}%`} detail={t("guardDialog.replayed")} />
          </div>
          <div className="mt-2"><RiskBadge level={approval.risk} reason={t("guardDialog.riskReason")} /></div>
        </>
      )}

      <div className="mt-5 grid gap-5 sm:grid-cols-2">
        {real ? (
          <div className="flex flex-col gap-3">
            <div>
              <label htmlFor="typed-name" className="mb-1 block text-label">{t("guardDialog.typeName")}</label>
              <input
                id="typed-name"
                value={typed}
                onChange={(e) => setTyped(e.target.value)}
                autoComplete="off"
                spellCheck={false}
                placeholder={name}
                className={cn("h-10 w-full rounded-md border bg-bg-sunken px-3 text-body outline-none focus:outline-2 focus:outline-border-focus", nameOk ? "border-semantic-profit" : "border-border-default")}
              />
              <p className="mt-1 text-caption text-text-tertiary">{t("guardDialog.match", { n: matchCount, total: name.length })}</p>
            </div>
            <Button
              variant="secondary"
              onClick={() => {
                setVerifying(true);
                setTimeout(() => {
                  setVerified(true);
                  setVerifying(false);
                }, 600);
              }}
              loading={verifying}
              disabled={verified}
            >
              <Fingerprint size={16} /> {verified ? t("approvals.verified") : t("approvals.verify")}
            </Button>
            <p className="text-caption text-text-tertiary">{t("guardDialog.mockFactor")}</p>
          </div>
        ) : (
          <p className="text-body text-text-secondary">{t("guardDialog.practiceNote")}</p>
        )}
        <div>
          <h4 className="text-label">{t("guardDialog.afterApproval")}</h4>
          {/* QA-02: the cooldown and the 24 h auto-revert are mandatory on Real SOL (server-enforced), so they are
              static info rows with a lock, never checkboxes or toggles. */}
          <ul className="mt-1 flex flex-col gap-1 text-caption text-text-secondary" data-testid="after-approval">
            {real ? (
              <>
                <RuleRow locked text={t("guardDialog.ruleCooldown")} lockedLabel={t("guardDialog.locked")} />
                <RuleRow locked strong text={t("guardDialog.ruleRevert")} lockedLabel={t("guardDialog.locked")} />
                <RuleRow text={t("guardDialog.ruleNotify")} />
                <RuleRow text={t("guardDialog.ruleAudit")} />
              </>
            ) : (
              <>
                <RuleRow text={t("guardDialog.ruleApplies")} />
                <RuleRow text={t("guardDialog.ruleAuditShort")} />
              </>
            )}
          </ul>
        </div>
      </div>

      <div className="mt-6 grid gap-3 sm:grid-cols-2">
        <HoldButton
          durationMs={real ? 2500 : 1200}
          variant={real ? "real" : "warning"}
          disabled={!ready || busy}
          onConfirm={(holdMs) => onConfirm({ holdMs, typedName: real ? typed : undefined, secondFactor: real ? "mock_passkey" : undefined })}
          hint={real ? t("guardDialog.holdHintReal") : t("common.releaseCancel")}
        >
          {t("guardDialog.hold", { s: real ? 2.5 : 1.2 })}
        </HoldButton>
        <div>
          <Button ref={cancelRef} variant="primary" size="lg" className="w-full" onClick={onClose}>{t("common.cancelEsc")}</Button>
          <p className="mt-1 text-caption text-text-tertiary">{t("common.defaultFocusCancel")}</p>
        </div>
      </div>
      <p className="num mt-4 flex items-center gap-1.5 text-caption text-text-tertiary">
        <ShieldAlert size={12} /> {t("guardDialog.footer")}
      </p>
      {!ready && real && <Badge tone="neutral" className="mt-2">{t("guardDialog.waiting")}</Badge>}
    </Dialog>
  );
}

function TitleWithWeaken({ text, word }: { text: string; word: string }) {
  // UX 0.4.x titles already say "LOOSEN" and carry no {weaken} slot: then show the text as is (no glued-on word).
  if (!text.includes("\u0000")) return <>{text}</>;
  const [a, b = ""] = text.split("\u0000");
  return <>{a}<span className="text-semantic-warning">{word}</span>{b}</>;
}

function Impact({ label, value, detail }: { label: string; value: string; detail: string }) {
  return (
    <div className="rounded-md border border-border-subtle bg-bg-surface p-3">
      <p className="text-caption text-text-secondary">{label}</p>
      <p className="num mt-1 text-numMd text-semantic-loss">{value}</p>
      <p className="num text-caption text-text-tertiary">{detail}</p>
    </div>
  );
}

/** Static rule row: a lock for mandatory, server-enforced rules (not a control); a dot for plain info. */
function RuleRow({ text, locked, strong, lockedLabel }: { text: string; locked?: boolean; strong?: boolean; lockedLabel?: string }) {
  return (
    <li className={cn("flex items-start gap-2", strong && "font-medium text-text-primary")} data-locked={locked || undefined}>
      {locked ? <Lock size={14} className="mt-0.5 shrink-0 text-text-tertiary" role="img" aria-label={lockedLabel} /> : <Dot size={14} className="mt-0.5 shrink-0" aria-hidden />}
      <span>{text}</span>
    </li>
  );
}
