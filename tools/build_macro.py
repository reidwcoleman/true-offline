"""Print close-ups for the Up Close section, plus the film grain tile.
Run from the repo root: python3 tools/build_macro.py
"""
import numpy as np
from PIL import Image, ImageFilter

# name: (source photo, crop box, output width)
C = {
    'pagoda':   ('4604463792/1', (492, 490, 930, 1036), 1000),
    'redglobe': ('4593331552/1', (440, 410, 960, 760), 1200),
    'rooster':  ('4593507922/1', (476, 566, 924, 1104), 900),
    'fury':     ('4594819815/0', (790, 890, 1036, 1236), 760),
    'hibiscus': ('4603708191/1', (500, 530, 950, 850), 900),
    'dreamer':  ('4594073163/1', (390, 410, 1010, 850), 1200),
    'japan':    ('4594086745/0', (380, 400, 1020, 890), 1000),
    'starfish': ('4594094949/0', (826, 830, 1130, 1150), 760),
}
for name, (src, box, w) in C.items():
    im = Image.open(f'raw/{src}.jpg').convert('RGB').crop(box)
    h = round(w * im.height / im.width)
    im = im.resize((w, h), Image.LANCZOS).filter(ImageFilter.UnsharpMask(1.6, 45, 3))
    im.save(f'site/img/macro-{name}.webp', quality=84, method=6)
    print(name, im.size)

# Neutral grain: light and dark specks with low alpha, tiled over grounds as a background layer.
rng = np.random.default_rng(7)
n = rng.normal(0, 1, (256, 256))
v = np.where(n > 0, 255, 0).astype(np.uint8)
a = np.clip(np.abs(n) * 3.4, 0, 9).astype(np.uint8)
Image.fromarray(np.dstack([v, v, v, a]), 'RGBA').save('site/img/grain.png', optimize=True)
