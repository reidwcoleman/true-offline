"""The colour behind each garment on the shop tiles, sampled from its photo -> appended to site/data.js.
Run after tools/build_data.py, which rewrites that file."""
import colorsys, json, math, re
from PIL import Image

src = open('site/data.js').read()
src = re.sub(r'window\.TO_GLOW=.*?;\n', '', src)
products = json.loads(src[src.index('['):src.rindex(']') + 1])

def glow(path):
    im = Image.open(path).convert('RGB').resize((64, 80))
    bg = im.getpixel((2, 2))
    px = [c for c in im.get_flattened_data() if sum(abs(a - b) for a, b in zip(c, bg)) > 40]
    hsv = [colorsys.rgb_to_hsv(*(v / 255 for v in c)) for c in px] or [(0, 0, 0)]
    vivid = [p for p in hsv if p[1] > .22 and p[2] > .18]
    if len(vivid) < len(hsv) * .12:
        # Greys, blacks and creams have no colour of their own, so they take the brand's violet or blush.
        lum = sum(p[2] for p in hsv) / len(hsv)
        return '#a9a4ff' if lum < .55 else '#ffbcd2'
    x = sum(p[1] * math.cos(p[0] * 6.2832) for p in vivid)
    y = sum(p[1] * math.sin(p[0] * 6.2832) for p in vivid)
    hue = (math.atan2(y, x) / 6.2832) % 1
    return '#%02x%02x%02x' % tuple(round(v * 255) for v in colorsys.hsv_to_rgb(hue, .55, .98))

out = {}
for p in products:
    keys = [c['key'] for c in p['colours']] if p['colours'] else ['']
    for k in keys:
        name = p['img'] + ('-' + k if k else '')
        out[name] = glow(f'site/img/{name}-front.webp')
open('site/data.js', 'w').write(src.rstrip('\n') + '\nwindow.TO_GLOW=' + json.dumps(out, separators=(',', ':')) + ';\n')
print(len(out), 'glows', sorted(set(out.values()))[:12])
