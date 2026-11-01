import type { Metadata, Viewport } from "next";
import { APP_DESCRIPTION, APP_NAME, APP_TITLE, BRAND_COLORS } from "@/lib/brand";
import { Inter, JetBrains_Mono } from "next/font/google";
import { ToastProvider } from "@/components/ui/client";
import { THEME_INIT } from "@/lib/security/theme-init";
import "./globals.css";

const inter = Inter({ subsets: ["latin"], variable: "--font-inter", display: "swap" });
const mono = JetBrains_Mono({ subsets: ["latin"], variable: "--font-jetbrains", display: "swap" });

// Rebrand (Boss 2026-10-29): Centurion Trade. Private app → robots noindex; OG/Twitter for shared links only.
export const metadata: Metadata = {
  metadataBase: new URL(process.env.NEXT_PUBLIC_SITE_URL ?? "http://localhost:3100"),
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


export default function RootLayout({ children }: LayoutProps<"/">) {
  return (
    <html lang="en" data-theme="dark" className={`${inter.variable} ${mono.variable} h-full antialiased`} suppressHydrationWarning>
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
