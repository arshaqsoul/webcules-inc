#!/usr/bin/env python
"""Side-by-side BEFORE/AFTER comparison image for outreach.

Usage:
  python before_after.py <before.png> <after.png> <out.jpg> [business_name]

Both screenshots should be the homepage at the same viewport (use the
research/before + research/after captures). Images are scaled to a common
height, labeled BEFORE / AFTER, joined side-by-side, and exported as an
email-friendly JPEG (<= 1600px wide, ~quality 82). This is the image that
goes out in the REPLY email and on WhatsApp — never as a link substitute in
the first cold email.

Runs on ComfyUI's bundled venv (has Pillow, no extra install):
  C:/Users/arsha/Documents/projects/ComfyUI/.venv/Scripts/python.exe
"""
import sys

from PIL import Image, ImageDraw, ImageFont

LABEL_BAR = 64  # px strip above each panel


def label_font(size: int) -> ImageFont.FreeTypeFont | ImageFont.ImageFont:
    try:
        return ImageFont.load_default(size=size)
    except TypeError:  # Pillow < 10.1
        return ImageFont.load_default()


def panel(img: Image.Image, height: int, label: str) -> Image.Image:
    im = img.convert("RGB")
    # compare the above-the-fold section: full-page captures are thousands of px
    # tall and would crush when scaled to a common height — crop to the top
    # viewport-ish band (3:4 width:height) first
    crop_h = min(im.height, round(im.width * 0.75))
    im = im.crop((0, 0, im.width, crop_h))
    scale = height / im.height
    im = im.resize((max(1, round(im.width * scale)), height), Image.LANCZOS)
    bar = Image.new("RGB", (im.width, LABEL_BAR), (12, 12, 14))
    draw = ImageDraw.Draw(bar)
    font = label_font(min(34, bar.height - 22))
    bbox = draw.textbbox((0, 0), label, font=font)
    draw.text(((im.width - (bbox[2] - bbox[0])) // 2, (bar.height - (bbox[3] - bbox[1])) // 2 - bbox[1]), label, fill=(242, 239, 233), font=font)
    out = Image.new("RGB", (im.width, LABEL_BAR + height), (12, 12, 14))
    out.paste(bar, (0, 0))
    out.paste(im, (0, LABEL_BAR))
    return out


def main() -> None:
    before_path, after_path, out_path = sys.argv[1], sys.argv[2], sys.argv[3]
    business = sys.argv[4] if len(sys.argv) > 4 else None

    height = 900
    left = panel(Image.open(before_path), height, "BEFORE")
    right = panel(Image.open(after_path), height, "AFTER")

    gap = 8
    canvas = Image.new("RGB", (left.width + gap + right.width, left.height), (12, 12, 14))
    canvas.paste(left, (0, 0))
    canvas.paste(right, (left.width + gap, 0))

    if business:
        top = Image.new("RGB", (canvas.width, 56), (255, 255, 255))
        d = ImageDraw.Draw(top)
        f = label_font(30)
        text = f"{business} - website redesign by Webcules (Saskatoon)"
        bbox = d.textbbox((0, 0), text, font=f)
        d.text(((canvas.width - (bbox[2] - bbox[0])) // 2, (top.height - (bbox[3] - bbox[1])) // 2 - bbox[1]), text, fill=(12, 12, 14), font=f)
        combined = Image.new("RGB", (canvas.width, top.height + canvas.height), (255, 255, 255))
        combined.paste(top, (0, 0))
        combined.paste(canvas, (0, top.height))
        canvas = combined

    if canvas.width > 1600:
        scale = 1600 / canvas.width
        canvas = canvas.resize((1600, round(canvas.height * scale)), Image.LANCZOS)

    canvas.save(out_path, "JPEG", quality=82, optimize=True)
    print(f"before/after comparison -> {out_path} ({canvas.width}x{canvas.height})")


if __name__ == "__main__":
    main()
