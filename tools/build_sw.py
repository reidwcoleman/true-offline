"""Writes site/sw.js with a precache list and a version hash taken from the site's contents."""
import glob, hashlib, os
os.chdir('site')
core = ['./', 'index.html', 'style.css', 'app.js', 'data.js', 'manifest.webmanifest', 'fonts/archivo.woff2', 'fonts/archivo-italic.woff2', 'img/star.svg', 'img/icon-192.png', 'img/grain.png']
small = sorted(glob.glob('img/*-s.webp'))
macro = sorted(glob.glob('img/macro-*.webp'))
# Large cutouts used on the page itself: hero, the turn section and the shop's feature tiles.
named = ('graphic-ripped-boxy-hoodie', 'zip-through-boxy-fleece-hoodie', '2018-wc-faded-hoodie', 'dirty-faded-flare-zip-hoodie', 'hibuscus-ivory-hoodie')
big = ['img/logo-grey-washed-box-hoodie-back.webp'] + [f'img/{n}-{s}.webp' for n in named for s in ('front', 'back')]
urls = core + small + macro + big
h = hashlib.sha1()
for u in urls[1:]:
    h.update(open(u, 'rb').read())
v = h.hexdigest()[:10]
body = open('../tools/sw.template.js').read().replace('__VERSION__', v).replace('__URLS__', repr(urls))
open('sw.js', 'w').write(body)
print(v, len(urls), sum(os.path.getsize(u) for u in urls[1:]) // 1024, 'KB')
