"use client";
import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import { useEffect, useState, type ReactNode } from "react";
import { LogOut, MoreHorizontal, Search, X } from "lucide-react";
import { Wordmark } from "./Wordmark";
import type { TradingMode } from "@/lib/types";
import { APPROVALS_CHANGED, fetchApprovals } from "@/lib/client";
import { cn } from "@/components/ui";
import { NAV } from "./nav";
import { RealtimeProvider, useRealtime } from "./RealtimeProvider";
import { ModeBanner } from "./ModeBanner";
import { ThemeToggle } from "./ThemeToggle";
import { LocaleToggle } from "./LocaleToggle";
import { useT } from "@/lib/i18n/client";
import { logout, useSessionKeeper } from "@/lib/auth/session-client";

function Brand({ height = 36 }: { height?: number }) {
  return (
    <Link href="/" className="flex items-center text-text-primary" aria-label="Centurion Trade">
      <Wordmark height={height} />
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
    <nav className="flex flex-col gap-0.5" aria-label={t("nav.main")}>
      {NAV.map(({ href, label, icon: Icon }) => {
        const active = isActive(href);
        return (
          <Link
            key={href}
            href={href}
            aria-current={active ? "page" : undefined}
            className={cn(
              "relative flex h-8 items-center gap-2 rounded-md px-2 text-label transition duration-fast",
              active ? "bg-bg-raised text-text-primary" : "text-text-secondary hover:bg-bg-raised hover:text-text-primary",
            )}
          >
            {active && <span className="absolute top-1.5 bottom-1.5 left-0 w-0.5 rounded-full bg-brand-primary" aria-hidden />}
            <Icon size={16} strokeWidth={1.75} aria-hidden />
            <span className="flex-1">{t(label)}</span>
            {href === "/approvals" && pending > 0 && <span className="num grid h-4 min-w-4 place-items-center rounded-sm bg-semantic-loss px-1 text-[10px] text-text-onAccent" aria-label={t("nav.pending", { n: pending })}>{pending}</span>}
          </Link>
        );
      })}
    </nav>
  );
}

function BottomNav({ pending, onMore }: { pending: number; onMore: () => void }) {
  const t = useT();
  const isActive = useActive();
  return (
    <nav aria-label={t("nav.main")} className="fixed inset-x-0 bottom-0 z-30 grid grid-cols-5 border-t border-border-subtle bg-bg-chrome pb-[env(safe-area-inset-bottom)] lg:hidden">
      {NAV.filter((n) => n.mobile).map(({ href, short, icon: Icon }) => (
        <Link key={href} href={href} aria-current={isActive(href) ? "page" : undefined} className="relative flex min-h-tap-touch flex-col items-center justify-center gap-0.5 text-caption">
          <span className={cn("grid h-7 w-12 place-items-center rounded-md", isActive(href) ? "bg-bg-raised text-text-primary" : "text-text-secondary")}>
            <Icon size={16} strokeWidth={1.75} aria-hidden />
          </span>
          <span className={isActive(href) ? "text-text-primary" : "text-text-secondary"}>{t(short)}</span>
          {href === "/approvals" && pending > 0 && <span className="num absolute top-1 right-[22%] rounded-full bg-semantic-loss px-1.5 text-overline text-bg-canvas">{pending}</span>}
        </Link>
      ))}
      <button onClick={onMore} className="flex min-h-tap-touch flex-col items-center justify-center gap-0.5 text-caption text-text-secondary">
        <span className="grid h-7 w-12 place-items-center"><MoreHorizontal size={16} strokeWidth={1.75} aria-hidden /></span>
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
      <label className="flex h-8 w-56 items-center gap-2 rounded-md border border-border-subtle bg-bg-sunken px-2.5 text-caption text-text-tertiary focus-within:border-border-focus">
        <Search size={14} strokeWidth={1.75} aria-hidden />
        <input id="global-search" name="q" placeholder={t("nav.search")} className="w-full bg-transparent text-body text-text-primary outline-none placeholder:text-text-tertiary" aria-label={t("nav.searchLabel")} />
      </label>
    </form>
  );
}

export function ShellSkeleton() {
  return (
    <div className="min-h-screen">
      <div className="skeleton h-7" />
      <div className="h-12 border-b border-border-subtle bg-bg-chrome" />
      <div className="mx-auto max-w-7xl p-6">
        <div className="h-40 animate-pulse rounded-lg bg-bg-surface" />
      </div>
    </div>
  );
}

export function AppShell({ children, sessionKeeper = true, modes, realCount, paperCount, pendingApprovals }: {
  children: ReactNode;
  /** Silent refresh of the httpOnly session (off when CENTURION_AUTH_GATE=0 for local perf/screenshot runs). */
  sessionKeeper?: boolean;
  /** Modes that have strategies (Paper always; Real only when a strategy runs in Real). No global mode any more. */
  modes: TradingMode[];
  realCount: number;
  paperCount: number;
  pendingApprovals: number;
}) {
  const t = useT();
  const [more, setMore] = useState(false);
  const [pending, setPending] = useState(pendingApprovals);
  const pathname = usePathname();
  useSessionKeeper(sessionKeeper);

  useEffect(() => {
    const refresh = () =>
      Promise.all(modes.map((m) => fetchApprovals(m).catch(() => [])))
        .then((lists) => setPending(lists.flat().filter((a) => a.status === "pending").length))
        .catch(() => {});
    refresh();
    window.addEventListener(APPROVALS_CHANGED, refresh);
    return () => window.removeEventListener(APPROVALS_CHANGED, refresh);
  }, [modes]);

  // Window title prefix (SPEC §4; i18n 0.4.10 [PAPER]/[REAL]): [REAL] as soon as any strategy runs in Real.
  const real = realCount > 0;
  useEffect(() => {
    const prefix = real ? "[REAL] " : "[PAPER] ";
    if (!document.title.startsWith(prefix)) document.title = prefix + document.title.replace(/^\[(PRACTICE|REAL SOL|PAPER|REAL)\] /, "");
  }, [real, pathname]);

  return (
    <RealtimeProvider modes={modes}>
      {/* Mode accent tokens: Paper unless a strategy runs in Real (per-item chips carry each item's own mode). */}
      <div data-mode={real ? "real" : "practice"} className="flex min-h-screen flex-col">
        <div className="sticky top-0 z-40">
          <ModeBanner realCount={realCount} paperCount={paperCount} />
          <header className="chrome-bar flex h-12 items-center gap-3 border-b border-border-subtle px-4">
            <span className="lg:hidden"><Brand height={26} /></span>
            <div className="ml-auto flex items-center gap-2 sm:gap-3">
              <SearchBox />
              <ConnectionDot />
              <span className="hidden sm:inline-flex"><LocaleToggle /></span>
              <ThemeToggle />
              <button
                className="hidden h-8 w-8 place-items-center rounded-md text-text-secondary hover:bg-bg-raised hover:text-text-primary sm:grid"
                title={t("nav.signOut")}
                aria-label={t("nav.signOut")}
                onClick={() => logout()}
              >
                <LogOut size={16} aria-hidden />
              </button>
            </div>
          </header>
        </div>

        <div className="flex flex-1">
          {/* QA-14: the column background stretches with the content; the nav inside stays sticky. */}
          <aside className="hidden w-56 shrink-0 border-r border-border-subtle bg-bg-chrome lg:block">
            <div className="sticky top-[var(--shell-top)] flex h-[calc(100dvh-var(--shell-top))] flex-col px-3 py-4">
              <Brand height={28} />
              <div className="mt-5">
                <SideNav pending={pending} />
              </div>
              <p className="mt-auto border-t border-border-subtle px-2 pt-3 text-caption text-text-tertiary">{t("nav.workspaceNote")}</p>
            </div>
          </aside>
          <main className="mx-auto w-full min-w-0 max-w-7xl flex-1 px-4 pt-4 pb-24 sm:px-6 lg:pb-8">
            {children}
          </main>
        </div>

        <BottomNav pending={pending} onMore={() => setMore(true)} />
        {more && (
          <div className="fixed inset-0 z-50 lg:hidden" role="dialog" aria-modal="true" aria-label={t("nav.more")}>
            <button className="absolute inset-0 bg-scrim-sheet" aria-label={t("common.close")} onClick={() => setMore(false)} />
            <div className="absolute inset-x-0 bottom-0 rounded-t-xl border-t border-border-default bg-bg-overlay p-4 shadow-dialog">
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
