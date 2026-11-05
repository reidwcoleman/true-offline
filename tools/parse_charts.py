"""Size chart images -> raw/charts.json. Each column is OCR'd as its own strip; inch and cm cross-check."""
import json, os, re, subprocess
from PIL import Image, ImageOps
SKIP = {'4544505308', '4545666908'}
def ocr(im):
    p = 'raw/mask/_s.png'; im.save(p)
    return json.loads(subprocess.run(['tools/vision', 'ocr', p], capture_output=True, text=True, check=True).stdout)
def strip(im, x0, x1, k=5):
    c = ImageOps.autocontrast(im.crop((int(x0), 0, int(x1), im.height)).convert('L'), cutoff=1)
    c = c.resize((c.width * k, c.height * k), Image.LANCZOS)
    c = ImageOps.expand(c, border=40, fill=255)
    return c, k
L = json.load(open('raw/listings.json'))
out, problems = {}, 0
for l in L:
    if l['id'] in SKIP: continue
    sizes = [s for s in l['sizes'] if re.fullmatch(r'(S|M|L|XL|2XL)', s)]
    d = f"raw/{l['id']}"
    f = sorted(x for x in os.listdir(d) if x.endswith('.jpg'))[-1]
    im = Image.open(f'{d}/{f}').convert('RGB')
    W = im.width; n = len(sizes)
    # row labels from a strip over the first column
    lab = ocr(im.crop((0, 0, 118, im.height)).resize((118 * 4, im.height * 4), Image.LANCZOS))
    rows = []
    for o in sorted(lab, key=lambda o: o['y']):
        y = (o['y'] + o['h'] / 2) / 4
        t = o['t'].strip()
        if not re.fullmatch(r'[A-Za-z ]{3,}', t) or y < 45: continue
        if t.lower() == 'length' and rows and rows[-1]['name'].lower().startswith('sleeve'):
            rows[-1]['y'] = (rows[-1]['y'] + y) / 2; continue
        rows.append(dict(name=t.split()[0].capitalize(), y=y))
    # header positions: fit centre = a + b*j from whichever size letters OCR sees
    head = ocr(im.crop((0, 0, W, 30)).resize((W * 3, 90), Image.LANCZOS))
    pts = [((o['x'] + o['w'] / 2) / 3, sizes.index(o['t'].strip())) for o in head if o['t'].strip() in sizes]
    if len(pts) >= 2:
        (xa, ja), (xb, jb) = pts[0], pts[-1]; b = (xb - xa) / (jb - ja); a = xa - b * ja
    else:
        b = (W - 118) / n; a = 118 + b / 2
    table = [dict(name=r['name'], inch=[None] * n, cm=[None] * n) for r in rows]
    for j in range(n):
        c = a + b * j
        for key, (x0, x1), pat in (('inch', (c - b / 2 + 2, c - 2), r'\d{1,2}\.\d{2}'), ('cm', (c + 2, c + b / 2 - 2), r'\d{2,3}(\.\d)?')):
            s, k = strip(im, x0, x1)
            for o in ocr(s):
                y = ((o['y'] + o['h'] / 2) - 40) / k
                t = o['t'].strip().replace(',', '.').replace(' ', '')
                if not re.fullmatch(pat, t): continue
                i = min(range(len(rows)), key=lambda i: abs(rows[i]['y'] - y))
                if abs(rows[i]['y'] - y) < 14: table[i][key][j] = float(t)
    for r in table:
        for j in range(n):
            a_, c_ = r['inch'][j], r['cm'][j]
            if a_ is not None and c_ is not None and abs(a_ * 2.54 - c_) > 0.8:
                # trust whichever keeps the row monotonic
                print('MISMATCH', l['name'], r['name'], sizes[j], a_, c_); problems += 1
            if a_ is None and c_ is not None: r['inch'][j] = round(c_ / 2.54, 2)
            if c_ is None and a_ is not None: r['cm'][j] = round(a_ * 2.54 * 2) / 2
        if None in r['inch'] or any(x > y for x, y in zip(r['inch'], r['inch'][1:])):
            print('BAD', l['name'], sizes, r); problems += 1
    out[l['id']] = dict(sizes=sizes, rows=table)
json.dump(out, open('raw/charts.json', 'w'), indent=0)
print('charts', len(out), 'rows', sum(len(v['rows']) for v in out.values()), 'problems', problems)
