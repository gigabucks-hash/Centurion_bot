import type { Metadata } from "next";
import { Inter, JetBrains_Mono } from "next/font/google";
import { ToastProvider } from "@/components/ui/client";
import "./globals.css";

const inter = Inter({ subsets: ["latin"], variable: "--font-inter", display: "swap" });
const mono = JetBrains_Mono({ subsets: ["latin"], variable: "--font-jetbrains", display: "swap" });

export const metadata: Metadata = {
  title: { default: "Sentra", template: "%s · Sentra" },
  description: "Sentra (working name): dashboard for our Solana trading bot. Mock data build.",
};

/** Applies the saved theme before first paint (dark is default). Theme is a UI preference, not account data. */
const themeInit = `try{var t=localStorage.getItem('sentra_theme');document.documentElement.dataset.theme=(t==='light'?'light':'dark')}catch(e){document.documentElement.dataset.theme='dark'}`;

export default function RootLayout({ children }: LayoutProps<"/">) {
  return (
    <html lang="en" data-theme="dark" className={`${inter.variable} ${mono.variable} h-full antialiased`} suppressHydrationWarning>
      <head>
        <script dangerouslySetInnerHTML={{ __html: themeInit }} />
      </head>
      <body className="min-h-full text-body">
        <ToastProvider>{children}</ToastProvider>
      </body>
    </html>
  );
}
