"use client";
import { rejectReasonFor } from "@/lib/contracts";
import { remainingUntil } from "@/lib/clock";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { AlertTriangle, Ban, Check, Fingerprint, Keyboard, ShieldAlert, Timer, X } from "lucide-react";
import { NOT_TRADEABLE } from "@/lib/types";
import type { Approval, SkipReason, TradingMode } from "@/lib/types";
import { cancelGuardChangeClient, decideApprovalClient, fetchApproval, fetchApprovals, type DecideOptions } from "@/lib/client";
import { ApiError, errorText } from "@/lib/errors";
import { fmtCountdown } from "@/lib/format";
import { useT, useFmt } from "@/lib/i18n/client";
import { settingLabel } from "@/lib/strategy-schema";
import { Badge, Button, Card, EmptyState, RiskBadge, cn } from "@/components/ui";
import { Countdown, Dialog, HoldButton, Segmented, useNow, useToast } from "@/components/ui/client";
import { ApprovalStatusBadge, ModeBadge } from "@/components/domain";
import dynamic from "next/dynamic";
// Perf: the hardened guard dialog is only needed once a guard change is opened → its own chunk.
const GuardWeakeningDialog = dynamic(() => import("./GuardWeakeningDialog").then((m) => m.GuardWeakeningDialog), { ssr: false });
import { SwipeRow } from "./SwipeRow";
import { NotTradeableChip, NotTradeableCta, NotTradeableReason } from "@/components/NotTradeable";

/** QA-06: one tab per contract ProposalStatus (pending · approved · rejected="Skipped" · expired). executing/filled/failed are approved sub-states. */
type Tab = "pending" | "approved" | "rejected" | "expired";
const TAB_OF = (a: Approval): Tab => (a.status === "pending" ? "pending" : a.status === "rejected" ? "rejected" : a.status === "expired" ? "expired" : "approved");
const KIND_KEY = { buy_pick: "approvals.kindPick", guard_change: "approvals.kindGuard", team_action: "approvals.kindTeam" } as const;
const PICK_KEY = { first_buy: "approvals.pickFirst", buy: "approvals.pickBuy", rebuy: "approvals.pickRebuy" } as const;
const HOLD = { practice: 1200, real: 2500 } as const;
const SKIP_REASONS: SkipReason[] = ["thin_liquidity", "already_pumped", "dev_suspicious", "other"];

/**
 * Approval queue (SPEC §3, wireframe 03/05). Sorted by soonest expiry.
 * - Picks: approve / skip (+reason chips, Undo 5 s). Batch approve = picks only.
 * - Real SOL picks: extra confirm dialog (summary + hold 2.5 s), batch shows total SOL.
 * - Guard changes: never batched/swiped → hardened GuardWeakeningDialog.
 * - Team actions on Real: mock passkey + hold 2.5 s.
 * Keyboard (QA-12): J/K move · A approve · S skip · X select · ⇧A approve selected · Space details · ↵ chart · Esc clear.
 */
export function ApprovalQueue({ initial, mode }: { initial: Approval[]; mode: TradingMode }) {
  const toast = useToast();
  const t = useT();
  const f = useFmt();
  const now = useNow(1000);
  const [items, setItems] = useState(initial);
  const [tab, setTab] = useState<Tab>("pending");
  const [focusId, setFocusId] = useState<string | null>(null);
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const [busy, setBusy] = useState(false);
  const [skipFor, setSkipFor] = useState<Approval | null>(null);
  const [realPick, setRealPick] = useState<Approval[] | null>(null);
  const [guardFor, setGuardFor] = useState<Approval | null>(null);
  const [teamFor, setTeamFor] = useState<Approval | null>(null);
  const [quickLook, setQuickLook] = useState<Approval | null>(null);
  const router = useRouter();
  const real = mode === "real";

  /** Rejects are sent after the 5 s Undo window (the contract has no undo). */
  const [skipping, setSkipping] = useState<Map<string, SkipReason | undefined>>(new Map());
  const skipTimers = useRef(new Map<string, ReturnType<typeof setTimeout>>());
  /** 409 VERSION_CONFLICT banner: the item changed elsewhere; reloaded, user re-decides. */
  const [conflict, setConflict] = useState<Approval | null>(null);

  const refresh = useCallback(async () => {
    try {
      setItems(await fetchApprovals(mode));
    } catch {
      /* keep last state */
    }
  }, [mode]);
  useEffect(() => {
    const id = setInterval(refresh, 4000);
    return () => clearInterval(id);
  }, [refresh]);

  // Client-side expiry so countdown → expired is immediate (server is authoritative on next poll).
  const view = useMemo(
    () =>
      items.map((a) =>
        a.status === "pending" && skipping.has(a.id)
          ? { ...a, status: "rejected" as const, skipReason: skipping.get(a.id), decidedAt: now ?? a.createdAt }
          : a.status === "pending" && now != null && now > a.expiresAt
            ? { ...a, status: "expired" as const, expiredReason: "timeout" as const }
            : a,
      ),
    [items, now, skipping],
  );
  const counts = useMemo(() => {
    const c: Record<Tab, number> = { pending: 0, approved: 0, rejected: 0, expired: 0 };
    view.forEach((a) => c[TAB_OF(a)]++);
    return c;
  }, [view]);
  const list = useMemo(
    () => view.filter((a) => TAB_OF(a) === tab).sort((a, b) => (tab === "pending" ? a.expiresAt - b.expiresAt : (b.decidedAt ?? b.expiresAt) - (a.decidedAt ?? a.expiresAt))),
    [view, tab],
  );
  const focused = list.find((a) => a.id === focusId) ?? list[0] ?? null;
  const cooldowns = view.filter((a) => a.kind === "guard_change" && a.status === "approved" && a.cooldownEndsAt);
  const ntPending = list.filter((a) => a.kind === "buy_pick" && a.status === "pending" && isNotTradeable(a)).length;
  const selPicks = list.filter((a) => selected.has(a.id) && a.kind === "buy_pick" && a.status === "pending" && !isNotTradeable(a));
  const selTotal = selPicks.reduce((s, a) => s + (a.amountSol ?? 0), 0);

  const decide = useCallback(
    async (a: Approval, d: DecideOptions): Promise<Approval | null> => {
      setBusy(true);
      try {
        await decideApprovalClient(a, d);
        const next = await fetchApproval(a.id);
        setItems((p) => p.map((x) => (x.id === next.id ? next : x)));
        return next;
      } catch (e) {
        if (e instanceof ApiError && e.code === "VERSION_CONFLICT") {
          const fresh = await fetchApproval(a.id).catch(() => null);
          if (fresh) {
            setItems((p) => p.map((x) => (x.id === fresh.id ? fresh : x)));
            setConflict(fresh);
          }
        } else {
          toast({ kind: "error", text: errorText(t, e) });
          if (e instanceof ApiError && (e.code === "APPROVAL_ALREADY_DECIDED" || e.code === "APPROVAL_EXPIRED")) refresh();
        }
        return null;
      } finally {
        setBusy(false);
      }
    },
    [toast, t, refresh],
  );

  const cancelCooldown = useCallback(
    async (a: Approval) => {
      try {
        const next = await cancelGuardChangeClient(a.id);
        setItems((p) => p.map((x) => (x.id === next.id ? next : x)));
        toast({ kind: "success", text: t("approvals.cancelled") });
      } catch (e) {
        toast({ kind: "error", text: errorText(t, e) });
      }
    },
    [toast, t],
  );

  const approve = useCallback(
    (a: Approval) => {
      if (a.status !== "pending" || isNotTradeable(a)) return;
      if (a.kind === "guard_change") return setGuardFor(a);
      if (a.kind === "team_action") return setTeamFor(a);
      if (a.mode === "real") return setRealPick([a]);
      decide(a, { decision: "approve" }).then((n) => n && toast({ kind: "success", text: t("approvals.approvedToast", { symbol: a.symbol ? `$${a.symbol}` : a.title }) }));
    },
    [decide, toast, t],
  );

  const skip = useCallback(
    (a: Approval, reason?: SkipReason) => {
      // Not tradeable: Skip is allowed as a plain dismiss (no reason). Approve stays disabled.
      if (isNotTradeable(a)) reason = undefined;
      setSkipFor(null);
      setSkipping((m) => new Map(m).set(a.id, reason));
      const drop = () =>
        setSkipping((m) => {
          const n = new Map(m);
          n.delete(a.id);
          return n;
        });
      const timer = setTimeout(async () => {
        skipTimers.current.delete(a.id);
        // 1.1.3 reject_reason: not tradeable → not_tradeable (dismiss, no dialog); chip → price_moved/other; none → user_declined.
        // The chip id stays in the free-text `reason` for the audit trail.
        await decide(a, { decision: "reject", reason: reason ?? null, rejectReason: rejectReasonFor({ notTradeable: isNotTradeable(a), skipReason: reason }) });
        drop();
      }, 5000);
      skipTimers.current.set(a.id, timer);
      const coin = a.symbol ?? a.title;
      toast({
        kind: "info",
        text: a.kind !== "buy_pick" ? t("approvals.rejectedChange", { title: a.title }) : reason ? t("approvals.skippedReason", { symbol: coin, reason: t(`skipReason.${reason}`) }) : t("approvals.skippedToast", { symbol: coin }),
        action: {
          label: t("approvals.undo"),
          run: () => {
            clearTimeout(skipTimers.current.get(a.id));
            skipTimers.current.delete(a.id);
            drop();
          },
        },
        ttl: 5000,
      });
    },
    [decide, toast, t],
  );
  useEffect(() => {
    const timers = skipTimers.current;
    return () => timers.forEach(clearTimeout);
  }, []);

  const batchApprove = useCallback(() => {
    if (selPicks.length === 0) return;
    if (real) return setRealPick(selPicks);
    Promise.all(selPicks.map((a) => decideApprovalClient(a, { decision: "approve" }).catch(() => null))).then(() => {
      toast({ kind: "success", text: t("approvals.approvedMany", { n: selPicks.length }) });
      setSelected(new Set());
      refresh();
    });
  }, [selPicks, real, toast, refresh, t]);

  // Keyboard shortcuts
  const dialogOpen = !!(skipFor || realPick || guardFor || teamFor || quickLook);
  const stateRef = useRef({ list, focused, approve, skip, batchApprove, dialogOpen });
  useEffect(() => {
    stateRef.current = { list, focused, approve, skip, batchApprove, dialogOpen };
  });
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      const s = stateRef.current;
      const target = e.target as HTMLElement;
      if (s.dialogOpen || target.closest("input, textarea, select, [contenteditable]")) return;
      const idx = s.focused ? s.list.findIndex((a) => a.id === s.focused!.id) : -1;
      const k = e.key;
      if (k === "j" || k === "J" || k === "ArrowDown") setFocusId(s.list[Math.min(s.list.length - 1, idx + 1)]?.id ?? null);
      else if (k === "k" || k === "K" || k === "ArrowUp") setFocusId(s.list[Math.max(0, idx - 1)]?.id ?? null);
      else if (k === "A" && e.shiftKey) s.batchApprove();
      else if (k === "a" && s.focused) s.approve(s.focused);
      else if ((k === "s" || k === "S") && s.focused?.status === "pending") {
        if (isNotTradeable(s.focused)) s.skip(s.focused); // dismiss: no reason dialog
        else setSkipFor(s.focused);
      }
      else if ((k === "x" || k === "X") && s.focused?.kind === "buy_pick" && s.focused.status === "pending" && !isNotTradeable(s.focused)) toggle(s.focused.id);
      else if (k === " " && s.focused) setQuickLook(s.focused);
      else if (k === "Enter" && s.focused?.mint) router.push(`/coins/${s.focused.mint}#chart`);
      else if (k === "Escape") setSelected(new Set());
      else return;
      e.preventDefault();
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [router]);

  function toggle(id: string) {
    setSelected((p) => {
      const n = new Set(p);
      if (n.has(id)) n.delete(id);
      else n.add(id);
      return n;
    });
  }

  return (
    <>
      {cooldowns.map((a) => (
        <div key={a.id} role="status" className="mb-3 flex flex-wrap items-center gap-3 rounded-md border border-mode-real/60 bg-mode-realContainer px-4 py-3 text-body">
          <Timer size={16} className="text-mode-real" />
          <span>
            {t("approvals.cooldownBanner", { strategy: a.strategyName ?? "", from: a.revFrom ?? "", to: a.revTo ?? "" })}{" "}
            <span className="num font-semibold">{now ? fmtCountdown(remainingUntil(a.cooldownEndsAt ?? 0)) : "--:--"}</span>
            {a.autoRevertAt && <span className="text-text-secondary">{t("approvals.autoReverts", { time: f.dateTime(a.autoRevertAt) })}</span>}
          </span>
          <Button size="sm" variant="primary" className="ml-auto" onClick={() => cancelCooldown(a)}>
            {t("approvals.cancelChange")}
          </Button>
        </div>
      ))}

      {conflict && (
        <div role="alert" className="mb-3 flex flex-wrap items-center gap-3 rounded-md border border-semantic-warning/60 bg-semantic-warningContainer px-4 py-3 text-body">
          <AlertTriangle size={16} className="text-semantic-warning" aria-hidden />
          <span className="min-w-0 flex-1">
            <b>{t("approvals.conflictTitle")}</b> {t("approvals.conflictBody", { title: conflict.symbol ?? conflict.title, version: conflict.rev })}
          </span>
          <Button size="sm" variant="primary" onClick={() => { setTab(TAB_OF(conflict)); setFocusId(conflict.id); setConflict(null); }}>{t("conflict.review")}</Button>
          <Button size="sm" variant="ghost" onClick={() => setConflict(null)}>{t("common.dismiss")}</Button>
        </div>
      )}

      <div className="mb-3 flex flex-wrap items-center gap-2">
        <Segmented
          label={t("approvals.queue")}
          value={tab}
          onChange={(v) => {
            setTab(v);
            setSelected(new Set());
            setFocusId(null);
          }}
          options={[
            { value: "pending", label: t("approvals.tabPending"), count: counts.pending },
            { value: "approved", label: t("approvals.tabApproved"), count: counts.approved },
            { value: "rejected", label: t("approvals.tabSkipped"), count: counts.rejected },
            { value: "expired", label: t("approvals.tabExpired"), count: counts.expired },
          ]}
        />
        <span className="ml-auto text-caption text-text-tertiary">{t("approvals.sortNote")}</span>
      </div>

      {selPicks.length > 0 && (
        <div className={cn("sticky top-2 z-20 mb-3 flex flex-wrap items-center gap-3 rounded-md border px-4 py-2 shadow-e2", real ? "border-mode-real bg-mode-realContainer" : "border-border-default bg-bg-overlay")}>
          <span className="text-label">{t("approvals.selected", { n: selPicks.length })}</span>
          {real && <span className="num text-label">{t("approvals.total", { amount_lamports: f.amount(selTotal) })}</span>}
          {ntPending > 0 && <span className="text-caption text-text-tertiary" data-not-tradeable>{t("notTradeable.batchExcluded", { n: ntPending })}</span>}
          <span className="text-caption text-text-tertiary">{t("approvals.batchNote")}</span>
          <Button size="sm" variant="ghost" className="ml-auto" onClick={() => setSelected(new Set())}>{t("approvals.clear")}</Button>
          <Button size="sm" variant={real ? "real" : "success"} onClick={batchApprove}><Check size={14} /> {t("approvals.approveSelectedN", { n: selPicks.length })} <kbd className="num hidden text-caption opacity-70 lg:inline">⇧A</kbd></Button>
        </div>
      )}

      <div className="grid grid-cols-1 gap-4 lg:grid-cols-[minmax(0,1fr)_minmax(0,24rem)]">
        <div className="flex min-w-0 flex-col gap-2">
          {tab === "pending" && list.some((a) => a.kind === "buy_pick") && (
            <p className="text-caption text-text-tertiary lg:hidden">{t(real ? "approvals.swipeDisabledReal" : "approvals.swipeHint")}</p>
          )}
          {list.length === 0 && <EmptyState title={tab === "pending" ? t("approvals.emptyPending") : t("approvals.empty")} detail={tab === "pending" ? t("approvals.emptyPendingDetail") : undefined} />}
          {list.map((a) => (
            <SwipeRow key={a.id} enabled={a.mode === "practice" && a.kind === "buy_pick" && a.status === "pending" && !isNotTradeable(a)} onApprove={() => approve(a)} onSkip={() => skip(a)}>
              <QueueCard
                a={a}
                focused={focused?.id === a.id}
                selected={selected.has(a.id)}
                onFocus={() => setFocusId(a.id)}
                onToggle={() => toggle(a.id)}
                onApprove={() => approve(a)}
                onSkip={() => (a.kind === "buy_pick" && !isNotTradeable(a) ? setSkipFor(a) : skip(a))}
                busy={busy}
              />
            </SwipeRow>
          ))}
        </div>
        <div className="flex min-w-0 flex-col gap-4">
          {focused && <DetailPane a={focused} onApprove={() => approve(focused)} onSkip={() => (focused.kind === "buy_pick" && !isNotTradeable(focused) ? setSkipFor(focused) : skip(focused))} />}
          <Card title={<span className="flex items-center gap-2"><Keyboard size={14} /> {t("approvals.shortcuts")}</span>} className="hidden lg:block">
            <dl className="grid grid-cols-2 gap-x-4 gap-y-1 text-caption text-text-secondary">
              {([["J / K", "jk"], ["A", "a"], ["S", "s"], ["X", "x"], ["⇧A", "sa"], ["Space", "space"], ["↵", "enter"], ["Esc", "esc"]] as const).map(([k, id]) => [k, t(`approvals.sc.${id}`)]).map(([k, v]) => (
                <div key={k} className="contents"><dt className="num text-text-primary">{k}</dt><dd>{v}</dd></div>
              ))}
            </dl>
            <p className="mt-2 text-caption text-text-tertiary">{t("approvals.swipeNote")}</p>
          </Card>
        </div>
      </div>

      {quickLook && (
        <Dialog open onClose={() => setQuickLook(null)} title={t("approvals.quickLook")}>
          <DetailPane a={quickLook} onApprove={() => (setQuickLook(null), approve(quickLook))} onSkip={() => (setQuickLook(null), quickLook.kind === "buy_pick" && !isNotTradeable(quickLook) ? setSkipFor(quickLook) : skip(quickLook))} />
        </Dialog>
      )}
      <SkipDialog a={skipFor} onClose={() => setSkipFor(null)} onSkip={skip} />
      {realPick && (
        <RealPickDialog
          picks={realPick}
          onClose={() => setRealPick(null)}
          busy={busy}
          onConfirm={async (holdMs) => {
            const res = await Promise.all(realPick.map((a) => decide(a, { decision: "approve", confirmation: { holdMs } })));
            setRealPick(null);
            setSelected(new Set());
            const ok = res.filter(Boolean).length;
            if (ok) toast({ kind: "success", text: t("approvals.approvedReal", { n: ok }) });
          }}
        />
      )}
      {guardFor && (
        <GuardWeakeningDialog
          approval={guardFor}
          open
          busy={busy}
          onClose={() => setGuardFor(null)}
          onConfirm={async (c) => {
            const n = await decide(guardFor, { decision: "approve", confirmation: { holdMs: c.holdMs, typedName: c.typedName, passkey: c.secondFactor === "mock_passkey" } });
            setGuardFor(null);
            if (n) toast({ kind: "warning", text: n.cooldownEndsAt ? t("approvals.cooldownToast", { strategy: n.strategyName ?? "", time: f.dateTime(n.cooldownEndsAt) }) : t("approvals.appliedPractice", { strategy: n.strategyName ?? "" }) });
          }}
        />
      )}
      {teamFor && (
        <TeamActionDialog
          a={teamFor}
          busy={busy}
          onClose={() => setTeamFor(null)}
          onConfirm={async (c) => {
            const n = await decide(teamFor, { decision: "approve", confirmation: { holdMs: c.holdMs, typedName: teamFor.strategyName, passkey: c.secondFactor === "mock_passkey" } });
            setTeamFor(null);
            if (n) toast({ kind: "success", text: t("approvals.teamApproved", { title: teamFor.title }) });
          }}
        />
      )}
    </>
  );
}

const isNotTradeable = (a: Approval) => a.screenerState === NOT_TRADEABLE;

function QueueCard({ a, focused, selected, onFocus, onToggle, onApprove, onSkip, busy }: {
  a: Approval; focused: boolean; selected: boolean; onFocus: () => void; onToggle: () => void; onApprove: () => void; onSkip: () => void; busy: boolean;
}) {
  const t = useT();
  const f = useFmt();
  const blockedCoin = isNotTradeable(a);
  const pending = a.status === "pending";
  const actionable = pending && !blockedCoin;
  const isPick = a.kind === "buy_pick";
  return (
    <article
      data-not-tradeable={blockedCoin || undefined}
      // WF-21 + Apex correction: neutral dashed card, grey text, no swipe; only "Skip" (dismiss), never Approve.
      onClick={onFocus}
      aria-current={focused || undefined}
      className={cn(
        "flex flex-wrap items-center gap-3 rounded-lg border bg-bg-surface p-3 shadow-e1 transition duration-fast sm:flex-nowrap",
        focused ? "border-brand-primary" : "border-border-subtle",
        a.kind === "guard_change" && pending && "border-l-4 border-l-semantic-warning",
        a.mode === "real" && pending && "border-l-4 border-l-mode-real",
        a.status === "expired" && "opacity-70",
        blockedCoin && "border-dashed bg-bg-sunken text-text-tertiary shadow-none",
      )}
    >
      {isPick && actionable ? (
        <input type="checkbox" checked={selected} onChange={onToggle} onClick={(e) => e.stopPropagation()} aria-label={t("approvals.selectAria", { symbol: `$${a.symbol}` })} className="h-4 w-4 accent-[var(--color-brand-primary)]" />
      ) : (
        <span className="w-4" aria-hidden />
      )}
      <div className="min-w-0 flex-1">
        <div className="flex flex-wrap items-center gap-1.5">
          <span className="text-titleSm">{isPick ? `$${a.symbol}` : a.title}</span>
          <Badge tone={a.kind === "guard_change" ? "warning" : a.kind === "team_action" ? "loss" : "brand"}>{isPick && a.pick ? t(PICK_KEY[a.pick.pickKind]) : t(KIND_KEY[a.kind])}</Badge>
          {a.mode === "real" && <ModeBadge mode="real" />}
          {blockedCoin && <NotTradeableChip label={t("screener.notTradeable")} />}
          {!pending && <ApprovalStatusBadge status={a.status} />}
        </div>
        <p className="truncate text-caption text-text-secondary">
          {a.strategyName}
          {blockedCoin && ` · ${t("notTradeable.rowHint", { score: a.pick?.score.value ?? "—" })}`}
          {a.kind === "guard_change" && a.revFrom != null && ` · rev ${a.revFrom} → ${a.revTo}`}
          {a.status === "expired" && a.expiredReason && ` · ${t("approvals.cannotApprove", { reason: t(`expiredReason.${a.expiredReason}`) })}`}
          {a.status === "rejected" && a.skipReason && ` · ${t(`skipReason.${a.skipReason}`)}`}
          {a.status === "rejected" && a.skipNote && ` · ${a.skipNote}`}
        </p>
      </div>
      {a.amountSol != null && <span className="num hidden text-numSm sm:block">{f.sol(a.amountSol)}</span>}
      <span className="hidden md:block"><RiskBadge level={a.risk} /></span>
      {pending ? <Countdown createdAt={a.createdAt} expiresAt={a.expiresAt} compact /> : <span className="num w-20 text-right text-caption text-text-tertiary">{f.time(a.decidedAt ?? a.expiresAt)}</span>}
      {pending && blockedCoin && (
        <div className="grid w-full grid-cols-1 gap-2 sm:flex sm:w-auto sm:justify-end" onClick={(e) => e.stopPropagation()}>
          <Button size="sm" variant="ghost" onClick={onSkip} disabled={busy} className="min-h-12 whitespace-nowrap sm:min-h-0" data-dismiss>
            <X size={14} aria-hidden /> {t("approvals.skip")}
          </Button>
        </div>
      )}
      {actionable && (
        <div className="grid w-full grid-cols-2 gap-2 sm:flex sm:w-auto sm:justify-end sm:gap-1.5" onClick={(e) => e.stopPropagation()}>
          {/* QA-03: always a labelled button (never icon-only), ≥ 48 px tall on touch layouts. QA-07: guard rows say "Reject change". */}
          <Button size="sm" variant={isPick ? "ghost" : "secondary"} onClick={onSkip} disabled={busy} className="min-h-12 whitespace-nowrap sm:min-h-0">
            <X size={14} aria-hidden /> {isPick ? t("approvals.skip") : t("approvals.rejectChange")}
          </Button>
          <Button size="sm" variant={a.mode === "real" ? "real" : a.kind === "buy_pick" ? "success" : "secondary"} onClick={onApprove} disabled={busy} className="min-h-12 whitespace-nowrap sm:min-h-0">
            {a.kind === "buy_pick" ? <><Check size={14} /> {t("approvals.approve")}</> : <><ShieldAlert size={14} /> {t("approvals.review")}</>}
          </Button>
        </div>
      )}
    </article>
  );
}

function DetailPane({ a, onApprove, onSkip }: { a: Approval; onApprove: () => void; onSkip: () => void }) {
  const t = useT();
  const f = useFmt();
  const p = a.pick;
  return (
    <Card title={a.kind === "buy_pick" ? `$${a.symbol} · ${t(p ? PICK_KEY[p.pickKind] : "approvals.kindPick")}` : a.title} subtitle={t("approvals.requested", { strategy: a.strategyName ?? "", time: f.time(a.createdAt) })} action={<ModeBadge mode={a.mode} />}>
      {p?.pickKind === "first_buy" && <p className="mb-2 rounded-md bg-semantic-warningContainer px-3 py-2 text-caption text-text-primary">{t("approvals.firstBuyNote")}</p>}
      <p className="text-body text-text-secondary">{a.detail}</p>
      {p && (
        <dl className="mt-3 grid grid-cols-2 gap-2 text-caption">
          <Field k={t("approvals.score")} v={<span className={p.score.value >= p.score.passMark ? "text-semantic-profit" : "text-semantic-warning"}>{p.score.value} / {p.score.passMark}</span>} />
          <Field k={t("approvals.guard")} v={`${p.guard.passed}/${p.guard.total}${p.guard.note ? ` · ${p.guard.note}` : ""}`} />
          <Field k={t("approvals.entry")} v={p.entry} />
          <Field k={t("approvals.exitPlan")} v={p.exitPlan} />
          <Field k={t("approvals.size")} v={a.amountSol != null ? f.sol(a.amountSol) : "—"} />
          <Field k={t("approvals.budget")} v={f.sol(p.budgetSol)} />
        </dl>
      )}
      {a.kind === "guard_change" && a.diff && (
        <ul className="mt-3 space-y-1 text-caption">
          {a.diff.map((r) => (
            <li key={r.key} className={cn("flex justify-between gap-2 rounded-sm px-2 py-1", r.direction === "weakens" && "bg-semantic-warningContainer")}>
              <span className="num">{settingLabel(t, r.key, r.label)}</span>
              <span className="num">{f.value(r.before)} → <b>{f.value(r.after)}</b></span>
            </li>
          ))}
        </ul>
      )}
      {a.kind === "team_action" && <p className="mt-3 flex items-center gap-1.5 text-caption text-semantic-loss"><AlertTriangle size={12} /> {t("approvals.teamNote")}</p>}
      {a.mint && <Link href={`/coins/${a.mint}`} className="mt-3 inline-block text-label text-brand-primary hover:underline">{t("approvals.openTrail")}</Link>}
      {isNotTradeable(a) ? (
        <>
          <NotTradeableReason className="mt-4" text={t("screener.notTradeableDetail")} />
          <NotTradeableCta label={t("notTradeable.cta")} note={t("notTradeable.ctaNote")} />
          {a.status === "pending" && (
            <>
              <Button onClick={onSkip} className="mt-2 min-h-12 w-full sm:min-h-0" data-dismiss><X size={14} /> {t("approvals.skipKey")}</Button>
              <p className="mt-1.5 text-caption text-text-tertiary">{t("notTradeable.skipHint")}</p>
            </>
          )}
        </>
      ) : a.status === "pending" ? (
        <div className="mt-4 grid grid-cols-2 gap-2">
          <Button onClick={onSkip} className="min-h-12 sm:min-h-0"><X size={14} /> {a.kind === "buy_pick" ? t("approvals.skipKey") : t("approvals.rejectChange")}</Button>
          <Button variant={a.mode === "real" ? "real" : a.kind === "buy_pick" ? "success" : "primary"} onClick={onApprove} className="min-h-12 sm:min-h-0">
            {a.kind === "buy_pick" ? t("approvals.approveKey") : t("approvals.reviewKey")}
          </Button>
        </div>
      ) : a.status === "expired" ? (
        <p className="mt-4 flex items-center gap-1.5 rounded-md bg-bg-sunken px-3 py-2 text-label text-text-secondary"><Ban size={14} /> {t("approvals.cannotApprove", { reason: a.expiredReason ? t(`expiredReason.${a.expiredReason}`) : t("approvalStatus.expired") })}</p>
      ) : (
        <p className="mt-4 flex items-center gap-2 text-caption text-text-tertiary"><ApprovalStatusBadge status={a.status} /> {a.auditId && <span className="num">{t("approvals.audit", { id: a.auditId })}</span>}</p>
      )}
    </Card>
  );
}

function Field({ k, v }: { k: string; v: React.ReactNode }) {
  return (
    <div className="rounded-md bg-bg-sunken px-2 py-1.5">
      <dt className="text-text-tertiary">{k}</dt>
      <dd className="num break-words text-text-primary">{v}</dd>
    </div>
  );
}

function SkipDialog({ a, onClose, onSkip }: { a: Approval | null; onClose: () => void; onSkip: (a: Approval, r?: SkipReason) => void }) {
  const t = useT();
  const firstRef = useRef<HTMLButtonElement>(null);
  if (!a) return null;
  return (
    <Dialog open onClose={onClose} title={t("approvals.skipTitle", { symbol: a.symbol ? `$${a.symbol}` : a.title })} initialFocusRef={firstRef}>
      <p className="text-body text-text-secondary">{t("approvals.skipBody")}</p>
      <div className="mt-4 flex flex-wrap gap-2">
        {SKIP_REASONS.map((r, i) => (
          <Button key={r} ref={i === 0 ? firstRef : undefined} size="sm" onClick={() => onSkip(a, r)}>{t(`skipReason.${r}`)}</Button>
        ))}
      </div>
      <div className="mt-5 flex justify-end gap-2">
        <Button variant="ghost" onClick={onClose}>{t("common.cancel")}</Button>
        <Button variant="secondary" onClick={() => onSkip(a)}>{t("approvals.skipNoReason")}</Button>
      </div>
    </Dialog>
  );
}

function RealPickDialog({ picks, onClose, onConfirm, busy }: { picks: Approval[]; onClose: () => void; onConfirm: (holdMs: number) => void; busy: boolean }) {
  const t = useT();
  const f = useFmt();
  const cancelRef = useRef<HTMLButtonElement>(null);
  const total = picks.reduce((s, a) => s + (a.amountSol ?? 0), 0);
  return (
    <Dialog open onClose={onClose} accent="real" initialFocusRef={cancelRef} title={t("approvals.realTitle", { what: picks.length > 1 ? t("approvals.realMany", { n: picks.length }) : t("approvals.realOne") })}>
      <ul className="divide-y divide-border-subtle rounded-md border border-border-subtle">
        {picks.map((a) => (
          <li key={a.id} className="flex items-center justify-between gap-2 px-3 py-2 text-body">
            <span><b>${a.symbol}</b> <span className="text-caption text-text-secondary">· {a.strategyName}</span></span>
            <span className="num">{f.sol(a.amountSol ?? 0)}</span>
          </li>
        ))}
      </ul>
      <p className="num mt-3 flex justify-between text-titleSm"><span>{t("approvals.totalLabel")}</span><span className="text-mode-real">{f.sol(total)}</span></p>
      <p className="mt-2 text-caption text-text-secondary">{t("approvals.realNote")}</p>
      <div className="mt-5 grid gap-3 sm:grid-cols-2">
        <HoldButton durationMs={HOLD.real} variant="real" disabled={busy} onConfirm={onConfirm} hint={t("common.holdSeconds", { s: HOLD.real / 1000 })}>{t("approvals.holdApprove", { amount_lamports: f.amount(total) })}</HoldButton>
        <Button ref={cancelRef} variant="primary" size="lg" onClick={onClose}>{t("common.cancelEsc")}</Button>
      </div>
    </Dialog>
  );
}

function TeamActionDialog({ a, onClose, onConfirm, busy }: { a: Approval; onClose: () => void; onConfirm: (c: { holdMs: number; secondFactor?: "mock_passkey" }) => void; busy: boolean }) {
  const t = useT();
  const cancelRef = useRef<HTMLButtonElement>(null);
  const [verified, setVerified] = useState(a.mode !== "real");
  const [verifying, setVerifying] = useState(false);
  return (
    <Dialog open onClose={onClose} accent={a.mode === "real" ? "real" : "warning"} initialFocusRef={cancelRef} title={a.title}>
      <div className="mb-3 flex items-center gap-2"><ModeBadge mode={a.mode} /><RiskBadge level={a.risk} /></div>
      <p className="text-body text-text-secondary">{a.detail}</p>
      {a.mode === "real" && (
        <Button
          className="mt-4 w-full"
          loading={verifying}
          disabled={verified}
          onClick={() => {
            setVerifying(true);
            setTimeout(() => {
              setVerifying(false);
              setVerified(true);
            }, 600);
          }}
        >
          <Fingerprint size={16} /> {verified ? t("approvals.verified") : t("approvals.verify")}
        </Button>
      )}
      <div className="mt-5 grid gap-3 sm:grid-cols-2">
        <HoldButton durationMs={HOLD[a.mode]} variant={a.mode === "real" ? "real" : "warning"} disabled={!verified || busy} onConfirm={(holdMs) => onConfirm({ holdMs, secondFactor: a.mode === "real" ? "mock_passkey" : undefined })} hint={t("common.holdSeconds", { s: HOLD[a.mode] / 1000 })}>
          {t("approvals.holdConfirm")}
        </HoldButton>
        <Button ref={cancelRef} variant="primary" size="lg" onClick={onClose}>{t("common.cancelEsc")}</Button>
      </div>
    </Dialog>
  );
}
