"""Archivo Expanded Black Italic outlines for the chrome type -> tools/hero/glyphs.json
Needs fontTools. Run from the repo root: ~/Shift/.venv/bin/python tools/hero/glyphs.py
"""
import json, string
from fontTools.ttLib import TTFont
from fontTools.varLib import instancer
from fontTools.pens.svgPathPen import SVGPathPen

f = TTFont('tools/hero/fonts/Archivo-Italic.ttf')
f = instancer.instantiateVariableFont(f, {'wdth': 125, 'wght': 900})
gs, cmap = f.getGlyphSet(), f.getBestCmap()
out = {'upem': f['head'].unitsPerEm, 'cap': f['OS/2'].sCapHeight, 'glyphs': {}}
for ch in string.ascii_uppercase + '.':
    g = cmap[ord(ch)]
    pen = SVGPathPen(gs)
    gs[g].draw(pen)
    out['glyphs'][ch] = {'d': pen.getCommands(), 'adv': gs[g].width}
json.dump(out, open('tools/hero/glyphs.json', 'w'))
print(len(out['glyphs']), 'glyphs')
