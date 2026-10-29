/** JS access to theme tokens for canvas-based charts. Values mirror app/theme.css; read live from CSS vars. */
export const tokenVar = {
  brand: "--color-brand-primary",
  profit: "--color-semantic-profit",
  loss: "--color-semantic-loss",
  warning: "--color-semantic-warning",
  guard: "--color-semantic-guard",
  info: "--color-semantic-info",
  textSecondary: "--color-text-secondary",
  textTertiary: "--color-text-tertiary",
  borderSubtle: "--color-border-subtle",
  surface: "--color-bg-surface",
  raised: "--color-bg-raised",
  textPrimary: "--color-text-primary",
} as const;

/** CSS var() strings for SVG-based charts (server-rendered SVG) — re-theme automatically. */
export const chartColors = {
  accent: `var(${tokenVar.brand})`,
  positive: `var(${tokenVar.profit})`,
  negative: `var(${tokenVar.loss})`,
  warning: `var(${tokenVar.warning})`,
  info: `var(${tokenVar.info})`,
  guard: `var(${tokenVar.guard})`,
  muted: `var(${tokenVar.textTertiary})`,
  line: `var(${tokenVar.borderSubtle})`,
  surface: `var(${tokenVar.raised})`,
  fg: `var(${tokenVar.textPrimary})`,
} as const;

/** Resolve a token to a concrete colour (canvas charts can't use var()). Client-only. */
export function readToken(name: string, el: Element = document.documentElement): string {
  return getComputedStyle(el).getPropertyValue(name).trim();
}
