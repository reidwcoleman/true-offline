"""Curated product table + scraped listings + parsed size charts -> site/data.js"""
import json
L = {l['id']: l for l in json.load(open('raw/listings.json'))}
C = json.load(open('raw/charts.json'))
# id: (display name, category, what is actually on the garment, fabric, gsm, fit, finish)
P = {
 '4604463792': ('Graphic Ripped Boxy Hoodie', 'Hoodies', 'Cherry blossom on the chest, a full pagoda print across the back, ripped hem.', '88% cotton, 12% polyester', 370, 'Oversized', 'Sunfade wash, ripped'),
 '4607885005': ('Sunfaded Hoodie', 'Hoodies', 'Script logo on the chest, white flames down both sleeves, a small star at the back hem.', '100% cotton', 400, 'Loose', 'Monkey wash'),
 '4598064712': ('Blossom Baggy Zip Hoodie', 'Hoodies', 'Cherry blossom front and back, katakana and the Japanese flag.', '100% cotton', 360, 'Oversized', 'Vintage wash'),
 '4594092973': ('Logo Grey Washed Box Hoodie', 'Hoodies', 'Lowercase logo at the front hem, the globe logo across the back.', '53% polyester, 42% cotton, 5% other', 355, 'Oversized', 'Snow wash'),
 '4593331552': ('Deep Red Logo Zip Hoodie', 'Hoodies', 'Washed wine red, logo down the zip, pink and blue globe across the back.', '53% polyester, 42% cotton, 5% other', 355, 'Loose', 'Snow wash'),
 '4594073163': ('Dirty Faded Flare Zip Hoodie', 'Hoodies', 'Cloud-dyed grey with a Dreamer flame print and cream burst, front and back.', '74.7% polyester, 21.2% cotton, 4.1% spandex', 410, 'Boxy', 'Dirty wash'),
 '4593507922': ('2018 WC Faded Hoodie', 'Hoodies', 'Illustrated rooster and France 2018 champions print across the back.', '53% polyester, 42% cotton, 5% other', 355, 'Loose', 'Sunfade wash'),
 '4603708191': ('Hibiscus Ivory Hoodie', 'Hoodies', 'Red florals across the chest, back and sleeve on snow-washed ivory.', '53% polyester, 42% cotton, 5% other', 355, 'Oversized', 'Snow wash'),
 '4607676717': ('Autumn Waffle Knit', 'Tops', 'Raglan crew with flames on both sleeves and a star at the chest.', '70% cotton, 30% polyester', 340, 'Loose, boxy', 'Vintage wash'),
 '4594086745': ('Japan Jersey Sweatshirt', 'Tops', 'Striped collar and sleeves, Mie Prefecture 19 print front and back.', '100% cotton', 380, 'Loose', 'Unwashed'),
 '4605137651': ('Fleeced Sweatshirt', 'Tops', 'Caffe Paradiso 1972 print on the chest, the full lemon graphic on the back.', '53% polyester, 42% cotton, 5% other', 350, 'Loose', 'Fleece lined'),
 '4593312297': ('Logo Compression Shirt', 'Tops', 'Fitted training top with contrast seams and a star at the chest.', '87% polyester, 13% spandex', 180, 'Fitted', 'Paneled'),
 '4594819815': ('Fury Logo Straight Sweatpants', 'Sweats', 'Cobalt flame star at the ankle, a smaller one on the back pocket.', '51% polyester, 49% cotton', 360, 'Oversized', 'Fleece lined'),
 '4593496941': ('Signature Straight Sweatpants', 'Sweats', 'Contrast piping curves down each leg, white drawcord.', '57.4% polyester, 36.8% cotton, 5.8% other', 350, 'Oversized', 'Fleece lined'),
 '4602331440': ('Earth Barrel Leg Sweatpants', 'Sweats', 'Deep brown barrel leg with a vine script on the lower leg.', '53% polyester, 42% cotton, 5% other', 345, 'Loose', 'Elastic waist'),
 '4598360332': ('Waistband Barrel Sweatpants', 'Sweats', 'Barrel leg, contrast waistband, red line art at both knees.', '64.1% cotton, 35.9% polyester', 350, 'Loose', 'Paneled'),
 '4594094089': ('Darks Barrel Fleece Sweatpants', 'Sweats', 'Washed black barrel leg with a red script on the thigh.', '53% polyester, 42% cotton, 5% other', 390, 'Regular', 'Vintage wash'),
 '4594094949': ('Starfish Fleece Faded Shorts', 'Shorts', 'Sun-faded olive fleece with pink starfish down the legs.', '70% cotton, 30% polyester', 340, 'Wide leg', 'Sunfade wash'),
 '4593770988': ('Logo Wash Jorts', 'Shorts', 'Faded denim, cobalt star at the hem, raw edge.', '80% cotton, 14% cellulose, 6% polyester', 425, 'Loose', 'Sunfade wash'),
 '4605915280': ('Vintage Wash Denim Shorts', 'Shorts', 'Reverse wash, tonal flames on the legs, a star at the back hem.', '80% cotton, 14% cellulose, 6% polyester', 430, 'Loose', 'Reverse wash'),
}
FIXED_NOTES = {'4607676717': [{'name': 'Black', 'key': 'black'}, {'name': 'Ivory', 'key': 'ivory'}]}
REVIEW = {'4593312297': 'Nice design, fits well! Would recommend!'}
out = []
for i, (name, cat, note, fabric, gsm, fit, finish) in P.items():
    l, c = L[i], C[i]
    assert l['price'], i
    out.append(dict(
        id=i, slug=name.lower().replace(' ', '-'), name=name, cat=cat, note=note,
        price=float(l['price']), etsy=f"https://www.etsy.com/listing/{i}/{l['slug']}",
        img=l['slug'], colours=FIXED_NOTES.get(i), fabric=fabric, gsm=gsm, fit=fit, finish=finish,
        sizes=c['sizes'], rows=[dict(name=r['name'], inch=r['inch'], cm=r['cm']) for r in c['rows']],
        review=REVIEW.get(i),
    ))
open('site/data.js', 'w').write('window.TO_PRODUCTS=' + json.dumps(out, separators=(',', ':')) + ';\n')
print(len(out), sum(1 for o in out if o['rows']))
