#!/usr/bin/env python3
"""Build Centurion Trade logo SVGs from the approved reference.

Text is outlined from Cinzel (OFL-1.1, Natanael Gama) so the files do not
depend on a font being installed. The helmet is an original vector galea
matching the approved lockup: gold bowl, red-to-orange crest, purple lining.
"""
from __future__ import annotations

import math
import shutil
from pathlib import Path

from fontTools.pens.svgPathPen import SVGPathPen
from fontTools.ttLib import TTFont
from fontTools.varLib.instancer import instantiateVariableFont

ROOT = Path(__file__).resolve().parent
FONT_PATH = ROOT / "fonts" / "Cinzel-wght.ttf"
OUT = ROOT

GOLD = ("#F6E2A8", "#E0BE62", "#A9782C")
TRADE_DARK = "#1A140C"
LINE_DARK = "#6E5316"
BG = "#0C0C0E"
BG_LIGHT = "#F6F3EC"


def font_at(weight: float) -> TTFont:
    font = TTFont(FONT_PATH)
    return instantiateVariableFont(font, {"wght": weight}, inplace=False)


def text_svg(font: TTFont, text: str, size: float, tracking: float = 0.0) -> tuple[str, float, float]:
    """Return (svg fragment, width, height) with baseline at y=0 and y growing down."""
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
                f'<g transform="translate({x:.3f} 0) scale({scale:.6f} {-scale:.6f})"><path d="{commands}"/></g>'
            )
        x += glyph_set[name].width * scale + tracking
    body = "\n".join(parts)
    return body, x, ascent + descent


def helmet(uid: str) -> str:
    """Profile galea facing right. Box is about 0 0 300 340."""
    # Filled crest: a fan whose base sits on the crown.
    # Bristle lines are clipped to that fan so they read as horsehair, not a comb.
    return f"""
<g id="{uid}">
  <defs>
    <linearGradient id="{uid}-gold" x1="0.15" y1="0" x2="0.9" y2="1">
      <stop offset="0" stop-color="#FFF4D0"/>
      <stop offset="0.4" stop-color="#E4C56A"/>
      <stop offset="1" stop-color="#8D6118"/>
    </linearGradient>
    <linearGradient id="{uid}-crest" x1="0" y1="0.2" x2="1" y2="0.6">
      <stop offset="0" stop-color="#7A1230"/>
      <stop offset="0.45" stop-color="#D3262E"/>
      <stop offset="1" stop-color="#F0B03A"/>
    </linearGradient>
    <radialGradient id="{uid}-rivet" cx="0.35" cy="0.32" r="0.8">
      <stop offset="0" stop-color="#FFF8DE"/>
      <stop offset="1" stop-color="#9A6820"/>
    </radialGradient>
    <linearGradient id="{uid}-purple" x1="0" y1="0" x2="0" y2="1">
      <stop offset="0" stop-color="#4C227C"/>
      <stop offset="1" stop-color="#160828"/>
    </linearGradient>
    <clipPath id="{uid}-fan">
      <path d="M118 132
               C70 96 48 48 78 22
               C112 2 176 8 196 40
               C210 62 188 96 160 118
               C146 128 130 136 118 132 Z"/>
    </clipPath>
  </defs>
  <g clip-path="url(#{uid}-fan)">
    <path d="M118 132 C70 96 48 48 78 22 C112 2 176 8 196 40 C210 62 188 96 160 118 C146 128 130 136 118 132 Z" fill="url(#{uid}-crest)"/>
    <g stroke="#2A0A14" stroke-width="1.15" opacity="0.35">
      {"".join(f'<line x1="150" y1="120" x2="{78 + i * 4.2:.1f}" y2="{18 + (i - 14) ** 2 * 0.22:.1f}"/>' for i in range(28))}
    </g>
  </g>
  <path d="M78 214 C58 228 56 256 82 272 C108 288 136 276 140 254 C142 238 124 222 104 214 Z" fill="url(#{uid}-gold)"/>
  <path d="M108 150
           C92 176 96 214 122 238
           C146 260 184 258 198 232
           C210 210 206 176 184 154
           C164 134 128 128 108 150 Z" fill="url(#{uid}-gold)"/>
  <path d="M176 162
           C158 178 154 214 170 242
           C184 264 214 268 226 246
           C238 224 232 186 210 166
           C196 154 186 152 176 162 Z" fill="url(#{uid}-purple)"/>
  <path d="M148 176
           C138 204 146 246 172 266
           C194 282 220 270 224 246
           C228 220 214 188 192 170
           C176 158 158 160 148 176 Z" fill="url(#{uid}-gold)"/>
  <path d="M168 140 C198 132 232 148 246 170 C228 154 196 148 174 156 C166 148 164 142 168 140 Z" fill="#F3D78A"/>
  <path d="M196 178 C206 198 204 222 190 236 C204 224 212 202 206 182 C202 172 198 172 196 178 Z" fill="#2A1246"/>
  <circle cx="128" cy="176" r="6" fill="url(#{uid}-rivet)"/>
  <circle cx="188" cy="188" r="5.5" fill="url(#{uid}-rivet)"/>
  <circle cx="178" cy="232" r="5" fill="url(#{uid}-rivet)"/>
  <path d="M118 158 C142 140 170 136 196 150" fill="none" stroke="#FFF6D4" stroke-width="2.5" stroke-linecap="round" opacity="0.55"/>
</g>
"""


def mix(a: tuple[int, int, int], b: tuple[int, int, int], t: float) -> str:
    c = tuple(round(a[i] + (b[i] - a[i]) * t) for i in range(3))
    return f"#{c[0]:02X}{c[1]:02X}{c[2]:02X}"


def gold_defs(uid: str) -> str:
    return f"""
    <linearGradient id="{uid}" x1="0" y1="0" x2="0" y2="1">
      <stop offset="0" stop-color="{GOLD[0]}"/>
      <stop offset="0.48" stop-color="{GOLD[1]}"/>
      <stop offset="1" stop-color="{GOLD[2]}"/>
    </linearGradient>
    """


def helmet_markup() -> str:
    raw = (ROOT / "helmet.svg").read_text()
    start = raw.find("<svg")
    start = raw.find(">", start) + 1
    return raw[start:raw.rfind("</svg>")].strip()


def wordmark(trade_fill: str, line_fill: str) -> str:
    font = font_at(680)
    name, name_w, name_h = text_svg(font, "CENTURION", 168, tracking=-1.2)
    small = font_at(620)
    trade, trade_w, trade_h = text_svg(small, "TRADE", 64, tracking=18)
    helm_h = 320
    helm_w = helm_h * (312 / 370)
    gap = 36
    text_x = helm_w + gap
    # Vertically center the two text lines against the helmet.
    block_h = name_h + 28 + trade_h
    name_y = (helm_h - block_h) / 2 + 132  # baseline offset: ascent of 168px Cinzel is ~132
    # text_svg places baseline at 0, glyphs extend upward (negative y) and a little down.
    ascent = 132
    trade_ascent = 50
    name_baseline = (helm_h - (ascent + 22 + trade_ascent)) / 2 + ascent
    trade_baseline = name_baseline + 22 + trade_ascent
    trade_x = text_x + (name_w - trade_w) / 2
    line_y = trade_baseline - trade_ascent * 0.42
    line_w = 92
    pad = 8
    width = text_x + name_w + pad
    height = helm_h
    return f"""<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 {width:.0f} {height:.0f}" fill="none" role="img" aria-label="Centurion Trade">
  <defs>
    {gold_defs("g")}
  </defs>
  <svg x="0" y="{(height - helm_h) / 2:.1f}" width="{helm_w:.1f}" height="{helm_h:.1f}" viewBox="0 0 312 370">{helmet_markup()}</svg>
  <g fill="url(#g)" transform="translate({text_x:.1f} {name_baseline:.1f})">{name}</g>
  <line x1="{trade_x - line_w - 16:.1f}" y1="{line_y:.1f}" x2="{trade_x - 14:.1f}" y2="{line_y:.1f}" stroke="{line_fill}" stroke-width="3" stroke-linecap="round"/>
  <line x1="{trade_x + trade_w + 14:.1f}" y1="{line_y:.1f}" x2="{trade_x + trade_w + line_w + 16:.1f}" y2="{line_y:.1f}" stroke="{line_fill}" stroke-width="3" stroke-linecap="round"/>
  <g fill="{trade_fill}" transform="translate({trade_x:.1f} {trade_baseline:.1f})">{trade}</g>
</svg>
"""


def mark_svg() -> str:
    return f"""<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 312 370" role="img" aria-label="Centurion Trade">
  {helmet_markup()}
</svg>
"""


def icon_svg(pad_ratio: float) -> str:
    side = 512
    margin = side * pad_ratio
    avail = side - margin * 2
    helm_h = avail
    helm_w = avail * (312 / 370)
    if helm_w > avail:
        helm_w = avail
        helm_h = avail * (370 / 312)
    x = (side - helm_w) / 2
    y = (side - helm_h) / 2
    return f"""<svg xmlns="http://www.w3.org/2000/svg" width="{side}" height="{side}" viewBox="0 0 {side} {side}" role="img" aria-label="Centurion Trade">
  <rect width="{side}" height="{side}" fill="{BG}"/>
  <svg x="{x:.1f}" y="{y:.1f}" width="{helm_w:.1f}" height="{helm_h:.1f}" viewBox="0 0 312 370">{helmet_markup()}</svg>
</svg>
"""


def banner(width: int, height: int, light: bool) -> str:
    import re
    bg = BG_LIGHT if light else BG
    trade = TRADE_DARK if light else "#FFFFFF"
    line = LINE_DARK if light else "#E0BE62"
    glow = "rgba(212,168,75,0.18)" if not light else "rgba(166,120,44,0.12)"
    inner = wordmark(trade, line)
    match = re.search(r'viewBox="0 0 ([0-9.]+) ([0-9.]+)"', inner)
    vw, vh = float(match.group(1)), float(match.group(2))
    body = inner.split(">", 1)[1].rsplit("</svg>", 1)[0]
    target_w = width * 0.86
    scale = target_w / vw
    target_h = vh * scale
    x = (width - target_w) / 2
    y = (height - target_h) / 2
    return f"""<svg xmlns="http://www.w3.org/2000/svg" width="{width}" height="{height}" viewBox="0 0 {width} {height}" role="img" aria-label="Centurion Trade">
  <rect width="{width}" height="{height}" fill="{bg}"/>
  <defs>
    <radialGradient id="glow" cx="50%" cy="50%" r="42%">
      <stop offset="0" stop-color="{glow}"/>
      <stop offset="1" stop-color="{bg}" stop-opacity="0"/>
    </radialGradient>
  </defs>
  <rect width="{width}" height="{height}" fill="url(#glow)"/>
  <svg x="{x:.1f}" y="{y:.1f}" width="{target_w:.1f}" height="{target_h:.1f}" viewBox="0 0 {vw:.0f} {vh:.0f}">{body}</svg>
</svg>
"""


def main() -> None:
    dark = wordmark("#FFFFFF", "#E0BE62")
    light = wordmark(TRADE_DARK, LINE_DARK)
    (OUT / "wordmark-on-dark.svg").write_text(dark)
    (OUT / "wordmark-on-light.svg").write_text(light)
    (OUT / "mark.svg").write_text(mark_svg())
    (OUT / "icon.svg").write_text(icon_svg(0.12))
    (OUT / "icon-maskable.svg").write_text(icon_svg(0.22))
    (OUT / "readme-banner-dark.svg").write_text(banner(1280, 400, False))
    (OUT / "readme-banner-light.svg").write_text(banner(1280, 400, True))
    (OUT / "social-preview.svg").write_text(banner(1280, 640, False))
    print("wrote svgs")
    # Print wordmark viewBox by reading the tag
    for name in ("wordmark-on-dark.svg", "mark.svg"):
        first = (OUT / name).read_text().split(">", 1)[0]
        print(name, first[-80:])


if __name__ == "__main__":
    main()
