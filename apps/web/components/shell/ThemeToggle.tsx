"use client";
import { useEffect, useState } from "react";
import { Monitor, Moon, Sun } from "lucide-react";
import { resolveTheme } from "@/lib/i18n/core";
import { useT } from "@/lib/i18n/client";

type Choice = "system" | "dark" | "light";
const ORDER: Choice[] = ["system", "dark", "light"];

function readChoice(): Choice {
  try {
    const saved = localStorage.getItem("centurion_theme");
    if (saved === "light" || saved === "dark" || saved === "system") return saved;
  } catch {
    /* ignore */
  }
  return "system";
}

export function applyThemeChoice(choice: Choice) {
  const mode = resolveTheme(choice, window.matchMedia("(prefers-color-scheme: dark)").matches);
  document.documentElement.dataset.theme = mode;
  document.documentElement.dataset.themeChoice = choice;
  try {
    if (choice === "system") localStorage.removeItem("centurion_theme");
    else localStorage.setItem("centurion_theme", choice);
  } catch {
    /* ignore */
  }
}

export function ThemeToggle() {
  const t = useT();
  const [choice, setChoice] = useState<Choice>("system");
  useEffect(() => {
    const tm = setTimeout(() => setChoice(readChoice()), 0);
    return () => clearTimeout(tm);
  }, []);
  const next = ORDER[(ORDER.indexOf(choice) + 1) % ORDER.length];
  const Icon = choice === "light" ? Sun : choice === "dark" ? Moon : Monitor;
  const name = (c: Choice) => t(c === "system" ? "nav.themeSystem" : c === "light" ? "nav.themeLight" : "nav.themeDark");
  return (
    <button
      type="button"
      onClick={() => {
        applyThemeChoice(next);
        setChoice(next);
      }}
      aria-label={t("nav.themeTo", { theme: name(next) })}
      title={t("nav.themeTo", { theme: name(next) })}
      className="grid h-8 w-8 place-items-center rounded-md text-text-secondary hover:bg-bg-raised hover:text-text-primary"
    >
      <Icon size={16} aria-hidden />
    </button>
  );
}
