"""Real 3D garments from two flat photos. Run from the repo root: python3 tools/build_hero.py [slug or mesh name ...]
With no names it rebuilds every piece in catalog.json that already has a model. The studio calls
model_for() to make one for any product put on show.

Each garment becomes one watertight mesh, not a pair of displaced sheets:

1. The back photo is mirrored and bent onto the front silhouette (a small demons registration on the
   signed distance fields), so both sides share one outline and one seam.
2. Volume comes from the medial axis: every part is as thick as it is wide, up to a limit. Sleeves
   get round tubes, the hood a rounded shell, the body an elliptical barrel.
3. Hem and cuffs are open ends. The outline is extended past them before the volume is solved, so
   the body keeps its full depth right to the hem and finishes as a tube instead of a pillow.
4. The hood opening is carved in, and the body leans: hood back, sleeves forward.
5. Rings of vertices follow the outline, so the edge is geometry, smooth at any zoom, with no alpha.

Writes <name>.bin (layout in tools/hero/garment.js), colour and normal maps to site/img/hero.
"""
import json, os, struct, sys
import cv2
import numpy as np
from PIL import Image
from scipy import ndimage as ni
from scipy.spatial import Delaunay
from skimage.morphology import medial_axis
sys.path.insert(0, 'tools')
from build_assets import cut
from crisp import crisp

# Each product's model settings live in catalog.json under "mesh": vertex spacing (grid), the hood
# opening polygon (fractions of the crop) and the neck line (fraction of height). The first five were
# traced from the front photos by hand; for any other piece they are worked out from the outline.
OUT = 'site/img/hero'
DEBUG = os.environ.get('HERO_DEBUG')
os.makedirs(OUT, exist_ok=True)


def fit(im, w):
    return im if im.width <= w else im.resize((w, round(im.height * w / im.width)), Image.LANCZOS)


def clean_mask(alpha):
    m = ni.gaussian_filter((alpha > 127).astype(np.float32), 1.6) > .5
    lab, n = ni.label(m)
    if n > 1:
        m = lab == 1 + np.argmax(ni.sum(m, lab, range(1, n + 1)))
    holes = ni.binary_fill_holes(m) & ~m
    lab, n = ni.label(holes)
    for i in range(1, n + 1):
        if (lab == i).sum() < 900:
            m |= lab == i
    return m


def sdf(m, clip):
    return np.clip(ni.distance_transform_edt(m) - ni.distance_transform_edt(~m), -clip, clip).astype(np.float32)


def register(src, dst, s=.33):
    """Displacement u so that src sampled at x + u matches dst. Both are boolean masks."""
    h, w = src.shape
    lo = (round(w * s), round(h * s))
    A = sdf(cv2.resize(src.astype(np.uint8), lo, interpolation=cv2.INTER_AREA) > 0, 26)
    B = sdf(cv2.resize(dst.astype(np.uint8), lo, interpolation=cv2.INTER_AREA) > 0, 26)
    yy, xx = np.mgrid[:lo[1], :lo[0]].astype(np.float32)
    ux = np.zeros_like(A); uy = np.zeros_like(A)
    for _ in range(320):
        W = cv2.remap(A, xx + ux, yy + uy, cv2.INTER_LINEAR, borderMode=cv2.BORDER_REPLICATE)
        d = W - B
        gy, gx = np.gradient(W)
        den = gx * gx + gy * gy + d * d + 1e-3
        ux = ni.gaussian_filter(ux - d * gx / den * .8, 5)
        uy = ni.gaussian_filter(uy - d * gy / den * .8, 5)
    ux = cv2.resize(ux, (w, h), interpolation=cv2.INTER_CUBIC) / s
    uy = cv2.resize(uy, (w, h), interpolation=cv2.INTER_CUBIC) / s
    return ux, uy


def warp(img, ux, uy):
    h, w = img.shape[:2]
    yy, xx = np.mgrid[:h, :w].astype(np.float32)
    return cv2.remap(img, xx + ux, yy + uy, cv2.INTER_LINEAR, borderMode=cv2.BORDER_REPLICATE)


def bleed(rgb, m):
    """Replace everything outside the mask with the nearest fabric colour: no fringe at the seam."""
    solid = ni.binary_erosion(m, iterations=3)
    idx = ni.distance_transform_edt(~solid, return_distances=False, return_indices=True)
    return rgb[idx[0], idx[1]]


def extend_open_ends(C, pad):
    """Grow the outline past the hem and cuffs. Works on a low-res mask already padded by `pad`."""
    h, w = C.shape
    E = C.copy()
    cx = w // 2
    hem = np.where(C[:, cx])[0].max()
    row = C[hem - 5]
    xl = cx
    while xl > 0 and row[xl - 1]: xl -= 1
    xr = cx
    while xr < w - 1 and row[xr + 1]: xr += 1
    E[hem - 5:, xl:xr + 1] = True
    yy, xx = np.mgrid[:h, :w]
    ends = [(xl, xr, hem)]
    for side in (-1, 1):
        part = C & ((xx < xl - 3) if side < 0 else (xx > xr + 3))
        lab, n = ni.label(part)
        if not n:
            continue
        part = lab == 1 + np.argmax(ni.sum(part, lab, range(1, n + 1)))
        ys, xs = np.where(part)
        low = ys > np.percentile(ys, 45)
        p = np.c_[xs[low], ys[low]].astype(np.float32)
        c = p.mean(0)
        _, _, v = np.linalg.svd(p - c, full_matrices=False)
        d = v[0] if v[0][1] > 0 else -v[0]
        proj = (np.c_[xs, ys] - c) @ d
        band = proj > proj.max() - 9
        bx, by = xs[band], ys[band]
        for k in np.arange(1, pad * .9, .7):
            X = np.clip(np.round(bx + d[0] * k).astype(int), 0, w - 1)
            Y = np.clip(np.round(by + d[1] * k).astype(int), 0, h - 1)
            E[Y, X] = True
    return ni.binary_closing(E, iterations=2) | C


def extend_bottoms(C, pad):
    """The same for trousers and shorts: the waist is open at the top and each leg at the bottom."""
    h, w = C.shape
    E = C.copy()
    rows = np.where(C.any(1))[0]
    top, bot = rows.min(), rows.max()
    row = C[top + 5]
    xs = np.where(row)[0]
    E[:top + 6, xs.min():xs.max() + 1] = True
    lab, n = ni.label(C[bot - 6][None, :])
    for i in range(1, n + 1):
        run = np.where(lab[0] == i)[0]
        if len(run) < 6:
            continue
        x0, x1 = run.min(), run.max()
        yy, xx = np.mgrid[:h, :w]
        part = C & (xx >= x0 - 4) & (xx <= x1 + 4) & (yy > bot - max(30, (bot - top) * .22))
        ys, xs2 = np.where(part)
        p = np.c_[xs2, ys].astype(np.float32)
        c = p.mean(0)
        _, _, v = np.linalg.svd(p - c, full_matrices=False)
        d = v[0] if v[0][1] > 0 else -v[0]
        if d[1] < .8:
            d = np.array([0., 1.])                     # a short leg has no clear direction: straight down
        proj = (np.c_[xs2, ys] - c) @ d
        band = proj > proj.max() - 9
        bx, by = xs2[band], ys[band]
        for k in np.arange(1, pad * .9, .7):
            X = np.clip(np.round(bx + d[0] * k).astype(int), 0, w - 1)
            Y = np.clip(np.round(by + d[1] * k).astype(int), 0, h - 1)
            E[Y, X] = True
    return ni.binary_closing(E, iterations=2) | C


def auto_hood(C):
    """Neck line and hood opening for a hoodie nobody has traced, from its outline alone.
    Going down from the top, the outline widens over the crown of the hood, runs level down its
    sides, then widens again at the shoulders. That second widening is the landmark: on the five
    hand-traced pieces the neck line sits just under it and the opening straddles it. A hood laid
    open has no crown, starts wide and gets a wider opening."""
    h, w = C.shape
    rows = np.where(C.any(1))[0]
    top, bot = rows.min(), rows.max()
    H = bot - top
    width = ni.gaussian_filter1d(C.sum(1).astype(np.float32), 5)
    grow = np.gradient(width)
    y = top + int(H * .03)
    while y < top + H * .3 and grow[y] > .9:
        y += 1
    crown = (y - top) / H
    hood_w = width[y] / w
    while y < top + H * .6 and grow[y:y + max(2, int(H * .02))].mean() <= 1.1:
        y += 1
    takeoff = float(np.clip((y - top) / H, .06, .4))
    # fractions of the crop, which has a 24 px margin above the garment
    f = lambda v: (top + v * H) / h
    opened = crown < .06
    a = hood_w * (.38 if opened else .27)
    y0, y1 = f(max(.015, takeoff - .045)), f(takeoff + .09)
    cx = .5
    shield = [(cx - a, y0), (cx, y0 - .004), (cx + a, y0), (cx + a * 1.04, y0 + (y1 - y0) * .22), (cx + a * .62, y0 + (y1 - y0) * .62), (cx, y1),
              (cx - a * .62, y0 + (y1 - y0) * .62), (cx - a * 1.04, y0 + (y1 - y0) * .22)]
    return round(takeoff + .045, 4), [(round(x, 4), round(y, 4)) for x, y in shield], ([22, .1] if opened else [16, -.1])


def volume(E, rmax):
    """Union of ellipsoids on the medial axis, returned as squared height."""
    skel, dist = medial_axis(E, return_distance=True, rng=0)       # seeded, so a rebuild gives the same model
    ys, xs = np.where(skel & (dist > 2.5))
    T = np.zeros(E.shape, np.float32)
    order = np.argsort(dist[ys, xs])
    for i in order[::1]:
        y, x, r = ys[i], xs[i], dist[ys[i], xs[i]]
        a = rmax * np.tanh(r / rmax)
        R = int(r) + 1
        y0, y1, x0, x1 = max(y - R, 0), min(y + R + 1, E.shape[0]), max(x - R, 0), min(x + R + 1, E.shape[1])
        gy, gx = np.mgrid[y0 - y:y1 - y, x0 - x:x1 - x]
        v = a * a * (1 - (gx * gx + gy * gy) / (r * r))
        T[y0:y1, x0:x1] = np.maximum(T[y0:y1, x0:x1], v)
    w = ni.gaussian_filter(E.astype(np.float32), 3)
    return ni.gaussian_filter(T * E, 3) / np.maximum(w, 1e-3) * E


def base_lum(rgb, C):
    """Fabric brightness with the print painted out, so ink is never mistaken for a fold."""
    f = rgb.astype(np.float32) / 255
    lum = f.mean(2)
    lo = cv2.resize((lum * 255).astype(np.uint8), None, fx=.5, fy=.5, interpolation=cv2.INTER_AREA)
    med = cv2.resize(cv2.medianBlur(lo, 61), lum.shape[::-1], interpolation=cv2.INTER_LINEAR).astype(np.float32) / 255
    chroma = f.max(2) - f.min(2)
    lo = cv2.resize((chroma * 255).astype(np.uint8), None, fx=.5, fy=.5, interpolation=cv2.INTER_AREA)
    base = cv2.resize(cv2.medianBlur(lo, 61), lum.shape[::-1], interpolation=cv2.INTER_LINEAR).astype(np.float32) / 255
    # ink stands out from the fabric around it, in brightness or in colour
    ink = (np.abs(lum - med) > .085) | (np.abs(chroma - base) > .05)
    ink = ni.binary_dilation(ink, iterations=4)
    ok = (C & ~ink).astype(np.float32)
    fill = ni.gaussian_filter(lum * ok, 14) / np.maximum(ni.gaussian_filter(ok, 14), 1e-3)
    soft = ni.gaussian_filter(ok, 2)
    return lum * soft + fill * (1 - soft), ni.gaussian_filter((ink & C).astype(np.float32), 3)


def contours(m):
    cs, hier = cv2.findContours(m.astype(np.uint8), cv2.RETR_CCOMP, cv2.CHAIN_APPROX_NONE)
    return [c[:, 0, :].astype(np.float64) for c in cs if len(c) > 40]


def resample(c, step, smooth=2.5):
    n = len(c)
    k = ni.gaussian_filter1d(c, smooth, axis=0, mode='wrap')
    seg = np.linalg.norm(np.diff(np.r_[k, k[:1]], axis=0), axis=1)
    s = np.r_[0, np.cumsum(seg)]
    t = np.arange(0, s[-1], step)
    kk = np.r_[k, k[:1]]
    return np.c_[np.interp(t, s, kk[:, 0]), np.interp(t, s, kk[:, 1])]


def build(key, cfg):
    """cfg: id, front and back photo numbers, kind ('hoodie', 'top' or 'bottom'), and optionally grid,
    neck, hood and lip. Returns the settings it used plus the model's size, ready for catalog.json."""
    lid = cfg['id']
    kind = cfg.get('kind', 'hoodie')
    cfg = dict(cfg)
    cfg.setdefault('grid', 14)
    front = cut(f"raw/{lid}/{cfg.get('front', 0)}.jpg", 'raw/mask/_m.png')
    back = cut(f"raw/{lid}/{cfg.get('back', 1)}.jpg", 'raw/mask/_m.png').transpose(Image.FLIP_LEFT_RIGHT)
    box = None
    for im in (front, back):
        b = im.getchannel('A').point(lambda v: 255 if v > 12 else 0).getbbox()
        box = b if box is None else (min(box[0], b[0]), min(box[1], b[1]), max(box[2], b[2]), max(box[3], b[3]))
    pad = 24
    box = (max(box[0] - pad, 0), max(box[1] - pad, 0), box[2] + pad, box[3] + pad)
    sides = []
    for im in (front, back):
        im = im.crop(box)
        b = im.getchannel('A').point(lambda v: 255 if v > 12 else 0).getbbox()
        sides.append(np.roll(np.array(im), round(im.width / 2 - (b[0] + b[2]) / 2), axis=1))
    F, B = sides
    h, w = F.shape[:2]

    C = clean_mask(F[..., 3])
    if kind != 'hoodie':
        cfg['neck'], cfg['hood'] = -1., []             # nothing to round off or carve above the shoulders
    elif not cfg.get('hood') or cfg.get('neck') is None:
        cfg['neck'], cfg['hood'], cfg['lip'] = auto_hood(C)
        cfg['traced'] = 'auto'
    ux, uy = register(clean_mask(B[..., 3]), C)
    Bw = warp(B, ux, uy)
    fit_iou = (clean_mask(Bw[..., 3]) & C).sum() / (clean_mask(Bw[..., 3]) | C).sum()

    colF, colB = bleed(F[..., :3], C), bleed(Bw[..., :3], C & (Bw[..., 3] > 127))
    dC = ni.distance_transform_edt(C).astype(np.float32)
    wrap = np.clip(1 - (dC - 5) / 26, 0, 1)[..., None] ** 1.5

    def soften(c):
        f = c.astype(np.float32)
        return (f * (1 - wrap) + cv2.GaussianBlur(f, (0, 0), 5) * wrap).round().astype(np.uint8)
    colF, colB = soften(colF), soften(colB)

    # volume at a third of the size, on a canvas with room for the extended ends
    s, P = 3, 110
    lo = cv2.resize(C.astype(np.uint8) * 255, (w // s, h // s), interpolation=cv2.INTER_AREA) > 127
    lo = np.pad(lo, P)
    E = extend_bottoms(lo, P) if kind == 'bottom' else extend_open_ends(lo, P)
    rmax = .118 * w / s
    T = volume(E, rmax)
    T = T[P:-P, P:-P]
    Elo = E[P:-P, P:-P]
    T = cv2.resize(T, (w, h), interpolation=cv2.INTER_CUBIC).clip(0) * s * s
    Eh = cv2.resize(Elo.astype(np.float32), (w, h), interpolation=cv2.INTER_LINEAR) > .5
    Eh |= C
    dE = ni.distance_transform_edt(np.pad(Eh, 1, constant_values=False))[1:-1, 1:-1]
    rows = np.where(C.any(1))[0]; top, bot = rows.min(), rows.max()
    yy, xx = np.mgrid[:h, :w].astype(np.float32)
    yn = (yy - top) / (bot - top)
    xn = np.abs(xx - w / 2) / (w / 2)
    sm = lambda a, b, v: (lambda t: t * t * (3 - 2 * t))(np.clip((v - a) / (b - a), 0, 1))
    d = ni.distance_transform_edt(C).astype(np.float32)

    # the hood is a rounded shell: its crown must not pinch to a point in profile
    rho = .074 * w
    dd = np.minimum(d, rho)
    T = np.maximum(T, sm(cfg['neck'] + .03, cfg['neck'] - .07, yn) * (2 * rho * dd - dd * dd) * .92)
    z = np.sqrt(T)

    # the body leans: hood back, sleeves forward
    zc = -sm(cfg['neck'] + .1, cfg['neck'] - .14, yn) * .34 * rmax * s
    if kind != 'bottom':
        zc += sm(.52, .92, xn) * .26 * rmax * s
    zc += sm(.55, 1, yn) * .05 * rmax * s
    zc = ni.gaussian_filter(zc, 18)

    # folds from the photo and a little loose cloth, kept away from the seam
    (lumF, inkF), (lumB, inkB) = base_lum(colF, C), base_lum(colB, C)
    # colour maps: large and sharpened for desktop, the plain size for phones
    for name, col, ink in (('front', colF, inkF), ('back', colB, inkB)):
        fit(Image.fromarray(crisp(col, ink)), 2240).save(f'{OUT}/{key}-{name}.webp', quality=91, method=6)
        fit(Image.fromarray(crisp(col, ink)), 1280).save(f'{OUT}/{key}-{name}-m.webp', quality=82, method=6)

    def folds(lum):
        f = ni.gaussian_filter(lum, 12) - ni.gaussian_filter(lum, 52)
        return f / (np.abs(f[C]).max() + 1e-6)

    def noise(seed, sy, sx):
        n = ni.gaussian_filter(np.random.RandomState(seed).randn(h, w).astype(np.float32), (sy, sx))
        return n / np.abs(n).max()
    keep = sm(14, 90, d)
    amp = .075 * rmax * s
    zf = zc + z + (folds(lumF) * .8 + noise(7, 78, 44) + noise(8, 34, 22) * .35) * amp * keep
    zb = zc - z * .94 - (folds(lumB) * .8 + noise(9, 78, 44) + noise(10, 34, 22) * .35) * amp * keep

    # Exact normals from the height field, so shading never shows the triangles. Written with z squared
    # (T), the slope stays finite at the seam, and front and back meet on one identical sideways normal.
    Ts = ni.gaussian_filter(T, 1.5)
    zs = np.sqrt(Ts)
    gTy, gTx = np.gradient(Ts)
    gAy, gAx = np.gradient(ni.gaussian_filter(zf - z, 3))
    gBy, gBx = np.gradient(ni.gaussian_filter(zb + z * .94, 3))
    NF = np.dstack([-gTx - 2 * zs * gAx, -gTy - 2 * zs * gAy, 2 * zs])
    NB = np.dstack([-.94 * gTx + 2 * zs * gBx, -.94 * gTy + 2 * zs * gBy, -2 * zs])

    # hood opening: the front wall falls away into the hood
    poly = np.array([(x * w, y * h) for x, y in cfg['hood']], np.int32).reshape(-1, 2)
    pm = np.zeros((h, w), np.uint8)
    if len(poly):
        cv2.fillPoly(pm, [poly], 255)
    soft, fall = cfg.get('lip', (11, -.3))
    pm = ni.gaussian_filter(pm.astype(np.float32) / 255, soft)
    pmask = sm(.12, .8, pm)
    zf = zf * (1 - pmask) + (zc + z * fall) * pmask
    gy3, gx3 = np.gradient(ni.gaussian_filter(zf, 2.5))
    NP = np.dstack([-gx3, -gy3, np.ones_like(gx3)])
    NP /= np.linalg.norm(NP, axis=2, keepdims=True)
    NF /= np.linalg.norm(NF, axis=2, keepdims=True) + 1e-6
    NF = NF * (1 - pmask[..., None]) + NP * pmask[..., None]

    NB /= np.linalg.norm(NB, axis=2, keepdims=True) + 1e-6

    def emit(step, levels, suffix):
        # vertices: columns that walk in from the outline down the distance field, so the rounded side
        # is a clean strip of quads, then a loose grid inside
        gyd, gxd = np.gradient(ni.gaussian_filter(d, 2.2))
        dE32 = dE.astype(np.float32)
        LV = np.array(levels)
        R0 = 60.
        arc = R0 * np.arccos(1 - np.minimum(LV, R0) / R0)
        LUV = LV.max() * arc / arc.max()                # where each ring samples the photo

        def at(A, P):
            return ni.map_coordinates(A, [P[:, 1], P[:, 0]], order=1, mode='nearest')

        def attrs(P):
            return np.c_[at(zf, P), at(zb, P), at(NF[..., 0], P), at(NF[..., 1], P), at(NF[..., 2], P), at(NB[..., 0], P), at(NB[..., 1], P), at(NB[..., 2], P)]
        allV, allUV, allA = [], [], []
        outline = [resample(c, step * .5) for c in contours(C)]
        for ring in outline:
            cols = [ring.copy()]
            alive = np.ones(len(ring), bool)
            P = ring.copy()
            for li in range(1, len(LV)):
                for _ in range(max(2, int((LV[li] - LV[li - 1]) / 1.2))):
                    g = np.c_[at(gxd, P), at(gyd, P)]
                    g /= np.linalg.norm(g, axis=1, keepdims=True) + 1e-6
                    P = P + g * (LV[li] - LV[li - 1]) / max(2, int((LV[li] - LV[li - 1]) / 1.2))
                alive &= at(d, P) > LV[li] * .72
                cols.append(P.copy())
            cols = np.stack(cols)                       # ring index, column, xy
            # photo coordinates: spread the outer band over the curve instead of smearing it at the seam
            wclosed = ni.gaussian_filter1d((at(dE32, ring) < 7).astype(np.float32), 5, mode='wrap')[:, None]
            for li in range(len(LV)):
                j = min(np.searchsorted(LV, LUV[li], 'right'), len(LV) - 1)
                i = j - 1
                t = (LUV[li] - LV[i]) / (LV[j] - LV[i]) if j > i else 0
                uv = cols[i] * (1 - t) + cols[j] * t
                pick = alive if li else np.ones(len(ring), bool)
                if li >= 5:
                    pick = pick & (np.arange(len(ring)) % 2 == 0)
                allV.append(cols[li][pick])
                allUV.append((cols[li] * (1 - wclosed) + uv * wclosed)[pick])
                # The volume is solved on a coarse grid and the seam amplifies its steps, so height and
                # normal are smoothed along each ring. Without this the side of the garment shows stripes.
                raw = attrs(cols[li])
                lip = at(pmask, cols[li])[:, None]      # the hood lip stays sharp
                allA.append((ni.gaussian_filter1d(raw, 4, axis=0, mode='wrap') * (1 - lip) + raw * lip)[pick])
        # rings round the hood opening keep its lip clean
        for lvl in (.2, .5, .8):
            for c in contours(pm > lvl):
                r = resample(c, step * .6, 2)
                r = r[at(d, r) > 46]                    # the outline's own columns already cover the rest
                allV.append(r); allUV.append(r); allA.append(attrs(r))
        gy, gx = np.mgrid[0:h:step * .87, 0:w:step]
        gx = gx + (np.arange(gx.shape[0])[:, None] % 2) * step / 2
        g = np.c_[gx.ravel(), gy.ravel()]
        gi = np.clip(g.round().astype(int), 0, [w - 1, h - 1])
        g = g[(d[gi[:, 1], gi[:, 0]] > 47) & (np.abs(pm[gi[:, 1], gi[:, 0]] - .5) > .4)]
        allV.append(g); allUV.append(g); allA.append(attrs(g))
        V = np.vstack(allV); UV = np.vstack(allUV); A = np.vstack(allA)
        q = np.round(V * 8).astype(np.int64)
        _, first = np.unique(q[:, 0] * 10000000 + q[:, 1], return_index=True)
        first = np.sort(first)
        V, UV, A = V[first], UV[first], A[first]

        tri = Delaunay(V).simplices
        cen = V[tri].mean(1)
        SS = 4
        Cin = np.zeros((h * SS, w * SS), np.uint8)
        cv2.fillPoly(Cin, [(r * SS).round().astype(np.int32) for r in outline], 1)
        ci = np.clip((cen * SS).round().astype(int), 0, [w * SS - 1, h * SS - 1])
        tri = tri[Cin[ci[:, 1], ci[:, 0]] > 0]
        # sliver check: no long edges (bridges over the gap between sleeve and body)
        e = np.linalg.norm(V[tri] - V[np.roll(tri, 1, axis=1)], axis=2).max(1)
        tri = tri[e < step * 5]
        # consistent winding, y up
        a, b, c = V[tri[:, 0]], V[tri[:, 1]], V[tri[:, 2]]
        u, v = b - a, c - a
        area2 = u[:, 0] * v[:, 1] - u[:, 1] * v[:, 0]
        # Along a dead straight stretch of outline the triangulation makes flat, empty triangles. They
        # would hide outline vertices from the seam test below and leave a gap between front and back.
        tri, area2 = tri[np.abs(area2) > .5], area2[np.abs(area2) > .5]
        flip = area2 > 0
        tri[flip] = tri[flip][:, [0, 2, 1]]

        # boundary edges of the triangulation are the true seam
        edges = np.sort(np.vstack([tri[:, [0, 1]], tri[:, [1, 2]], tri[:, [2, 0]]]), axis=1)
        uniq, cnt = np.unique(edges, axis=0, return_counts=True)
        bedge = uniq[cnt == 1]
        onb = np.zeros(len(V), bool); onb[bedge.ravel()] = True

        samp = lambda A: ni.map_coordinates(A, [V[:, 1], V[:, 0]], order=1)
        vzf, vzb, vzc = A[:, 0].copy(), A[:, 1].copy(), samp(zc)
        # A seam vertex is closed where the volume falls to nothing; hem and cuffs stay open.
        dE_v = samp(dE.astype(np.float32))
        closed = onb & (dE_v < 7)
        vzf[closed] = vzc[closed]; vzb[closed] = vzc[closed]
        oe = bedge[~(closed[bedge[:, 0]] & closed[bedge[:, 1]])]
        ids = np.unique(oe)
        gyd, gxd = np.gradient(ni.gaussian_filter(d, 6))
        dirs = np.c_[at(gxd, V[ids]), at(gyd, V[ids])]
        dirs /= np.linalg.norm(dirs, axis=1, keepdims=True) + 1e-6

        gys, gxs = np.gradient(ni.gaussian_filter(d, 3))

        def normals(n):
            n = n.copy()
            out_xy = -np.c_[at(gxs, V), at(gys, V)]
            n[closed, 2] = 0
            flat = np.linalg.norm(n[closed, :2], axis=1, keepdims=True) > 1e-4
            n[closed, :2] = np.where(flat, n[closed, :2], out_xy[closed])
            n /= np.linalg.norm(n, axis=1, keepdims=True) + 1e-9
            n[:, 1] *= -1                               # image y runs down
            return (n * 127).round().astype(np.int8)
        nF, nBk = normals(A[:, 2:5]), normals(A[:, 5:8])
        nBk[closed] = nF[closed]

        # to world-ish units: 16ths of a pixel, y up, centred
        X = ((V[:, 0] - w / 2) * 16).round().astype(np.int16)
        Y = ((h / 2 - V[:, 1]) * 16).round().astype(np.int16)
        U = (UV[:, 0] / w * 65535).clip(0, 65535).round().astype(np.uint16)
        W_ = ((1 - UV[:, 1] / h) * 65535).clip(0, 65535).round().astype(np.uint16)
        ZF = (vzf * 16).round().astype(np.int16)
        ZB = (vzb * 16).round().astype(np.int16)
        with open(f'{OUT}/{key}{suffix}.bin', 'wb') as f:
            f.write(struct.pack('<4I', len(V), len(tri), len(oe), len(ids)))
            for a_ in (X, Y, ZF, ZB, U, W_):
                f.write(a_.tobytes())
            f.write(tri.astype(np.uint16).tobytes())
            f.write(oe.astype(np.uint16).tobytes())
            f.write(ids.astype(np.uint16).tobytes())
            f.write((dirs * np.array([1, -1]) * 1000).round().astype(np.int16).tobytes())
            f.write(nF.tobytes())
            f.write(nBk.tobytes())
        return len(V), len(tri), len(ids), (vzf.max() - vzb.min()) / w

    nV, nT, nO, depth = emit(cfg['grid'], [0, .9, 3.6, 8, 14, 21, 30, 40.], '')
    mV = emit(cfg['grid'] * 1.75, [0, 1.2, 5, 12, 22, 40.], '-m')[0]

    # lighting detail only: the shape now lives in the mesh
    for name, lum in (('front', lumF), ('back', lumB)):
        lum = np.where(C, lum, lum[C].mean())
        detail = ni.gaussian_filter(lum, .9) - ni.gaussian_filter(lum, 5)
        fold = ni.gaussian_filter(lum, 3) - ni.gaussian_filter(lum, 24)
        hn = fold * 24 + detail * 15
        gy2, gx2 = np.gradient(hn)
        n = np.dstack([-gx2, gy2, np.ones_like(gx2)])
        n[..., :2] *= np.clip((dC - 8) / 30, 0, 1)[..., None]   # none where the fabric wraps out of view
        n /= np.linalg.norm(n, axis=2, keepdims=True)
        nm = Image.fromarray(((n * .5 + .5) * 255).astype(np.uint8), 'RGB')
        fit(nm, 1280).save(f'{OUT}/{key}-{name}-n.webp', quality=84, method=6)
        fit(nm, 640).save(f'{OUT}/{key}-{name}-n-m.webp', quality=78, method=6)

    inner = (colF[C].astype(np.float32).mean(0) * .34).astype(int)
    size = os.path.getsize(f'{OUT}/{key}.bin')
    print(f'{key}: {w}x{h} verts {nV} (phone {mV}) tris {nT} open {nO} iou {fit_iou:.3f} depth {depth:.2f}w bin {size // 1024}KB', flush=True)
    if DEBUG:
        vis = (colF * .6 + 90).clip(0, 255).astype(np.uint8)
        if len(poly):
            cv2.polylines(vis, [poly], True, (255, 40, 40), 2)
        vis[(Eh ^ C)] = (40, 160, 255)
        for i in range(1, 10):
            cv2.line(vis, (w * i // 10, 0), (w * i // 10, h), (255, 255, 255), 1)
            cv2.line(vis, (0, h * i // 10), (w, h * i // 10), (255, 255, 255), 1)
        Image.fromarray(vis).save(f'{DEBUG}/{key}-dbg.jpg', quality=80)
        zz = (z / z.max() * 255).astype(np.uint8)
        Image.fromarray(zz).save(f'{DEBUG}/{key}-z.jpg', quality=80)
    out = dict(key=key, kind=kind, grid=cfg['grid'], neck=round(float(cfg['neck']), 4), hood=[list(map(float, p)) for p in cfg['hood']],
               w=w, h=h, inner='#%02x%02x%02x' % tuple(int(v) for v in inner), iou=round(float(fit_iou), 3))
    for k in ('lip', 'traced'):
        if cfg.get(k) is not None:
            out[k] = list(cfg[k]) if k == 'lip' else cfg[k]
    return out


def model_for(p):
    """Builds (or rebuilds) the model for one catalog product and returns its "mesh" entry."""
    old = p.get('mesh') or {}
    f, b = next(iter(p['views'].values()))
    kind = old.get('kind') or {'Hoodies': 'hoodie', 'Tops': 'top', 'Sweats': 'bottom', 'Shorts': 'bottom'}[p['cat']]
    cfg = dict(id=p['id'], front=f, back=b, kind=kind)
    for k in ('grid', 'neck', 'hood', 'lip'):
        if old.get(k) is not None and not (k in ('neck', 'hood') and old.get('traced')):
            cfg[k] = old[k]
    return build(old.get('key') or p['slug'], cfg)


if __name__ == '__main__':
    path = 'catalog.json'
    cat = json.load(open(path))
    want = sys.argv[1:]
    for p in cat['products']:
        m = p.get('mesh')
        if (want and (p['slug'] in want or (m and m['key'] in want))) or (not want and m):
            p['mesh'] = model_for(p)
    json.dump(cat, open(path, 'w'), indent=1, ensure_ascii=False)
