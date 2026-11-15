"""The True Offline studio: a small local web app for running the shop.

    zsh studio.sh            (or: python3 tools/studio/server.py)   ->   http://localhost:4781

Paste an Etsy listing link and the piece is added to the site the same way the others were made.
Choose what is on show in the scrolling 3D section, reorder the line, edit details, then publish.
Everything it changes lives in catalog.json and site/. Publishing commits those and pushes main,
which deploys the site. It only listens on this Mac.
"""
import colorsys, json, mimetypes, os, queue, re, subprocess, sys, threading, time, traceback
from http.server import BaseHTTPRequestHandler, ThreadingHTTPServer
from urllib.parse import urlparse, unquote

HERE = os.path.dirname(os.path.abspath(__file__))
ROOT = os.path.dirname(os.path.dirname(HERE))
sys.path.insert(0, HERE)
sys.path.insert(0, f'{ROOT}/tools')
os.chdir(ROOT)
import build_data
import pipeline
from pipeline import Problem

PORT = int(os.environ.get('STUDIO_PORT', 4781))
LIVE = 'https://reidwcoleman.github.io/true-offline/'
FALLS = ('petals', 'stars', 'feathers', 'flames')
lock = threading.RLock()                      # catalog.json has one writer at a time


# ---------- jobs: one at a time, each with a running log the page polls ----------

jobs, order, work = {}, [], queue.Queue()


class Job:
    def __init__(self, kind, label, fn):
        self.id = f'{int(time.time() * 1000):x}{len(order)}'
        self.kind, self.label, self.fn = kind, label, fn
        self.lines, self.state, self.result, self.error = [], 'waiting', None, None
        jobs[self.id] = self
        order.append(self.id)
        work.put(self)

    def log(self, text, kind='step'):
        self.lines.append(dict(text=text, kind=kind, t=time.time()))

    def view(self):
        return dict(id=self.id, kind=self.kind, label=self.label, state=self.state, lines=self.lines[-40:], result=self.result, error=self.error)


def worker():
    while True:
        job = work.get()
        job.state = 'running'
        try:
            job.result = job.fn(job.log)
            job.state = 'done'
        except Problem as e:
            job.error, job.state = str(e), 'error'
        except subprocess.TimeoutExpired:
            job.error, job.state = 'A step took too long and was stopped. Try again.', 'error'
        except Exception as e:                # anything unexpected: say so plainly and keep the detail for the terminal
            traceback.print_exc()
            job.error, job.state = f'Something broke: {e.__class__.__name__}: {e}', 'error'


# ---------- catalog helpers ----------

def load():
    return build_data.load()


def commit(cat):
    """Writes the catalog and rebuilds the site's data file from it."""
    build_data.save(cat)
    build_data.build()


def find(cat, slug):
    p = next((p for p in cat['products'] if p['slug'] == slug), None)
    if not p:
        raise Problem('That piece is not in the catalog any more.')
    return p


def hexrgb(h):
    h = h.lstrip('#')
    return tuple(int(h[i:i + 2], 16) / 255 for i in (0, 2, 4))


def tohex(rgb):
    return '#%02x%02x%02x' % tuple(round(max(0, min(1, v)) * 255) for v in rgb)


def suggest_show(p):
    """A word and colours for a piece going on show, taken from its name and its back print."""
    key = build_data.colour_keys(p)[0]
    base = build_data.glow(f"{ROOT}/site/img/{p['img']}{'-' + key if key else ''}-back.webp")
    h, s, v = colorsys.rgb_to_hsv(*hexrgb(base))
    skip = {'the', 'true', 'offline', 'logo', 'mens', 'womens', 'unisex', 'hoodie', 'zip', 'tee', 'shirt', 'shorts', 'sweatpants', 'sweatshirt'}
    words = [w for w in re.findall(r'[A-Za-z]+', p['name']) if w.lower() not in skip and 3 <= len(w) <= 9]
    word = (words[0] if words else re.sub(r'[^A-Za-z]', '', p['name'])[:8] or 'Piece').capitalize()
    name = p['name'].lower()
    fall = 'stars' if re.search(r'star|chrome|globe|space|moon', name) else 'flames' if re.search(r'flame|fire|flare|fury', name) else 'petals'
    if base == '#a9a4ff':                              # a grey or black piece: the brand's violet, kept soft
        return dict(slug=p['slug'], word=word, tint='#a9a4ff', ink='#8f86ff', flat='#6f66e0', fall=fall)
    if base == '#ffbcd2':                              # a pale piece: blush
        return dict(slug=p['slug'], word=word, tint='#ffbcd2', ink='#ff6f9f', flat='#e0668c', fall=fall)
    return dict(slug=p['slug'], word=word, tint=tohex(colorsys.hsv_to_rgb(h, .5, 1)), ink=tohex(colorsys.hsv_to_rgb(h, .82, 1)),
                flat=tohex(colorsys.hsv_to_rgb(h, .75, .86)), fall=fall)


def public(p):
    """What the page needs to know about a piece."""
    key = build_data.colour_keys(p)[0]
    stem = f"{p['img']}{'-' + key if key else ''}"
    v = int(os.path.getmtime(f'{ROOT}/site/img/{stem}-front-s.webp')) if os.path.exists(f'{ROOT}/site/img/{stem}-front-s.webp') else 0
    shots = p.get('shots')
    if shots is None:
        d = f"{ROOT}/raw/{p['id']}"
        nums = sorted(int(f[:-4]) for f in os.listdir(d) if re.fullmatch(r'\d+\.jpg', f)) if os.path.isdir(d) else []
        shots = nums[:-1] if len(nums) > 2 else nums       # the print shop puts the size chart last
    return dict(id=p['id'], slug=p['slug'], name=p['name'], cat=p['cat'], note=p['note'], price=p['price'], etsy=p['etsy'], fabric=p['fabric'], gsm=p['gsm'],
                fit=p['fit'], finish=p['finish'], sizes=p['sizes'], rows=p['rows'], colours=p.get('colours'), feature=bool(p.get('feature')),
                views=p['views'], shots=shots, draft=bool(p.get('draft')), doubts=p.get('doubts') or [], added=p.get('added'),
                front=f'/preview/img/{stem}-front-s.webp?v={v}', back=f'/preview/img/{stem}-back-s.webp?v={v}', model=bool(p.get('mesh')))


def git(*args, check=True, timeout=120):
    r = subprocess.run(['git', *args], cwd=ROOT, capture_output=True, text=True, timeout=timeout)
    if check and r.returncode:
        raise Problem((r.stderr or r.stdout).strip().split('\n')[-1] or f"git {args[0]} failed")
    return r.stdout


def pending(cat):
    """What differs from the site as last published, in plain words."""
    try:
        old = json.loads(git('show', 'HEAD:catalog.json'))
    except Exception:
        return ['The catalog has never been published']
    out = []
    was, now = {p['slug']: p for p in old['products']}, {p['slug']: p for p in cat['products']}
    for s in now:
        if s not in was:
            out.append(f"Added {now[s]['name']}")
    for s in was:
        if s not in now:
            out.append(f"Removed {was[s]['name']}")
    edited = [now[s]['name'] for s in now if s in was and {k: v for k, v in now[s].items() if k != 'mesh'} != {k: v for k, v in was[s].items() if k != 'mesh'}]
    if edited:
        out.append('Edited ' + (edited[0] if len(edited) == 1 else f'{len(edited)} pieces'))
    if [(s['slug'], s['word'], s['tint'], s['ink'], s.get('fall')) for s in old['showcase']] != [(s['slug'], s['word'], s['tint'], s['ink'], s.get('fall')) for s in cat['showcase']]:
        out.append('Changed what is on show')
    if build_data.layout(old) != build_data.layout(cat) and not any(o.startswith(('Added', 'Removed')) for o in out):
        out.append('Reordered the line')
    if not out and git('status', '--porcelain', '--', 'site', 'catalog.json', check=False).strip():
        out.append('Site files changed')
    ahead = git('rev-list', '--count', '@{u}..HEAD', check=False).strip()
    if ahead.isdigit() and int(ahead):
        out.append('A finished change is still waiting to upload')
    return out


def state():
    with lock:
        cat = load()
    by = {p['slug']: p for p in cat['products']}
    line = [s for s in cat['line'] if s in by] + [s for s in by if s not in cat['line']]
    return dict(products=[public(by[s]) for s in line], showcase=[s for s in cat['showcase'] if s['slug'] in by], falls=FALLS,
                pending=pending(cat), live=LIVE, running=[jobs[i].view() for i in order[-6:] if jobs[i].state in ('waiting', 'running')])


# ---------- actions ----------

def add(url):
    lid, _ = pipeline.listing_id(url)
    with lock:
        if any(p['id'] == lid for p in load()['products']):
            raise Problem('That listing is already on the site.')

    def run(log):
        with lock:
            cat = load()
        p = pipeline.new_product(url, cat, log)
        with lock:
            cat = load()
            if any(x['id'] == p['id'] for x in cat['products']):
                raise Problem('That listing is already on the site.')
            cat['products'].append(p)
            cat['line'].insert(1 if len(cat['line']) else 0, p['slug'])      # near the top, where new pieces get seen
            commit(cat)
        log(f"{p['name']} is in the line", 'done')
        return dict(slug=p['slug'])
    return Job('add', 'Adding a piece', run)


def edit(body):
    with lock:
        cat = load()
        p = find(cat, body['slug'])
        f = body.get('fields') or {}
        for k in ('name', 'note', 'fabric', 'fit', 'finish'):
            if k in f:
                v = re.sub(r'\s+', ' ', str(f[k])).strip()
                if not v:
                    raise Problem(f'The {k} cannot be empty.')
                if k == 'note' and v != p['note']:
                    p.pop('draft', None)
                p[k] = v
        if 'cat' in f:
            if f['cat'] not in pipeline.CATS:
                raise Problem('Pick one of the four types.')
            p['cat'] = f['cat']
        if 'price' in f:
            try:
                price = round(float(f['price']), 2)
            except (TypeError, ValueError):
                raise Problem('The price needs to be a number.')
            if not 0 < price < 10000:
                raise Problem('The price needs to be a number.')
            p['price'] = price
        if 'gsm' in f:
            try:
                p['gsm'] = int(float(f['gsm']))
            except (TypeError, ValueError):
                raise Problem('The weight needs to be a number of gsm.')
        if 'feature' in f:
            p['feature'] = bool(f['feature'])
        commit(cat)
    return dict(ok=True)


def photos(body):
    slug, views = body['slug'], body['views']

    def run(log):
        with lock:
            cat = load()
            p = find(cat, slug)
            if set(views) != set(p['views']):
                raise Problem('The colours do not match this piece.')
            p['views'] = {k: [int(v[0]), int(v[1])] for k, v in views.items()}
        if p.get('photos'):
            pipeline.download(p['photos'], p['id'], log)
        pipeline.cutouts(p, log)
        with lock:
            cat = load()
            q = find(cat, slug)
            q['views'] = p['views']
            if q.get('mesh'):
                log('Rebuilding its 3D model')
                import build_hero
                q['mesh'] = build_hero.model_for(q)
            commit(cat)
        log('Photos updated', 'done')
    return Job('photos', 'Changing photos', run)


def remove(body):
    with lock:
        cat = load()
        p = find(cat, body['slug'])
        left = [s for s in cat['showcase'] if s['slug'] != p['slug']]
        if len(left) < 2 and len(left) != len(cat['showcase']):
            raise Problem('This piece is on show, and the show needs at least two pieces. Put another piece on show first.')
        cat['showcase'] = left
        cat['products'] = [x for x in cat['products'] if x['slug'] != p['slug']]
        cat['line'] = [s for s in cat['line'] if s != p['slug']]
        for path in pipeline.image_files(p) + (pipeline.mesh_files(p['mesh']['key']) if p.get('mesh') else []):
            if os.path.exists(path):
                os.remove(path)
        commit(cat)
    return dict(ok=True)


def line(body):
    with lock:
        cat = load()
        slugs = {p['slug'] for p in cat['products']}
        want = [s for s in body['order'] if s in slugs]
        cat['line'] = want + [s for s in cat['line'] if s in slugs and s not in want]
        commit(cat)
    return dict(ok=True)


def showcase(body):
    items = body['items']
    if not 2 <= len(items) <= 8:
        raise Problem('The show needs between two and eight pieces.')
    with lock:
        cat = load()
        clean = []
        for it in items:
            p = find(cat, it['slug'])
            word = re.sub(r'[^A-Za-z. ]', '', str(it.get('word', ''))).strip()[:12]
            if not word:
                raise Problem(f"{p['name']} needs a word. Letters only.")
            for k in ('tint', 'ink'):
                if not re.fullmatch(r'#[0-9a-fA-F]{6}', str(it.get(k, ''))):
                    raise Problem('A colour is not valid.')
            h, s, v = colorsys.rgb_to_hsv(*hexrgb(it['ink']))
            old = next((s0 for s0 in cat['showcase'] if s0['slug'] == it['slug']), {})
            flat = old.get('flat') if old.get('ink') == it['ink'].lower() and old.get('flat') else tohex(colorsys.hsv_to_rgb(h, min(s, .8), min(v, .86)))
            clean.append(dict(slug=it['slug'], word=word, tint=it['tint'].lower(), ink=it['ink'].lower(), fall=it['fall'] if it.get('fall') in FALLS else 'petals', flat=flat))
        if len({c['slug'] for c in clean}) != len(clean):
            raise Problem('A piece can only be on show once.')
        need = [c['slug'] for c in clean if not find(cat, c['slug']).get('mesh')]
        if not need:
            cat['showcase'] = clean
            commit(cat)
            return dict(ok=True)

    def run(log):
        import build_hero
        for slug in need:
            with lock:
                p = find(load(), slug)
            log(f"Building the 3D model of {p['name']}. This takes about twenty seconds.")
            if p.get('photos'):
                pipeline.download(p['photos'], p['id'], log)
            mesh = build_hero.model_for(p)
            with lock:
                cat = load()
                find(cat, slug)['mesh'] = mesh
                build_data.save(cat)
        with lock:
            cat = load()
            cat['showcase'] = clean
            commit(cat)
        log('The show is updated', 'done')
    return Job('show', 'Updating the show', run)


def poster(cat, log):
    """Phones open on a still of the first screen. Retake it when the opening piece changes."""
    first = cat['showcase'][0]['slug']
    if cat.get('poster', 'blossom-baggy-zip-hoodie') == first:
        return
    import glob
    from PIL import Image
    chrome = sorted(glob.glob(os.path.expanduser('~/Library/Caches/ms-playwright/chromium-*/*/Google Chrome for Testing.app/Contents/MacOS/Google Chrome for Testing')))
    try:
        if not chrome:
            raise Problem('no test browser')
        log('Retaking the still that phones open on')
        subprocess.run([pipeline.node(), 'tools/poster.mjs'], cwd=ROOT, check=True, timeout=180, capture_output=True,
                       env=dict(os.environ, CHROME=chrome[-1], SITE_URL=f'http://127.0.0.1:{PORT}/preview/'))
        for name in ('tall', 'wide'):
            Image.open(f'{ROOT}/tools/_poster-{name}.png').convert('RGB').save(f'{ROOT}/site/img/poster-{name}.webp', quality=60, method=6)
            os.remove(f'{ROOT}/tools/_poster-{name}.png')
        cat['poster'] = first
        build_data.save(cat)
    except Exception as e:
        log('Could not retake the still that phones open on, so for a moment they will show the old opening piece.', 'warn')
        print('poster:', e)


def publish():
    with lock:
        if not pending(load()):
            raise Problem('Nothing has changed since the last publish.')

    def run(log):
        with lock:
            cat = load()
            todo = pending(cat)
            if not todo:
                raise Problem('Nothing has changed since the last publish.')
            branch = git('rev-parse', '--abbrev-ref', 'HEAD').strip()
            if branch != 'main':
                raise Problem(f'The project is on the branch "{branch}". Publishing only works from main.')
            only_push = todo == ['A finished change is still waiting to upload']
            if not only_push:
                poster(cat, log)
                build_data.build(bump=True)
                git('add', '--', 'catalog.json', 'site')
                if git('diff', '--cached', '--name-only').strip():
                    msg = 'Studio: ' + '; '.join(t for t in todo if 'waiting to upload' not in t)
                    git('commit', '-m', msg[:180])
            log('Uploading to GitHub')
            r = subprocess.run(['git', 'push', 'origin', 'main'], cwd=ROOT, capture_output=True, text=True, timeout=180)
            if r.returncode:
                print(r.stderr)
                raise Problem('The change is saved but could not be uploaded. Check the internet connection and press Publish again.')
        log('Published. The live site updates in about a minute.', 'done')
        return dict(live=LIVE)
    return Job('publish', 'Publishing', run)


def shop():
    with lock:
        have = {p['id'] for p in load()['products']}
    try:
        return dict(items=[i for i in pipeline.shop_feed() if i['id'] not in have])
    except Exception as e:
        print('shop feed:', e)
        return dict(items=[], error='Could not reach the Etsy shop feed.')


# ---------- http ----------

class Handler(BaseHTTPRequestHandler):
    server_version = 'TrueOfflineStudio'

    def log_message(self, *a):
        pass

    def send(self, code, body, ctype='application/json', cache='no-store'):
        data = body if isinstance(body, bytes) else json.dumps(body).encode()
        self.send_response(code)
        self.send_header('Content-Type', ctype)
        self.send_header('Content-Length', str(len(data)))
        self.send_header('Cache-Control', cache)
        self.end_headers()
        self.wfile.write(data)

    def file(self, base, rel):
        path = os.path.realpath(os.path.join(base, rel))
        if not path.startswith(os.path.realpath(base) + os.sep) or not os.path.isfile(path):
            return self.send(404, dict(error='Not found'))
        ctype = mimetypes.guess_type(path)[0] or 'application/octet-stream'
        self.send(200, open(path, 'rb').read(), ctype)

    def local(self):
        """Only this Mac, and only pages served by the studio itself, may change anything."""
        host = (self.headers.get('Host') or '').split(':')[0]
        origin = self.headers.get('Origin')
        ok_origin = origin is None or urlparse(origin).hostname in ('localhost', '127.0.0.1')
        return host in ('localhost', '127.0.0.1') and ok_origin

    def do_GET(self):
        if not self.local():
            return self.send(403, dict(error='The studio only answers on this Mac.'))
        path = unquote(urlparse(self.path).path)
        try:
            if path == '/':
                return self.file(HERE, 'index.html')
            if path == '/preview':
                self.send_response(302)
                self.send_header('Location', '/preview/')
                self.end_headers()
                return
            if path.startswith('/preview/'):
                return self.file(f'{ROOT}/site', path[9:] or 'index.html')
            if path.startswith('/raw/') and re.fullmatch(r'/raw/\d+/\d+\.jpg', path):
                return self.file(f'{ROOT}/raw', path[5:])
            if path == '/api/state':
                return self.send(200, state())
            if path == '/api/shop':
                return self.send(200, shop())
            if path.startswith('/api/job/'):
                j = jobs.get(path[9:])
                return self.send(200, j.view()) if j else self.send(404, dict(error='That job is gone.'))
            if path == '/api/suggest':
                slug = (urlparse(self.path).query or '').replace('slug=', '')
                with lock:
                    return self.send(200, suggest_show(find(load(), unquote(slug))))
            self.send(404, dict(error='Not found'))
        except Problem as e:
            self.send(400, dict(error=str(e)))
        except BrokenPipeError:
            pass

    def do_POST(self):
        if not self.local() or 'json' not in (self.headers.get('Content-Type') or ''):
            return self.send(403, dict(error='The studio only answers on this Mac.'))
        path = urlparse(self.path).path
        try:
            n = int(self.headers.get('Content-Length') or 0)
            body = json.loads(self.rfile.read(n) or b'{}') if n < 1_000_000 else {}
            if path == '/api/add':
                r = add(str(body.get('url', '')))
            elif path == '/api/product':
                r = edit(body)
            elif path == '/api/photos':
                r = photos(body)
            elif path == '/api/remove':
                r = remove(body)
            elif path == '/api/line':
                r = line(body)
            elif path == '/api/showcase':
                r = showcase(body)
            elif path == '/api/publish':
                r = publish()
            else:
                return self.send(404, dict(error='Not found'))
            self.send(200, dict(job=r.id) if isinstance(r, Job) else r)
        except Problem as e:
            self.send(400, dict(error=str(e)))
        except (KeyError, TypeError, ValueError) as e:
            traceback.print_exc()
            self.send(400, dict(error='That request was not understood.'))


if __name__ == '__main__':
    if not os.path.exists(f'{ROOT}/tools/vision'):
        print('Building the photo cutout tool (once)...')
        subprocess.run(['swiftc', '-O', 'tools/vision.swift', '-o', 'tools/vision'], cwd=ROOT, check=True)
    build_data.build()
    threading.Thread(target=worker, daemon=True).start()
    srv = ThreadingHTTPServer(('127.0.0.1', PORT), Handler)
    print(f'True Offline studio: http://localhost:{PORT}')
    try:
        srv.serve_forever()
    except KeyboardInterrupt:
        pass
