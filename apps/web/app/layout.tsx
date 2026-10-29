import type { Metadata } from "next";
import { Inter, JetBrains_Mono } from "next/font/google";
import { ToastProvider } from "@/components/ui/client";
import { THEME_INIT } from "@/lib/security/theme-init";
import "./globals.css";

const inter = Inter({ subsets: ["latin"], variable: "--font-inter", display: "swap" });
const mono = JetBrains_Mono({ subsets: ["latin"], variable: "--font-jetbrains", display: "swap" });

export const metadata: Metadata = {
  title: { default: "Sentra", template: "%s · Sentra" },
  description: "Sentra (working name): dashboard for our Solana trading bot. Mock data build.",
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
