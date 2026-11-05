"""Textures for the 3D hoodie: colour, height and normal maps for each side.
Run from the repo root: python3 tools/build_hero.py

Both sides are cropped with one shared box, so the two shells line up when the mesh turns.
Height comes from the silhouette (distance to the edge gives a soft inflated profile) plus the
folds visible in the photo. The normal map adds the fabric's fine texture on top of that.
"""
import json, os, sys
import numpy as np
from PIL import Image
from scipy import ndimage as ni
sys.path.insert(0, 'tools')
from build_assets import cut, sharpen

ID = '4594092973'                 # Logo Grey Washed Box Hoodie
OUT = 'site/img/hero'
os.makedirs(OUT, exist_ok=True)

sides = {}
for name, n in (('front', 0), ('back', 1)):
    sides[name] = sharpen(cut(f'raw/{ID}/{n}.jpg', 'raw/mask/_m.png'))

box = None
for im in sides.values():
    b = im.getchannel('A').point(lambda v: 255 if v > 12 else 0).getbbox()
    box = b if box is None else (min(box[0], b[0]), min(box[1], b[1]), max(box[2], b[2]), max(box[3], b[3]))
pad = 44
box = (box[0] - pad, box[1] - pad, box[2] + pad, box[3] + pad)
print('box', box, box[2] - box[0], box[3] - box[1])

for name, im in sides.items():
    im = im.crop(box)
    # Each side is centred on the same axis, so the two shells meet when the mesh turns.
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
    h = ni.gaussian_filter(np.where(a, h, 0), 2.2)
    h = np.clip(h, 0, 1)
    # Height must reach exactly zero at the silhouette, or the shells leave a crack down the side.
    seam = np.clip((d - 1.5) / 7, 0, 1)
    Image.fromarray((h * seam * 255).astype(np.uint8), 'L').save(f'{OUT}/{name}-h.webp', quality=92, method=6)

    # Fabric grain plus a stronger read of the folds, for lighting only.
    detail = ni.gaussian_filter(lum, .9) - ni.gaussian_filter(lum, 5)
    hn = ni.gaussian_filter(h, 1.2) * 150 + fold * rim * 9 + detail * 13
    gy, gx = np.gradient(hn)
    n = np.dstack([-gx, gy, np.ones_like(gx)])
    n /= np.linalg.norm(n, axis=2, keepdims=True)
    Image.fromarray(((n * .5 + .5) * 255).astype(np.uint8), 'RGB').save(f'{OUT}/{name}-n.webp', quality=88, method=6)

    im.save(f'{OUT}/{name}.webp', quality=90, method=6)
    print(name, im.size)

json.dump({'w': box[2] - box[0], 'h': box[3] - box[1]}, open('tools/hero/size.json', 'w'))
