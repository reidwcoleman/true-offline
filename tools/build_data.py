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
    seo(cat)
    return dict(products=len(P), changed=changed)


SITE = 'https://reidwcoleman.github.io/true-offline'


def _esc(s):
    return str(s or '').replace('&', '&amp;').replace('<', '&lt;').replace('>', '&gt;').replace('"', '&quot;')


def _stem(p):
    k = p['colours'][0]['key'] if p.get('colours') else ''
    return p['img'] + ('-' + k if k else '')


def _img(p, side='front'):
    stem = _stem(p)
    for suf in ('', '-s'):
        if os.path.exists(f'{ROOT}/site/img/{stem}-{side}{suf}.webp'):
            return f'img/{stem}-{side}{suf}.webp'
    return f'img/{stem}-{side}.webp'


def seo(cat):
    """Per-piece pages search engines can index, a sitemap, and a catalog of structured data.
    The single-page app itself is not crawlable piece by piece, so each piece also gets a plain,
    real page at /p/<slug>.html with its own title, description, photo and Product data."""
    P = visible(cat)
    os.makedirs(f'{ROOT}/site/p', exist_ok=True)
    kept = set()
    for p in P:
        slug = p['slug']
        kept.add(slug)
        url = f'{SITE}/p/{slug}.html'
        img_rel, img_abs = _img(p), f'{SITE}/{_img(p)}'
        note = (p.get('note') or '').strip()
        desc = _esc((note or f"{p['name']} from True Offline, Raleigh NC.")[:180])
        price = f"{float(p['price']):.2f}"
        ld = {"@context": "https://schema.org", "@type": "Product", "name": p['name'], "image": [img_abs],
              "description": note or p['name'], "brand": {"@type": "Brand", "name": "True Offline"},
              "category": p.get('cat'), "sku": str(p.get('id') or slug), "material": p.get('fabric') or None,
              "offers": {"@type": "Offer", "price": price, "priceCurrency": "USD",
                         "availability": "https://schema.org/InStock", "itemCondition": "https://schema.org/NewCondition",
                         "url": p.get('etsy') or url, "seller": {"@type": "Organization", "name": "True Offline"}}}
        ld = {k: v for k, v in ld.items() if v is not None}
        html = f'''<!doctype html>
<html lang="en">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<title>{_esc(p['name'])} — True Offline</title>
<meta name="description" content="{desc}">
<link rel="canonical" href="{url}">
<meta name="robots" content="index,follow">
<meta property="og:type" content="product">
<meta property="og:site_name" content="True Offline">
<meta property="og:title" content="{_esc(p['name'])} — True Offline">
<meta property="og:description" content="{desc}">
<meta property="og:image" content="{img_abs}">
<meta property="og:url" content="{url}">
<meta property="product:price:amount" content="{price}">
<meta property="product:price:currency" content="USD">
<meta name="twitter:card" content="summary_large_image">
<meta name="twitter:title" content="{_esc(p['name'])} — True Offline">
<meta name="twitter:description" content="{desc}">
<meta name="twitter:image" content="{img_abs}">
<link rel="icon" href="../img/star.svg" type="image/svg+xml">
<script type="application/ld+json">{json.dumps(ld, ensure_ascii=False)}</script>
<style>
:root{{--ink:#08080B;--paper:#F2F2EE;--plate:#E8E8E3;--cobalt:#0A35F0;--t2:rgba(8,8,11,.64);--line:rgba(8,8,11,.13)}}
*{{box-sizing:border-box;margin:0}}
body{{font:16px/1.5 system-ui,-apple-system,Segoe UI,Roboto,sans-serif;color:var(--ink);background:var(--paper);-webkit-font-smoothing:antialiased}}
a{{color:inherit}}
.wrap{{max-width:900px;margin:0 auto;padding:24px 20px 64px}}
.top{{font-weight:800;font-style:italic;letter-spacing:-.01em;text-transform:uppercase;text-decoration:none;font-size:18px}}
.card{{display:grid;grid-template-columns:1fr 1fr;gap:28px;margin-top:28px;align-items:center}}
.shot{{aspect-ratio:4/5;background:var(--plate);border-radius:16px;overflow:hidden}}
.shot img{{width:100%;height:100%;object-fit:contain;padding:6%}}
h1{{font-size:30px;line-height:1.1;letter-spacing:-.02em}}
.price{{font-size:20px;margin:8px 0 14px;font-variant-numeric:tabular-nums}}
.note{{color:var(--t2);margin-bottom:22px}}
.meta{{font-size:14px;color:var(--t2);border-top:1px solid var(--line);padding-top:14px;margin-bottom:22px}}
.btn{{display:inline-flex;align-items:center;justify-content:center;min-height:48px;padding:0 22px;border-radius:12px;font-weight:600;text-decoration:none;margin:0 8px 8px 0}}
.btn-buy{{background:var(--cobalt);color:#fff}}
.btn-site{{border:1px solid rgba(8,8,11,.26)}}
@media (max-width:640px){{.card{{grid-template-columns:1fr}}}}
</style>
</head>
<body>
<div class="wrap">
<a class="top" href="../">True Offline</a>
<div class="card">
<div class="shot"><img src="../{img_rel}" alt="{_esc(p['name'])}" width="560" height="700"></div>
<div>
<h1>{_esc(p['name'])}</h1>
<p class="price">${price}</p>
<p class="note">{_esc(note)}</p>
<p class="meta">{_esc(p.get('cat') or '')}{(' · ' + _esc(p['fabric'])) if p.get('fabric') else ''}{(' · ' + _esc(str(p['gsm'])) + ' gsm') if p.get('gsm') else ''}</p>
<a class="btn btn-buy" href="{_esc(p.get('etsy') or url)}" rel="noopener">Buy on Etsy</a>
<a class="btn btn-site" href="../#/{_esc(slug)}">See it on the site</a>
</div>
</div>
</div>
</body>
</html>
'''
        open(f'{ROOT}/site/p/{slug}.html', 'w').write(html)
    for fn in os.listdir(f'{ROOT}/site/p'):
        if fn.endswith('.html') and fn[:-5] not in kept:
            os.remove(f'{ROOT}/site/p/{fn}')

    urls = [(f'{SITE}/', '1.0')] + [(f'{SITE}/p/{p["slug"]}.html', '0.8') for p in P]
    sm = ['<?xml version="1.0" encoding="UTF-8"?>', '<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">']
    sm += [f'<url><loc>{u}</loc><priority>{pr}</priority></url>' for u, pr in urls]
    sm += ['</urlset>', '']
    open(f'{ROOT}/site/sitemap.xml', 'w').write('\n'.join(sm))

    items = {"@context": "https://schema.org", "@type": "ItemList",
             "itemListElement": [{"@type": "ListItem", "position": i + 1, "url": f'{SITE}/p/{p["slug"]}.html', "name": p['name']}
                                 for i, p in enumerate(P)]}
    path = f'{ROOT}/site/index.html'
    s = open(path).read()
    block = '<script type="application/ld+json" data-ld="catalog">' + json.dumps(items, ensure_ascii=False) + '</script>'
    if 'data-ld="catalog"' in s:
        s2 = re.sub(r'<script type="application/ld\+json" data-ld="catalog">.*?</script>', lambda m: block, s, flags=re.S)
    else:
        s2 = s.replace('</head>', block + '\n</head>', 1)
    if s2 != s:
        open(path, 'w').write(s2)


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
