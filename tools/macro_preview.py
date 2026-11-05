"""Contact sheet of candidate print close-ups, to judge crops before committing to them."""
import sys
from PIL import Image, ImageDraw
C = [
 ('pagoda', '4604463792/1', (470, 480, 950, 1080)),
 ('blossom', '4598064712/1', (430, 330, 970, 880)),
 ('rooster', '4593507922/1', (470, 560, 930, 1110)),
 ('dreamer', '4594073163/1', (380, 400, 1020, 860)),
 ('globe', '4594092973/1', (470, 500, 930, 790)),
 ('redglobe', '4593331552/1', (440, 400, 960, 760)),
 ('starfish', '4594094949/0', (820, 820, 1240, 1300)),
 ('fury', '4594819815/0', (780, 880, 1140, 1320)),
 ('flame', '4607676717/0', (60, 620, 380, 1040)),
 ('sunflame', '4607885005/0', (1060, 560, 1340, 1180)),
 ('japan', '4594086745/0', (370, 380, 1030, 900)),
 ('hibiscus', '4603708191/1', (480, 520, 960, 860)),
 ('jorts', '4593770988/0', (200, 960, 560, 1230)),
 ('demin', '4605915280/0', (380, 620, 1060, 1060)),
]
S = Image.new('RGB', (5 * 380, 3 * 400), '#222')
d = ImageDraw.Draw(S)
for i, (n, f, b) in enumerate(C):
    im = Image.open(f'raw/{f}.jpg').convert('RGB').crop(b)
    im.thumbnail((372, 372))
    x, y = (i % 5) * 380 + 4, (i // 5) * 400 + 22
    S.paste(im, (x, y))
    d.text((x, y - 16), f'{n} {b[2]-b[0]}x{b[3]-b[1]}', fill='white')
S.save(sys.argv[1], quality=88)
