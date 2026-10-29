"use client";
import { useEffect, useState } from "react";
import { Moon, Sun } from "lucide-react";
import { useT } from "@/lib/i18n/client";

export function ThemeToggle() {
  const t = useT();
  const [theme, setTheme] = useState<"dark" | "light" | null>(null);
  useEffect(() => {
    const tm = setTimeout(() => setTheme(document.documentElement.dataset.theme === "light" ? "light" : "dark"), 0);
    return () => clearTimeout(tm);
  }, []);
  const next = theme === "light" ? "dark" : "light";
  return (
    <button
      type="button"
      onClick={() => {
        document.documentElement.dataset.theme = next;
        try {
          localStorage.setItem("sentra_theme", next);
        } catch {
          /* ignore */
        }
        setTheme(next);
      }}
      aria-label={t("nav.themeTo", { theme: t(next === "light" ? "nav.themeLight" : "nav.themeDark") })}
      title={t("nav.themeTo", { theme: t(next === "light" ? "nav.themeLight" : "nav.themeDark") })}
      className="grid h-9 w-9 place-items-center rounded-full border border-border-default text-text-secondary hover:bg-bg-raised hover:text-text-primary"
    >
      {theme === "light" ? <Moon size={16} /> : <Sun size={16} />}
    </button>
  );
}
