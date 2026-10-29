import Link from "next/link";
import { EmptyState } from "@/components/ui";
import { tEn as t } from "@/lib/i18n";

/** Root not-found renders outside the locale provider; it uses the default (English) copy. */
export default function NotFound() {
  return (
    <div className="mx-auto max-w-lg p-10">
      <EmptyState title={t("notFound.title")} detail={t("notFound.detail")} action={<Link href="/" className="text-label text-brand-primary hover:underline">{t("notFound.back")}</Link>} />
    </div>
  );
}
