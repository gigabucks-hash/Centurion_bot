"use client";
import { useEffect } from "react";
import { resolveTheme } from "@/lib/i18n/core";

/** Keep data-theme aligned with the saved choice, including live system changes. */
export function ThemeSync() {
  useEffect(() => {
    const mq = window.matchMedia("(prefers-color-scheme: dark)");
    const apply = () => {
      let choice: string | null = null;
      try {
        choice = localStorage.getItem("centurion_theme");
      } catch {
        choice = null;
      }
      const mode = resolveTheme(choice, mq.matches);
      document.documentElement.dataset.theme = mode;
      document.documentElement.dataset.themeChoice = choice === "light" || choice === "dark" ? choice : "system";
      const canvas = getComputedStyle(document.documentElement).getPropertyValue("--color-bg-canvas").trim();
      document.querySelector('meta[name="theme-color"]')?.setAttribute("content", canvas || (mode === "light" ? "#FFFFFF" : "#0B0B0D"));
    };
    apply();
    mq.addEventListener("change", apply);
    window.addEventListener("storage", apply);
    return () => {
      mq.removeEventListener("change", apply);
      window.removeEventListener("storage", apply);
    };
  }, []);
  return null;
}
