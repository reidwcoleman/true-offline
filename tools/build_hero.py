"""Textures for the 3D hoodies: colour, height and normal maps for each side.
Run from the repo root: python3 tools/build_hero.py

Both sides of a garment are cropped with one shared box and centred on one axis, so the two shells
line up when the mesh turns. Height comes from the silhouette (distance to the edge gives a soft
inflated profile) plus the folds visible in the photo. The normal map adds the fabric's fine texture.
"""
import glob, json, os, sys
import numpy as np
from PIL import Image
from scipy import ndimage as ni
sys.path.insert(0, 'tools')
from build_assets import cut, sharpen

# name: (listing id, largest colour width). The hero garment is seen closest, so it keeps full size.
G = {
    'blossom': ('4598064712', 1500),
    'pagoda':  ('4604463792', 1100),
    'globe':   ('4593331552', 1100),
    'rooster': ('4593507922', 1100),
    'dreamer': ('4594073163', 1100),
}
OUT = 'site/img/hero'
os.makedirs(OUT, exist_ok=True)
for f in glob.glob(f'{OUT}/*.webp'):
    os.remove(f)

def fit(im, w):
    return im if im.width <= w else im.resize((w, round(im.height * w / im.width)), Image.LANCZOS)

sizes = {}
for key, (lid, maxw) in G.items():
    sides = {name: sharpen(cut(f'raw/{lid}/{n}.jpg', 'raw/mask/_m.png')) for name, n in (('front', 0), ('back', 1))}
    box = None
    for im in sides.values():
        b = im.getchannel('A').point(lambda v: 255 if v > 12 else 0).getbbox()
        box = b if box is None else (min(box[0], b[0]), min(box[1], b[1]), max(box[2], b[2]), max(box[3], b[3]))
    pad = 44
    box = (max(box[0] - pad, 0), max(box[1] - pad, 0), box[2] + pad, box[3] + pad)

    for name, im in sides.items():
        im = im.crop(box)
        b = im.getchannel('A').point(lambda v: 255 if v > 12 else 0).getbbox()
        rgba = np.roll(np.array(im), round(im.width / 2 - (b[0] + b[2]) / 2), axis=1)
        im = Image.fromarray(rgba, 'RGBA')
        a = rgba[..., 3] > 127
        lum = rgba[..., :3].astype(np.float32).mean(axis=2) / 255
        lum = np.where(a, lum, lum[a].mean())

        d = ni.distance_transform_edt(a).astype(np.float32)
        rim = np.sqrt(1 - (1 - np.clip(d / 105, 0, 1)) ** 2)
        dome = np.sqrt(np.clip(d / 340, 0, 1))
        fold = ni.gaussian_filter(lum, 9) - ni.gaussian_filter(lum, 46)
        fold = fold / (np.abs(fold[a]).max() + 1e-6)
        h = .60 * rim + .34 * dome + .10 * fold * rim
        h = np.clip(ni.gaussian_filter(np.where(a, h, 0), 2.2), 0, 1)
        # Height must reach exactly zero at the silhouette, or the shells leave a crack down the side.
        seam = np.clip((d - 1.5) / 7, 0, 1)
        hm = Image.fromarray((h * seam * 255).astype(np.uint8), 'L')
        fit(hm, 760).save(f'{OUT}/{key}-{name}-h.webp', quality=92, method=6)

        # Fabric grain plus a stronger read of the folds, for lighting only.
        detail = ni.gaussian_filter(lum, .9) - ni.gaussian_filter(lum, 5)
        hn = ni.gaussian_filter(h, 1.2) * 150 + fold * rim * 9 + detail * 13
        gy, gx = np.gradient(hn)
        n = np.dstack([-gx, gy, np.ones_like(gx)])
        n /= np.linalg.norm(n, axis=2, keepdims=True)
        nm = Image.fromarray(((n * .5 + .5) * 255).astype(np.uint8), 'RGB')
        fit(nm, 1024).save(f'{OUT}/{key}-{name}-n.webp', quality=86, method=6)

        fit(im, maxw).save(f'{OUT}/{key}-{name}.webp', quality=88, method=6)
    sizes[key] = {'w': box[2] - box[0], 'h': box[3] - box[1]}
    print(key, sizes[key], flush=True)

json.dump(sizes, open('tools/hero/size.json', 'w'))
