"""Gera os ícones do PWA (192, 512 e versão maskable) em icons/."""
from PIL import Image, ImageDraw, ImageFont
import os

OUT = os.path.join(os.path.dirname(__file__), "..", "icons")
os.makedirs(OUT, exist_ok=True)


def lerp(c1, c2, t):
    return tuple(int(a + (b - a) * t) for a, b in zip(c1, c2))


def make(size, padding_ratio=0.0, filename="icon.png"):
    img = Image.new("RGBA", (size, size), (0, 0, 0, 0))
    d = ImageDraw.Draw(img)

    top = (16, 185, 129)      # emerald-500
    bottom = (13, 148, 136)   # teal-600

    inset = int(size * padding_ratio)
    box = [inset, inset, size - inset, size - inset]
    radius = int((size - 2 * inset) * 0.22)

    # fundo com gradiente vertical desenhado dentro de uma máscara arredondada
    grad = Image.new("RGBA", (size, size), (0, 0, 0, 0))
    gd = ImageDraw.Draw(grad)
    for y in range(size):
        t = y / max(1, size - 1)
        gd.line([(0, y), (size, y)], fill=lerp(top, bottom, t) + (255,))
    mask = Image.new("L", (size, size), 0)
    ImageDraw.Draw(mask).rounded_rectangle(box, radius=radius, fill=255)
    img.paste(grad, (0, 0), mask)

    # texto "DK"
    d = ImageDraw.Draw(img)
    text = "DK"
    font_size = int((size - 2 * inset) * 0.42)
    font = None
    for name in ("arialbd.ttf", "Arial Bold.ttf", "DejaVuSans-Bold.ttf", "seguisb.ttf"):
        try:
            font = ImageFont.truetype(name, font_size)
            break
        except Exception:
            continue
    if font is None:
        font = ImageFont.load_default()

    bbox = d.textbbox((0, 0), text, font=font)
    tw, th = bbox[2] - bbox[0], bbox[3] - bbox[1]
    pos = ((size - tw) / 2 - bbox[0], (size - th) / 2 - bbox[1] - size * 0.02)
    d.text(pos, text, font=font, fill=(255, 255, 255, 255))

    img.save(os.path.join(OUT, filename))
    print("gerado", filename, size)


make(192, 0.0, "icon-192.png")
make(512, 0.0, "icon-512.png")
make(512, 0.14, "icon-maskable-512.png")
