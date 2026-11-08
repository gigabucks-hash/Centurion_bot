import type { Metadata, Viewport } from "next";
import { cookies } from "next/headers";
import { APP_DESCRIPTION, APP_NAME, APP_TITLE, BRAND_COLORS } from "@/lib/brand";
import { siteUrl } from "@/lib/site-url";
import { LOCALE_COOKIE, localeFromCookie } from "@/lib/i18n/core";
import { Inter, JetBrains_Mono } from "next/font/google";
import { ToastProvider } from "@/components/ui/client";
import { THEME_INIT } from "@/lib/security/theme-init";
import "./globals.css";

const inter = Inter({ subsets: ["latin"], variable: "--font-inter", display: "swap" });
const mono = JetBrains_Mono({ subsets: ["latin"], variable: "--font-jetbrains", display: "swap" });

// Rebrand (Boss 2026-10-29): Centurion Trade. Private app → robots noindex; OG/Twitter for shared links only.
export const metadata: Metadata = {
  metadataBase: new URL(siteUrl(process.env.NEXT_PUBLIC_SITE_URL)),
  applicationName: APP_NAME,
  title: { default: APP_TITLE, template: `%s · ${APP_NAME}` },
  description: APP_DESCRIPTION,
  appleWebApp: { capable: true, title: APP_NAME, statusBarStyle: "black-translucent" },
  openGraph: { type: "website", siteName: APP_NAME, title: APP_TITLE, description: APP_DESCRIPTION },
  twitter: { card: "summary_large_image", title: APP_TITLE, description: APP_DESCRIPTION },
  robots: { index: false, follow: false },
  formatDetection: { telephone: false },
};

export const viewport: Viewport = {
  themeColor: BRAND_COLORS.canvas,
  colorScheme: "dark light",
  viewportFit: "cover",
};


export default async function RootLayout({ children }: LayoutProps<"/">) {
  // The app ships en + id copy behind a cookie; <html lang> must follow it (screen readers, spellcheck, hyphenation).
  const locale = localeFromCookie((await cookies()).get(LOCALE_COOKIE)?.value);
  return (
    <html lang={locale} data-theme="dark" className={`${inter.variable} ${mono.variable} h-full antialiased`} suppressHydrationWarning>
      <head>
        {/* Theme before first paint: plain text child (no dangerouslySetInnerHTML), allowed by its CSP hash. */}
        <script>{THEME_INIT}</script>
      </head>
      <body className="min-h-full text-body">
        <ToastProvider>{children}</ToastProvider>
      </body>
    </html>
  );
}
