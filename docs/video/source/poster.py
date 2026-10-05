# The README posters: a frame of the tour with a play button and the length.
#   python docs/video/source/poster.py docs/video/source/out/es-4.6.png es docs/images/video-poster-es.jpg
import sys
from PIL import Image, ImageDraw, ImageFilter, ImageFont

still, lang, out = sys.argv[1], sys.argv[2], sys.argv[3]
LABEL = {"es": "Ver el recorrido · 77 s, con sonido", "en": "Watch the tour · 77 s, with sound"}[lang]

frame = Image.open(still).convert("RGB").resize((1280, 720), Image.LANCZOS)
overlay = Image.new("RGBA", frame.size, (0, 0, 0, 0))
draw = ImageDraw.Draw(overlay)

# A soft dark band at the bottom so the button reads on any frame.
for y in range(520, 720):
    draw.line([(0, y), (1280, y)], fill=(4, 5, 6, int(150 * (y - 520) / 200)))

# Play button with a faint glow, bottom left.
cx, cy, r = 96, 632, 38
glow = Image.new("RGBA", frame.size, (0, 0, 0, 0))
ImageDraw.Draw(glow).ellipse([cx - r - 14, cy - r - 14, cx + r + 14, cy + r + 14], fill=(141, 231, 189, 70))
overlay = Image.alpha_composite(overlay, glow.filter(ImageFilter.GaussianBlur(14)))
draw = ImageDraw.Draw(overlay)
draw.ellipse([cx - r, cy - r, cx + r, cy + r], fill=(236, 236, 240, 255))
draw.polygon([(cx - 11, cy - 16), (cx - 11, cy + 16), (cx + 17, cy)], fill=(11, 12, 14, 255))

def load_font(size):
    # Segoe UI Semibold on Windows, then common sans fonts elsewhere.
    for name in ("seguisb.ttf", "C:/Windows/Fonts/seguisb.ttf", "DejaVuSans-Bold.ttf", "Arial Bold.ttf"):
        try:
            return ImageFont.truetype(name, size)
        except OSError:
            continue
    return ImageFont.load_default(size)


font = load_font(28)
draw.text((cx + r + 22, cy - 18), LABEL, font=font, fill=(245, 245, 247, 255))

Image.alpha_composite(frame.convert("RGBA"), overlay).convert("RGB").save(out, quality=86, optimize=True)
print("poster:", out)
