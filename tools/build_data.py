"""catalog.json -> site/data.js, plus the count and cache version in site/index.html.

catalog.json is the one source of truth. The studio page (site/studio) and its worker
(tools/studio/run.py) edit it; nothing else should. A piece marked hidden stays in the catalog
but is left off the site. Run from the repo root: python3 tools/build_data.py [--bump]
"""
import colorsys, json, math, os, re, sys
import numpy as np
from PIL import Image

ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
FALLS = ('petals', 'stars', 'feathers', 'flames')
PUBLIC = ('id', 'slug', 'name', 'cat', 'note', 'price', 'etsy', 'img', 'colours', 'fabric', 'gsm', 'fit', 'finish', 'sizes', 'rows', 'review')
WORDS = ['Zero', 'One', 'Two', 'Three', 'Four', 'Five', 'Six', 'Seven', 'Eight', 'Nine', 'Ten', 'Eleven', 'Twelve', 'Thirteen', 'Fourteen',
         'Fifteen', 'Sixteen', 'Seventeen', 'Eighteen', 'Nineteen', 'Twenty', 'Twenty-one', 'Twenty-two', 'Twenty-three', 'Twenty-four',
         'Twenty-five', 'Twenty-six', 'Twenty-seven', 'Twenty-eight', 'Twenty-nine', 'Thirty']


def load():
    return json.load(open(f'{ROOT}/catalog.json'))


def save(cat):
    tmp = f'{ROOT}/catalog.json.tmp'
    json.dump(cat, open(tmp, 'w'), indent=1, ensure_ascii=False)
    os.replace(tmp, f'{ROOT}/catalog.json')


def visible(cat):
    return [p for p in cat['products'] if not p.get('hidden')]


def colour_keys(p):
    return [c['key'] for c in p['colours']] if p.get('colours') else ['']


def glow(path):
    """The colour behind a garment on its shop tile, sampled from the cutout."""
    im = Image.open(path).convert('RGBA').resize((64, 80))
    px = [tuple(c[:3]) for c in np.asarray(im).reshape(-1, 4) if c[3] > 128]
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


def layout(cat):
    """The shop grid: bands of five, one feature tile and four smalls, the feature alternating sides.
    A feature only gets its big tile while there are four smalls to sit beside it."""
    by = {p['slug']: p for p in visible(cat)}
    order = [s for s in cat['line'] if s in by] + [s for s in by if s not in cat['line']]
    feats = [s for s in order if by[s].get('feature')]
    smalls = [s for s in order if not by[s].get('feature')]
    out, band = [], 0
    while smalls or feats:
        four, smalls = smalls[:4], smalls[4:]
        if feats and len(four) == 4:
            f = feats.pop(0)
            out += [[f, 1]] + [[s, 0] for s in four] if band % 2 == 0 else [[s, 0] for s in four[:2]] + [[f, 1]] + [[s, 0] for s in four[2:]]
        elif four:
            out += [[s, 0] for s in four]
        else:
            out += [[f, 0] for f in feats]
            feats = []
        band += 1
    return out


def showcase(cat):
    by = {p['slug']: p for p in visible(cat)}
    out, seen = [], set()
    colour = lambda v, d: v.lower() if re.fullmatch(r'#[0-9a-fA-F]{6}', str(v or '')) else d
    for s in cat.get('showcase', []):
        p = by.get(s.get('slug'))
        m = p and p.get('mesh')
        if not m or s['slug'] in seen or not os.path.exists(f"{ROOT}/site/img/hero/{m['key']}.bin"):
            continue                                   # never put a piece on show without its 3D model
        seen.add(s['slug'])
        word = re.sub(r'[^A-Za-z. ]', '', str(s.get('word') or '')).strip()[:12] or 'Piece'
        tint, ink = colour(s.get('tint'), '#ff9fbe'), colour(s.get('ink'), '#ff6f9f')
        out.append(dict(key=m['key'], slug=s['slug'], word=word, tint=tint, ink=ink, flat=colour(s.get('flat'), ink),
                        fall=s.get('fall') if s.get('fall') in FALLS else 'petals', w=m['w'], h=m['h'], inner=m['inner']))
    return out[:8]


def build(bump=False):
    cat = load()
    P = visible(cat)
    public = [{k: p.get(k) for k in PUBLIC} for p in P]
    glows = {}
    for p in P:
        for k in colour_keys(p):
            name = p['img'] + ('-' + k if k else '')
            glows[name] = glow(f'{ROOT}/site/img/{name}-front.webp')
    fit = cat.get('fit', {})
    tops = [p['slug'] for p in P if p['cat'] in ('Hoodies', 'Tops')]
    bottoms = [p['slug'] for p in P if p['cat'] in ('Sweats', 'Shorts')]
    fit = dict(top=fit.get('top') if fit.get('top') in tops else (tops or [''])[0],
               bottom=fit.get('bottom') if fit.get('bottom') in bottoms else (bottoms or [''])[0])
    j = lambda v: json.dumps(v, separators=(',', ':'), ensure_ascii=False)
    js = (f'window.TO_PRODUCTS={j(public)};\nwindow.TO_LINE={j(layout(cat))};\nwindow.TO_SHOW={j(showcase(cat))};\n'
          f'window.TO_FIT={j(fit)};\nwindow.TO_GLOW={j(glows)};\n')
    path = f'{ROOT}/site/data.js'
    changed = not os.path.exists(path) or open(path).read() != js
    if changed:
        open(path, 'w').write(js)
    stamp(len(P), bump)
    return dict(products=len(P), changed=changed)


def stamp(n, bump):
    """Keeps the piece count in the page head right, and gives every file a new cache version."""
    path = f'{ROOT}/site/index.html'
    s = open(path).read()
    word = WORDS[n] if n < len(WORDS) else str(n)
    s2 = re.sub(r'(Clothes for outside\. )[\w-]+( pieces? from)', lambda m: m.group(1) + word + m.group(2), s)
    s2 = re.sub(r'(<span data-count-all>)\d+(</span>)', lambda m: f'{m.group(1)}{n}{m.group(2)}', s2)
    if bump:
        v = int(re.search(r'data-v="(\d+)"', s2).group(1)) + 1
        s2 = re.sub(r'data-v="\d+"', f'data-v="{v}"', s2)
        s2 = re.sub(r'\?v=\d+', f'?v={v}', s2)
    if s2 != s:
        open(path, 'w').write(s2)


if __name__ == '__main__':
    print(build('--bump' in sys.argv))
