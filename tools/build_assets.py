"""Raw Etsy photos -> transparent, consistently framed WebP cutouts (size charts: tools/parse_charts.py).
Run from the repo root: python3 tools/build_assets.py
"""
import json, subprocess
import numpy as np
from PIL import Image, ImageFilter
from scipy import ndimage as ni

RAW, OUT = 'raw', 'site/img'
SKIP = {'4544505308', '4545666908'}          # older print-on-demand tees, off-line
# Waffle knit has two colourways: images 0/2 black, 1/3 ivory.
VIEWS = {'4607676717': {'black': (0, 2), 'ivory': (1, 3)}}
CANVAS = (1200, 1500)                        # 4:5
FILL = 0.90

def cut(path, tmp):
    subprocess.run(['tools/vision', 'mask', path, tmp], check=True)
    rgb = np.array(Image.open(path).convert('RGB'))
    m = np.array(Image.open(tmp).convert('L')).astype(np.float32) / 255
    # Pure-white background reachable from the border is never garment, even if Vision kept it.
    white = rgb.min(axis=2) >= 248
    lab, _ = ni.label(white)
    edge = np.unique(np.r_[lab[0], lab[-1], lab[:, 0], lab[:, -1]])
    bg = np.isin(lab, edge[edge > 0])
    m[bg] = 0
    # Pull the edge in ~1px so no white halo survives on dark grounds, then soften.
    solid = ni.binary_erosion(m > 0.5, iterations=2)
    a = ni.gaussian_filter(ni.binary_erosion(m > 0.5, iterations=1).astype(np.float32), 0.8)
    # Colour decontamination: edge pixels take the colour of the nearest solid interior pixel.
    idx = ni.distance_transform_edt(~solid, return_distances=False, return_indices=True)
    clean = rgb[idx[0], idx[1]]
    out = np.where(solid[..., None], rgb, clean)
    # Keep only the biggest connected pieces (drops stray specks).
    lab3, n3 = ni.label(a > 0.05)
    if n3 > 1:
        sizes = ni.sum(a > 0.05, lab3, range(1, n3 + 1))
        big = sizes.max()
        a[~np.isin(lab3, [i + 1 for i, s in enumerate(sizes) if s > big * 0.01])] = 0
    return Image.fromarray(np.dstack([out, (a * 255).astype(np.uint8)]).astype(np.uint8), 'RGBA')

def sharpen(im):
    # Runs before framing, while colour still extends past the alpha edge, so no halo forms.
    *rgb, a = im.split()
    s = Image.merge('RGB', rgb).filter(ImageFilter.UnsharpMask(1.6, 75, 2))
    return Image.merge('RGBA', (*s.split(), a))

def frame(im):
    bbox = im.getchannel('A').point(lambda v: 255 if v > 12 else 0).getbbox()
    g = im.crop(bbox)
    W, H = CANVAS
    s = min(W * FILL / g.width, H * FILL / g.height, 1.35)
    g = g.resize((round(g.width * s), round(g.height * s)), Image.LANCZOS)
    c = Image.new('RGBA', CANVAS, (0, 0, 0, 0))
    c.paste(g, ((W - g.width) // 2, (H - g.height) // 2))
    return c

def main():
    L = json.load(open(f'{RAW}/listings.json'))
    for l in L:
        i = l['id']
        if i in SKIP: continue
        views = VIEWS.get(i, {'': (0, 1)})
        for colour, (f, b) in views.items():
            for side, n in (('front', f), ('back', b)):
                tmp = 'raw/mask/_m.png'
                im = frame(sharpen(cut(f'{RAW}/{i}/{n}.jpg', tmp)))
                name = f"{l['slug']}{'-' + colour if colour else ''}-{side}"
                im.save(f'{OUT}/{name}.webp', quality=86, method=6)
                im.resize((720, 900), Image.LANCZOS).save(f'{OUT}/{name}-s.webp', quality=80, method=6)
                print(name, flush=True)

if __name__ == '__main__':
    main()
