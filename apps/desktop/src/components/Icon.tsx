import type { LucideIcon } from "lucide-react";

export type IconSize = 16 | 18 | 20 | 24 | 32;

/**
 * One icon family for the desktop chrome: Lucide (ISC, free for commercial use), the same package and
 * grid as web/mobile (G1 icon set, `Shared\centurion-work\icons\icons.manifest.json`).
 *
 * Colour is `currentColor`, so tokens decide contrast — never pass a hex to an icon. Icon + visible text
 * is decorative (`aria-hidden`); pass `label` only for an icon-only control, which then gets a name.
 *
 * Sizes: 16 inline (chips/table meta), 18 compact desktop rows, 20 controls/tabs/buttons, 24 page
 * headers, 32 empty-state hero. Stroke: Lucide default 2 on the 24 grid, 1.75 at 16 px, 1.5 at 32 px.
 */
export function Icon({ glyph: Glyph, size = 20, label, className }: {
  glyph: LucideIcon;
  size?: IconSize;
  /** Accessible name for an icon-only control. Omit when a visible text label sits next to it. */
  label?: string;
  className?: string;
}) {
  const strokeWidth = size === 16 ? 1.75 : size === 32 ? 1.5 : 2;
  return (
    <Glyph
      size={size}
      strokeWidth={strokeWidth}
      className={className ? `icon ${className}` : "icon"}
      aria-hidden={label ? undefined : true}
      aria-label={label}
      role={label ? "img" : undefined}
      focusable="false"
    />
  );
}
