import { ShieldOff } from "lucide-react";
import { getT } from "@/lib/i18n/server";

/** Proper state for `403 REAL_SOL_DISABLED` (CENTURION_REAL_SOL=disabled): replaces the page body in Real mode. */
export async function RealSolDisabled() {
  const t = await getT();
  return (
    <section role="status" data-mode="real" className="mx-auto mt-10 max-w-xl rounded-lg border border-mode-real/50 bg-bg-surface p-6 text-center">
      <ShieldOff size={28} className="mx-auto text-mode-real" aria-hidden />
      <h1 className="mt-3 text-titleMd">{t("realDisabled.title")}</h1>
      <p className="mt-2 text-body text-text-secondary">{t("realDisabled.body")}</p>
      <p className="mt-2 font-mono text-caption text-text-tertiary">403 REAL_SOL_DISABLED</p>
      <p className="mt-3 text-caption text-text-secondary">{t("apiError.REAL_SOL_DISABLED")}</p>
    </section>
  );
}
