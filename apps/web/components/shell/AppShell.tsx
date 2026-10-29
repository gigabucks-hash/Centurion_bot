"use client";
import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import { useEffect, useState, type ReactNode } from "react";
import { LogOut, MoreHorizontal, Search, X } from "lucide-react";
import type { TradingMode } from "@/lib/types";
import { APPROVALS_CHANGED, fetchApprovals } from "@/lib/client";
import { cn } from "@/components/ui";
import { NAV } from "./nav";
import { RealtimeProvider, useRealtime } from "./RealtimeProvider";
import { ModeBanner } from "./ModeBanner";
import { ModeSwitch } from "./ModeSwitch";
import { ThemeToggle } from "./ThemeToggle";
import { LocaleToggle } from "./LocaleToggle";
import { useT } from "@/lib/i18n/client";
import { logout, useSessionKeeper } from "@/lib/auth/session-client";

function Brand() {
  const t = useT();
  return (
    <Link href="/" className="flex items-baseline gap-2 text-text-primary">
      <span className="text-titleSm">{t("common.brand")}</span>
      <span className="hidden text-caption text-text-tertiary md:inline">{t("common.workingName")}</span>
    </Link>
  );
}

function useActive() {
  const pathname = usePathname();
  return (href: string) => (href === "/" ? pathname === "/" : pathname.startsWith(href));
}

function SideNav({ pending }: { pending: number }) {
  const t = useT();
  const isActive = useActive();
  return (
    <nav className="flex flex-col gap-1" aria-label={t("nav.main")}>
      {NAV.map(({ href, label, icon: Icon }) => (
        <Link
          key={href}
          href={href}
          aria-current={isActive(href) ? "page" : undefined}
          className={cn(
            "flex min-h-tap items-center gap-3 rounded-md border px-3 text-label transition duration-fast",
            isActive(href) ? "border-brand-primary/50 bg-brand-primaryContainer text-brand-onPrimaryContainer" : "border-transparent text-text-secondary hover:bg-bg-raised hover:text-text-primary",
          )}
        >
          <Icon size={18} aria-hidden />
          <span className="flex-1">{t(label)}</span>
          {href === "/approvals" && pending > 0 && <span className="num rounded-full bg-semantic-loss px-1.5 text-caption text-bg-canvas" aria-label={t("nav.pending", { n: pending })}>{pending}</span>}
        </Link>
      ))}
    </nav>
  );
}

function BottomNav({ pending, onMore }: { pending: number; onMore: () => void }) {
  const t = useT();
  const isActive = useActive();
  return (
    <nav aria-label={t("nav.main")} className="fixed inset-x-0 bottom-0 z-30 grid grid-cols-5 border-t border-border-subtle bg-bg-surface pb-[env(safe-area-inset-bottom)] lg:hidden">
      {NAV.filter((n) => n.mobile).map(({ href, short, icon: Icon }) => (
        <Link key={href} href={href} aria-current={isActive(href) ? "page" : undefined} className="relative flex min-h-tap-touch flex-col items-center justify-center gap-0.5 text-caption">
          <span className={cn("grid h-7 w-12 place-items-center rounded-full", isActive(href) ? "bg-brand-primaryContainer text-brand-onPrimaryContainer" : "text-text-secondary")}>
            <Icon size={18} aria-hidden />
          </span>
          <span className={isActive(href) ? "text-text-primary" : "text-text-secondary"}>{t(short)}</span>
          {href === "/approvals" && pending > 0 && <span className="num absolute top-1 right-[22%] rounded-full bg-semantic-loss px-1.5 text-overline text-bg-canvas">{pending}</span>}
        </Link>
      ))}
      <button onClick={onMore} className="flex min-h-tap-touch flex-col items-center justify-center gap-0.5 text-caption text-text-secondary">
        <span className="grid h-7 w-12 place-items-center"><MoreHorizontal size={18} aria-hidden /></span>
        {t("nav.more")}
      </button>
    </nav>
  );
}

function ConnectionDot() {
  const t = useT();
  const { status } = useRealtime();
  const cls = { connected: "bg-semantic-profit", connecting: "bg-semantic-warning animate-pulse", disconnected: "bg-semantic-loss" }[status];
  const map = { label: t(`conn.${status}`), cls };
  return (
    <span className="flex items-center gap-1.5 text-caption text-text-tertiary" role="status" aria-live="polite" title={status === "disconnected" ? t("conn.lost") : t("conn.title", { state: map.label })}>
      <span className={cn("h-2 w-2 rounded-full", map.cls)} aria-hidden />
      <span className="hidden xl:inline">{map.label}</span>
    </span>
  );
}

function SearchBox() {
  const t = useT();
  const router = useRouter();
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if ((e.metaKey || e.ctrlKey) && e.key.toLowerCase() === "k") {
        e.preventDefault();
        document.getElementById("global-search")?.focus();
      }
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, []);
  return (
    <form
      role="search"
      className="hidden md:block"
      onSubmit={(e) => {
        e.preventDefault();
        const q = new FormData(e.currentTarget).get("q");
        router.push(`/coins?q=${encodeURIComponent(String(q ?? ""))}`);
      }}
    >
      <label className="flex h-9 w-56 items-center gap-2 rounded-md border border-border-default bg-bg-sunken px-3 text-caption text-text-tertiary focus-within:outline-2 focus-within:outline-border-focus">
        <Search size={14} aria-hidden />
        <input id="global-search" name="q" placeholder={t("nav.search")} className="w-full bg-transparent text-body text-text-primary outline-none placeholder:text-text-tertiary" aria-label={t("nav.searchLabel")} />
      </label>
    </form>
  );
}

export function ShellSkeleton() {
  return (
    <div className="min-h-screen">
      <div className="h-8 bg-bg-raised" />
      <div className="h-14 border-b border-border-subtle bg-bg-surface" />
      <div className="mx-auto max-w-7xl p-6">
        <div className="h-40 animate-pulse rounded-lg bg-bg-surface" />
      </div>
    </div>
  );
}

export function AppShell({ children, sessionKeeper = true, mode, pendingApprovals, walletConnected, cashSol, lossStopPct, runningStrategies }: {
  children: ReactNode;
  /** Silent refresh of the httpOnly session (off when SENTRA_AUTH_GATE=0 for local perf/screenshot runs). */
  sessionKeeper?: boolean;
  mode: TradingMode;
  pendingApprovals: number;
  walletConnected: boolean;
  cashSol: number;
  lossStopPct: number;
  runningStrategies: number;
}) {
  const t = useT();
  const [more, setMore] = useState(false);
  const [pending, setPending] = useState(pendingApprovals);
  const pathname = usePathname();
  useSessionKeeper(sessionKeeper);

  useEffect(() => {
    const refresh = () =>
      fetchApprovals(mode)
        .then((list) => setPending(list.filter((a) => a.status === "pending").length))
        .catch(() => {});
    refresh();
    window.addEventListener(APPROVALS_CHANGED, refresh);
    return () => window.removeEventListener(APPROVALS_CHANGED, refresh);
  }, [mode]);

  // Window title carries the mode prefix (SPEC §4).
  useEffect(() => {
    const prefix = mode === "real" ? "[REAL SOL] " : "[PRACTICE] ";
    if (!document.title.startsWith(prefix)) document.title = prefix + document.title.replace(/^\[(PRACTICE|REAL SOL)\] /, "");
  }, [mode, pathname]);

  return (
    <RealtimeProvider mode={mode}>
      <div data-mode={mode} className="flex min-h-screen flex-col">
        <div className="sticky top-0 z-40">
          <ModeBanner mode={mode} walletConnected={walletConnected} />
          <header className="flex h-14 items-center gap-3 border-b border-border-subtle bg-bg-surface px-4">
            <Brand />
            <div className="ml-auto flex items-center gap-2 sm:gap-3">
              <ModeSwitch mode={mode} summary={{ cashSol, lossStopPct, runningStrategies, walletConnected }} />
              <SearchBox />
              <ConnectionDot />
              <span className="hidden sm:inline-flex"><LocaleToggle /></span>
              <ThemeToggle />
              <button
                className="hidden h-9 w-9 place-items-center rounded-full border border-border-default text-label text-text-secondary hover:bg-bg-raised sm:grid"
                title={t("nav.signOut")}
                aria-label={t("nav.signOut")}
                onClick={() => logout()}
              >
                Y
              </button>
            </div>
          </header>
        </div>

        <div className="flex flex-1">
          {/* QA-14: the column background stretches with the content; the nav inside stays sticky. */}
          <aside className="hidden w-[200px] shrink-0 border-r border-border-subtle bg-bg-surface lg:block">
            <div className="sticky top-22 flex h-[calc(100dvh-88px)] flex-col gap-4 px-2 py-4">
              <SideNav pending={pending} />
              <p className="mt-auto px-2 text-caption text-text-tertiary">{t("common.mockBuild")}</p>
            </div>
          </aside>
          <main className="mx-auto w-full min-w-0 max-w-7xl flex-1 px-4 pt-6 pb-24 sm:px-6 lg:pb-10">{children}</main>
        </div>

        <BottomNav pending={pending} onMore={() => setMore(true)} />
        {more && (
          <div className="fixed inset-0 z-50 lg:hidden" role="dialog" aria-modal="true" aria-label={t("nav.more")}>
            <button className="absolute inset-0 bg-bg-sunken/80" aria-label={t("common.close")} onClick={() => setMore(false)} />
            <div className="absolute inset-x-0 bottom-0 rounded-t-xl border-t border-border-default bg-bg-overlay p-4 shadow-e4">
              <div className="mb-3 flex items-center justify-between">
                <span className="text-titleSm">{t("nav.more")}</span>
                <button onClick={() => setMore(false)} aria-label={t("common.close")} className="grid h-10 w-10 place-items-center rounded-full text-text-secondary hover:bg-bg-raised"><X size={18} /></button>
              </div>
              <div className="flex flex-col gap-1" onClick={() => setMore(false)}>
                <SideNav pending={pending} />
              </div>
              <div className="mt-3 flex items-center justify-between border-t border-border-subtle pt-3">
                <ThemeToggle />
                <LocaleToggle />
                <button type="button" onClick={() => logout()} className="flex min-h-11 items-center gap-2 text-label text-text-secondary"><LogOut size={16} aria-hidden /> {t("nav.signOut")}</button>
              </div>
            </div>
          </div>
        )}
      </div>
    </RealtimeProvider>
  );
}
