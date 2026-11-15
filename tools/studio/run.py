"""The studio's worker. GitHub runs it on a Mac whenever catalog.json changes (.github/workflows/studio.yml).

The studio page (site/studio) only ever edits catalog.json. This brings the site into line with it:

  1. pieces waiting in the queue (captured by the bookmark button) are made and added to the line
  2. pieces whose chosen photos changed get their cutouts remade
  3. pieces put on show for the first time get their 3D model
  4. files left behind by removed pieces are swept away
  5. site/data.js is rebuilt, and the still that phones open on is retaken if the opening piece changed

Anything that goes wrong with one piece is written to catalog.json under "problems", where the page
shows it, and the rest carries on. Run from the repo root: python3 tools/studio/run.py
"""
import glob, json, os, re, subprocess, sys, time

HERE = os.path.dirname(os.path.abspath(__file__))
ROOT = os.path.dirname(os.path.dirname(HERE))
sys.path.insert(0, HERE)
sys.path.insert(0, f'{ROOT}/tools')
os.chdir(ROOT)
import build_data
import pipeline
from pipeline import Problem

IMG = f'{ROOT}/site/img'
did, problems = [], []


def log(text, *_):
    print(text, flush=True)


def trouble(name, error):
    print(f'PROBLEM {name}: {error}', flush=True)
    problems.append(dict(name=name, error=str(error), at=time.strftime('%Y-%m-%d %H:%M UTC', time.gmtime())))


def tidy(cat):
    """The page writes catalog.json, so nothing in it is taken on trust. Put every field in shape."""
    text = lambda v, n, d: (re.sub(r'\s+', ' ', re.sub(r'[\x00-\x1f<>]', '', str(v or ''))).strip()[:n]) or d
    seen = set()
    keep = []
    for p in cat.get('products', []):
        if not isinstance(p, dict) or not re.fullmatch(r'[a-z0-9-]{1,80}', str(p.get('slug', ''))) or p['slug'] in seen \
                or not re.fullmatch(r'[a-z0-9-]{1,80}', str(p.get('img', ''))) or not re.fullmatch(r'\d{6,14}', str(p.get('id', ''))):
            continue
        seen.add(p['slug'])
        p['name'] = text(p.get('name'), 90, p['slug'])
        p['note'] = text(p.get('note'), 240, p['name'])
        p['cat'] = p.get('cat') if p.get('cat') in pipeline.CATS else 'Tops'
        for k, d in (('fabric', 'See Etsy'), ('fit', 'Regular'), ('finish', 'Unwashed')):
            p[k] = text(p.get(k), 80, d)
        try:
            p['price'] = round(float(p['price']), 2)
            assert 0 < p['price'] < 10000
        except Exception:
            trouble(p['name'], 'The price was not a number, so the piece is hidden until it is fixed.')
            p['price'], p['hidden'] = 0.0, True
        try:
            p['gsm'] = max(0, int(float(p.get('gsm') or 0)))
        except Exception:
            p['gsm'] = 0
        p['feature'], p['hidden'] = bool(p.get('feature')), bool(p.get('hidden'))
        if not p['hidden']:
            p.pop('hidden')
        p['etsy'] = f"https://www.etsy.com/listing/{p['id']}/{pipeline.listing_id(p.get('etsy') or 'etsy.com/listing/' + p['id'])[1]}"
        p['photos'] = [u for u in p.get('photos') or [] if pipeline.PHOTO.fullmatch(str(u))]
        keep.append(p)
    cat['products'] = keep
    cat['line'] = [s for s in dict.fromkeys(cat.get('line') or []) if s in seen] + [p['slug'] for p in keep if p['slug'] not in (cat.get('line') or [])]
    cat['showcase'] = [s for s in cat.get('showcase') or [] if isinstance(s, dict) and s.get('slug') in seen][:8]
    for s in cat['showcase']:
        s['word'] = re.sub(r'[^A-Za-z. ]', '', str(s.get('word') or '')).strip()[:12] or 'Piece'
        s['fall'] = s.get('fall') if s.get('fall') in build_data.FALLS else 'petals'
        for k, d in (('tint', '#ff9fbe'), ('ink', '#ff6f9f'), ('flat', '')):
            s[k] = str(s.get(k)).lower() if re.fullmatch(r'#[0-9a-fA-F]{6}', str(s.get(k) or '')) else (d or s['ink'])
    cat['queue'] = [x for x in cat.get('queue') or [] if isinstance(x, dict)][:10]
    cat['fit'] = cat.get('fit') if isinstance(cat.get('fit'), dict) else {}


def views_ok(p):
    v = p.get('views')
    keys = [c['key'] for c in p['colours']] if p.get('colours') else ['']
    n = len(p.get('photos') or [])
    return isinstance(v, dict) and sorted(v) == sorted(keys) and all(
        isinstance(x, list) and len(x) == 2 and all(isinstance(i, int) and 0 <= i < max(n, 1) for i in x) and x[0] != x[1] for x in v.values())


def add_queued(cat):
    queue, cat['queue'] = cat.get('queue') or [], []
    for item in queue[:10]:
        name = str((item or {}).get('name') or 'A piece')[:90] if isinstance(item, dict) else 'A piece'
        try:
            p = pipeline.new_product(item, cat, log)
            cat['products'].append(p)
            cat['line'].insert(1 if cat['line'] else 0, p['slug'])       # near the top, where new pieces get seen
            did.append(f"Added {p['name']}")
        except Problem as e:
            trouble(name, e)
        except Exception as e:
            trouble(name, f'Something broke while adding it ({e.__class__.__name__}).')
            import traceback
            traceback.print_exc()


def recut(cat):
    for p in cat['products']:
        if not views_ok(p):
            if p.get('cut'):
                p['views'] = json.loads(p['cut'])             # back to the photos it was last made from
                trouble(p['name'], 'The photo choice did not make sense, so it was left as it was.')
            continue
        sig = pipeline.signature(p)
        have = all(os.path.exists(f) for f in pipeline.image_files(p))
        if p.get('cut') == sig and have:
            continue
        if 'cut' not in p and have:
            p['cut'] = sig                                    # made before the studio kept track
            continue
        try:
            log(f"Remaking the cutouts of {p['name']}")
            pipeline.download(p['photos'], p['id'], log)
            pipeline.cutouts(p, log)
            p['cut'] = sig
            if p.get('mesh'):
                import build_hero
                p['mesh'] = build_hero.model_for(p)
            did.append(f"New photos for {p['name']}")
        except Problem as e:
            trouble(p['name'], e)
            if p.get('cut') and have:
                p['views'] = json.loads(p['cut'])
        except Exception as e:
            trouble(p['name'], f'The photos could not be remade ({e.__class__.__name__}).')
            if p.get('cut') and have:
                p['views'] = json.loads(p['cut'])


def models(cat):
    by = {p['slug']: p for p in cat['products']}
    for s in cat['showcase']:
        p = by[s['slug']]
        if p.get('hidden'):
            continue
        if p.get('mesh') and os.path.exists(f"{IMG}/hero/{p['mesh']['key']}.bin"):
            continue
        try:
            log(f"Building the 3D model of {p['name']}")
            import build_hero
            pipeline.download(p['photos'], p['id'], log)
            p['mesh'] = build_hero.model_for(p)
            did.append(f"3D model for {p['name']}")
        except Exception as e:
            trouble(p['name'], f'Its 3D model could not be built, so it is not on show ({e.__class__.__name__}).')
            import traceback
            traceback.print_exc()


def sweep(cat):
    """Cutouts and models that no piece in the catalog uses any more."""
    stems = set()
    for p in cat['products']:
        for k in build_data.colour_keys(p):
            stems.add(p['img'] + ('-' + k if k else ''))
    for f in glob.glob(f'{IMG}/*.webp'):
        m = re.fullmatch(r'(.+)-(front|back)(-s)?\.webp', os.path.basename(f))
        if m and m.group(1) not in stems:
            os.remove(f)
    keys = {p['mesh']['key'] for p in cat['products'] if p.get('mesh')}
    for f in glob.glob(f'{IMG}/hero/*'):
        m = re.fullmatch(r'(.+?)(?:-(?:front|back)(?:-n|-h)?(?:-m)?\.webp|(?:-m)?\.bin)', os.path.basename(f))
        if m and m.group(1) not in keys:
            os.remove(f)


def poster(cat):
    """Phones open on a still of the first screen. Retake it when the opening piece changes."""
    shown = build_data.showcase(cat)
    if not shown or cat.get('poster', 'blossom-baggy-zip-hoodie') == shown[0]['slug']:
        return
    from PIL import Image
    server = subprocess.Popen([sys.executable, '-m', 'http.server', '4790', '--bind', '127.0.0.1'], cwd=f'{ROOT}/site', stdout=subprocess.DEVNULL, stderr=subprocess.DEVNULL)
    try:
        log('Retaking the still that phones open on')
        if not os.path.isdir(f'{ROOT}/tools/node_modules/playwright'):
            subprocess.run(['npm', 'install', '--no-save', '--no-audit', '--no-fund', '--prefix', 'tools', 'playwright'], check=True, timeout=300, capture_output=True)
        if not os.environ.get('CHROME'):
            subprocess.run(['npx', '--prefix', 'tools', 'playwright', 'install', 'chromium'], check=True, timeout=600, capture_output=True)
        time.sleep(1)
        subprocess.run(['node', 'tools/poster.mjs'], check=True, timeout=300, env=dict(os.environ, SITE_URL='http://127.0.0.1:4790/'))
        for name in ('tall', 'wide'):
            Image.open(f'{ROOT}/tools/_poster-{name}.png').convert('RGB').save(f'{IMG}/poster-{name}.webp', quality=60, method=6)
            os.remove(f'{ROOT}/tools/_poster-{name}.png')
        cat['poster'] = shown[0]['slug']
    except Exception as e:
        print('poster:', e, getattr(e, 'stderr', b'')[-600:] if hasattr(e, 'stderr') else '', flush=True)
        trouble('The phone loading picture', 'It could not be retaken, so for a moment phones show the old opening piece.')
    finally:
        server.terminate()


def main():
    cat = build_data.load()
    before = json.dumps(cat, sort_keys=True)
    tidy(cat)
    add_queued(cat)
    recut(cat)
    models(cat)
    sweep(cat)
    cat['problems'] = problems
    build_data.save(cat)
    build_data.build(bump=True)
    cat = build_data.load()
    poster(cat)
    cat['problems'] = problems
    cat['built'] = time.strftime('%Y-%m-%d %H:%M UTC', time.gmtime())
    build_data.save(cat)
    summary = '; '.join(did) or ('Catalog changes' if json.dumps(cat, sort_keys=True) != before else 'Rebuild')
    out = os.environ.get('GITHUB_OUTPUT')
    if out:
        open(out, 'a').write(f'summary={summary[:160]}\n')
    print('DONE', summary, f'({len(problems)} problems)', flush=True)


if __name__ == '__main__':
    main()
