"""The film grain tile. Run from the repo root: python3 tools/build_grain.py
"""
import numpy as np
from PIL import Image

# Neutral grain: light and dark specks with low alpha, tiled over grounds as a background layer.
rng = np.random.default_rng(7)
n = rng.normal(0, 1, (256, 256))
v = np.where(n > 0, 255, 0).astype(np.uint8)
a = np.clip(np.abs(n) * 3.4, 0, 9).astype(np.uint8)
Image.fromarray(np.dstack([v, v, v, a]), 'RGBA').save('site/img/grain.png', optimize=True)
