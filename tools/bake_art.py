#!/usr/bin/env python3
"""Bakes the Factory Floor art into mods/factory/art, in the look of a pre-rendered
top-down factory game: warm cracked desert dirt, bevelled machines with long shadows cast to
the right, rubber belts with yellow chevrons, white flying robots far above their shadows.

Everything is drawn here (no game files are read or downloaded). Entities are drawn at 4x
and downscaled with Lanczos, so edges are smooth like rendered sprites. Herdr scales images
smoothly and can't tile, so every PNG is baked at the exact size the mod draws it.
tools/bake_art.py also writes mods/factory/floormap.js: where everything stands.

    nix-shell -p 'python3.withPackages(p:[p.pillow p.numpy])' --run 'python3 tools/bake_art.py'
"""
import json
import shutil
import time
import math
import random
from pathlib import Path

import numpy as np
from PIL import Image, ImageDraw, ImageFilter

ROOT = Path(__file__).resolve().parent.parent
ART_ROOT = ROOT / "mods" / "factory" / "art"
# Herdr caches images by path, so every bake gets a new folder; floormap.js points the mod at it
STAMP = format(int(time.time()), "x")
OUT = ART_ROOT / STAMP
SS = 4  # supersampling

MAP_W, MAP_H = 2560, 256
# where things stand on the floor (display px, top-left corners unless said otherwise)
PLAN = {
    "assemblers": [256, 384, 512, 640, 1824, 1952, 2080, 2208],  # x; 96 wide, deck centre y 60
    "assembler_y": 14,
    "belt_y": 160,
    "roboport": [1216, 12],  # 128 x 128
    "lamp": [944, 112],  # 32 x 32; blocked robots wait around it
    "chests": [1488, 1552, 1616, 1680],  # x; y 112, 32 x 32
    "chest_y": 104,
    "furnaces": [[40, 40], [40, 176], [2456, 40], [2456, 176]],  # 64 x 64; mouth at +32,+50
    "poles": [184, 600, 1020, 1430, 1860, 2300],  # x, base y 236
    "lamps": [[288, 200], [736, 200], [1168, 200], [1592, 200], [2016, 200], [2448, 200]],  # 32 x 32 street lamps
}

# ---------- helpers ----------


def hexa(c: str, a: int = 255) -> tuple:
    c = c.lstrip("#")
    return (int(c[0:2], 16), int(c[2:4], 16), int(c[4:6], 16), a)


def mix(a: str, b: str, t: float) -> tuple:
    x, y = hexa(a), hexa(b)
    return tuple(int(x[i] + (y[i] - x[i]) * t) for i in range(3)) + (255,)


class Canvas:
    """Draws at SS x in display coordinates; `done()` downsamples."""

    def __init__(self, w: int, h: int) -> None:
        self.w, self.h = w, h
        self.img = Image.new("RGBA", (w * SS, h * SS))
        self.d = ImageDraw.Draw(self.img)

    def _p(self, pts):
        return [(x * SS, y * SS) for x, y in pts]

    def rect(self, x0, y0, x1, y1, fill, outline=None, width=1, r=0):
        box = [x0 * SS, y0 * SS, x1 * SS - 1, y1 * SS - 1]
        if r:
            self.d.rounded_rectangle(box, radius=r * SS, fill=fill, outline=outline, width=width * SS)
        else:
            self.d.rectangle(box, fill=fill, outline=outline, width=width * SS)

    def poly(self, pts, fill, outline=None, width=1):
        self.d.polygon(self._p(pts), fill=fill, outline=outline, width=width * SS)

    def ell(self, x0, y0, x1, y1, fill=None, outline=None, width=1):
        self.d.ellipse([x0 * SS, y0 * SS, x1 * SS, y1 * SS], fill=fill, outline=outline, width=int(width * SS))

    def line(self, pts, fill, width=1.0):
        self.d.line(self._p(pts), fill=fill, width=max(1, int(width * SS)), joint="curve")

    def done(self) -> Image.Image:
        return self.img.resize((self.w, self.h), Image.LANCZOS)


def shadow(sprite: Image.Image, dx: int, dy: int, shear: float = 0.0, alpha: float = 0.5, blur: float = 2.0):
    """The sprite's shape, dark, skewed toward the east and blurred: a cast shadow."""
    a = sprite.split()[3]
    w, h = sprite.size
    pad = int(abs(shear) * h) + abs(dx) + 8
    big = Image.new("L", (w + pad * 2, h + pad * 2))
    big.paste(a, (pad, pad))
    if shear:
        big = big.transform(big.size, Image.AFFINE, (1, shear, -shear * (pad + h), 0, 1, 0), Image.BILINEAR)
    big = big.filter(ImageFilter.GaussianBlur(blur)).point(lambda v: int(v * alpha))
    sh = Image.new("RGBA", big.size, (20, 12, 4, 0))
    sh.putalpha(big)
    return sh, (dx - pad, dy - pad)


def place(base: Image.Image, sprite: Image.Image, x: int, y: int, cast=(14, 6, -0.45, 0.5, 2.5)):
    if cast:
        sh, (ox, oy) = shadow(sprite, *cast)
        base.alpha_composite(sh, (x + ox, y + oy))
    base.alpha_composite(sprite, (x, y))


def save(img: Image.Image, name: str) -> None:
    OUT.mkdir(parents=True, exist_ok=True)
    img.save(OUT / f"{name}.png")


def noise(w: int, h: int, cell: int, rng: np.random.Generator) -> np.ndarray:
    small = rng.random((h // cell + 3, w // cell + 3)).astype(np.float32)
    im = Image.fromarray((small * 255).astype(np.uint8)).resize(
        ((w // cell + 3) * cell, (h // cell + 3) * cell), Image.BICUBIC)
    return np.asarray(im, dtype=np.float32)[:h, :w] / 255.0


# ---------- the ground ----------


def ground(rng: np.random.Generator, rnd: random.Random) -> Image.Image:
    n = 0.45 * noise(MAP_W, MAP_H, 96, rng) + 0.3 * noise(MAP_W, MAP_H, 24, rng) + 0.25 * noise(MAP_W, MAP_H, 4, rng)
    n = (n - n.min()) / (n.max() - n.min())
    dark, light = np.array(hexa("#6e4622")[:3]), np.array(hexa("#b5823f")[:3])
    rgb = dark + (light - dark) * n[..., None]
    img = Image.fromarray(rgb.astype(np.uint8)).convert("RGBA")
    layer = Image.new("RGBA", img.size)  # drawn apart and composited: PIL doesn't blend onto RGBA
    d = ImageDraw.Draw(layer)
    for _ in range(300):  # cracks: short wandering dark lines with a light lip below
        x, y = rnd.uniform(0, MAP_W), rnd.uniform(0, MAP_H)
        ang = rnd.uniform(0, math.tau)
        pts = [(x, y)]
        for _ in range(rnd.randint(3, 9)):
            ang += rnd.uniform(-0.9, 0.9)
            x, y = x + math.cos(ang) * rnd.uniform(3, 9), y + math.sin(ang) * rnd.uniform(3, 9)
            pts.append((x, y))
        d.line([(px, py + 1) for px, py in pts], fill=(200, 150, 84, 60), width=1)
        d.line(pts, fill=(58, 34, 14, 140), width=1)
    for _ in range(700):  # grit
        x, y = rnd.uniform(0, MAP_W), rnd.uniform(0, MAP_H)
        d.point((x, y), fill=(60, 36, 14, 120) if rnd.random() < 0.5 else (226, 182, 112, 110))
    img.alpha_composite(layer)
    for _ in range(26):  # rocks
        x, y = rnd.uniform(0, MAP_W), rnd.uniform(196, 252) if rnd.random() < 0.6 else rnd.uniform(0, 14)
        rock(img, int(x), int(y), rnd)
    return img


def rock(img: Image.Image, x: int, y: int, rnd: random.Random) -> None:
    s = rnd.uniform(5, 11)
    c = Canvas(int(s * 3), int(s * 2.4))
    cx, cy = s * 1.5, s * 1.3
    pts = [(cx + math.cos(a) * s * rnd.uniform(0.7, 1.0), cy + math.sin(a) * s * 0.75 * rnd.uniform(0.7, 1.0))
           for a in np.linspace(0, math.tau, 9)[:-1]]
    c.poly(pts, fill=hexa("#7d6a55"))
    c.poly([(px - 1, py - 1.5) for px, py in pts[4:8]] + [(cx, cy - 1)], fill=hexa("#a8917a"))
    c.poly(pts[0:4] + [(cx, cy + 1)], fill=hexa("#5c4c3c"))
    place(img, c.done(), x, y, cast=(4, 2, -0.3, 0.45, 1.2))


# ---------- entities ----------


def assembler() -> Image.Image:
    """A 3x3 assembling machine: slate housing with sloped, panelled sides and a dirty
    copper-brown deck crowded with machinery around two gear wells (the mod spins gears in
    them while it crafts): a motor, a coolant tank, a copper coil, pistons, pipes, cables and an
    exhaust stack."""
    c = Canvas(96, 108)
    # housing
    c.poly([(2, 8), (94, 8), (94, 98), (2, 98)], fill=hexa("#222b2a"))
    c.poly([(2, 8), (14, 18), (14, 84), (2, 98)], fill=hexa("#4a5754"))
    c.poly([(94, 8), (82, 18), (82, 84), (94, 98)], fill=hexa("#2f3b39"))
    c.poly([(2, 98), (14, 84), (82, 84), (94, 98)], fill=hexa("#566560"))
    c.poly([(2, 8), (94, 8), (82, 18), (14, 18)], fill=hexa("#617069"))
    for i in range(1, 8):  # front panels with a lit edge
        x = 2 + i * 92 / 8
        x2 = 14 + (x - 2) * 68 / 92
        c.line([(x, 98), (x2, 84)], fill=hexa("#3a4644"), width=0.9)
        c.line([(x + 0.9, 98), (x2 + 0.9, 84)], fill=hexa("#6c7b75"), width=0.5)
    for y in (34, 50, 66):  # side ribs
        c.line([(3, y + 6), (13, y)], fill=hexa("#3a4644"), width=0.8)
        c.line([(93, y + 6), (83, y)], fill=hexa("#26302e"), width=0.8)
    for x0, x1 in ((4, 14), (82, 92)):  # hazard corners on the front lip
        for k in range(5):
            xa = x0 + k * 2
            c.poly([(xa, 97), (xa + 1, 97), (xa + 2.5, 92), (xa + 1.5, 92)], fill=hexa("#d4a01c") if k % 2 else hexa("#1d1d1b"))
    c.line([(2, 98), (94, 98)], fill=hexa("#141918"), width=1.5)
    # deck
    c.rect(14, 18, 82, 84, fill=hexa("#4f4031"))
    c.rect(15, 19, 81, 83, fill=hexa("#6b5640"))
    for (x0, y0, x1, y1) in ((15, 19, 47, 50), (49, 19, 81, 40), (15, 52, 40, 83), (61, 52, 81, 83)):
        c.rect(x0, y0, x1, y1, fill=hexa("#735c44"), outline=hexa("#4e3e2d"), width=1)
    # gear wells: big one centre-left, small one top-right
    c.ell(28, 34, 64, 70, fill=hexa("#3b2b1d"))
    c.ell(30, 36, 62, 68, fill=hexa("#1f160e"), outline=hexa("#9a6232"), width=1.6)
    c.ell(60, 20, 80, 40, fill=hexa("#3b2b1d"))
    c.ell(61.5, 21.5, 78.5, 38.5, fill=hexa("#1f160e"), outline=hexa("#9a6232"), width=1.2)
    # motor block with cooling fins
    c.rect(17, 21, 33, 33, fill=hexa("#6e706a"), r=2)
    for x in range(19, 32, 3):
        c.rect(x, 22, x + 1.4, 32, fill=hexa("#a9aba2"))
    # coolant tank
    c.ell(64, 56, 80, 72, fill=hexa("#2c3f4a"))
    c.ell(65, 57, 79, 71, fill=hexa("#3f6274"))
    c.ell(67, 58.5, 73, 63, fill=hexa("#7aa6bc"))
    # copper coil
    c.ell(16, 70, 30, 84, fill=hexa("#5a3416"))
    for r in (6.5, 5, 3.5):
        c.ell(23 - r, 77 - r, 23 + r, 77 + r, outline=hexa("#d4914c"), width=0.9)
    # pistons
    for x in (44, 50, 56):
        c.rect(x, 72, x + 4, 82, fill=hexa("#545650"), r=1)
        c.rect(x + 0.6, 72, x + 1.8, 82, fill=hexa("#b8bab0"))
        c.rect(x - 0.5, 70, x + 4.5, 72.5, fill=hexa("#c2a040"), r=0.5)
    # pipes and flanges along the deck edges
    c.rect(34, 22, 58, 27, fill=hexa("#7c7e78"), r=2)
    c.line([(35, 23.2), (57, 23.2)], fill=hexa("#c6c8be"), width=0.8)
    for x in (38, 54):
        c.rect(x, 21, x + 2.5, 28, fill=hexa("#55574f"))
    c.rect(66, 42, 71, 54, fill=hexa("#7c7e78"), r=2)
    c.line([(67.2, 43), (67.2, 53)], fill=hexa("#c6c8be"), width=0.8)
    # cables
    c.line([(33, 30), (40, 33), (44, 31)], fill=hexa("#1a1a18"), width=1.3)
    c.line([(62, 62), (58, 70), (52, 70)], fill=hexa("#a8321e"), width=1.1)
    c.line([(62, 64), (60, 72), (56, 72)], fill=hexa("#2a62b8"), width=1.1)
    # status light box
    c.rect(72, 75, 80, 82, fill=hexa("#232b2a"), r=1)
    c.rect(73.5, 76.5, 78.5, 78.5, fill=hexa("#3b5a2c"))
    # exhaust stack, standing up out of the deck
    c.rect(21, 0, 28, 22, fill=hexa("#5d5f59"))
    c.rect(22, 0, 24, 22, fill=hexa("#9a9c94"))
    c.ell(19.5, -2.5, 29.5, 4, fill=hexa("#2e2e2a"))
    c.ell(21.5, -1.2, 27.5, 2.6, fill=hexa("#141412"))
    for bx, by in ((6, 12), (90, 12), (6, 92), (90, 92)):
        c.ell(bx - 1.5, by - 1.5, bx + 1.5, by + 1.5, fill=hexa("#1a2120"))
    img = c.done()
    rng = random.Random(3)  # rust streaks and grime
    layer = Image.new("RGBA", img.size)
    d = ImageDraw.Draw(layer)
    for _ in range(260):
        x, y = rng.uniform(2, 94), rng.uniform(8, 98)
        if img.getpixel((int(x), int(y)))[3] > 200:
            d.point((x, y), fill=(128, 66, 22, 100) if rng.random() < 0.6 else (14, 14, 12, 100))
    for _ in range(10):
        x = rng.uniform(4, 92)
        d.line([(x, 86 + rng.uniform(0, 4)), (x + rng.uniform(-1, 1), 97)], fill=(110, 58, 20, 70))
    img.alpha_composite(layer)
    return img


def belt() -> Image.Image:
    """A straight belt, 32 px: steel side frames with rivets, ribbed rubber treads, and the
    shadow it casts along its south edge. Its chevrons move, so the mod draws them."""
    c = Canvas(MAP_W, 38)
    c.rect(0, 30, MAP_W, 38, fill=(20, 12, 4, 90))  # cast shadow
    c.rect(0, 31, MAP_W, 34, fill=(20, 12, 4, 70))
    c.rect(0, 2, MAP_W, 30, fill=hexa("#1f1f1d"))
    for x in range(0, MAP_W, 4):  # treads: a lit ridge, its face, a dark gap
        c.rect(x, 4, x + 3, 28, fill=hexa("#383835"))
        c.rect(x, 4, x + 0.8, 28, fill=hexa("#4b4b47"))
        c.rect(x + 2.4, 4, x + 3, 28, fill=hexa("#2b2b29"))
    for y in (4, 27):  # tread edges catch the light
        c.rect(0, y, MAP_W, y + 1, fill=(0, 0, 0, 90))
    for y0 in (0, 28):  # side frames
        c.rect(0, y0, MAP_W, y0 + 4, fill=hexa("#55554f"))
        c.rect(0, y0, MAP_W, y0 + 1, fill=hexa("#8f8f86"))
        c.rect(0, y0 + 3, MAP_W, y0 + 4, fill=hexa("#2c2c29"))
        for x in range(16, MAP_W, 32):
            c.ell(x - 1.1, y0 + 1, x + 1.1, y0 + 3.2, fill=hexa("#2a2a27"))
            c.ell(x - 0.6, y0 + 1.2, x + 0.4, y0 + 2, fill=hexa("#a8a89e"))
    return c.done()


def inserter() -> Image.Image:
    c = Canvas(32, 44)
    c.rect(7, 30, 25, 44, fill=hexa("#4e4f4a"), r=2)  # base on the ground
    c.rect(8, 31, 24, 34, fill=hexa("#7c7d76"), r=1)
    c.ell(12, 33, 20, 41, fill=hexa("#2e2f2b"))
    c.line([(16, 37), (11, 20)], fill=hexa("#3a2e08"), width=5.5)  # arm, outline then yellow
    c.line([(11, 20), (16, 6)], fill=hexa("#3a2e08"), width=5)
    c.line([(16, 37), (11, 20)], fill=hexa("#e2b21e"), width=4)
    c.line([(11, 20), (16, 6)], fill=hexa("#e8bc2a"), width=3.6)
    c.ell(8.5, 17.5, 13.5, 22.5, fill=hexa("#5a5a54"))
    c.rect(12, 1, 20, 7, fill=hexa("#6c6d66"), r=1)  # hand
    c.line([(13, 1), (13, -1)], fill=hexa("#2a2a28"), width=1.2)
    c.line([(19, 1), (19, -1)], fill=hexa("#2a2a28"), width=1.2)
    return c.done()


def chest() -> Image.Image:
    c = Canvas(32, 32)
    c.rect(2, 2, 30, 30, fill=hexa("#5c3d1d"), r=1)
    for i, y in enumerate(range(4, 28, 6)):  # planks
        c.rect(4, y, 28, y + 5, fill=mix("#a8783f", "#8d6332", (i % 2) * 0.5))
        c.line([(4, y + 0.6), (28, y + 0.6)], fill=hexa("#c99a5c"), width=0.6)
    c.rect(2, 2, 30, 6, fill=hexa("#b9884a"))
    c.rect(2, 2, 30, 3.2, fill=hexa("#d4a564"))
    for x in (2, 26):
        c.rect(x, 2, x + 4, 30, fill=hexa("#6b4823"))
    c.rect(13, 9, 19, 14, fill=hexa("#8c8a80"), r=1)
    return c.done()


def pole() -> Image.Image:
    c = Canvas(24, 64)
    c.rect(10, 6, 14, 64, fill=hexa("#6a4524"))
    c.rect(10, 6, 11.5, 64, fill=hexa("#8f6338"))
    c.rect(3, 6, 21, 10, fill=hexa("#5d3c1f"), r=1)
    for x in (4, 20):
        c.ell(x - 2.2, 2.5, x + 2.2, 7.5, fill=hexa("#d8d8d0"), outline=hexa("#6a6a62"), width=0.6)
    return c.done()


def roboport() -> Image.Image:
    c = Canvas(128, 132)
    c.poly([(6, 4), (122, 4), (128, 12), (128, 124), (122, 130), (6, 130), (0, 124), (0, 12)], fill=hexa("#2c2f31"))
    c.poly([(8, 8), (120, 8), (124, 14), (124, 118), (4, 118), (4, 14)], fill=hexa("#5d6164"))
    c.rect(4, 118, 124, 128, fill=hexa("#44484b"))
    for x in range(12, 124, 12):
        c.line([(x, 118), (x, 128)], fill=hexa("#33373a"), width=0.8)
    c.rect(14, 18, 114, 110, fill=hexa("#6f7376"))
    for i in range(14, 114, 10):
        c.line([(i, 18), (i, 110)], fill=hexa("#666a6d"), width=0.5)
    c.ell(28, 28, 100, 100, fill=hexa("#3c3f42"))
    for k in range(16):  # hazard ring
        a0 = k * math.tau / 16
        pts = [(64 + math.cos(a) * r, 64 + math.sin(a) * r)
               for r, a in ((36, a0), (36, a0 + 0.38), (30, a0 + 0.38), (30, a0))]
        c.poly(pts, fill=hexa("#d9a520") if k % 2 else hexa("#1f1f1d"))
    c.ell(36, 36, 92, 92, fill=hexa("#8d9194"), outline=hexa("#2a2c2e"), width=1.5)
    c.ell(46, 46, 82, 82, fill=hexa("#a6aaad"))
    for k in range(6):  # iris
        a = k * math.tau / 6
        c.line([(64, 64), (64 + math.cos(a) * 18, 64 + math.sin(a) * 18)], fill=hexa("#6c7073"), width=1.4)
    c.ell(58, 58, 70, 70, fill=hexa("#4b4f52"))
    for x, y, tip in ((12, 12, "#d84a3a"), (116, 12, "#4a8ad8"), (12, 110, "#4a8ad8"), (116, 110, "#d84a3a")):
        c.rect(x - 6, y - 6, x + 6, y + 6, fill=hexa("#3f4346"), r=2)
        c.rect(x - 1.5, y - 14, x + 1.5, y, fill=hexa("#9a9ea1"))
        c.ell(x - 2.5, y - 17, x + 2.5, y - 12, fill=hexa(tip))
    return c.done()


def lamp() -> Image.Image:
    c = Canvas(32, 32)
    c.rect(6, 10, 26, 30, fill=hexa("#4c4e4a"), r=2)
    c.rect(7, 11, 25, 14, fill=hexa("#7a7c76"), r=1)
    c.ell(9, 4, 23, 18, fill=hexa("#8f9a96"), outline=hexa("#3a3e3c"), width=1)
    c.ell(12, 6, 17, 11, fill=hexa("#d6e0dc"))
    return c.done()


def furnace() -> Image.Image:
    c = Canvas(64, 64)
    rnd = random.Random(5)
    c.ell(2, 4, 62, 62, fill=hexa("#5e5244"))
    for row in range(7):  # stone blocks
        y = 6 + row * 8
        off = (row % 2) * 7
        for x in range(4 + off - 7, 60, 14):
            shade = rnd.uniform(0, 1)
            c.rect(max(4, x), y, min(60, x + 13), y + 7, fill=mix("#8a7c6a", "#a8987f", shade), r=2)
    c.ell(18, 34, 46, 60, fill=hexa("#2a1a10"))  # mouth
    c.ell(22, 40, 42, 58, fill=hexa("#5a240c"))
    c.rect(26, 0, 38, 12, fill=hexa("#6a5e50"), r=2)  # chimney
    c.ell(27, 1, 37, 7, fill=hexa("#1a1612"))
    return c.done()


def glow(size: int, colour: str, name: str) -> None:
    r = size / 2
    yy, xx = np.mgrid[0:size, 0:size]
    d = np.sqrt((xx - r + 0.5) ** 2 + (yy - r + 0.5) ** 2) / r
    a = np.clip(1 - d, 0, 1) ** 2
    rgb = np.array(hexa(colour)[:3], dtype=np.float32)
    arr = np.zeros((size, size, 4), dtype=np.uint8)
    arr[..., :3] = rgb
    arr[..., 3] = (a * 255).astype(np.uint8)
    save(Image.fromarray(arr, "RGBA"), name)


def wire(img: Image.Image, xs: list, y: float) -> None:
    layer = Image.new("RGBA", img.size)
    d = ImageDraw.Draw(layer)
    for a, b in zip(xs, xs[1:]):
        for dy, col in ((0.0, (200, 120, 58, 230)), (16.0, (20, 12, 4, 60))):  # wire, then its shadow on the ground
            pts = []
            for i in range(0, b - a + 1, 4):
                t = i / (b - a)
                pts.append((a + 12 + i, y + 4 * (1 - (2 * t - 1) ** 2) * 3 + dy + (dy and 10 * t)))
            d.line(pts, fill=col, width=1)
    img.alpha_composite(layer)


def floor() -> None:
    rng, rnd = np.random.default_rng(11), random.Random(11)
    img = ground(rng, rnd)
    img.alpha_composite(belt(), (0, PLAN["belt_y"]))
    a, ins = assembler(), inserter()
    for x in PLAN["assemblers"]:
        place(img, a, x, PLAN["assembler_y"], cast=(18, 4, -0.5, 0.5, 3))
        place(img, ins, x + 32, 122, cast=(8, 2, -0.4, 0.45, 1.5))
    place(img, roboport(), *PLAN["roboport"], cast=(18, 4, -0.5, 0.5, 3))
    place(img, lamp(), *PLAN["lamp"], cast=(8, 2, -0.4, 0.45, 1.5))
    ch = chest()
    for x in PLAN["chests"]:
        place(img, ch, x, PLAN["chest_y"], cast=(8, 2, -0.4, 0.45, 1.5))
        place(img, ins, x, 128, cast=(8, 2, -0.4, 0.45, 1.5))
    fu = furnace()
    for x, y in PLAN["furnaces"]:
        place(img, fu, x, y, cast=(12, 3, -0.45, 0.5, 2))
    po = pole()
    for x in PLAN["poles"]:
        place(img, po, x, 196, cast=(20, 8, -0.9, 0.45, 1.5))
    lp = lamp()
    for x, y in PLAN["lamps"]:
        place(img, lp, x, y, cast=(8, 2, -0.4, 0.45, 1.5))
    wire(img, PLAN["poles"], 200)
    save(img, "floor")
    save(night(img), "floor-night")


# ---------- night: moonlight everywhere, warm pools where lights stand ----------

AMBIENT = (0.15, 0.18, 0.30)  # blue moonlight


def lights() -> list:
    """(x, y, radius, (r, g, b) intensity) for every light source on the floor."""
    out = [(x + 16, y + 10, 150, (1.05, 0.95, 0.78)) for x, y in PLAN["lamps"]]
    out += [(x + 16, y + 10, 120, (0.9, 0.82, 0.68)) for x, y in [PLAN["lamp"]]]
    out += [(x + 32, y + 50, 110, (1.1, 0.55, 0.2)) for x, y in PLAN["furnaces"]]
    rx, ry = PLAN["roboport"]
    out += [(rx + 64, ry + 64, 130, (0.55, 0.65, 0.8))]
    return out


def lightmap(w: int, h: int, sources: list, ambient=AMBIENT) -> np.ndarray:
    yy, xx = np.mgrid[0:h, 0:w].astype(np.float32)
    lm = np.ones((h, w, 3), dtype=np.float32) * np.array(ambient, dtype=np.float32)
    for x, y, r, col in sources:
        f = np.clip(1 - np.hypot(xx - x, (yy - y) * 1.25) / r, 0, 1) ** 1.7
        lm += f[..., None] * np.array(col, dtype=np.float32)
    return lm


def night(img: Image.Image) -> Image.Image:
    arr = np.asarray(img, dtype=np.float32)
    rgb = arr[..., :3] * lightmap(img.width, img.height, lights())
    out = np.dstack([np.clip(rgb, 0, 255), arr[..., 3:]]).astype(np.uint8)
    return Image.fromarray(out, "RGBA")


# ---------- robots: white flying bots with a band in the program's colour ----------

BANDS = {
    "orange": "#e8892a", "teal": "#2fb5a8", "blue": "#4a86e8", "green": "#5aae3a",
    "purple": "#a060dc", "grey": "#8c8c88", "yellow": "#e0b82a",
}


def bot(band: str, size: int) -> Image.Image:
    k = size / 40
    c = Canvas(size, size)
    s = lambda *v: [x * k for x in v]  # noqa: E731
    c.line([tuple(s(20, 9)), tuple(s(23, 2))], fill=hexa("#2a2a2a"), width=1.2 * k)  # antenna
    c.ell(*s(22, 0.5, 25, 3.5), fill=hexa("#e04030"))
    for lx in (13, 27):  # legs with red feet
        c.line([tuple(s(lx, 24)), tuple(s(lx + (lx - 20) * 0.25, 34))], fill=hexa("#3a3a38"), width=2.2 * k)
        c.ell(*s(lx + (lx - 20) * 0.25 - 2.2, 32.5, lx + (lx - 20) * 0.25 + 2.2, 37), fill=hexa("#c8302a"))
    c.ell(*s(7, 9, 33, 29), fill=hexa("#3a3a38"))  # body outline
    c.ell(*s(8, 10, 32, 28), fill=hexa("#d9d9d3"))
    c.ell(*s(8, 17, 32, 28), fill=hexa("#a9a9a3"))
    c.ell(*s(10, 10.5, 28, 22), fill=hexa("#ececE6"))
    c.rect(*s(8.5, 17, 31.5, 21), fill=hexa(band))  # band
    c.ell(*s(12, 12, 19, 15.5), fill=hexa("#ffffff"))  # glint
    c.ell(*s(25, 13.5, 31, 19.5), fill=hexa("#1c2e34"))  # sensor, facing right
    c.ell(*s(26.5, 15, 29.5, 18), fill=hexa("#7ee6f0"))
    return c.done()


def robots() -> None:
    for name, band in BANDS.items():
        img = bot(band, 40)
        save(img, f"bot-{name}")
        save(img.transpose(Image.FLIP_LEFT_RIGHT), f"bot-{name}-l")
        save(bot(band, 112), f"bot-{name}-big")
        for kind, im in (("", img), ("-l", img.transpose(Image.FLIP_LEFT_RIGHT))):  # moonlit copies
            a = np.asarray(im, dtype=np.float32)
            a[..., :3] *= np.array((0.5, 0.56, 0.75))
            save(Image.fromarray(a.astype(np.uint8), "RGBA"), f"bot-{name}{kind}-night")


# ---------- small pieces ----------


def icons() -> None:
    c = Canvas(24, 24)  # alert: red rounded triangle, white bar
    c.poly([(12, 1), (23, 21), (1, 21)], fill=hexa("#2a0a08"))
    c.poly([(12, 3.5), (21, 19.5), (3, 19.5)], fill=hexa("#e0402e"))
    c.rect(10.8, 8, 13.2, 14.5, fill=hexa("#ffffff"), r=1)
    c.ell(10.8, 15.5, 13.2, 17.9, fill=hexa("#ffffff"))
    save(c.done(), "alert-red")

    c = Canvas(16, 16)
    c.line([(2, 8.5), (6.5, 13), (14, 3.5)], fill=hexa("#1a3a14"), width=3.6)
    c.line([(2, 8.5), (6.5, 13), (14, 3.5)], fill=hexa("#6ccc5c"), width=2.2)
    save(c.done(), "tick")

    for n, rot in (("spark-a", 0), ("spark-b", math.pi / 4)):
        c = Canvas(18, 18)
        for a in (rot, rot + math.pi / 2):
            c.line([(9 + math.cos(a) * 8, 9 + math.sin(a) * 8), (9 - math.cos(a) * 8, 9 - math.sin(a) * 8)],
                   fill=hexa("#fff2a8"), width=1.4)
        c.ell(6.5, 6.5, 11.5, 11.5, fill=hexa("#ffffff"))
        save(c.done(), n)

    for size, name in ((24, "item"), (32, "item-slot")):  # iron gear wheel item
        k = size / 24
        c = Canvas(size, size)
        for t in range(8):
            a = t * math.tau / 8
            cx, cy = 12 + math.cos(a) * 8.5, 12 + math.sin(a) * 8.5
            c.ell((cx - 2.6) * k, (cy - 2.6) * k, (cx + 2.6) * k, (cy + 2.6) * k, fill=hexa("#6a747a"))
        c.ell(4 * k, 4 * k, 20 * k, 20 * k, fill=hexa("#8d989e"), outline=hexa("#4a5258"), width=k)
        c.ell(5.5 * k, 5 * k, 15 * k, 12 * k, fill=hexa("#b6c0c4"))
        c.ell(9 * k, 9 * k, 15 * k, 15 * k, fill=hexa("#3a4044"))
        save(c.done(), name)

    c = Canvas(22, 12)
    c.rect(0, 0, 19, 12, fill=hexa("#1c1c1a"), r=2)
    c.rect(19, 3.5, 22, 8.5, fill=hexa("#1c1c1a"), r=1)
    for i in range(3):
        c.rect(2 + i * 5.6, 2, 6.6 + i * 5.6, 10, fill=hexa("#6ccc5c"), r=1)
    save(c.done(), "battery")

    h = Image.new("RGBA", (800, 14))  # title bar drag filler: raised dashes
    d = ImageDraw.Draw(h)
    for y in (2, 7):
        for x in range(0, 800, 4):
            d.line([x, y, x + 1, y], fill="#5a595a")
            d.line([x, y + 1, x + 1, y + 1], fill="#1b1a1b")
            d.line([x + 2, y + 3, x + 3, y + 3], fill="#5a595a")
            d.line([x + 2, y + 4, x + 3, y + 4], fill="#1b1a1b")
    h.save(OUT / "handle.png")

    ck = Image.new("RGBA", (320, 160), "#2b2a2b")  # entity preview checker
    d = ImageDraw.Draw(ck)
    for y in range(0, 160, 32):
        for x in range(0, 320, 32):
            if (x // 32 + y // 32) % 2:
                d.rectangle([x, y, x + 31, y + 31], fill="#333233")
    ck.save(OUT / "checker.png")

    glow(96, "#ff3a20", "glow-red")
    glow(64, "#ff9a30", "glow-fire")
    glow(64, "#fff1c8", "glow-lamp")


SVGS = {
    "gear": '<path fill-rule="evenodd" d="M10.6 1h2.8l.5 2.6 1.8.8 2.2-1.5 2 2-1.5 2.2.8 1.8 2.6.5v2.8l-2.6.5-.8 1.8 1.5 2.2-2 2-2.2-1.5-1.8.8-.5 2.6h-2.8l-.5-2.6-1.8-.8-2.2 1.5-2-2 1.5-2.2-.8-1.8L1 13.4v-2.8l2.6-.5.8-1.8-1.5-2.2 2-2 2.2 1.5 1.8-.8zM12 8a4 4 0 100 8 4 4 0 000-8z"/>',
    "split-r": '<path d="M3 4h18v16H3zM5 6v12h6V6zm8 0v12h6V6z" fill-rule="evenodd"/>',
    "split-d": '<path d="M3 4h18v16H3zM5 6v5h14V6zm0 7v5h14v-5z" fill-rule="evenodd"/>',
    "zoom": '<path d="M3 3h7v2H5v5H3zm11 0h7v7h-2V5h-5zM3 14h2v5h5v2H3zm16 0h2v7h-7v-2h5z"/>',
    "close": '<path d="M5.6 4.2 12 10.6l6.4-6.4 1.4 1.4-6.4 6.4 6.4 6.4-1.4 1.4-6.4-6.4-6.4 6.4-1.4-1.4 6.4-6.4-6.4-6.4z"/>',
    "min": '<path d="M5 17h14v2H5z"/>',
    "max": '<path d="M4 4h16v16H4zm2 4v10h12V8z" fill-rule="evenodd"/>',
}


def svgs() -> None:
    for name, body in SVGS.items():
        (OUT / f"{name}.svg").write_text(
            f'<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="#ffffff">{body}</svg>\n')


def floormap() -> None:
    (ROOT / "mods" / "factory" / "floormap.js").write_text(
        "// Written by tools/bake_art.py: where everything stands on floor.png (display px).\n"
        f"export default {json.dumps({**PLAN, 'art': f'mods/factory/art/{STAMP}'})};\n")


if __name__ == "__main__":
    if ART_ROOT.exists():
        shutil.rmtree(ART_ROOT)
    floor()
    robots()
    icons()
    svgs()
    floormap()
    print(f"baked into {OUT}")
