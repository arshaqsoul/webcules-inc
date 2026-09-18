#!/usr/bin/env python
"""Stitch viewport screenshot tiles into one full-page image.

Usage:
  python fullpage-stitch.py <tiles_dir> <out_path> <total_page_height> <viewport_height>

Tiles must be named tile-00.png, tile-01.png, ... in capture order, each one a
viewport-sized screenshot taken at scrollY = i * viewport_height (the last tile
may be taken at scrollY = total_height - viewport_height; this script aligns it
to the page bottom).

Runs on ComfyUI's bundled venv (has Pillow, no extra install):
  C:/Users/arsha/Documents/projects/ComfyUI/.venv/Scripts/python.exe
"""
import os
import sys

from PIL import Image


def main() -> None:
    tiles_dir, out_path, total_h, vh = sys.argv[1], sys.argv[2], int(sys.argv[3]), int(sys.argv[4])
    tiles = sorted(f for f in os.listdir(tiles_dir) if f.startswith("tile-") and f.endswith(".png"))
    if not tiles:
        sys.exit(f"no tile-*.png found in {tiles_dir}")
    imgs = [Image.open(os.path.join(tiles_dir, t)) for t in tiles]
    w = imgs[0].width
    canvas = Image.new("RGB", (w, total_h), (255, 255, 255))
    for i, im in enumerate(imgs):
        y = min(i * vh, total_h - vh)  # last tile aligns to page bottom
        canvas.paste(im, (0, y))
    canvas.save(out_path, optimize=True)
    print(f"stitched {len(imgs)} tiles -> {out_path} ({w}x{total_h})")


if __name__ == "__main__":
    main()
