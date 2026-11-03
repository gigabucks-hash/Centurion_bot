import type { Metadata } from "next";
import { cookies } from "next/headers";
import { Suspense } from "react";
import { PageHeader } from "@/components/ui";
import { SettingsPanel } from "@/components/settings/SettingsPanel";
import { getT } from "@/lib/i18n/server";
import { ACCESS_COOKIE } from "@/lib/auth/cookies";

export const metadata: Metadata = { title: "Settings" };

const METHODS = ["google", "apple", "telegram", "email_otp", "wallet_siws"] as const;

async function Body() {
  const [c, t] = await Promise.all([cookies(), getT()]);
  // Wallet session (httpOnly access cookie) → SIWS; legacy flagged methods keep their marker cookie.
  const m = c.has(ACCESS_COOKIE) ? "wallet_siws" : c.get("centurion_session")?.value?.replace(/^mock:/, "");
  const method = (METHODS as readonly string[]).includes(m ?? "") ? (m as (typeof METHODS)[number]) : null;
  return (
    <>
      <PageHeader title={t("settings.title")} subtitle={t("settings.subtitle")} />
      <SettingsPanel signedInWith={method} />
    </>
  );
}

export default function SettingsPage() {
  return (
    <Suspense fallback={<div className="h-64 animate-pulse rounded-lg bg-bg-surface" />}>
      <Body />
    </Suspense>
  );
}
