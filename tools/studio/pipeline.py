"""Everything between an Etsy link and a finished product on the site.

    link -> listing (name, price, photos, sizes, description) -> raw photos -> which photo is what
         -> cutouts in site/img -> size chart numbers -> a product record for catalog.json

Used by tools/studio/server.py. Run from the repo root.
"""
import colorsys, glob, html, itertools, json, os, re, shutil, subprocess, sys, urllib.request
import numpy as np
from PIL import Image, ImageOps

ROOT = os.path.dirname(os.path.dirname(os.path.dirname(os.path.abspath(__file__))))
sys.path.insert(0, f'{ROOT}/tools')
RAW, IMG = f'{ROOT}/raw', f'{ROOT}/site/img'
UA = {'User-Agent': 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/17.4 Safari/605.1.15'}
SHOP_RSS = 'https://www.etsy.com/shop/TrueOffline/rss'
CATS = ('Hoodies', 'Tops', 'Sweats', 'Shorts')


class Problem(Exception):
    """Something the person using the studio should be told in plain words."""


def node():
    n = shutil.which('node')
    if n:
        return n
    for pat in ('~/.nvm/versions/node/*/bin/node', '/opt/homebrew/bin/node', '/usr/local/bin/node'):
        found = sorted(glob.glob(os.path.expanduser(pat)))
        if found:
            return found[-1]
    raise Problem('Node.js is needed to read Etsy and was not found.')


# ---------- the listing ----------

def listing_id(url):
    m = re.search(r'etsy\.com/(?:[a-z]{2}(?:-[a-z]{2})?/)?listing/(\d+)(?:/([^/?#]+))?', url.strip(), re.I)
    if not m:
        raise Problem('That does not look like an Etsy listing link. It should look like etsy.com/listing/1234567890/name.')
    return m.group(1), (m.group(2) or 'item')


def fetch_listing(url, log=print):
    """Opens the listing in a real Chrome window (Etsy refuses anything else) and returns its HTML."""
    lid, slug = listing_id(url)
    out = f'{RAW}/.page-{lid}.html'
    os.makedirs(RAW, exist_ok=True)
    saved = f'{RAW}/.pages/{lid}.html'                 # a page saved by hand, for tests or when Etsy will not load
    if os.path.exists(saved):
        log('Using the saved copy of the listing')
        return open(saved).read()
    if os.path.exists(out):
        os.remove(out)
    p = subprocess.Popen([node(), f'{ROOT}/tools/studio/etsy.mjs', f'{RAW}/.chrome', out, f'https://www.etsy.com/listing/{lid}/{slug}'],
                         stdout=subprocess.PIPE, stderr=subprocess.STDOUT, text=True)
    err = None
    for line in p.stdout:
        try:
            ev = json.loads(line)
        except ValueError:
            continue
        if ev['state'] == 'open':
            log('Opening the listing on Etsy')
        elif ev['state'] == 'captcha':
            log('Etsy wants to check you are a person. A Chrome window just came forward: finish the check there and this carries on.', 'ask')
        elif ev['state'] == 'error':
            err = ev['error']
    p.wait()
    if err or not os.path.exists(out):
        raise Problem(err or 'Could not read the listing from Etsy.')
    page = open(out).read()
    os.remove(out)
    return page


def parse_listing(page):
    prod = None
    for m in re.finditer(r'<script type="application/ld\+json"[^>]*>(.*?)</script>', page, re.S):
        try:
            d = json.loads(m.group(1))
        except ValueError:
            continue
        if isinstance(d, dict) and d.get('@type') == 'Product':
            prod = d
    if not prod:
        raise Problem('Etsy showed a page, but it was not a listing.')
    photos = [(i.get('contentURL') or i.get('url')) if isinstance(i, dict) else i for i in prod.get('image', [])]
    photos = [re.sub(r'il_\d+x[N\d]+\.', 'il_fullxfull.', u.split('?')[0]) for u in photos if u]
    offers = prod.get('offers') or {}
    price = offers.get('price') or offers.get('lowPrice')
    options = {}
    for sm in re.finditer(r'<select[^>]*id="(variation-selector-\d+)"[^>]*>(.*?)</select>', page, re.S):
        lab = re.search(r'<label[^>]*for="%s"[^>]*>(.*?)</label>' % sm.group(1), page, re.S)
        lab = html.unescape(re.sub(r'<[^>]+>', ' ', lab.group(1))).split() if lab else []
        vals = [html.unescape(re.sub(r'<[^>]+>', '', o)).strip() for o in re.findall(r'<option[^>]*>(.*?)</option>', sm.group(2), re.S)][1:]
        # "XL ($25.99)" and "M [Sold out]" are still just XL and M
        vals = [re.sub(r'\s*[\(\[].*$', '', v).strip() for v in vals]
        options[(lab[0] if lab else 'Option').lower()] = [v for v in vals if v]
    lid, slug = listing_id(prod.get('url') or '')
    shop = re.search(r'etsy\.com/shop/([A-Za-z0-9]+)', page)
    return dict(id=str(prod.get('sku') or lid), etsy=f'https://www.etsy.com/listing/{lid}/{slug}', name=html.unescape(prod.get('name') or '').strip(),
                price=float(price) if price else None, photos=photos, description=html.unescape(prod.get('description') or ''),
                sizes=options.get('size') or options.get('sizes') or [], colours=options.get('color') or options.get('colour') or options.get('primary') or [],
                shop=shop.group(1) if shop else None)


def shop_feed():
    """The shop's public feed: its ten newest listings. No browser needed."""
    req = urllib.request.Request(SHOP_RSS, headers=UA)
    xml = urllib.request.urlopen(req, timeout=20).read().decode('utf8', 'replace')
    out = []
    for item in re.findall(r'<item>(.*?)</item>', xml, re.S):
        link = re.search(r'<link>(.*?)</link>', item, re.S)
        title = re.search(r'<title>(.*?)</title>', item, re.S)
        desc = html.unescape(re.search(r'<description>(.*?)</description>', item, re.S).group(1))
        img = re.search(r'<img src="([^"]+)"', desc)
        price = re.search(r'class="price">([\d.]+)', desc)
        try:
            lid, slug = listing_id(link.group(1))
        except Problem:
            continue
        out.append(dict(id=lid, url=f'https://www.etsy.com/listing/{lid}/{slug}', name=re.sub(r'\s+by\s+\w+\s*$', '', html.unescape(title.group(1))).strip(),
                        price=float(price.group(1)) if price else None, thumb=img.group(1) if img else None))
    return out


# ---------- details ----------

def spec(description):
    """Etsy descriptions from the print shop come as "- Key: value" lines. Pull out the ones the site shows."""
    kv = {}
    for line in description.replace('\r', '').split('\n'):
        m = re.match(r'\s*[-•*]?\s*([A-Za-z ]{3,24}):\s*(.+)', line)
        if m:
            kv[m.group(1).strip().lower()] = m.group(2).strip()
    fabric = kv.get('material') or kv.get('fabric') or ''
    parts = re.findall(r'([\d.]+)\s*%\s*([A-Za-z ]+?)(?=,|$|\d)', fabric)
    if parts:
        parts = sorted(((float(n), w.strip().lower()) for n, w in parts), key=lambda x: -x[0])
        fabric = ', '.join(f"{('%g' % n)}% {re.sub(r' fib(er|re)s?$', '', w)}" for n, w in parts)
    gsm = re.search(r'(\d{2,4})\s*gsm', kv.get('fabric weight', '') + ' ' + description, re.I)
    fit = (kv.get('fit') or '').split('/')[0].strip().capitalize()
    effects = [e.strip() for e in (kv.get('effects') or '').split('/') if e.strip() and e.strip().lower() not in ('zipper', 'print', 'printed', 'pocket', 'pockets')]
    if effects:
        finish = ', '.join(e.lower() for e in effects).capitalize()
        finish = 'Vintage wash' if finish == 'Washed' else finish
    else:
        finish = {'thin': 'Lightweight', 'moderate': 'Midweight', 'thick': 'Heavyweight'}.get((kv.get('thickness') or '').lower(), 'Unwashed')
    return dict(fabric=fabric, gsm=int(gsm.group(1)) if gsm else None, fit=fit or 'Regular', finish=finish, kv=kv)


def category(name, kv, rows=()):
    n = name.lower()
    names = {r['name'].lower() for r in rows}
    if re.search(r'\b(shorts?|jorts)\b', n):
        return 'Shorts'
    if re.search(r'\b(sweatpants?|pants?|joggers?|trousers?|jeans|sweats)\b', n):
        return 'Sweats'
    if names & {'waist', 'hip', 'hips', 'inseam', 'thigh'} and not names & {'chest', 'shoulder', 'sleeve'}:
        length = next((r['inch'][0] for r in rows if r['name'].lower() == 'length'), 40)
        return 'Shorts' if length and length < 26 else 'Sweats'
    if 'hood' in (kv.get('neckline') or '').lower() or re.search(r'\b(hoodie|hooded|zip[- ]?up)\b', n):
        return 'Hoodies'
    return 'Tops'


def slugify(s):
    return re.sub(r'-+', '-', re.sub(r'[^a-z0-9]+', '-', s.lower())).strip('-') or 'piece'


# ---------- photos ----------

def download(photos, lid, log=print):
    d = f'{RAW}/{lid}'
    os.makedirs(d, exist_ok=True)
    for n, u in enumerate(photos):
        path = f'{d}/{n}.jpg'
        if os.path.exists(path) and os.path.getsize(path) > 2000:
            continue
        log(f'Downloading photo {n + 1} of {len(photos)}')
        data = urllib.request.urlopen(urllib.request.Request(u, headers=UA), timeout=40).read()
        Image.open(__import__('io').BytesIO(data)).convert('RGB').save(path, quality=95)
    return d


def ocr(im):
    os.makedirs(f'{RAW}/mask', exist_ok=True)
    p = f'{RAW}/mask/_s.png'
    im.save(p)
    return json.loads(subprocess.run([f'{ROOT}/tools/vision', 'ocr', p], capture_output=True, text=True, check=True).stdout)


def is_chart(path):
    im = Image.open(path).convert('RGB')
    if im.width / im.height < 1.6 and im.height / im.width < 1.6:
        small = np.asarray(im.resize((96, 96)))
        if (small.min(2) > 235).mean() < .55 or (small.max(2) - small.min(2) > 40).mean() > .04:
            return False                               # a photo, not a table
    words = [o['t'].strip().lower() for o in ocr(im if im.width >= 900 else im.resize((im.width * 2, im.height * 2), Image.LANCZOS))]
    return sum(w in ('inch', 'cm', 'in') for w in words) >= 2


def garment_colour(path):
    """Mean colour of the garment itself in a product photo on a plain ground."""
    a = np.asarray(Image.open(path).convert('RGB').resize((160, 160))).astype(np.float32)
    bg = np.median(np.r_[a[:6].reshape(-1, 3), a[-6:].reshape(-1, 3), a[:, :6].reshape(-1, 3), a[:, -6:].reshape(-1, 3)], axis=0)
    fg = np.abs(a - bg).sum(2) > 45
    return a[fg].mean(0) if fg.sum() > 400 else a.reshape(-1, 3).mean(0)


NAMED = {
    'black': (28, 28, 30), 'white': (245, 245, 245), 'ivory': (236, 228, 208), 'cream': (238, 228, 200), 'beige': (214, 196, 168), 'khaki': (176, 160, 120),
    'grey': (128, 128, 128), 'gray': (128, 128, 128), 'charcoal': (60, 60, 62), 'silver': (190, 190, 195), 'blue': (60, 90, 190), 'royal': (70, 90, 180),
    'navy': (30, 40, 80), 'sky': (140, 180, 230), 'red': (190, 40, 40), 'wine': (110, 30, 45), 'burgundy': (110, 30, 45), 'maroon': (100, 30, 40),
    'pink': (240, 150, 180), 'green': (50, 130, 70), 'olive': (110, 110, 60), 'sage': (160, 175, 150), 'brown': (100, 70, 50), 'coffee': (100, 75, 55),
    'tan': (200, 170, 130), 'purple': (120, 70, 160), 'violet': (120, 70, 160), 'yellow': (235, 205, 70), 'orange': (230, 130, 50), 'teal': (40, 130, 130),
}


def name_rgb(name):
    hits = [NAMED[w] for w in re.findall(r'[a-z]+', name.lower()) if w in NAMED]
    return np.mean(hits, axis=0) if hits else None


def lab(rgb):
    import cv2
    return cv2.cvtColor(np.uint8([[rgb]]), cv2.COLOR_RGB2LAB)[0, 0].astype(np.float32)


def sort_photos(lid, colours, log=print):
    """Which raw photo is the size chart, and which are the front and back of each colour.
    Returns (views, chart index or None, garment photo indices). views maps colour key -> [front, back]."""
    files = sorted(glob.glob(f'{RAW}/{lid}/[0-9]*.jpg'), key=lambda f: int(os.path.basename(f)[:-4]))
    idx = [int(os.path.basename(f)[:-4]) for f in files]
    charts = [i for i, f in zip(idx, files) if is_chart(f)]
    shots = [i for i in idx if i not in charts]
    if len(shots) < 2:
        raise Problem('The listing needs at least a front and a back photo of the garment.')
    n = len(colours)
    if n < 2 or len(shots) < 2 * n:
        return {'': [shots[0], shots[1]]}, (charts[-1] if charts else None), shots
    use = shots[:2 * n]
    col = {i: lab(garment_colour(f'{RAW}/{lid}/{i}.jpg')) for i in use}
    # pair the photos so the two in each pair are the same colour of garment
    def pairings(items):
        if not items:
            yield []
            return
        a = items[0]
        for b in items[1:]:
            rest = [x for x in items[1:] if x != b]
            for more in pairings(rest):
                yield [(a, b)] + more
    best = min(pairings(use), key=lambda ps: sum(float(np.linalg.norm(col[a] - col[b])) for a, b in ps))
    means = [(col[a] + col[b]) / 2 for a, b in best]
    targets = [name_rgb(c) for c in colours]
    order = list(range(n))
    if all(t is not None for t in targets):
        tl = [lab(t) for t in targets]
        order = min(itertools.permutations(range(n)), key=lambda perm: sum(float(np.linalg.norm(means[perm[k]] - tl[k])) for k in range(n)))
    views = {slugify(colours[k]): sorted(best[order[k]]) for k in range(n)}
    return views, (charts[-1] if charts else None), shots


def cutouts(p, log=print):
    """Raw photos -> the same framed, transparent cutouts every other piece on the site has."""
    from build_assets import cut, sharpen, frame
    os.makedirs(f'{RAW}/mask', exist_ok=True)
    cwd = os.getcwd()
    os.chdir(ROOT)
    try:
        for colour, (f, b) in p['views'].items():
            for side, n in (('front', f), ('back', b)):
                log(f"Cutting out the {side}{' in ' + colour if colour else ''}")
                try:
                    im = frame(sharpen(cut(f"raw/{p['id']}/{n}.jpg", 'raw/mask/_m.png')))
                except ValueError:
                    raise Problem(f'Could not find the garment in photo {n + 1} of the listing. It needs a plain background.')
                name = f"{p['img']}{'-' + colour if colour else ''}-{side}"
                im.save(f'{IMG}/{name}.webp', quality=86, method=6)
                im.resize((720, 900), Image.LANCZOS).save(f'{IMG}/{name}-s.webp', quality=80, method=6)
    finally:
        os.chdir(cwd)


def image_files(p):
    out = []
    for colour in p['views']:
        for side in ('front', 'back'):
            name = f"{p['img']}{'-' + colour if colour else ''}-{side}"
            out += [f'{IMG}/{name}.webp', f'{IMG}/{name}-s.webp']
    return out


def mesh_files(key):
    return [f for f in glob.glob(f'{IMG}/hero/{key}*') if re.fullmatch(re.escape(key) + r'(-(front|back))?(-n)?(-m)?\.(bin|webp)|' + re.escape(key) + r'-(front|back)-h\.webp', os.path.basename(f))]


# ---------- the size chart ----------

def read_chart(path, sizes):
    """A size chart image -> rows of inches and centimetres. Each column is read as its own strip,
    and the two units check each other."""
    im = Image.open(path).convert('RGB')
    W, k0 = im.width, im.width / 1032
    first, head = round(118 * k0), round(30 * k0)

    def strip(x0, x1, k=5):
        c = ImageOps.autocontrast(im.crop((int(x0), 0, int(x1), im.height)).convert('L'), cutoff=1)
        c = c.resize((c.width * k, c.height * k), Image.LANCZOS)
        return ImageOps.expand(c, border=40, fill=255), k
    labels = ocr(im.crop((0, 0, first, im.height)).resize((first * 4, im.height * 4), Image.LANCZOS))
    rows = []
    for o in sorted(labels, key=lambda o: o['y']):
        y = (o['y'] + o['h'] / 2) / 4
        t = o['t'].strip()
        if not re.fullmatch(r'[A-Za-z ]{3,}', t) or y < 45 * k0:
            continue
        if t.lower() == 'length' and rows and rows[-1]['name'].lower().startswith('sleeve'):
            rows[-1]['y'] = (rows[-1]['y'] + y) / 2
            continue
        rows.append(dict(name=t.split()[0].capitalize(), y=y))
    header = ocr(im.crop((0, 0, W, head)).resize((W * 3, head * 3), Image.LANCZOS))
    seen = [o['t'].strip().upper().replace(' ', '') for o in header]
    if not sizes:
        sizes = [s for s in seen if re.fullmatch(r'(\d?X{0,3}[SL]|M|\dXL|ONE SIZE|\d{2})', s)]
    sizes = [s for s in sizes if s]
    n = len(sizes)
    if not n or not rows:
        raise Problem('Could not read the size chart.')
    pts = [((o['x'] + o['w'] / 2) / 3, sizes.index(o['t'].strip().upper().replace(' ', ''))) for o in header if o['t'].strip().upper().replace(' ', '') in sizes]
    if len(pts) >= 2 and pts[-1][1] != pts[0][1]:
        (xa, ja), (xb, jb) = pts[0], pts[-1]
        b = (xb - xa) / (jb - ja)
        a = xa - b * ja
    else:
        b = (W - first) / n
        a = first + b / 2
    table = [dict(name=r['name'], inch=[None] * n, cm=[None] * n) for r in rows]
    for j in range(n):
        c = a + b * j
        for key, (x0, x1), pat in (('inch', (c - b / 2 + 2, c - 2), r'\d{1,2}\.\d{2}'), ('cm', (c + 2, c + b / 2 - 2), r'\d{2,3}(\.\d)?')):
            s, k = strip(x0, x1)
            for o in ocr(s):
                y = ((o['y'] + o['h'] / 2) - 40) / k
                t = o['t'].strip().replace(',', '.').replace(' ', '')
                if not re.fullmatch(pat, t):
                    continue
                i = min(range(len(rows)), key=lambda i: abs(rows[i]['y'] - y))
                if abs(rows[i]['y'] - y) < 14 * k0:
                    table[i][key][j] = float(t)
    doubts = []
    for r in table:
        for j in range(n):
            a_, c_ = r['inch'][j], r['cm'][j]
            if a_ is not None and c_ is not None and abs(a_ * 2.54 - c_) > .8:
                r['inch'][j] = round(c_ / 2.54, 2)         # centimetres are the simpler number to read
                doubts.append(f"{r['name']} {sizes[j]}")
            if a_ is None and c_ is not None:
                r['inch'][j] = round(c_ / 2.54, 2)
            if c_ is None and a_ is not None:
                r['cm'][j] = round(a_ * 2.54 * 2) / 2
        if None in r['inch'] or any(x > y for x, y in zip(r['inch'], r['inch'][1:])):
            doubts.append(r['name'])
    table = [r for r in table if None not in r['inch'] and None not in r['cm']]
    if not table:
        raise Problem('Could not read the size chart.')
    return dict(sizes=sizes, rows=table, doubts=sorted(set(doubts)))


# ---------- words ----------

def colour_word(rgb):
    r, g, b = (v / 255 for v in rgb)
    h, s, v = colorsys.rgb_to_hsv(r, g, b)
    if s < .14:
        return 'black' if v < .3 else 'charcoal' if v < .45 else 'grey' if v < .78 else 'white'
    if v < .22:
        return 'black'
    for lim, word in ((.04, 'red'), (.1, 'brown' if v < .55 else 'orange'), (.18, 'olive' if v < .6 else 'yellow'), (.45, 'green'), (.52, 'teal'),
                      (.72, 'navy' if v < .4 else 'blue'), (.82, 'purple'), (.95, 'wine' if v < .5 else 'pink'), (1.01, 'red')):
        if h < lim:
            return word
    return 'grey'


def draft_note(p, kv):
    """A plain first line from what Etsy says about the piece. The person is meant to improve it."""
    key = next(iter(p['views']))
    f, _ = p['views'][key]
    tone = colour_word(garment_colour(f"{RAW}/{p['id']}/{f}.jpg"))
    washed = 'wash' in (kv.get('effects') or '').lower()
    kind = {'Hoodies': 'zip hoodie' if re.search(r'zip', p['name'] + (kv.get('effects') or ''), re.I) else 'hoodie',
            'Tops': 'long sleeve' if 'long' in (kv.get('sleeve length') or '').lower() else 'tee' if 'short' in (kv.get('sleeve length') or '').lower() else 'top',
            'Sweats': 'sweatpants', 'Shorts': 'shorts'}[p['cat']]
    bits = [f"{'Washed ' + tone if washed else tone.capitalize()} {kind}"]
    if p.get('colours') and len(p['colours']) > 1:
        bits[0] = f"{'Washed ' if washed else ''}{kind}".capitalize() + ' in ' + ' and '.join(c['name'].lower() for c in p['colours'])
    if 'drop' in (kv.get('sleeve style') or '').lower():
        bits.append('drop shoulders')
    fit = (p.get('fit') or '').lower()
    if fit and fit != 'regular':
        bits.append(f'{fit} fit')
    return ', '.join(bits) + '.'


# ---------- one call for a new product ----------

def new_product(url, cat, log=print, page=None):
    """Builds the record and the images for a listing. Does not touch catalog.json."""
    lid, _ = listing_id(url)
    if any(p['id'] == lid for p in cat['products']):
        raise Problem('That listing is already on the site.')
    L = parse_listing(page or fetch_listing(url, log))
    if not L['photos']:
        raise Problem('The listing has no photos.')
    if L['price'] is None:
        raise Problem('Could not read the price from Etsy.')
    log(f"Found {L['name']}")
    download(L['photos'], L['id'], log)
    log('Sorting the photos')
    views, chart, shots = sort_photos(L['id'], L['colours'], log)
    sp = spec(L['description'])
    rows, sizes, doubts = [], L['sizes'], []
    if chart is not None:
        log('Reading the size chart')
        try:
            c = read_chart(f"{RAW}/{L['id']}/{chart}.jpg", [s.upper() for s in L['sizes']])
            rows, sizes, doubts = c['rows'], c['sizes'], c['doubts']
        except Problem:
            doubts = ['the size chart could not be read']
    else:
        doubts = ['no size chart in the listing']
    taken = {p['slug'] for p in cat['products']} | {p['img'] for p in cat['products']}
    slug = slugify(L['name'])
    while slug in taken:
        slug += '-2'
    p = dict(id=L['id'], slug=slug, name=L['name'], cat=category(L['name'], sp['kv'], rows), note='', price=L['price'], etsy=L['etsy'], img=slug,
             colours=[dict(name=c, key=slugify(c)) for c in L['colours']] if len(views) > 1 else None,
             fabric=sp['fabric'] or 'See Etsy', gsm=sp['gsm'] or 0, fit=sp['fit'], finish=sp['finish'], sizes=sizes or ['One size'], rows=rows, review=None,
             feature=False, views=views, photos=L['photos'], shots=shots, chart=chart, doubts=doubts, added=__import__('time').strftime('%Y-%m-%d'))
    if p['colours']:
        p['colours'] = [c for c in p['colours'] if c['key'] in views]
    p['note'] = draft_note(p, sp['kv'])
    p['draft'] = True                                   # the note is a first guess until someone edits it
    cutouts(p, log)
    return p


if __name__ == '__main__':
    # python3 tools/studio/pipeline.py <saved listing.html>   (a dry run that prints the record)
    cat = json.load(open(f'{ROOT}/catalog.json'))
    page = open(sys.argv[1]).read()
    L = parse_listing(page)
    print(json.dumps(new_product(L['etsy'], cat, page=page), indent=1)[:3000])
