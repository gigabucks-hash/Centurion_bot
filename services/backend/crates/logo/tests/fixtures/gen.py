# Regenerates the local test fixtures (dev-only; Pillow is NOT a project dependency).
# python3 gen.py  -> writes files next to this script. Marker strings let tests prove metadata is stripped.
import io, struct, zlib
from PIL import Image

MARK = b"CENTURION_EXIF_MARKER_7f3a"

def exif_bytes():
    ex = Image.Exif()
    ex[0x010E] = MARK.decode()   # ImageDescription
    ex[0x0131] = "CenturionCam 1.0"  # Software
    ex[0x8298] = "Copyright " + MARK.decode()
    return ex.tobytes()

img = Image.new("RGB", (300, 200), (220, 30, 30))
for x in range(150, 300):
    for y in range(200):
        img.putpixel((x, y), (30, 30, 220))
img.save("photo_exif.jpg", "JPEG", quality=90, exif=exif_bytes())

from PIL import PngImagePlugin
pi = PngImagePlugin.PngInfo()
pi.add_text("Comment", MARK.decode())
pi.add_itxt("XML:com.adobe.xmp", "<x:xmpmeta>" + MARK.decode() + "</x:xmpmeta>")
rgba = Image.new("RGBA", (64, 64), (0, 0, 0, 0))
for x in range(16, 48):
    for y in range(16, 48):
        rgba.putpixel((x, y), (10, 200, 10, 255))
rgba.save("alpha_text.png", "PNG", pnginfo=pi, exif=exif_bytes())

gray = Image.new("L", (10, 40), 128)
gray.save("gray_tall.png", "PNG")

f1 = Image.new("RGB", (50, 50), (255, 0, 0))
f2 = Image.new("RGB", (50, 50), (0, 0, 255))
f1.save("anim.gif", "GIF", save_all=True, append_images=[f2], duration=100, loop=0)
f1.save("anim.webp", "WEBP", save_all=True, append_images=[f2], duration=100, loop=0, lossless=True)
Image.new("RGB", (40, 40), (0, 255, 0)).save("still.webp", "WEBP", quality=80, exif=exif_bytes())

open("logo.svg", "wb").write(b'<?xml version="1.0"?>\n<svg xmlns="http://www.w3.org/2000/svg" width="10" height="10"><script>alert(1)</script><rect width="10" height="10"/></svg>\n')
open("svg_no_decl.svg", "wb").write(b'  <svg viewBox="0 0 1 1" onload="alert(1)"></svg>')
open("not_image.html", "wb").write(b"<html><body>hello</body></html>")

# decompression bomb: 1-bit 30000x30000 PNG (~110 MB if decoded as RGBA would be 3.6 GB), tiny on disk
Image.new("1", (30000, 30000), 0).save("bomb_30000.png", "PNG", optimize=True)
# GIF with a huge logical screen (65535x65535) and a 1x1 frame
def gif_bomb():
    hdr = b"GIF89a" + struct.pack("<HHBBB", 65535, 65535, 0x80, 0, 0) + b"\x00\x00\x00\xff\xff\xff"
    img = b"\x2c" + struct.pack("<HHHHB", 0, 0, 1, 1, 0) + b"\x02\x02\x44\x01\x00"
    return hdr + img + b"\x3b"
open("bomb_screen.gif", "wb").write(gif_bomb())
