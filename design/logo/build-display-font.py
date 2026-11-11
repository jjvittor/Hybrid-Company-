"""Build the local display face from the already-used Unbounded source.

Usage: python design/logo/build-display-font.py /path/to/Unbounded-wght.ttf
Requires fontTools with WOFF support in the design environment, not in the app.
"""
import json
import sys
from pathlib import Path
from fontTools.ttLib import TTFont
from fontTools.varLib.instancer import instantiateVariableFont
from fontTools.pens.ttGlyphPen import TTGlyphPen
from fontTools.pens.transformPen import TransformPen
from fontTools.svgLib.path import parse_path

ROOT = Path(__file__).resolve().parents[2]
font = instantiateVariableFont(TTFont(sys.argv[1]), {"wght": 500}, inplace=False)
source = (ROOT / "src/lib/ybrd-logo.ts").read_text()
logo = json.loads(source.split("export const YBRD_LOGO = ", 1)[1].split(" as const;", 1)[0])
# Approved A: B and R outlines, including the manually tuned R origin.
for letter, index, origin in [("B", 1, 897), ("R", 2, 1754)]:
    pen = TTGlyphPen(font.getGlyphSet())
    parse_path(logo["unbounded"]["paths"]["A"][index], TransformPen(pen, (1, 0, 0, -1, -origin, 750)))
    glyph = pen.glyph()
    glyph.recalcBounds(font["glyf"])
    font["glyf"][letter] = glyph
    advance, _ = font["hmtx"][letter]
    font["hmtx"][letter] = (advance, glyph.xMin)
# Keep every other character, advance, kerning rule and vertical metric unchanged.
# A distinct family name identifies the modified font under the bundled OFL.
names = {1: "Ybrd Display", 2: "Medium", 3: "YbrdDisplay-Medium-1.0", 4: "Ybrd Display Medium", 6: "YbrdDisplay-Medium", 16: "Ybrd Display", 17: "Medium"}
for record in font["name"].names:
    if record.nameID in names:
        record.string = names[record.nameID].encode(record.getEncoding())
font.flavor = "woff"
font.save(ROOT / "src/assets/fonts/ybrd-display-medium.woff")
