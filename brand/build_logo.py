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
# viewBox of the hand-drawn mark. Crest, then the helmet: rounded dome,
# a visor notch that opens through the face guard, an angled cheek, and a neck flare.
MARK_BOX = (100, 126)

MARK_PATHS = (
    "M50.6 0.6C55.1 0.3 60.5 0.6 65.0 1.3C69.5 2.0 73.3 3.0 77.4 4.7"
    "C81.5 6.4 86.1 8.9 89.7 11.5L99.6 19.2L86.0 23.8"
    "C81.8 25.8 79.3 30.4 75.4 30.8C71.5 31.2 66.4 27.0 62.4 26.1"
    "C58.4 25.2 55.2 25.3 51.5 25.5C47.8 25.7 43.7 26.4 40.4 27.4"
    "C37.1 28.3 35.0 29.1 31.6 31.2C28.2 33.4 23.3 37.1 20.3 40.3"
    "C17.3 43.5 15.3 46.6 13.5 50.3C11.7 53.9 10.2 57.5 9.2 62.2"
    "L7.7 78.6L3.0 68.4C1.9 64.7 1.1 60.9 0.9 56.5C0.7 52.1 0.7 47.1 1.7 42.3"
    "C2.7 37.4 5.1 31.4 7.1 27.4C9.1 23.3 10.6 21.2 13.7 18.0"
    "C16.8 14.8 21.6 10.8 25.6 8.3C29.6 5.8 33.6 4.3 37.8 3.0"
    "C42.0 1.7 46.1 0.9 50.6 0.6Z",
    "M47.0 35.7C49.9 35.4 52.8 35.4 55.6 35.7C58.4 36.0 60.9 36.5 63.7 37.6"
    "C66.5 38.7 70.2 40.8 72.4 42.3L77.1 46.7L42.5 63.9L41.7 65.2L55.6 61.2"
    "C62.7 58.8 78.3 44.8 84.4 50.5L92.3 95.5L85.9 92.2"
    "C84.3 88.9 86.8 79.2 82.7 75.6C78.6 71.9 65.0 71.2 61.1 70.3"
    "C57.2 69.4 59.6 70.0 59.2 70.1C58.8 70.2 58.6 70.0 58.8 71.1"
    "C59.0 72.1 59.6 74.9 60.5 76.4C61.4 77.9 61.1 78.9 64.1 80.3"
    "C67.1 81.7 75.7 80.2 78.6 84.7C81.5 89.2 80.0 101.0 81.4 107.4"
    "L86.8 123.4L73.5 120.4C69.0 118.7 63.5 115.5 60.0 113.0"
    "C56.5 110.5 54.8 108.8 52.4 105.1C50.0 101.4 48.1 94.3 45.9 91.1"
    "L39.1 86.0L41.7 94.7C41.9 97.9 42.4 103.7 40.2 105.3"
    "C38.0 106.9 32.9 104.3 28.4 104.5L13.2 106.6L19.2 97.2"
    "C20.6 94.7 21.0 93.5 21.4 91.5C21.8 89.5 22.3 88.3 21.8 84.9"
    "C21.3 81.5 18.8 74.7 18.2 70.9C17.6 67.1 17.9 65.2 18.4 62.2"
    "C18.9 59.2 20.3 55.2 21.4 52.7C22.5 50.2 23.3 49.1 24.8 47.3"
    "C26.3 45.5 28.1 43.6 30.3 42.0C32.5 40.4 35.4 38.8 38.2 37.8"
    "C41.0 36.8 44.1 36.1 47.0 35.7Z",
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
