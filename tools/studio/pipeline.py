"""Everything between a captured Etsy listing and a finished product on the site.

    capture (name, price, photos, sizes, description) -> raw photos -> which photo is what
        -> cutouts in site/img -> size chart numbers -> a product record for catalog.json

The capture comes from the "Add to True Offline" bookmark button, which reads the listing in the
person's own browser: Etsy turns away servers, so nothing here ever requests an Etsy page. Photos
come from Etsy's image host, which is open. Used by tools/studio/run.py. Needs macOS (Apple Vision).
"""
import colorsys, glob, html, itertools, json, os, re, subprocess, sys, urllib.request
import numpy as np
from PIL import Image, ImageOps

ROOT = os.path.dirname(os.path.dirname(os.path.dirname(os.path.abspath(__file__))))
sys.path.insert(0, f'{ROOT}/tools')
RAW, IMG = f'{ROOT}/raw', f'{ROOT}/site/img'
UA = {'User-Agent': 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/17.4 Safari/605.1.15'}
CATS = ('Hoodies', 'Tops', 'Sweats', 'Shorts')
PHOTO = re.compile(r'https://i\.etsystatic\.com/[\w./-]+\.(?:jpe?g|png|webp)', re.I)


class Problem(Exception):
    """Something the person using the studio should be told in plain words."""


# ---------- the capture ----------

def listing_id(url):
    m = re.search(r'etsy\.com/(?:[a-z]{2}(?:-[a-z]{2})?/)?listing/(\d+)(?:/([\w-]+))?', str(url).strip(), re.I)
    if not m:
        raise Problem('That is not an Etsy listing link.')
    return m.group(1), (m.group(2) or 'item')


def clean_capture(c):
    """What the bookmark button sent is typed by nobody and could be anything. Keep only what a
    listing can hold, and only photos that live on Etsy's image host."""
    if not isinstance(c, dict):
        raise Problem('The listing did not come through.')
    lid, slug = listing_id(c.get('url', ''))
    text = lambda v, n: re.sub(r'[\x00-\x08\x0b-\x1f<>]', '', html.unescape(str(v or '')))[:n].strip()
    photos = []
    for u in c.get('photos') or []:
        u = str(u).split('?')[0]
        if PHOTO.fullmatch(u) and u not in photos:
            photos.append(re.sub(r'il_\d+x[N\d]+\.', 'il_fullxfull.', u))
    try:
        price = round(float(c.get('price')), 2)
    except (TypeError, ValueError):
        price = None
    if not 0 < (price or 0) < 10000:
        raise Problem('The price did not come through from Etsy.')
    name = re.sub(r'\s+', ' ', text(c.get('name'), 90))
    if not name:
        raise Problem('The name did not come through from Etsy.')
    if len(photos) < 2:
        raise Problem('The listing needs at least a front and a back photo.')
    short = lambda vs, n, size: [t for t in (re.sub(r'\s*[\(\[].*$', '', text(v, 40)).strip()[:size] for v in (vs or [])[:n]) if t]
    return dict(id=lid, etsy=f'https://www.etsy.com/listing/{lid}/{slug}', name=name, price=price, photos=photos[:12],
                description=text(c.get('description'), 6000), sizes=short(c.get('sizes'), 14, 10), colours=short(c.get('colours'), 6, 30))


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
        if not PHOTO.fullmatch(u):
            raise Problem('A photo link is not on Etsy.')
        data = urllib.request.urlopen(urllib.request.Request(u, headers=UA), timeout=40).read(20_000_001)
        if len(data) > 20_000_000:
            raise Problem('A photo is too large.')
        im = Image.open(__import__('io').BytesIO(data))
        im.load()                                      # proves it is a real picture before anything is kept
        if data[:2] == b'\xff\xd8':
            open(path, 'wb').write(data)               # already a JPEG: keep Etsy's own bytes
        else:
            im.convert('RGB').save(path, quality=95)
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

def new_product(capture, cat, log=print):
    """Builds the record and the images for a captured listing. Does not touch catalog.json."""
    L = clean_capture(capture)
    if any(p['id'] == L['id'] for p in cat['products']):
        raise Problem('That listing is already on the site.')
    log(f"Adding {L['name']}")
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
    p['cut'] = signature(p)
    return p


def signature(p):
    """Which photos a piece's cutouts were made from. When this stops matching, they are remade."""
    return json.dumps(p['views'], sort_keys=True, separators=(',', ':'))
