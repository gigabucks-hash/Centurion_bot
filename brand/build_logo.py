#!/usr/bin/env python3
"""Build the Centurion Trade mark and lockups.

The helmet is a hand-drawn geometric galea (side profile, solid fill): a
crescent crest, a visor slit, and a cheek opening. It is not a trace.
"Centurion" is outlined from Schibsted Grotesk and "TRADE" from Martian Mono
so the files do not depend on a font being installed. Both faces are OFL.
"""
from __future__ import annotations

from pathlib import Path

from fontTools.pens.svgPathPen import SVGPathPen
from fontTools.ttLib import TTFont

ROOT = Path(__file__).resolve().parent
REPO = ROOT.parent
UI = REPO / "packages" / "design-tokens" / "fonts" / "ui"
SANS = UI / "schibsted-grotesk-latin-600-normal.woff2"
MONO = UI / "martian-mono-latin-500-normal.woff2"

ORANGE = "#FF7A1A"
BLUE = "#2563EB"
INK = "#0B0B0D"
PAPER = "#FFFFFF"
NAME_ON_DARK = "#F4F4F5"
# viewBox of the hand-drawn mark
MARK_BOX = (116, 146)

# Crest, then the bowl with the visor slit and the cheek opening cut out.
MARK_PATHS = (
    "M106 30C92 10 62 0 36 10C14 18 2 42 10 64C12 76 20 88 26 78"
    "C18 64 16 44 32 30C50 16 76 18 96 28C102 30 105 30 106 30Z",
    "M32 50C42 40 60 36 76 42C90 46 100 56 106 70C112 86 112 104 104 118"
    "C98 132 90 144 82 138C70 128 60 116 54 106C48 114 38 122 32 116"
    "C26 106 24 92 28 80C30 68 30 56 32 50Z"
    "M56 56L104 46L100 54L60 62Z"
    "M70 70C84 68 96 76 94 86C92 94 80 96 72 88C66 82 64 72 70 70Z",
)


def text_svg(font: TTFont, text: str, size: float, tracking: float = 0.0) -> tuple[str, float, float, float]:
    """Outlined glyphs. Baseline at y=0, y grows down. Returns path, width, ascent, descent."""
    glyph_set = font.getGlyphSet()
    cmap = font.getBestCmap()
    upem = font["head"].unitsPerEm
    scale = size / upem
    ascent = font["hhea"].ascent * scale
    descent = -font["hhea"].descent * scale
    x = 0.0
    parts: list[str] = []
    for ch in text:
        name = cmap[ord(ch)]
        pen = SVGPathPen(glyph_set)
        glyph_set[name].draw(pen)
        commands = pen.getCommands()
        if commands:
            parts.append(
                f'<path d="{commands}" transform="translate({x:.2f} 0) scale({scale:.5f} {-scale:.5f})"/>'
            )
        x += glyph_set[name].width * scale + tracking
    return "".join(parts), x - (tracking if text else 0), ascent, descent


def mark_group(fill: str) -> str:
    paths = "".join(f'<path fill="{fill}" fill-rule="evenodd" d="{d}"/>' for d in MARK_PATHS)
    return paths


def mark_svg(fill: str) -> str:
    w, h = MARK_BOX
    label = "Centurion Trade" if fill != "currentColor" else "Centurion"
    return (
        f'<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 {w} {h}" fill="none" role="img" aria-label="{label}">'
        f"{mark_group(fill)}</svg>\n"
    )


def wordmark(mark_fill: str, name_fill: str, trade_fill: str) -> str:
    sans = TTFont(SANS)
    mono = TTFont(MONO)
    name, name_w, name_asc, name_desc = text_svg(sans, "Centurion", 86, tracking=-0.8)
    trade, trade_w, trade_asc, trade_desc = text_svg(mono, "TRADE", 22, tracking=3.2)
    helm_h = 148
    helm_w = helm_h * (MARK_BOX[0] / MARK_BOX[1])
    gap = 22
    text_x = helm_w + gap
    # Two lines, optically centered on the helmet.
    block = name_asc + name_desc + 10 + trade_asc + trade_desc
    name_base = (helm_h - block) / 2 + name_asc
    trade_base = name_base + name_desc + 10 + trade_asc
    width = text_x + max(name_w, trade_w) + 4
    height = helm_h
    return f'''<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 {width:.0f} {height:.0f}" fill="none" role="img" aria-label="Centurion Trade">
  <svg x="0" y="0" width="{helm_w:.1f}" height="{helm_h:.0f}" viewBox="0 0 {MARK_BOX[0]} {MARK_BOX[1]}">{mark_group(mark_fill)}</svg>
  <g fill="{name_fill}" transform="translate({text_x:.1f} {name_base:.1f})">{name}</g>
  <g fill="{trade_fill}" transform="translate({text_x:.1f} {trade_base:.1f})">{trade}</g>
</svg>
'''


def icon_svg(pad: float, rounded: bool) -> str:
    side = 512
    margin = side * pad
    avail = side - margin * 2
    helm_h = avail
    helm_w = avail * (MARK_BOX[0] / MARK_BOX[1])
    if helm_w > avail:
        helm_w = avail
        helm_h = avail * (MARK_BOX[1] / MARK_BOX[0])
    x = (side - helm_w) / 2
    y = (side - helm_h) / 2
    radius = 112 if rounded else 0
    return f'''<svg xmlns="http://www.w3.org/2000/svg" width="{side}" height="{side}" viewBox="0 0 {side} {side}" role="img" aria-label="Centurion Trade">
  <rect width="{side}" height="{side}" rx="{radius}" fill="{INK}"/>
  <svg x="{x:.1f}" y="{y:.1f}" width="{helm_w:.1f}" height="{helm_h:.1f}" viewBox="0 0 {MARK_BOX[0]} {MARK_BOX[1]}">{mark_group(ORANGE)}</svg>
</svg>
'''


def banner(width: int, height: int, light: bool) -> str:
    import re

    bg = PAPER if light else INK
    inner = wordmark(BLUE if light else ORANGE, INK if light else NAME_ON_DARK, BLUE if light else ORANGE)
    match = re.search(r'viewBox="0 0 ([0-9.]+) ([0-9.]+)"', inner)
    vw, vh = float(match.group(1)), float(match.group(2))
    body = inner.split(">", 1)[1].rsplit("</svg>", 1)[0]
    target_h = height * 0.46
    scale = target_h / vh
    target_w = vw * scale
    if target_w > width * 0.86:
        target_w = width * 0.86
        scale = target_w / vw
        target_h = vh * scale
    x = (width - target_w) / 2
    y = (height - target_h) / 2
    return f'''<svg xmlns="http://www.w3.org/2000/svg" width="{width}" height="{height}" viewBox="0 0 {width} {height}" role="img" aria-label="Centurion Trade">
  <rect width="{width}" height="{height}" fill="{bg}"/>
  <svg x="{x:.1f}" y="{y:.1f}" width="{target_w:.1f}" height="{target_h:.1f}" viewBox="0 0 {vw:.0f} {vh:.0f}">{body}</svg>
</svg>
'''


def main() -> None:
    (ROOT / "mark.svg").write_text(mark_svg("currentColor"))
    (ROOT / "mark-on-dark.svg").write_text(mark_svg(ORANGE))
    (ROOT / "mark-on-light.svg").write_text(mark_svg(BLUE))
    (ROOT / "wordmark-on-dark.svg").write_text(wordmark(ORANGE, NAME_ON_DARK, ORANGE))
    (ROOT / "wordmark-on-light.svg").write_text(wordmark(BLUE, INK, BLUE))
    (ROOT / "wordmark.svg").write_text(wordmark("currentColor", "currentColor", "currentColor"))
    (ROOT / "icon.svg").write_text(icon_svg(0.16, True))
    (ROOT / "icon-maskable.svg").write_text(icon_svg(0.28, False))
    (ROOT / "readme-banner-dark.svg").write_text(banner(1280, 400, False))
    (ROOT / "readme-banner-light.svg").write_text(banner(1280, 400, True))
    (ROOT / "social-preview.svg").write_text(banner(1280, 640, False))
    (ROOT / "og.svg").write_text(banner(1200, 630, False))
    print("wrote svgs")


if __name__ == "__main__":
    main()
