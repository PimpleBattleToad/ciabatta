# Рисует иконки приложения (PWA) без внешних картинок.
# Запуск: python tools/make-icons.py
from PIL import Image, ImageDraw, ImageFilter
import os

S = 1024
BG = (20, 17, 16)
LOAF = (231, 162, 58)
LOAF_TOP = (246, 195, 116)
CUT = (150, 95, 20)
DUST = (253, 249, 243)
OUT = os.path.join(os.path.dirname(os.path.dirname(os.path.abspath(__file__))), 'icons')


def layer():
    return Image.new('RGBA', (S, S), (0, 0, 0, 0))


def over(img, lay):
    return Image.alpha_composite(img, lay)


def render(width_ratio):
    """Буханка чиабатты по центру тёмного фона с тёплым свечением."""
    img = Image.new('RGBA', (S, S), BG + (255,))

    # 1. едва заметное тёплое свечение — чтобы фон не был плоским
    glow = layer()
    gd = ImageDraw.Draw(glow)
    for i in range(40, 0, -1):
        rr = S * 0.85 * i / 40
        gd.ellipse([S / 2 - rr, S / 2 - rr, S / 2 + rr, S / 2 + rr], fill=(233, 164, 60, 1))
    img = over(img, glow.filter(ImageFilter.GaussianBlur(60)))

    w = int(S * width_ratio)
    h = int(w * 0.52)
    x0, y0 = (S - w) // 2, (S - h) // 2
    r = h // 2

    # 2. мягкая тень под буханкой
    sh = layer()
    ImageDraw.Draw(sh).rounded_rectangle(
        [x0 + int(w * 0.05), y0 + int(h * 0.30), x0 + w - int(w * 0.05), y0 + h + int(h * 0.30)],
        radius=r, fill=(0, 0, 0, 150))
    img = over(img, sh.filter(ImageFilter.GaussianBlur(S * 0.028)))

    # 3. сама буханка
    loaf = layer()
    ImageDraw.Draw(loaf).rounded_rectangle([x0, y0, x0 + w, y0 + h], radius=r, fill=LOAF + (255,))

    # 4. объём: светлая корка сверху и затемнение снизу
    light = layer()
    ImageDraw.Draw(light).ellipse(
        [x0 + int(w * 0.04), y0 - int(h * 0.55), x0 + w - int(w * 0.04), y0 + int(h * 0.62)],
        fill=LOAF_TOP + (120,))
    loaf = over(loaf, light.filter(ImageFilter.GaussianBlur(S * 0.018)))

    dark = layer()
    ImageDraw.Draw(dark).ellipse(
        [x0 + int(w * 0.02), y0 + int(h * 0.45), x0 + w - int(w * 0.02), y0 + h + int(h * 0.45)],
        fill=(120, 72, 12, 105))
    loaf = over(loaf, dark.filter(ImageFilter.GaussianBlur(S * 0.020)))

    # 5. надрезы — толстые короткие косые линии с круглыми концами
    cut = layer()
    cd = ImageDraw.Draw(cut)
    cw = max(10, int(w * 0.038))
    for k in (-1, 0, 1):
        cx = S // 2 + int(k * w * 0.20)
        cy = y0 + int(h * 0.50)
        dx, dy = int(w * 0.045), int(h * 0.30)
        cd.line([cx - dx, cy + dy, cx + dx, cy - dy], fill=CUT + (255,), width=cw)
        for px, py in ((cx - dx, cy + dy), (cx + dx, cy - dy)):
            cd.ellipse([px - cw / 2, py - cw / 2, px + cw / 2, py + cw / 2], fill=CUT + (255,))
    img = over(img, loaf)
    img = over(img, cut)

    # 6. мука
    dust = layer()
    dd = ImageDraw.Draw(dust)
    for fx, fy, fr in ((0.26, 0.34, 0.017), (0.47, 0.20, 0.012), (0.70, 0.33, 0.015),
                       (0.38, 0.50, 0.010), (0.62, 0.55, 0.009), (0.80, 0.52, 0.008)):
        rr = S * fr
        dd.ellipse([S * fx - rr, y0 + h * fy - rr, S * fx + rr, y0 + h * fy + rr],
                   fill=DUST + (165,))
    img = over(img, dust)

    return img.convert('RGB')


def save(width_ratio, size, name):
    path = os.path.join(OUT, name)
    render(width_ratio).resize((size, size), Image.LANCZOS).save(path, 'PNG', optimize=True)
    print('%-22s %4d x %4d  %6d байт' % (name, size, size, os.path.getsize(path)))


os.makedirs(OUT, exist_ok=True)
save(0.64, 512, 'icon-512.png')
save(0.64, 192, 'icon-192.png')
save(0.64, 180, 'icon-180.png')      # apple-touch-icon
save(0.46, 512, 'maskable-512.png')  # с запасом под круглую обрезку Android
