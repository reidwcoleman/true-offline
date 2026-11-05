"""Sharper print artwork from a 1400 px photo. Clean compression noise, enlarge, then a shock filter
pushes each soft edge back to a hard one. Fabric is left alone: it only runs where `ink` says."""
import cv2
import numpy as np


def shock(f, steps=4, dt=.2, sigma=1.7):
    """f is float32 BGR 0..1. Edges move toward the nearest flat colour on either side."""
    for _ in range(steps):
        L = cv2.GaussianBlur(f.mean(2), (0, 0), sigma)
        gx = cv2.Sobel(f, cv2.CV_32F, 1, 0, ksize=3) / 8
        gy = cv2.Sobel(f, cv2.CV_32F, 0, 1, ksize=3) / 8
        lap = cv2.Laplacian(L, cv2.CV_32F, ksize=3)
        s = np.tanh(lap * 90)[..., None]
        f = f - dt * s * np.sqrt(gx * gx + gy * gy)
    return f


def crisp(rgb, ink, scale=2):
    """rgb uint8, ink float 0..1 at the same size. Returns uint8 at `scale` times the size."""
    clean = cv2.fastNlMeansDenoisingColored(rgb[..., ::-1].copy(), None, 2.2, 3.5, 5, 15)[..., ::-1]
    h, w = rgb.shape[:2]
    size = (w * scale, h * scale)
    base = cv2.resize(rgb, size, interpolation=cv2.INTER_LANCZOS4).astype(np.float32) / 255
    up = cv2.resize(clean, size, interpolation=cv2.INTER_CUBIC).astype(np.float32) / 255
    sharp = up * .3 + shock(up) * .7
    sharp = sharp + (sharp - cv2.GaussianBlur(sharp, (0, 0), 1.6)) * .55
    m = cv2.resize(ink.astype(np.float32), size, interpolation=cv2.INTER_LINEAR)[..., None]
    return (np.clip(base * (1 - m) + sharp * m, 0, 1) * 255).round().astype(np.uint8)
