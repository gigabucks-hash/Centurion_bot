"use client";
import { usePathname } from "next/navigation";
import { useT } from "@/lib/i18n/client";
import { heroKind, type HeroKind } from "@/lib/local/hero-kind";

type Kind = HeroKind;

const COPY: Record<Kind, "hero.desk" | "hero.positions" | "hero.strategies" | "hero.approvals" | "hero.activity" | "hero.coins" | "hero.stats" | "hero.settings"> = {
  desk: "hero.desk",
  positions: "hero.positions",
  strategies: "hero.strategies",
  approvals: "hero.approvals",
  activity: "hero.activity",
  coins: "hero.coins",
  stats: "hero.stats",
  settings: "hero.settings",
};

/** Original scene art. Colours come from design tokens so dark and light stay on-palette. */
function Scene({ kind }: { kind: Kind }) {
  const ink = "var(--color-text-primary)";
  const mute = "var(--color-text-tertiary)";
  const brand = "var(--color-brand-primary)";
  const profit = "var(--color-semantic-profit)";
  const loss = "var(--color-semantic-loss)";
  const surface = "var(--color-bg-sunken)";
  return (
    <svg viewBox="0 0 280 112" className="h-[88px] w-[220px] sm:h-[104px] sm:w-[260px]" aria-hidden>
      <rect x="8" y="16" width="264" height="80" rx="16" fill={surface} />
      {kind === "desk" && (
        <>
          <path d="M28 78c18-22 32-22 46-4 10 14 22 8 32-10 12-22 28-20 40 2" fill="none" stroke={brand} strokeWidth="3" strokeLinecap="round" />
          <rect x="168" y="36" width="14" height="40" rx="3" fill={profit} />
          <rect x="188" y="48" width="14" height="28" rx="3" fill={loss} />
          <rect x="208" y="28" width="14" height="48" rx="3" fill={brand} />
          <rect x="228" y="42" width="14" height="34" rx="3" fill={mute} />
        </>
      )}
      {kind === "positions" && (
        <>
          <rect x="36" y="34" width="88" height="48" rx="10" fill={brand} opacity="0.9" />
          <rect x="108" y="42" width="72" height="40" rx="10" fill={profit} />
          <rect x="168" y="50" width="72" height="32" rx="10" fill={ink} opacity="0.18" />
        </>
      )}
      {kind === "strategies" && (
        <>
          <circle cx="70" cy="56" r="16" fill={brand} />
          <circle cx="140" cy="40" r="12" fill={profit} />
          <circle cx="150" cy="78" r="12" fill={loss} />
          <circle cx="214" cy="56" r="18" fill="none" stroke={ink} strokeWidth="3" />
          <path d="M86 56h28M128 46l14 8M132 72l12-8" stroke={mute} strokeWidth="2" />
        </>
      )}
      {kind === "approvals" && (
        <>
          <rect x="48" y="32" width="120" height="56" rx="10" fill={ink} opacity="0.08" />
          <path d="M68 52h64M68 66h40" stroke={mute} strokeWidth="3" strokeLinecap="round" />
          <circle cx="196" cy="58" r="22" fill={profit} />
          <path d="M186 58l7 7 14-16" fill="none" stroke="var(--color-text-onAccent)" strokeWidth="3" strokeLinecap="round" />
        </>
      )}
      {kind === "activity" && (
        <>
          <path d="M48 36v48" stroke={mute} strokeWidth="2" />
          <circle cx="48" cy="42" r="5" fill={brand} />
          <circle cx="48" cy="60" r="5" fill={profit} />
          <circle cx="48" cy="78" r="5" fill={loss} />
          <rect x="68" y="34" width="150" height="12" rx="6" fill={ink} opacity="0.12" />
          <rect x="68" y="54" width="120" height="12" rx="6" fill={ink} opacity="0.12" />
          <rect x="68" y="72" width="90" height="12" rx="6" fill={ink} opacity="0.12" />
        </>
      )}
      {kind === "coins" && (
        <>
          <circle cx="90" cy="58" r="26" fill={brand} />
          <circle cx="150" cy="50" r="18" fill={profit} />
          <circle cx="196" cy="68" r="14" fill={loss} />
          <circle cx="230" cy="46" r="10" fill={mute} />
        </>
      )}
      {kind === "stats" && (
        <>
          <path d="M40 84h200" stroke={mute} strokeWidth="2" />
          <rect x="56" y="58" width="22" height="26" rx="4" fill={brand} />
          <rect x="90" y="44" width="22" height="40" rx="4" fill={profit} />
          <rect x="124" y="64" width="22" height="20" rx="4" fill={loss} />
          <rect x="158" y="36" width="22" height="48" rx="4" fill={brand} />
          <rect x="192" y="50" width="22" height="34" rx="4" fill={mute} />
        </>
      )}
      {kind === "settings" && (
        <>
          <rect x="48" y="36" width="168" height="14" rx="7" fill={ink} opacity="0.12" />
          <circle cx="150" cy="43" r="8" fill={brand} />
          <rect x="48" y="60" width="168" height="14" rx="7" fill={ink} opacity="0.12" />
          <circle cx="96" cy="67" r="8" fill={profit} />
          <rect x="48" y="84" width="120" height="8" rx="4" fill={mute} />
        </>
      )}
    </svg>
  );
}

export function PageHero() {
  const pathname = usePathname() ?? "/";
  const kind = heroKind(pathname);
  const t = useT();
  const key = COPY[kind];
  return (
    <section data-testid="page-hero" className="page-hero mb-6 flex items-center justify-between gap-4 overflow-hidden rounded-2xl border border-border-subtle px-4 py-3 sm:px-6">
      <div className="min-w-0">
        <p className="logo-kicker text-overline uppercase tracking-[0.14em]">{t("hero.kicker")}</p>
        <p className="mt-1 max-w-xl text-body text-text-primary sm:text-titleSm">{t(key)}</p>
      </div>
      <Scene kind={kind} />
    </section>
  );
}
