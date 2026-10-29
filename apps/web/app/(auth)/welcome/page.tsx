import type { Metadata } from "next";
import Link from "next/link";
import { STRATEGY_PRESETS } from "@/lib/strategy-schema";
import { getT } from "@/lib/i18n/server";

export const metadata: Metadata = { title: "Welcome" };

/** Onboarding: new account → Practice workspace 30 SOL → pick a preset → dashboard. */
export default async function WelcomePage() {
  const t = await getT();
  return (
    <div className="mx-auto flex min-h-screen max-w-3xl flex-col justify-center p-6">
      <div className="stripes-practice mb-6 rounded-md bg-mode-practiceContainer px-4 py-2 text-label font-semibold text-mode-practice">{t("mode.bannerPractice")}</div>
      <h1 className="text-headline">{t("welcome.heading")}</h1>
      <p className="mt-2 text-bodyLg text-text-secondary">{t("welcome.body", { n: 30 })}</p>
      <div className="mt-6 grid gap-3 sm:grid-cols-2">
        {STRATEGY_PRESETS.map((p) => (
          <Link key={p.id} href={`/strategies/new?preset=${p.id}`} className="rounded-lg border border-border-subtle bg-bg-surface p-4 shadow-e1 hover:border-brand-primary">
            <p className="text-titleSm">{t(`preset.${p.id}`)}</p>
            <p className="mt-1 text-caption text-text-secondary">{t(`preset.${p.id}Blurb`)}</p>
          </Link>
        ))}
      </div>
      <div className="mt-6 flex items-center gap-4">
        <Link href="/" className="inline-flex h-12 items-center rounded-md bg-brand-primary px-5 text-titleSm text-text-onAccent hover:bg-brand-primaryHover">{t("welcome.go")}</Link>
        <span className="text-caption text-text-tertiary">{t("welcome.realNote")}</span>
      </div>
    </div>
  );
}
