#!/usr/bin/env python3
"""Small app icons from the 64px helmet, snapped to the pixel grid.

32 is the 64px tile scaled down, then the crest gap and the eye slit are
opened to 2px. 16 keeps that silhouette with a 1px gap and a 1px eye notch.
24 and 48 are the same 64px tile, thresholded so the edges sit on pixels.
"""
from __future__ import annotations

import struct
from pathlib import Path

from PIL import Image, ImageDraw

ORANGE = (255, 122, 26, 255)
INK = (11, 11, 13, 255)
ROOT = Path(__file__).resolve().parent
REPO = ROOT.parent
SRC64 = REPO / "apps" / "web" / "public" / "brand" / "mark-64.png"

# 32: box-downscale of mark-64, with the crest gap and the eye opened to 2px.
GRID32 = [
    "................................",
    "................................",
    "................................",
    "................................",
    "................................",
    "...............####.............",
    "............##########..........",
    "...........############.........",
    "..........##############........",
    ".........######...####..........",
    "........#####...................",
    "........###....###..............",
    "........##...#######............",
    "........##..########............",
    "........#..####....###..........",
    "........#..#####..####..........",
    "........#..###########..........",
    "........#..#######..###.........",
    "...........#######....#.........",
    "...........#########..#.........",
    "...........###.######.#.........",
    "...........###..#####...........",
    "..........#####.#####...........",
    ".................####...........",
    "..................####..........",
    "...................###..........",
    "................................",
    "................................",
    "................................",
    "................................",
    "................................",
    "................................",
]

# 16: same silhouette. 1px crest gap, 1px eye notch, tile still visible.
GRID16 = [
    "................",
    "................",
    "......###.......",
    "....#######.....",
    "...#########....",
    "...######.......",
    "..#.............",
    "..#.#####.......",
    "..#.###.........",
    "..#.#.###.......",
    "..#.######......",
    "...######.......",
    "....####........",
    ".....##.........",
    "................",
    "................",
]


def from_grid(rows: list[str], radius: int) -> Image.Image:
    size = len(rows)
    im = Image.new("RGBA", (size, size), (0, 0, 0, 0))
    draw = ImageDraw.Draw(im)
    draw.rounded_rectangle((0, 0, size - 1, size - 1), radius=radius, fill=INK)
    px = im.load()
    for y, row in enumerate(rows):
        for x, ch in enumerate(row):
            if ch == "#":
                px[x, y] = ORANGE
    return im


def threshold(size: int, radius: int) -> Image.Image:
    src = Image.open(SRC64).convert("RGBA").resize((size, size), Image.Resampling.BOX)
    im = Image.new("RGBA", (size, size), (0, 0, 0, 0))
    draw = ImageDraw.Draw(im)
    draw.rounded_rectangle((0, 0, size - 1, size - 1), radius=radius, fill=INK)
    sp = src.load()
    ip = im.load()
    for y in range(size):
        for x in range(size):
            r, g, b, a = sp[x, y]
            if a > 128 and r > 150 and g > 50:
                ip[x, y] = ORANGE
    return im


def widen_crest(im: Image.Image) -> None:
    """Where the crest gap is a single pixel, clear the crest's underside."""
    size = im.width
    px = im.load()

    def orange(x: int, y: int) -> bool:
        r, g, b, a = px[x, y]
        return a > 128 and r > 150

    for x in range(size):
        runs: list[tuple[int, int]] = []
        y = 0
        while y < size:
            if orange(x, y):
                start = y
                while y < size and orange(x, y):
                    y += 1
                runs.append((start, y - 1))
            else:
                y += 1
        if len(runs) < 2 or runs[1][0] > int(size * 0.55):
            continue
        gap = runs[1][0] - runs[0][1] - 1
        if gap == 1 and runs[0][1] > 0:
            y = runs[0][1]
            if px[x, y][3]:
                px[x, y] = INK


def pack_ico(images: list[Image.Image], dest: Path) -> None:
    blobs = []
    sizes = []
    for im in images:
        import io
        buf = io.BytesIO()
        im.save(buf, format="PNG")
        blobs.append(buf.getvalue())
        sizes.append(im.width)
    offset = 6 + 16 * len(blobs)
    header = struct.pack("<HHH", 0, 1, len(blobs))
    entries = b""
    for size, blob in zip(sizes, blobs):
        dim = 0 if size >= 256 else size
        entries += struct.pack("<BBBBHHII", dim, dim, 0, 0, 1, 32, len(blob), offset)
        offset += len(blob)
    dest.write_bytes(header + entries + b"".join(blobs))


def main() -> None:
    web = REPO / "apps" / "web" / "public" / "brand"
    desk = REPO / "apps" / "desktop" / "src-tauri" / "icons"
    icons = {
        16: from_grid(GRID16, 3),
        24: threshold(24, 5),
        32: from_grid(GRID32, 7),
        48: threshold(48, 11),
    }
    widen_crest(icons[24])
    for size, im in icons.items():
        im.save(web / f"mark-{size}.png")
    icons[32].save(desk / "32x32.png")
    large = [Image.open(web / f"mark-{s}.png").convert("RGBA") for s in (64, 128, 256)]
    ordered = [icons[s] for s in (16, 24, 32, 48)] + large
    pack_ico(ordered, REPO / "apps" / "web" / "app" / "favicon.ico")
    pack_ico(ordered, desk / "icon.ico")
    print("wrote", sorted(icons))


if __name__ == "__main__":
    main()
